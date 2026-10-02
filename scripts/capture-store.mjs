// Store artwork uses unmodified application UI, isolated fixtures and no external requests.
import { chromium, expect } from '@playwright/test';
import { installDemo } from './demo/fixture.mjs';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output=path.join(root,'assets/store');
const scratch=path.join(root,'dist/store-work');
await mkdir(scratch,{recursive:true});
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const base=pathname.startsWith('/assets/')||pathname.startsWith('/dist/')||pathname.startsWith('/scripts/')?root:path.join(root,'extension');
  const file=path.resolve(base,'.'+pathname);
  if(!file.startsWith(base+path.sep))return res.writeHead(403).end();
  try{res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const checks=[];
try{
  browser=await chromium.launch({channel:process.env.PW_CHANNEL||undefined});
  const art=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,colorScheme:'light'});
  await art.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  const stage=await art.newPage();await stage.goto(origin+'/scripts/store/stage.html');
  for(const lang of ['zh','en']){
    const t=(zh,en)=>lang==='zh'?zh:en;
    const context=await browser.newContext({viewport:{width:1480,height:1200},deviceScaleFactor:1,colorScheme:'light',locale:lang==='zh'?'zh-CN':'en-US',timezoneId:'Asia/Shanghai'});
    await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
    await installDemo(context,lang,origin,{overview:true});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const shot=async(name,locator)=>{
      await page.evaluate(()=>document.fonts.ready);
      const filename=`${lang}-${name}.png`;
      await locator.screenshot({path:path.join(scratch,filename),animations:'disabled'});
      return `/dist/store-work/${filename}`;
    };
    const img=(src)=>`<img class="ui" src="${src}">`;
    const render=async(index,slug,title,subtitle,html)=>{
      await stage.evaluate(data=>window.render(data),{lang,index,title,subtitle,html});
      await stage.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));});
      const overflow=await stage.evaluate(()=>[...document.querySelectorAll('h1,#subtitle,.card,.footer')].filter(el=>el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2).map(el=>el.className||el.id||el.tagName));
      if(overflow.length)throw new Error(`Artwork overflow: ${lang}/${slug} ${overflow.join(',')}`);
      await stage.screenshot({path:path.join(output,`${String(index).padStart(2,'0')}-${slug}-${lang}.png`),animations:'disabled'});
    };
    await page.setViewportSize({width:480,height:1400});await page.goto(origin+'/popup.html');
    const title='Reading Papers with Evidence-Aware Agents';
    await expect(page.locator('#titleInput')).toHaveValue(title);
    const memory=t('先验证工具返回的证据，再让智能体回答论文问题。','Verify tool evidence before an agent answers questions about a paper.');
    await page.locator('#captureMemory').fill(memory);await page.locator('#captureReadingStatus').selectOption('reading');
    await page.locator('#valueScoreInput').fill('4.5');
    for(const alias of ['agent','evaluation']){await page.locator('#tagInput').fill(alias);await page.locator('#tagSuggestions .tag-suggestion:not(.create)').click();}
    await expect(page.locator('#tagBox .chip')).toHaveCount(2);
    const bib=await shot('bibliography',page.locator('#captureBibliography'));
    const paperTitle=await shot('title',page.locator('#titleInput').locator('..'));
    const memoryImage=await shot('memory',page.locator('.memory-fields'));
    const tags=await shot('capture-tags',page.locator('.tag-section'));
    await render(1,'capture',t('一篇论文，留下多个记忆入口。','One paper. Several ways to remember it.'),t('方向、方法、团队，用标签描述；再用一句话记住它。','Capture its details, choose several tags, and keep one sentence in your own words.'),`<div class="card half"><div class="label">${t('01 论文信息','01 PAPER DETAILS')}</div>${img(paperTitle)}${img(bib)}</div><div class="card half"><div class="label">${t('02 标签与个人记忆','02 TAGS & YOUR MEMORY')}</div>${img(memoryImage)}${img(tags)}</div>`);
    await page.locator('#saveButton').click();await expect(page.locator('#message')).toHaveClass(/success/);
    const saved=await page.evaluate(async()=>{const{handleApi}=await import('/storage.js');return(await handleApi('/api/state')).papers.find(p=>p.title==='Reading Papers with Evidence-Aware Agents');});
    expect(saved.tagIds.slice().sort()).toEqual(['agent','eval']);expect(saved.memory).toBe(memory);expect(saved.authors).toEqual(['Alex Chen','Morgan Lee']);
    await page.locator('#openManagerButton').click();await page.setViewportSize({width:1480,height:1200});await expect(page.locator('#paperCount')).toHaveText('9');
    await page.locator('#conceptQuery').fill(t('智能体优化','agent optimization'));
    await expect(page.locator('#conceptResults [data-concept-tag-id]')).toHaveCount(1);
    const concept=await shot('concept',page.locator('.concept-panel'));
    await render(2,'recall',t('标题忘了，从脑海中的概念开始。','Start with the idea you still remember.'),t('匹配已有标签，先读说明，再看关联论文。','Match existing tags, read their meaning, and explore the papers they connect.'),`<div class="card wide">${img(concept)}<div class="route"><span class="pill">${t('脑海中的概念','A remembered concept')}</span><span class="arrow">→</span><span class="pill">${t('已有标签','Existing tags')}</span><span class="arrow">→</span><span class="pill">${t('收藏论文','Saved papers')}</span></div></div>`);
    await page.locator('#conceptResults [data-concept-tag-id="agent"]').click();await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(3);
    await expect(page.locator('#libraryRefinement [data-library-tag-id="eval"]')).toContainText(t('剩 2 篇','2 left'));
    await page.setViewportSize({width:760,height:1200});
    const refinement=await shot('refinement',page.locator('#libraryRefinement'));
    await page.setViewportSize({width:1480,height:1200});
    await page.locator('#libraryRefinement [data-library-tag-id="eval"]').click();await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(2);
    const selected=await shot('selected-tags',page.locator('#activeLibraryFilters'));
    const card=page.locator(`#paperLibraryList [data-open-paper-id="${saved.id}"]`);await expect(card.locator('.recall-memory')).toContainText(memory);
    const result=await shot('paper-result',card);
    await render(3,'refine',t('再补一条线索，离目标更近一步。','Add one clue. Get closer to your paper.'),t('筛选建议显示剩余篇数，记忆句帮你认出当时的理解。','See exact narrowing counts and recognize the sentence you saved at the time.'),`<div class="card narrow"><div class="label">${t('3 篇候选 → 再加一个标签','3 MATCHES → ONE MORE TAG')}</div>${img(refinement)}<p class="legend">${t('系统提示还可以怎样缩小范围。','See which tag can narrow the current results.')}</p></div><div class="card rest"><div class="label">${t('组合标签后：2 篇论文','AFTER COMBINING TAGS: 2 PAPERS')}</div>${img(selected)}${img(result)}</div>`);
    await page.locator('[data-view="tags"]').click();await page.locator('#tagTree [data-tag-id="agent"]').click();
    const tagHeader=await shot('tag-header',page.locator('#selectedTagName').locator('..'));
    const description=await shot('tag-description',page.locator('#tagDetail .tag-description-block'));
    await expect(page.locator('#tagDetail')).toContainText(t('智能体优化','agent optimization'));
    await render(4,'tags',t('标签有含义，整理更有依据。','Give every tag a clear meaning.'),t('AI 根据你给的标签与关联论文生成说明，支持别名与复用。','AI explains your labels using linked paper excerpts. Reuse names and aliases as you save.'),`<div class="card wide"><div class="label">${t('标签说明 · 预置演示内容','TAG DESCRIPTION · PREWRITTEN EXAMPLE')}</div>${img(tagHeader)}${img(description)}<div class="route"><span class="pill">${t('你给的标签','Your labels')}</span><span class="arrow">+</span><span class="pill">${t('关联论文内容','Linked paper excerpts')}</span><span class="arrow">→</span><span class="pill">${t('含义与适用范围','Meaning and scope')}</span></div></div>`);
    await page.locator('[data-view="settings"]').click();await page.locator('[name="provider"][value="claude"]').check();
    await page.locator('#claudeModelSelect').selectOption('sonnet');await page.locator('#claudeEffort').selectOption('medium');await page.locator('#codexEffort').selectOption('high');
    expect(await page.locator('#bridgeToken').inputValue()).toBe('');
    const providers=await shot('providers',page.locator('#settingsForm > fieldset').nth(1));
    const claude=await shot('claude',page.locator('#localBackendSettings .local-model-group').nth(0));
    const codex=await shot('codex',page.locator('#localBackendSettings .local-model-group').nth(1));
    await render(5,'models',t('接入你自己的模型。','Connect the models you already use.'),t('Claude Code、Codex 或兼容 API；基础收藏与检索无需模型。','Use Claude Code, Codex or a compatible API. Core capture and search work without AI.'),`<div class="card wide">${img(providers)}<div class="stack">${img(claude)}${img(codex)}</div></div>`);
    // Reviewer fixture is a genuine export of the exact synthetic library used above.
    const exported=await page.evaluate(async()=>{const{handleApi}=await import('/storage.js');return await handleApi('/api/export');});
    expect(exported.store.papers).toHaveLength(9);expect(JSON.stringify(exported)).not.toContain('bridgeToken');
    const fixturePath=path.join(root,`docs/store/reviewer-library-${lang}.json`);
    await writeFile(fixturePath,JSON.stringify(exported,null,2)+'\n');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#importDataInput').setInputFiles(fixturePath);
    await expect(page.locator('#toast')).toContainText(t('已导入到 Chrome：9 篇论文','Imported to Chrome: 9 papers'));
    if(errors.length)throw new Error(errors.join('\n'));
    checks.push({language:lang,papers:9,tagsOnSavedPaper:saved.tagIds,filterCounts:[9,3,2],reviewerFixtureImported:true,noExternalRequests:true,pageErrors:errors});
    await context.close();console.log(`Store screenshots ${lang}: 5 images; real save, 9→3→2 filtering, memory and model fields verified.`);
  }
  await writeFile(path.join(scratch,'capture-checks.json'),JSON.stringify(checks,null,2)+'\n');
  await copyFile(path.join(root,'extension/icons/icon128.png'),path.join(output,'icon-128.png'));
  await art.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
