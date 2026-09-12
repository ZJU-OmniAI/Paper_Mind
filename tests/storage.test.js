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
async function reset(){ await api('/api/import',{papers:[],tags:[],topicPacks:[]}); await api('/api/settings',{provider:'qwen',maxTagsPerPaper:6,maxTags:80,autoDescribeTags:true,clearQwenKey:true}); messages.length=0; }
async function add(title,manualTags=[],extra={}){return api('/api/papers',{title,manualTags,duplicateAction:'create',...extra});}
const state=()=>handleApi('/api/state');
function mockLLM(fn){globalThis.fetch=async (_url, options)=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(await fn(JSON.parse(options.body)))}}]})});}
async function key(){await api('/api/settings',{qwenKey:'test-only-key'});}

test('save reuses aliases/fullwidth names, avoids accidental fuzzy merging, enforces limits atomically',async()=>{
  await reset();
  await add('One',['ＲＡＧ','rag','训练']);
  await add('Two',['RAG']);
  let db=await state(); assert.equal(db.tags.filter(t=>!t.system).length,2);
  assert.equal(db.tags.find(t=>t.name.toLowerCase()==='rag').paperIds.length,2);
  await assert.rejects(add('Overflow',['a','b','c','d','e','f','g']),/最多/);
  assert.equal((await state()).papers.length,2);
  await api('/api/settings',{maxTags:2});
  await assert.rejects(add('Extra',['new']),/上限/);
  await add('Reuse',['rag']);
  assert.equal((await state()).papers.length,3);
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
