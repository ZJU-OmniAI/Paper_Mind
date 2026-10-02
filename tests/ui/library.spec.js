import { test, expect } from '@playwright/test';

async function setup(page, {count=30, configured=false}={}) {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({count,configured})=>{
    const now=new Date().toISOString();
    const names=['检索增强生成','评估','多模态','智能体','强化学习','扩散模型','长上下文','推理'];
    const tags=names.map((name,i)=>({id:`tag-${i}`,name,aliases:i===0?['RAG']:[],description:`${name}相关论文的研究方法、适用范围与实际评估。`,descriptionStatus:'ready',paperIds:[],createdAt:now,updatedAt:now}));
    const papers=Array.from({length:count},(_,i)=>({id:`paper-${i}`,title:i===0?'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks':i===1?'Evaluating RAG: Faithfulness and Hallucination':`Research paper ${i+1}: ${names[i%names.length]}`,abstract:i<2?'Use retrieved knowledge to improve grounded generation and evaluate hallucination.':'研究论文摘要：探索模型的能力边界、方法设计与评估结果。',conversation:i===0?'讨论检索质量如何影响生成回答的准确性。':'',tagIds:i===0?['tag-0']:i===1?['tag-0','tag-1']:[`tag-${i%names.length}`],valueScore:i===0?5:3,citationCount:100+i,citationStatus:'ok',citationUpdatedAt:now,createdAt:now,updatedAt:now}));
    const values=JSON.parse(localStorage.getItem('paper-mind-test-values') || 'null') || {paperTagStore:{papers,tags,topicPacks:[]},paperTagConfig:{qwenKey:configured?'test-only-key':'',autoDescribeTags:false}};
    const listeners=[];
    window.chrome={storage:{local:{async get(keys){return Object.fromEntries(keys.map(key=>[key,structuredClone(values[key])]));},async set(data){Object.assign(values,structuredClone(data));localStorage.setItem('paper-mind-test-values',JSON.stringify(values));},async remove(key){delete values[key];localStorage.setItem('paper-mind-test-values',JSON.stringify(values));}}},runtime:{id:'test-extension',getURL:p=>`http://127.0.0.1:4178/${p}`,sendMessage:async()=>{},onMessage:{addListener:listener=>listeners.push(listener)},getContexts:async()=>[]},tabs:{query:async()=>[],create:async()=>{}},scripting:{executeScript:async()=>[]}};
    window.__emitMessage=message=>listeners.forEach(listener=>listener(message));
  },{count,configured});
  await page.route('https://**/*',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.goto('/manager.html');
  await expect(page.locator('#paperCount')).toHaveText(String(count));
  return errors;
}

test('default library, pagination, multi-term search, tag intersection and reset',async({page})=>{
  const errors=await setup(page);
  await expect(page.locator('#view-papers')).toHaveClass('view active');
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(24);
  await page.locator('[data-library-page="2"]').click();
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(6);
  await page.locator('#paperLibraryFilter').fill('RAG hallucination');
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(2);
  await page.locator('#paperLibraryTagList [data-library-tag-id="tag-0"]').click();
  await page.locator('#paperLibraryTagList [data-library-tag-id="tag-1"]').click();
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(1);
  await expect(page.locator('#activeLibraryFilters button')).toHaveCount(2);
  await page.locator('#libraryMatchMode').selectOption('any');
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(2);
  await page.locator('#libraryMinScore').selectOption('5');
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(1);
  await page.locator('#clearLibraryFilters').click();
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(24);
  await page.screenshot({path:'test-results/library-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('keyboard tag suggestions use aliases and descriptions, Enter selects without adding a row',async({page})=>{
  const errors=await setup(page);
  await page.locator('#libraryAddPaper').click();
  const input=page.locator('#manualTagList input').first();
  await input.fill('RAG');
  await expect(page.locator('#manualTagList .tag-suggestion:not(.create)')).toHaveCount(1);
  await expect(page.locator('#manualTagList .tag-suggestion.create')).toHaveCount(0);
  await input.press('ArrowDown');await input.press('Enter');
  await expect(input).toHaveValue('检索增强生成');
  await expect(page.locator('#manualTagList .manual-tag-row')).toHaveCount(1);
  await expect(input).toHaveAttribute('aria-expanded','false');
  await input.fill('does-not-exist');
  await expect(page.locator('#manualTagList .tag-suggestion:not(.create)')).toHaveCount(0);
  await expect(page.locator('#manualTagList .tag-suggestion.create')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('tag detail, settings and language without tag caps remain usable',async({page})=>{
  const errors=await setup(page);
  await page.locator('[data-view="tags"]').click();
  await page.locator('#tagTree [data-tag-id="tag-0"]').click();
  await expect(page.locator('#tagDetail .tag-description-block')).toContainText('适用范围');
  await page.locator('[data-filter-from-tag="tag-0"]').click();
  await expect(page.locator('#activeLibraryFilters button')).toHaveCount(1);
  await page.locator('[data-view="settings"]').click();
  await expect(page.locator('#maxTagsPerPaper, #maxTags')).toHaveCount(0);
  await page.locator('#autoDescribeTags').check();
  await page.locator('#settingsForm button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('保存');
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.locator('#tagPolicyLegend')).toHaveText('Tag management');
  await expect(page.locator('#autoDescribeTags')).toBeChecked();
  await expect(page.locator('#tagPolicyHint')).toContainText('No limit');
  expect(errors).toEqual([]);
});

test('delayed AI results cannot overwrite a new query',async({page})=>{
  const errors=await setup(page,{configured:true});
  let release;let started;
  const ready=new Promise(r=>started=r);const gate=new Promise(r=>release=r);
  await page.route('**/chat/completions',async route=>{started();await gate;await route.fulfill({json:{choices:[{message:{content:JSON.stringify({matches:[{paperId:'paper-0',reason:'Matches',confidence:.9}]})}}]}});});
  await page.locator('#paperLibraryFilter').fill('RAG');
  await page.locator('#paperLibraryLlmSearchButton').click();await ready;
  await page.locator('#paperLibraryFilter').fill('impossible-new-query');release();
  await expect(page.locator('#paperLibraryLlmSearchButton')).toBeEnabled();
  await expect(page.locator('#paperLibraryList')).toContainText('没有找到匹配论文');
  expect(errors).toEqual([]);
});

test('AI descriptions show in cards, details and failures keep existing text',async({page})=>{
  const errors=await setup(page,{configured:true,count:2});
  await page.route('**/chat/completions',async route=>{
    const body=route.request().postDataJSON();const input=JSON.parse(body.messages[1].content);
    await route.fulfill({json:{choices:[{message:{content:JSON.stringify({descriptions:input.tags.map(tag=>({tagId:tag.id,description:'根据关联论文，研究检索获得的外部知识如何增强语言模型回答的事实依据，以及检索质量对生成表现的影响。'}))})}}]}});
  });
  await page.locator('[data-view="tags"]').click();
  await page.locator('#describeTagsButton').click();
  await expect(page.locator('#tagTree [data-tag-id="tag-0"]')).toContainText('外部知识如何增强');
  await page.locator('#tagTree [data-tag-id="tag-0"]').click();
  await expect(page.locator('#tagDetail')).toContainText('qwen');
  await page.route('**/chat/completions',route=>route.fulfill({status:503,json:{error:{message:'测试模型暂不可用'}}}));
  await page.locator('[data-describe-tag="tag-0"]').click();
  await expect(page.locator('#tagDetail .description-error')).toHaveText('测试模型暂不可用');
  await expect(page.locator('#tagDetail')).toContainText('外部知识如何增强');
  await page.screenshot({path:'test-results/tag-library-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('narrow screen and empty library have no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=await setup(page,{count:0});
  await expect(page.locator('#paperLibraryList')).toContainText('从第一篇论文开始');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/library-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('popup only reads clipboard on request, bounds quick tags and resolves aliases',async({page})=>{
  const errors=await setup(page);
  await page.addInitScript(()=>{
    window.__clipboardReads=0;
    Object.defineProperty(navigator,'clipboard',{value:{async readText(){window.__clipboardReads++;return 'Only paste after the user clicks';}}});
  });
  await page.goto('/popup.html');
  await expect(page.locator('#quickTagsList .quick-tag')).toHaveCount(8);
  expect(await page.evaluate(()=>window.__clipboardReads)).toBe(0);
  await page.locator('#tagInput').fill('ＲＡＧ');
  await expect(page.locator('#tagSuggestions .tag-suggestion:not(.create)')).toHaveCount(1);
  await expect(page.locator('#tagSuggestions .create')).toHaveCount(0);
  await page.locator('#tagInput').press('ArrowDown');await page.locator('#tagInput').press('Enter');
  await expect(page.locator('#tagBox .chip')).toContainText('检索增强生成');
  await page.locator('#pasteNotesButton').click();
  await expect(page.locator('#conversationInput')).toHaveValue(/Only paste after the user clicks/);
  expect(await page.evaluate(()=>window.__clipboardReads)).toBe(1);
  await page.locator('#tagInput').fill('new-a,new-b,new-c,new-d,new-e,new-f,new-g,new-h');
  await page.locator('#tagInput').press('Enter');
  await expect(page.locator('#tagBox .chip')).toHaveCount(9);
  await expect(page.locator('#tagPolicyNote')).toContainText('9 个标签');
  await page.locator('#titleInput').fill('More than six tags');
  await page.locator('#saveButton').click();
  await expect(page.locator('#message')).toHaveClass(/success/);
  const saved = await page.evaluate(async()=>{const {handleApi}=await import('/storage.js');return (await handleApi('/api/state')).papers.find(p=>p.title==='More than six tags');});
  expect(saved.tagIds).toHaveLength(9);
  await page.screenshot({path:'test-results/popup.png'});
  expect(errors).toEqual([]);
});

test('dark mode and populated narrow layouts retain readable titles and fit viewport',async({page})=>{
  const errors=await setup(page);
  await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(24);
  const color=await page.locator('#paperLibraryList h4').first().evaluate(el=>getComputedStyle(el).color);
  expect(color).toBe('rgb(230, 236, 233)');
  await page.screenshot({path:'test-results/library-dark.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('[data-view="tags"]').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('remembered concept leads to existing tags then papers, without keeping a stale literal filter',async({page})=>{
  const errors=await setup(page,{configured:true});
  await page.route('**/chat/completions',route=>route.fulfill({json:{choices:[{message:{content:JSON.stringify({matches:[{tagId:'tag-0',reason:'用外部知识为生成提供事实依据',confidence:.9},{tagId:'invented',reason:'Must not appear'},{tagId:'tag-0',reason:'Duplicate'}]})}}]}}));
  await page.locator('#paperLibraryFilter').fill('impossible-literal');
  await page.locator('#conceptQuery').fill('记得那篇让回答有证据的论文');
  await page.locator('#conceptSearchButton').click();
  await expect(page.locator('#conceptResults [data-concept-tag-id]')).toHaveCount(1);
  await expect(page.locator('#conceptResults')).toContainText('事实依据');
  await page.locator('[data-concept-tag-id="tag-0"]').click();
  await expect(page.locator('#paperLibraryFilter')).toHaveValue('');
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(5);
  await expect(page.locator('#activeLibraryFilters')).toContainText('检索增强生成');
  await expect(page.locator('#tagCount')).toHaveText('9');
  await page.locator('#clearLibraryFilters').click();
  await expect(page.locator('#conceptQuery')).toHaveValue('');
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(24);
  expect(errors).toEqual([]);
});

test('concept search ignores stale model responses and offers local matches when unavailable',async({page})=>{
  const errors=await setup(page,{configured:true});
  let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  await page.route('**/chat/completions',async route=>{started();await gate;await route.fulfill({json:{choices:[{message:{content:JSON.stringify({matches:[{tagId:'tag-0',reason:'Old'}]})}}]}});});
  await page.locator('#conceptQuery').fill('Old query');await page.locator('#conceptSearchButton').click();await ready;
  await page.locator('#conceptQuery').fill('完全没有这个概念');release();
  await expect(page.locator('#conceptSearchButton')).toBeEnabled();
  await expect(page.locator('#conceptResults [data-concept-tag-id]')).toHaveCount(0);
  await page.route('**/chat/completions',route=>route.fulfill({status:503,json:{error:{message:'Temporary outage'}}}));
  await page.locator('#conceptQuery').fill('RAG');await page.locator('#conceptSearchButton').click();
  await expect(page.locator('#conceptHint')).toContainText('本地匹配');
  await expect(page.locator('#conceptResults [data-concept-tag-id="tag-0"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('capture memory and reading status survive save, detail editing, filtering and reload',async({page})=>{
  const errors=await setup(page,{count:0});
  await page.goto('/popup.html');
  await page.locator('#titleInput').fill('A paper worth remembering');
  await page.locator('#captureMemory').fill('证据检查让智能体少编造');
  await page.locator('#captureReadingStatus').selectOption('reading');
  await page.locator('#tagInput').fill('智能体');await page.locator('#tagInput').press('Enter');
  await page.locator('#saveButton').click();
  await expect(page.locator('#message')).toHaveClass(/success/);
  await page.goto('/manager.html');
  const card=page.locator('#paperLibraryList .paper-card');
  await expect(card).toContainText('证据检查让智能体少编造');await expect(card).toContainText('在读');
  await page.locator('#libraryReadingStatus').selectOption('read');await expect(card).toHaveCount(0);
  await page.locator('#libraryReadingStatus').selectOption('reading');await card.click();
  await expect(page.locator('#paperDetailMemory')).toHaveText('证据检查让智能体少编造');
  await page.locator('#detailQuickStatus').selectOption('read');
  await expect(page.locator('#toast')).toContainText('阅读状态已更新');
  await page.locator('#editPaperDetailButton').click();
  await page.locator('#detailMemory').fill('把事实核验加入每一步');await page.locator('#detailReadingStatus').selectOption('revisit');
  await page.locator('#paperDetailTagForm button[type="submit"]').click();
  await expect(page.locator('#paperDetailMemory')).toHaveText('把事实核验加入每一步');
  await page.goto('/manager.html');
  await page.locator('#paperLibraryFilter').fill('事实核验');await expect(card).toHaveCount(1);await expect(card).toContainText('待重读');
  await expect(page.locator('#paperLibraryTagList')).not.toContainText('待重读');
  await page.locator('#languageSelect').selectOption('en');await expect(card).toContainText('Revisit');
  expect(errors).toEqual([]);
});

test('backend settings connect local CLI and compatible API, mask credentials and retain model selections',async({page})=>{
  const errors=await setup(page);
  await page.locator('[data-view="settings"]').click();
  await page.locator('[name="provider"][value="codex"]').check();
  await expect(page.locator('#localBackendSettings')).toBeVisible();await expect(page.locator('#presetBackendSettings')).toBeHidden();
  await page.locator('#bridgeToken').fill('synthetic-bridge-token');
  await page.route('http://127.0.0.1:39321/health',route=>route.fulfill({json:{ok:true,backends:{claude:{status:'auth'},codex:{status:'ready',version:'test-cli'}}}}));
  await page.route('http://127.0.0.1:39321/models?refresh=1',route=>route.fulfill({json:{claude:{source:'cli',models:[{id:'sonnet',label:'Sonnet',efforts:['low','high']},{id:'haiku',label:'Haiku',efforts:[]}]},codex:{source:'cli',models:[{id:'fixture-model',label:'Fixture model',efforts:['low','medium','high']}]}}}));
  await page.locator('#checkBridge').click();await expect(page.locator('#bridgeHealth')).toContainText('可以使用');
  await expect(page.locator('#localCatalogStatus')).toContainText('已读取');
  await page.locator('#codexModelSelect').selectOption('fixture-model');
  await expect(page.locator('#codexEffort option')).toHaveCount(4);
  await page.locator('#codexEffort').selectOption('high');
  await page.locator('#claudeModelSelect').selectOption('sonnet');
  await page.locator('#claudeEffort').selectOption('high');
  await page.locator('#claudeModelSelect').selectOption('haiku');
  await expect(page.locator('#claudeEffort')).toHaveValue('default');
  await expect(page.locator('#claudeEffort option')).toHaveCount(1);
  await page.locator('#claudeModelSelect').selectOption('__custom__');
  await page.locator('#claudeModel').fill('custom-claude');
  await page.locator('#claudeEffort').selectOption('medium');
  await page.locator('#settingsForm button[type="submit"]').click();await expect(page.locator('#toast')).toContainText('保存');await expect(page.locator('#bridgeToken')).toHaveValue('');
  await page.reload();await page.locator('[data-view="settings"]').click();await expect(page.locator('[name="provider"][value="codex"]')).toBeChecked();
  await expect(page.locator('#bridgeToken')).toHaveAttribute('placeholder',/已保存/);
  await expect(page.locator('#codexModel')).toHaveValue('fixture-model');
  await expect(page.locator('#codexEffort')).toHaveValue('high');
  await expect(page.locator('#claudeModel')).toHaveValue('custom-claude');
  await expect(page.locator('#claudeEffort')).toHaveValue('medium');
  await page.route('http://127.0.0.1:39321/models?refresh=1',route=>route.fulfill({status:503,json:{error:'Catalog offline'}}));
  await page.locator('#refreshLocalModels').click();
  await expect(page.locator('#localCatalogStatus')).toContainText('Catalog offline');
  await expect(page.locator('#codexModel')).toHaveValue('fixture-model');
  await expect(page.locator('#codexEffort')).toHaveValue('high');
  await page.locator('[name="provider"][value="custom"]').check();await expect(page.locator('#customBackendSettings')).toBeVisible();
  await page.locator('#customBaseUrl').fill('http://127.0.0.1:11434/v1');await page.locator('#customModel').fill('test-local-model');
  await page.locator('#settingsForm button[type="submit"]').click();await expect(page.locator('#toast')).toContainText('保存');
  await page.reload();await page.locator('[data-view="settings"]').click();await expect(page.locator('#customModel')).toHaveValue('test-local-model');
  await page.locator('#languageSelect').selectOption('en');await expect(page.locator('#customBackendSettings')).toContainText('optional for local servers');
  expect(errors).toEqual([]);
});

test('refinement follows the visible results, shows exact next counts, and explains OR mode',async({page})=>{
  const errors=await setup(page,{count:6});
  await expect(page.locator('#libraryRefinement')).toBeHidden();
  await page.locator('#paperLibraryTagList [data-library-tag-id="tag-0"]').click();
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(2);
  const option=page.locator('#libraryRefinement [data-library-tag-id="tag-1"]');
  await expect(option).toContainText('剩 1 篇');
  await expect(page.locator('#libraryRefinement [data-library-tag-id="tag-2"]')).toHaveCount(0);
  await option.click();
  await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(1);
  await expect(page.locator('#libraryRefinement')).toContainText('已缩小到 1 篇');
  await page.locator('#libraryMatchMode').selectOption('any');
  await expect(page.locator('#libraryRefinement')).toContainText('会扩大范围');
  await page.locator('[data-refine-all]').click();
  await expect(page.locator('#libraryMatchMode')).toHaveValue('all');
  await page.locator('#libraryMinScore').selectOption('5');
  await expect(page.locator('#libraryRefinement')).toContainText('当前组合没有结果');
  await expect(page.locator('#activeLibraryFilters button')).toHaveCount(2);
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.locator('#libraryRefinement')).toContainText('No results');
  await page.locator('#clearLibraryFilters').click();
  await expect(page.locator('#libraryRefinement')).toBeHidden();
  expect(errors).toEqual([]);
});

test('search surfaces the personal memory, escaped highlights and evidence including bibliographic fields',async({page})=>{
  const errors=await setup(page,{count:2});
  await page.evaluate(async()=>{
    const {handleApi}=await import('/storage.js');
    await handleApi('/api/papers/paper-0',{method:'PUT',body:{memory:'先检查证据 <img src=x onerror=alert(1)> 再回答',authors:['Ada Lovelace'],year:'2025',venue:'ICLR',conversation:'原文笔记：关注 OPD 算法的证据检查'}});
  });
  await page.reload();
  await page.locator('#paperLibraryFilter').fill('证据');
  const card=page.locator('#paperLibraryList .paper-card');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.memory-label')).toHaveText('你当时记住的是');
  await expect(card.locator('.paper-memory mark')).toHaveText('证据');
  await expect(card.locator('.paper-memory')).toContainText('<img src=x onerror=alert(1)>');
  await expect(card.locator('.paper-memory img')).toHaveCount(0);
  await expect(card.locator('.search-evidence')).toContainText('你的笔记');
  await page.locator('#paperLibraryFilter').fill('Ada 2025 ICLR');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.search-evidence')).toContainText('作者');
  await expect(card.locator('.bibliography-line')).toContainText('Ada Lovelace · 2025 · ICLR');
  await page.screenshot({path:'test-results/recall-evidence.png',fullPage:true});
  await card.click();
  await expect(page.locator('#paperDetailBibliography')).toContainText('Ada Lovelace');
  await page.locator('#editPaperDetailButton').click();
  await page.locator('#detailBibliography [data-bib-field="venue"]').fill('NeurIPS');
  await page.locator('#paperDetailTagForm button[type="submit"]').click();
  await expect(page.locator('#paperDetailBibliography')).toContainText('NeurIPS');
  await page.locator('#editPaperDetailButton').click();
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({colorScheme:'dark'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#detailBibliography').screenshot({path:'test-results/publication-details-mobile-dark.png'});
  expect(errors).toEqual([]);
});

test('metadata lookup fills blanks, preserves concurrent edits and ignores stale titles',async({page})=>{
  const errors=await setup(page,{count:0});
  await page.locator('#libraryAddPaper').click();
  await page.locator('#paperTitle').fill('A verified paper');
  const editor=page.locator('#paperBibliography');
  let release,started;
  const gate=new Promise(r=>release=r), ready=new Promise(r=>started=r);
  await page.route('https://api.semanticscholar.org/**',async route=>{started();await gate;await route.fulfill({json:{data:[{title:'A verified paper',authors:[{name:'Lookup Author'}],year:2025,venue:'ICLR'}]}});});
  await editor.locator('button').click();await ready;
  await editor.locator('[data-bib-field="authors"]').fill('My edit');
  release();
  await expect(editor.locator('button')).toBeEnabled();
  await expect(editor.locator('[data-bib-field="authors"]')).toHaveValue('My edit');
  await expect(editor.locator('[data-bib-field="year"]')).toHaveValue('2025');
  await expect(editor.locator('[data-bib-field="venue"]')).toHaveValue('ICLR');
  await expect(editor.locator('[role="status"]')).toContainText('补全 2 项');
  await page.locator('#paperForm button[type="submit"]').click();
  await expect(page.locator('#paperCount')).toHaveText('1');
  await page.reload();
  await expect(page.locator('#paperLibraryList')).toContainText('My edit · 2025 · ICLR');
  await page.locator('#libraryAddPaper').click();
  await page.locator('#paperTitle').fill('A verified paper');
  let finish,begin;
  const pending=new Promise(r=>finish=r), request=new Promise(r=>begin=r);
  await page.route('https://api.semanticscholar.org/**',async route=>{begin();await pending;await route.fulfill({json:{data:[{title:'A verified paper',authors:[{name:'Stale Author'}],year:2020,venue:'Wrong Venue'}]}});});
  await editor.locator('button').click();await request;
  await page.locator('#paperTitle').fill('A different paper');finish();
  await expect(editor.locator('button')).toBeEnabled();
  await expect(editor.locator('[data-bib-field="authors"]')).toBeEmpty();
  await expect(editor.locator('[data-bib-field="year"]')).toBeEmpty();
  expect(errors).toEqual([]);
});

test('popup captures and persists authors year and venue without generating them',async({page})=>{
  const errors=await setup(page,{count:0});
  await page.addInitScript(()=>{
    chrome.tabs.query=async()=>[{id:42,title:'Captured paper',url:'https://example.org/paper'}];
    chrome.scripting.executeScript=async({func})=>[{result:func.name==='pagePaperMetadata'?{title:'Captured paper',description:'Abstract',authors:['First Author','Second Author'],year:'2024',venue:'Test Conference'}:null}];
  });
  await page.goto('/popup.html');
  const editor=page.locator('#captureBibliography');
  await expect(editor.locator('[data-bib-field="authors"]')).toHaveValue('First Author; Second Author');
  await expect(editor.locator('[data-bib-field="year"]')).toHaveValue('2024');
  await editor.locator('[data-bib-field="venue"]').fill('Confirmed Conference');
  await page.locator('#saveButton').click();
  await expect(page.locator('#message')).toHaveClass(/success/);
  await expect(editor.locator('[data-bib-field="venue"]')).toHaveValue('Confirmed Conference');
  await page.goto('/manager.html');
  await expect(page.locator('#paperLibraryList .bibliography-line')).toContainText('First Author; Second Author · 2024 · Confirmed Conference');
  expect(errors).toEqual([]);
});

test('page extractor distinguishes scholarly metadata from a blog byline',async({page})=>{
  const {pagePaperMetadata}=await import('../../extension/bibliography.js');
  await page.setContent('<meta name="citation_author" content="First Author"><meta name="citation_author" content="Second Author"><meta name="citation_publication_date" content="2024/04/20"><meta name="citation_conference_title" content="ICLR">');
  let result=await page.evaluate(pagePaperMetadata);expect(result.authors).toEqual(['First Author','Second Author']);expect(result.year).toBe('2024');expect(result.venue).toBe('ICLR');
  await page.setContent('<meta name="author" content="Blog writer"><script type="application/ld+json">{"@type":"BlogPosting","author":{"name":"Blog writer"},"datePublished":"2026-01-01"}</script>');
  result=await page.evaluate(pagePaperMetadata);expect(result.authors).toEqual([]);expect(result.year).toBe('');
  await page.setContent('<script type="application/ld+json">{"@graph":[{"@type":"ScholarlyArticle","author":[{"name":"JSON Author"}],"datePublished":"2023-05-10","isPartOf":{"name":"A Journal"}}]}</script>');
  result=await page.evaluate(pagePaperMetadata);expect(result.authors).toEqual(['JSON Author']);expect(result.year).toBe('2023');expect(result.venue).toBe('A Journal');
});
