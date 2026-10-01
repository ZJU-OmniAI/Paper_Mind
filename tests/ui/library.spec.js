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
