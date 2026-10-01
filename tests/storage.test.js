import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../extension/storage.js';

const values = {};
const messages = [];
const locks = new Map();
if (!globalThis.navigator) Object.defineProperty(globalThis, "navigator", { value: {} });
Object.defineProperty(globalThis.navigator,'locks',{value:{request(name, fn){const task=(locks.get(name)||Promise.resolve()).then(fn);locks.set(name,task.catch(()=>{}));return task;}}});
globalThis.chrome={storage:{local:{async get(keys){return Object.fromEntries(keys.map(key=>[key,structuredClone(values[key])]));},async set(data){Object.assign(values,structuredClone(data));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}}},runtime:{sendMessage(message){messages.push(message);return Promise.resolve();}}};
const api=(path,body,method='POST')=>handleApi(path,{method,body});
async function reset(){ await api('/api/import',{papers:[],tags:[],topicPacks:[]}); await api('/api/settings',{provider:'qwen',autoDescribeTags:true,clearQwenKey:true}); messages.length=0; }
async function add(title,manualTags=[],extra={}){return api('/api/papers',{title,manualTags,duplicateAction:'create',...extra});}
const state=()=>handleApi('/api/state');
function mockLLM(fn){globalThis.fetch=async (_url, options)=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(await fn(JSON.parse(options.body)))}}]})});}
async function key(){await api('/api/settings',{qwenKey:'test-only-key'});}

test('tag counts are unlimited even with legacy settings; reuse and name validation remain atomic',async()=>{
  await reset();
  values.paperTagConfig.maxTagsPerPaper=2; values.paperTagConfig.maxTags=2;
  await add('One',['ＲＡＧ','rag','训练']);
  await add('Two',['RAG']);
  let db=await state(); assert.equal(db.tags.filter(t=>!t.system).length,2);
  assert.equal(db.tags.find(t=>t.name.toLowerCase()==='rag').paperIds.length,2);
  await add('Many tags',Array.from({length:100},(_,i)=>'concept-'+i));
  db=await state(); assert.equal(db.papers.find(p=>p.title==='Many tags').tagIds.length,100);
  assert.equal(db.tags.filter(t=>!t.system).length,102);
  await Promise.all([add('New A',['new-a']),add('New B',['new-b'])]);
  await assert.rejects(add('Invalid',['x'.repeat(61)]),/60/);
  assert.equal((await state()).papers.length,5);
  await api('/api/settings',{maxTags:1,maxTagsPerPaper:1});
  assert.equal(values.paperTagConfig.maxTags,undefined);
  await add('Still allowed',['new-c']);
});

test('simultaneous saves retain both papers and canonicalize the same new tag',async()=>{
  await reset();
  await Promise.all([add('Concurrent A',['RAG']),add('Concurrent B',['rag'])]);
  const db=await state(); assert.equal(db.papers.length,2); assert.equal(db.tags.filter(t=>!t.system).length,1);
  const tag=db.tags.find(t=>!t.system); assert.equal(tag.paperIds.length,2);
  for(const p of db.papers)assert.deepEqual(p.tagIds,[tag.id]);
});

test('merging tags preserves paper and topic-pack references and aliases',async()=>{
  await reset(); await add('One',['RAG']); await add('Two',['检索增强生成']);
  const db=await state(); const source=db.tags.find(t=>t.name==='RAG'); const target=db.tags.find(t=>t.name==='检索增强生成');
  await api('/api/topic-packs',{name:'My topic',includeTagIds:[source.id],excludeTagIds:[]});
  await api('/api/tags/merge',{canonical:target.name,tags:[source.name]});
  const merged=await state(); assert.equal(merged.papers.length,2); assert.deepEqual(merged.topicPacks[0].includeTagIds,[target.id]);
  assert.ok(merged.tags.find(t=>t.id===target.id).aliases.includes('RAG'));
  await add('Alias',['RAG']); assert.equal((await state()).tags.filter(t=>!t.system).length,1);
});

test('AI descriptions use paper evidence, persist provenance, and do not regenerate unchanged content',async()=>{
  await reset(); await key(); await add('Retrieval paper',['RAG'],{abstract:'Grounded answers with retrieved documents',conversation:'我的标签用于减少幻觉'});
  let calls=0;
  mockLLM(body=>{calls++;const input=JSON.parse(body.messages[1].content);assert.match(input.tags[0].papers[0].abstract,/Grounded/);assert.match(input.tags[0].papers[0].notes,/减少幻觉/);return {descriptions:input.tags.map(tag=>({tagId:tag.id,description:'根据外部检索到的文档，为语言模型回答提供事实依据，适用于研究检索增强生成与幻觉缓解的论文。'}))};});
  const result=await api('/api/tags/describe',{}); assert.equal(result.generated,1);
  let db=await state(); let tag=db.tags.find(t=>!t.system); assert.equal(tag.descriptionStatus,'ready'); assert.equal(tag.descriptionProvider,'qwen');
  await api('/api/tags/describe',{}); assert.equal(calls,1);
  await api(`/api/papers/${db.papers[0].id}`,{abstract:'New evidence'},'PUT');
  tag=(await state()).tags.find(t=>!t.system); assert.equal(tag.descriptionStatus,'stale');assert.ok(tag.description);
});

test('malformed AI output retains previous description, records error and does not loop',async()=>{
  await reset(); await key(); await add('Paper',['RAG'],{abstract:'Evidence'});
  mockLLM(body=>({descriptions:[{tagId:JSON.parse(body.messages[1].content).tags[0].id,description:'这是用于研究检索增强生成的标签，关注外部知识如何支撑回答的事实准确性。'}]}));
  await api('/api/tags/describe',{}); const old=(await state()).tags.find(t=>!t.system).description;
  mockLLM(()=>({descriptions:[{tagId:'invented-tag',description:'模型不应该创建任何新标签。'}]}));
  const result=await api('/api/tags/describe',{force:true}); assert.equal(result.failed,1);
  const db=await state();const tag=db.tags.find(t=>!t.system); assert.equal(tag.description,old);assert.equal(tag.descriptionStatus,'error');assert.equal(db.tags.filter(t=>!t.system).length,1);
  assert.equal((await api('/api/tags/describe',{})).generated,0);
});

test('AI request in flight cannot overwrite changed paper evidence or resurrect deleted tags',async()=>{
  await reset(); await key();const saved=await add('Paper',['RAG'],{abstract:'Old evidence'});
  let release;let started;
  const ready=new Promise(r=>started=r);const gate=new Promise(r=>release=r);
  mockLLM(async body=>{started();await gate;return{descriptions:JSON.parse(body.messages[1].content).tags.map(tag=>({tagId:tag.id,description:'这段说明基于旧证据生成，不应覆盖用户随后更新过的论文对应的标签说明。'}))};});
  const pending=api('/api/tags/describe',{});await ready;
  await api(`/api/papers/${saved.paper.id}`,{abstract:'New evidence'},'PUT');release();
  assert.equal((await pending).generated,0);
  assert.equal((await state()).tags.find(t=>!t.system).description,'');
});

test('import validates IDs before mutation and strips unsafe links; export excludes API keys',async()=>{
  await reset(); await key();await add('Keep me');
  await assert.rejects(api('/api/import',{papers:[{id:'"><img src=x>',title:'Bad'}],tags:[]}),/导入文件/);
  assert.equal((await state()).papers.length,1);
  await api('/api/import',{papers:[{id:'safe',title:'Safe',links:[{id:'link1',url:'javascript:alert(1)'}]}],tags:[]});
  const db=await state();assert.equal(db.papers[0].links.length,0);assert.deepEqual(db.papers[0].tagIds,['system-unsorted']);
  assert.ok(!JSON.stringify(await handleApi('/api/export')).includes('test-only-key'));
});

test('remote model HTTP and credentials are rejected; localhost remains usable',async()=>{
  await reset();await assert.rejects(api('/api/settings',{qwenBaseUrl:'http://example.com/v1'}),/HTTPS/);
  await assert.rejects(api('/api/settings',{qwenBaseUrl:'https://u:secret@example.com/v1'}),/用户名/);
  await api('/api/settings',{qwenBaseUrl:'http://localhost:8000/v1'});
  await api('/api/settings',{qwenBaseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1'});
});

test('memory and reading status round-trip independently of tags; legacy imports get safe defaults', async () => {
  await reset();
  const saved = await add('Remember this', ['RAG'], {memory:'  外部证据\n减少幻觉  ',readingStatus:'reading'});
  let paper = (await state()).papers[0];
  assert.equal(paper.memory, '外部证据 减少幻觉'); assert.equal(paper.readingStatus, 'reading');
  const tags = paper.tagIds;
  await api(`/api/papers/${paper.id}`, {memory:'记忆线索',readingStatus:'revisit'}, 'PUT');
  paper = (await state()).papers[0]; assert.deepEqual(paper.tagIds,tags);
  const exported = await handleApi('/api/export');
  await api('/api/import', exported);
  paper = (await state()).papers.find(p=>p.id===saved.paper.id);
  assert.equal(paper.memory,'记忆线索'); assert.equal(paper.readingStatus,'revisit');
  await assert.rejects(api(`/api/papers/${paper.id}`, {readingStatus:'invented',memory:'do not save'}, 'PUT'), /状态/);
  assert.equal((await state()).papers[0].memory,'记忆线索');
  await api('/api/import',{papers:[{id:'legacy',title:'Legacy'}],tags:[]});
  assert.equal((await state()).papers[0].readingStatus,'unread'); assert.equal((await state()).papers[0].memory,'');
});

test('duplicate source merge preserves reading progress and both memories; explicit capture edits replace personal fields', async () => {
  await reset(); await add('Same paper',['RAG'],{memory:'Original memory',readingStatus:'read',sourceUrl:'https://arxiv.org/abs/2401.00001'});
  await api('/api/papers',{title:'Same paper',sourceUrl:'https://arxiv.org/abs/2401.00001',memory:'Second memory',readingStatus:'unread',duplicateAction:'merge'});
  let paper=(await state()).papers[0];assert.equal(paper.memory,'Original memory');assert.equal(paper.readingStatus,'read');assert.match(paper.conversation,/Second memory/);
  await api('/api/papers',{title:'Same paper',sourceUrl:paper.sourceUrl,memory:'Edited memory',readingStatus:'revisit',replacePersonalFields:true});
  paper=(await state()).papers[0];assert.equal(paper.memory,'Edited memory');assert.equal(paper.readingStatus,'revisit');assert.equal((await state()).papers.length,1);
});

test('concept search accepts only existing non-system tags, deduplicates and limits suggestions', async () => {
  await reset();await key();
  for(let i=0;i<9;i++)await add('Paper '+i,['Tag '+i]);
  const before=await state(), first=before.tags.find(t=>!t.system);
  mockLLM(()=>({matches:[null,{tagId:'invented',tagName:'made-up'},{tagId:'system-unsorted'},
    {tagId:first.id,reason:'Matches evidence',confidence:9},{tagId:first.id,confidence:0.1},
    ...before.tags.filter(t=>!t.system).map(t=>({tagId:t.id,tagName:t.name}))]}));
  const result=await api('/api/search',{query:'I remember evidence-based answers'});
  assert.equal(result.llmUsed,true);assert.equal(result.matches.length,6);
  assert.equal(result.matches[0].confidence,1);assert.equal(new Set(result.matches.map(m=>m.tagId)).size,6);
  assert.ok(result.matches.every(m=>before.tags.some(t=>t.id===m.tagId && !t.system)));
  assert.deepEqual((await state()).tags,before.tags);
});

test('local CLIs and compatible API share model workflows without exposing credentials', async () => {
  await reset();await add('Paper',['RAG'],{memory:'Ground in evidence'});
  await api('/api/settings',{provider:'claude',bridgeToken:'test-bridge-secret',claudeModel:'sonnet',claudeEffort:'high'});
  globalThis.fetch=async (url,options)=>{
    assert.equal(url,'http://127.0.0.1:39321/v1/generate');
    assert.equal(options.headers.Authorization,'Bearer test-bridge-secret');
    const body=JSON.parse(options.body);assert.equal(body.provider,'claude');assert.equal(body.model,'sonnet');assert.equal(body.effort,'high');
    const input=JSON.parse(body.messages[1].content);assert.equal(input.tags[0].papers[0].memory,'Ground in evidence');
    return {ok:true,json:async()=>({content:JSON.stringify({descriptions:[{tagId:input.tags[0].id,description:'通过检索外部文档提供事实依据，并减少语言模型在回答时产生的幻觉。'}]}),model:'sonnet'})};
  };
  assert.equal((await api('/api/tags/describe',{force:true})).generated,1);
  await api('/api/settings',{provider:'codex',codexModel:'default',codexEffort:'low'});
  globalThis.fetch=async (_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.provider,'codex');assert.equal(body.effort,'medium');return {ok:true,json:async()=>({content:'pong',model:'default'})};};
  assert.equal((await api('/api/test-model',{provider:'codex',codexEffort:'medium',question:'ping'})).answer,'pong');
  assert.equal((await state()).config.codexEffort,'low');
  assert.equal((await state()).config.claudeEffort,'high');
  await assert.rejects(api('/api/settings',{claudeEffort:'ultra'}),/effort/);
  await api('/api/settings',{provider:'custom',customModel:'local-model',customBaseUrl:'http://127.0.0.1:11434/v1',customJsonMode:false,customKey:'test-custom-secret'});
  globalThis.fetch=async (url,options)=>{assert.equal(url,'http://127.0.0.1:11434/v1/chat/completions');const body=JSON.parse(options.body);assert.equal(body.model,'local-model');assert.ok(!body.response_format);assert.ok(!Object.hasOwn(body,'temperature'));return {ok:true,json:async()=>({choices:[{message:{content:'pong'}}]})};};
  assert.equal((await api('/api/test-model',{provider:'custom',question:'ping'})).answer,'pong');
  for(const value of [await state(),await handleApi('/api/export')]){assert.ok(!JSON.stringify(value).includes('test-bridge-secret'));assert.ok(!JSON.stringify(value).includes('test-custom-secret'));}
  await assert.rejects(api('/api/settings',{bridgeUrl:'https://remote.example'}),/127.0.0.1/);
  await assert.rejects(api('/api/settings',{customBaseUrl:'http://remote.example/v1'}),/HTTPS/);
});

test('reading progress changes do not reshuffle tag description evidence or consume new model calls', async () => {
  await reset();await key();
  for(let i=0;i<7;i++)await add('Evidence '+i,['RAG'],{abstract:'Evidence '+i});
  let calls=0;
  mockLLM(body=>{calls++;return {descriptions:JSON.parse(body.messages[1].content).tags.map(tag=>({tagId:tag.id,description:'这个标签研究如何通过外部检索到的证据提高生成回答的事实可靠性。'}))};});
  await api('/api/tags/describe',{});assert.equal(calls,1);
  const paper=(await state()).papers.find(p=>p.title==='Evidence 0');
  await api(`/api/papers/${paper.id}`,{readingStatus:'read'},'PUT');
  const result=await api('/api/tags/describe',{});assert.equal(result.generated,0);assert.equal(calls,1);
});
