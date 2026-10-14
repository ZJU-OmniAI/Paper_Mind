import {test,expect} from '@playwright/test';

const TITLES=['Retrieval-Augmented Generation for Knowledge-Intensive Tasks','Self-RAG: Learning to Retrieve, Generate and Critique','Learning to Verify Evidence Before Answering'];
async function setup(page,{count=3,configured=true,auto=false,long=false,shortFields=false,malicious=false,methodDiagrams=false,synthesisDiagrams=false,branchDiagrams=false,horizontalLabel=false,designCharts=false}={}) {
  const errors=[],calls=[],control={failPaper:'',failSynthesis:false,pausePaper:'',paperStarted:false,releasePaper:null};page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({count,configured,auto,titles})=>{
    const now=new Date().toISOString();
    const papers=Array.from({length:count},(_,index)=>({id:`paper-${index}`,title:titles[index]||`Additional evidence paper ${index}`,abstract:`Paper ${index} investigates retrieval and evidence verification.`,conversation:`Personal note ${index}: consider checking evidence before generation.`,memory:`Remember the evidence-checking mechanism ${index}.`,clips:[{id:`clip-${index}`,title:'Saved discussion',markdown:`# Source ${index}\nRetrieval quality changes the cost of generation.`,sourceUrl:'https://example.test/source'}],tagIds:['topic-rag'],createdAt:now,updatedAt:now,citationCount:40,citationStatus:'ok',citationMatchVersion:2,citationSource:'semanticscholar:title',citationUpdatedAt:now}));
    const values={paperTagStore:{papers,tags:[{id:'topic-rag',name:'检索增强生成',description:'检索、生成与证据核验的研究。',descriptionStatus:'ready',createdAt:now,updatedAt:now}],topicPacks:[]},paperTagConfig:{provider:'qwen',qwenModel:'synthetic-topic-model',qwenKey:configured?'synthetic-only-key':'',autoDescribeTags:false,autoPaperGraphs:auto}};
    const listeners=[];window.chrome={storage:{local:{async get(keys){return Object.fromEntries(keys.map(key=>[key,structuredClone(values[key])]));},async set(data){Object.assign(values,structuredClone(data));},async remove(key){delete values[key];}}},runtime:{id:'test-extension',getURL:p=>`http://127.0.0.1:4178/${p}`,sendMessage:async()=>{},onMessage:{addListener:listener=>listeners.push(listener)},getContexts:async()=>[]},tabs:{query:async()=>[],create:async()=>{}},scripting:{executeScript:async()=>[]}};
    window.__emitMessage=message=>listeners.forEach(listener=>listener(message));
  },{count,configured,auto,titles:TITLES});
  await page.route('https://**/*',route=>route.fulfill({json:{}}));
  const extendedText='在设计层面，这一方法把证据是否足够与答案是否流畅分开处理。检索结果进入生成器以前，系统先判断来源之间是否存在冲突，并把无法确认的主张留给后续验证。个人笔记提出，真正重要的比较应固定总调用预算，否则更高的准确率可能只是更多计算的结果。现有摘要没有给出同一数据集上的完整消融实验，因此这些差异只能作为设计取舍，不能直接推断某种方法更好。实际落地还需要测量等待时间、失败恢复成本与用户纠正次数，并对比任务难度带来的影响。完整段落末尾保留：需要匹配计算预算再验证。';
  const makeDiagram=(flow=true)=>({kind:flow?'flow':'structure',nodes:[{id:'retrieval',role:'input',label:'检索候选证据'},{id:'checking',role:'decision',label:'检查证据缺口'},{id:'answer',role:'output',label:'生成带依据答案'}],edges:[{from:'retrieval',to:'checking',relation:flow?'flow':'contains',evidenceIds:['e1']},{from:'checking',to:'answer',relation:flow?'flow':'related',evidenceIds:['e1']}]});
  const formatReading=profile=>{
    if(methodDiagrams||branchDiagrams)profile.methodDiagram=makeDiagram(profile.evidence[0].paperId==='paper-0');
    if(methodDiagrams&&profile.evidence[0].paperId==='paper-1')profile.methodDiagram.nodes.push({id:'budget',role:'component',label:'统一比较预算'});
    if(branchDiagrams&&profile.evidence[0].paperId==='paper-0')profile.methodDiagram={kind:'flow',nodes:[{id:'answer',role:'output',label:'生成有依据的答案'},{id:'reuse',role:'step',label:'使用现有证据'},{id:'checking',role:'decision',label:'判断证据充分性'},{id:'retrieval',role:'step',label:'补充检索证据'}],edges:[{from:'retrieval',to:'answer',relation:'flow',evidenceIds:['e1']},{from:'checking',to:'retrieval',label:'不足',relation:'flow',evidenceIds:['e1']},{from:'reuse',to:'answer',relation:'flow',evidenceIds:['e1']},{from:'checking',to:'reuse',label:'充分',relation:'flow',evidenceIds:['e1']}]};
    if(horizontalLabel)profile.methodDiagram={kind:'structure',nodes:[{id:'policy',role:'component',label:'策略学习模块'},{id:'evidence',role:'component',label:'证据核验模块'},{id:'evaluation',role:'component',label:'统一策略评测'}],edges:[{from:'policy',to:'evidence',relation:'related',label:'PolicyLearning reuses checked evidence across both modules',evidenceIds:['e1']},{from:'policy',to:'evaluation',relation:'contains',label:'策略评测接入',evidenceIds:['e1']}]};
    if(long)for(const field of ['researchQuestion','approach','mechanism','distinctiveChoice','tradeoffs','personalTake'])profile[field]+=' '+extendedText;
    if(shortFields)profile.card={label:'证据核验方法',focus:'生成之前，证据够不够？',method:'先检索，再检查证据缺口',tradeoff:'更少错误；增加核验成本',note:malicious?'固定预算比较核验时机 <img src=x onerror="window.injected=true"> 可选短字段完整末尾':'固定预算，比较核验时机'};
    return profile;
  };
  const formatSynthesis=result=>{
    if(synthesisDiagrams)result.paperDiagrams=result.readingPath.map(item=>({paperId:item.paperId,...makeDiagram(true)}));
    if(designCharts){const ids=result.readingPath.map(item=>item.paperId),refs=result.commonalities[0].evidenceIds;result.paperStances=ids.map((paperId,index)=>({paperId,stance:index?'生成中反复核验证据':'先检索一次再生成 <b>粗体</b>'}));result.designAxes=[{axis:'核验发生在何时',low:'生成之前',high:'生成之中',positions:ids.map((paperId,index)=>({paperId,value:index?2:-2,reason:index?'推理中检查':'生成前收集'})),evidenceIds:refs},{axis:'是否改动模型',low:'免训练',high:'需要训练',positions:ids.map((paperId,index)=>({paperId,value:index===1?1:-1})),evidenceIds:refs},{axis:'没有证据的轴',low:'甲',high:'乙',positions:ids.map(paperId=>({paperId,value:0})),evidenceIds:[]}];}
    if(long){result.overview+=' '+extendedText;for(const item of result.commonalities)item.finding+=' '+extendedText;for(const item of result.differences){item.finding+=' '+extendedText;for(const group of item.groups){group.approach+=' '+extendedText;group.tradeoff+=' '+extendedText;}}for(const item of result.inspirations)for(const field of ['hypothesis','rationale','nextStep','caveat'])item[field]+=' '+extendedText;}
    if(shortFields){result.headline='生成之前先检查证据，还是生成之后再纠正？';for(const item of result.commonalities)item.summary='把外部证据纳入生成决策';for(const item of result.differences){item.summary='两条路线区别在核验发生的时机。';for(const group of item.groups){group.methodSummary='检查证据，再选择生成动作';group.tradeoffSummary='可靠性与推理成本之间的取舍';}}for(const item of result.inspirations){item.hypothesisSummary='先检查充分性，或可减少返工';item.testSummary='固定预算，对照两种核验时机';}}
    if(long||shortFields){const ids=result.readingPath.map(item=>item.paperId);result.differences.push({dimension:'核验模块是否独立',summary:'独立模块与生成内核验的设计对照',finding:'这一维度只在两篇论文中有足够材料；其余论文不能强行归类。',groups:[{label:'独立核验模块',paperIds:[ids[0]],approach:'把验证器与生成器分开。',tradeoff:'可以独立评估，但接口增多。'},{label:'生成过程内核验',paperIds:[ids[1]],approach:'在同一推理过程中检查。',tradeoff:'共享上下文，但难以分离错误来源。'}],evidenceIds:result.commonalities[0].evidenceIds.slice(0,2)});}
    return result;
  };
  await page.route('**/chat/completions',async route=>{
    const request=route.request().postDataJSON(),input=JSON.parse(request.messages.find(message=>message.role==='user').content);
    calls.push({task:input.task,paperId:input.paper?.paperId,input,model:request.model});
    if(input.task==='profile_saved_paper_method') {
      if(control.pausePaper===input.paper.paperId){control.paperStarted=true;await new Promise(resolve=>control.releasePaper=resolve);}
      if(control.failPaper===input.paper.paperId) return route.fulfill({status:503,json:{error:{message:'Synthetic reading service unavailable'}}});
      return route.fulfill({json:{choices:[{message:{content:JSON.stringify(formatReading({researchQuestion:'如何在回答之前判断检索证据是否足够？',approach:input.paper.paperId==='paper-0'?'固定检索后生成':'在推理过程中检查并修订证据',mechanism:'检索器提供候选证据，生成器结合证据组织回答。',distinctiveChoice:'把证据质量作为方法设计中的独立环节。',tradeoffs:'多次核验增加推理成本；材料未提供统一预算下的比较。',personalTake:'你的笔记关心先核验再生成，提示可以优先比较核验时机。',evidence:[{paperId:input.paper.paperId,quote:input.paper.notes},{paperId:input.paper.paperId,quote:input.paper.abstract}]}))}}]}});
    }
    if(input.task==='synthesize_tag_method_analysis') {
      if(control.failSynthesis) return route.fulfill({status:503,json:{error:{message:'Synthetic synthesis quota reached'}}});
      const profiles=input.profiles,ids=profiles.map(profile=>profile.paperId),refs=profiles.map(profile=>profile.evidence[0].id);
      return route.fulfill({json:{choices:[{message:{content:JSON.stringify(formatSynthesis({overview:`这组研究围绕“什么时候检查证据”形成两条方法路线：先检索再回答，以及在生成过程中反复核验。你的笔记进一步提出先判断证据是否充分的想法，适合在相同预算下比较。材料依据 ${refs[0]}。`,commonalities:[{title:'都把证据质量作为生成可靠性的前提',finding:'共同点不是使用相同主题词，而是把外部证据纳入生成决策；个人笔记尤其关注核验时机。',paperIds:ids,evidenceIds:refs}],differences:[{dimension:'证据核验发生在流程的哪个阶段',finding:'固定检索侧重简单流程，动态核验侧重在推理中发现缺口。',groups:[{label:'先检索，再生成',paperIds:[ids[0]],approach:'生成前一次性收集证据。',tradeoff:'调用次数少，但可能难以及时发现证据缺口。'},{label:'生成中反复核验',paperIds:ids.slice(1),approach:'在推理环节检查证据并决定是否重新检索。',tradeoff:'可以补充证据，但额外核验会提高成本。'}],evidenceIds:refs}],inspirations:[{title:'在生成前加入轻量证据充分性检查',hypothesis:'如果先检查证据是否充分，可能减少生成后的修订成本。',rationale:'这个假设来自你的笔记，并结合两类方法在核验时机上的差异。',nextStep:'固定总调用预算，比较先核验与生成后核验的失败率。',caveat:'尚未验证，也未检索外部文献确认新颖性。',paperIds:ids,evidenceIds:refs}],readingPath:ids.map((paperId,index)=>({paperId,reason:index?'比较核验机制如何改变流程与成本。':'先理解固定检索的基本流程。'})),openQuestions:['哪类任务更容易因证据不足而失败？']}))}}]}});
    }
    if(input.task==='compare_saved_papers') {
      const ids=input.papers.map(paper=>paper.paperId),quote=id=>({paperId:id,quote:input.papers.find(paper=>paper.paperId===id).evidence.split('\n').find(line=>line.startsWith('Paper '))});
      return route.fulfill({json:{choices:[{message:{content:JSON.stringify({title:'核验时机对比 <img src=x onerror="window.injected=true">',comparison:{headline:'差别在于证据在生成前还是生成中被检查',summary:'两篇都依赖检索证据，但核验发生的阶段不同。',stances:ids.map((paperId,index)=>({paperId,stance:index?'边生成边核验':'先核验再生成'})),dimensions:[{name:'核验时机',cells:ids.map((paperId,index)=>({paperId,choice:index?'生成中核验':'生成前核验',finding:index?'在推理过程中检查证据。':'在生成之前检查证据。',evidence:[quote(paperId)]}))},{name:'证据来源',cells:ids.map(paperId=>({paperId,choice:'外部检索',finding:'都使用检索到的外部证据。',evidence:[quote(paperId)]}))},{name:'统一预算评测',cells:ids.map(paperId=>({paperId,finding:'材料未提供',evidence:[]}))}],axes:[{axis:'核验发生在何时',low:'生成之前',high:'生成之中',positions:ids.map((paperId,index)=>({paperId,value:index?2:-2,reason:index?'推理中检查':'生成前检查'}))}],commonalities:['都依赖外部检索证据。'],differences:['核验所处阶段不同。'],gaps:['缺少统一预算下的比较。']}})}}]}});
    }
    if(input.task==='discuss_saved_research') {
      const paper=input.papers[0];
      return route.fulfill({json:{choices:[{message:{content:JSON.stringify({answerKind:'grounded',answer:`回答：${input.question}`,evidence:[{paperId:paper.paperId,quote:paper.evidence.split('\n').find(line=>line.startsWith('Paper '))}],suggestedQuestions:['统一预算下怎样比较？']})}}]}});
    }
    return route.fulfill({status:400,json:{error:{message:`Unexpected synthetic task ${input.task}`}}});
  });
  await page.goto('/manager.html');await expect(page.locator('#paperCount')).toHaveText(String(count));
  await page.locator('[data-view="tags"]').click();await page.locator('#tagTree [data-tag-id="topic-rag"]').click();
  await expect(page.locator('#tagPaperAnalysis')).toBeVisible();
  return {errors,calls,control};
}
async function step(page) {
  return page.evaluate(async()=>{const {handleApi}=await import('/storage.js');await handleApi('/api/paper-analyses/update-next',{method:'POST'});const {analysis}=await handleApi('/api/tags/topic-rag/paper-analysis');window.__emitMessage({type:'paper-analyses-updated'});return analysis;});
}
async function complete(page,count=3) {
  await page.locator('[data-analysis-generate]').click();
  for(let index=0;index<count+3;index++){const state=await step(page);if(state.status==='ready')return state;if(state.status==='error')throw new Error(state.error);}
  throw new Error('Synthetic topic analysis did not finish');
}

test('topic analysis turns all saved sources into overview, design comparisons and testable ideas',async({page})=>{
  const {errors,calls}=await setup(page);
  await expect(page.locator('.analysis-heading h4')).toHaveText('标签专题分析');
  await expect(page.locator('#tagPaperGraph')).toHaveCount(0);
  await page.locator('.analysis-scope summary').click();
  await expect(page.locator('.analysis-scope')).toContainText('完整个人笔记');
  const result=await complete(page);
  expect(calls.map(call=>call.task)).toEqual(['profile_saved_paper_method','profile_saved_paper_method','profile_saved_paper_method','synthesize_tag_method_analysis']);
  expect(calls[0].input.paper.notes).toContain('Personal note 0');
  expect(calls[0].input.paper.memory).toContain('Remember the evidence');
  expect(calls[0].input.paper.clips[0]).toContain('Retrieval quality changes');
  await expect(page.locator('.analysis-status')).toHaveText('分析已更新');
  await expect(page.locator('.analysis-overview')).toContainText('什么时候检查证据');
  await expect(page.locator('.analysis-overview')).not.toContainText('paper-0:e1');
  await expect(page.locator('.analysis-reading-path li')).toHaveCount(3);
  await page.locator('[data-analysis-detail="common-0"] > summary').click();
  await page.locator('[data-analysis-detail="common-evidence-0"] > summary').click();
  await expect(page.locator('[data-analysis-detail="common-0"]')).toContainText('个人笔记 / 对话记录 · 保存原文');
  await page.locator('[data-analysis-tab="methods"]').click();
  await expect(page.locator('.analysis-methods-board')).toBeVisible();
  await expect(page.locator('.analysis-method-card')).toHaveCount(3);
  await page.locator('[data-analysis-detail="profile-paper-0"] > summary').click();
  await expect(page.locator('.analysis-personal').first()).toContainText('你的笔记与关注点');
  await expect(page.locator('.analysis-personal').first()).toContainText('先核验再生成');
  await page.locator('[data-analysis-tab="methods"]').focus();await page.locator('[data-analysis-tab="methods"]').press('ArrowRight');
  await expect(page.locator('[data-analysis-tab="ideas"]')).toBeFocused();
  await expect(page.locator('.analysis-idea')).toContainText('固定总调用预算');
  await expect(page.locator('.analysis-idea')).toContainText('尚未验证');
  await page.locator('[data-analysis-detail="idea-0"] > summary').click();
  await page.locator('[data-analysis-detail="idea-evidence-0"] > summary').click();
  await expect(page.locator('[data-analysis-detail="idea-0"] blockquote')).toHaveCount(3);
  expect(result.resultProfiles).toHaveLength(3);
  await page.locator('[data-analysis-detail="idea-evidence-0"] [data-analysis-paper="paper-0"]').click();
  await expect(page.locator('#paperDetailTitle')).toHaveText(TITLES[0]);
  expect(errors).toEqual([]);
});

test('a failed paper reading keeps completed work and retry resumes only unfinished papers',async({page})=>{
  const {errors,calls,control}=await setup(page);control.failPaper='paper-1';
  await page.locator('[data-analysis-generate]').click();
  const first=await step(page);expect(first.progress.completed).toBe(1);
  await expect(page.locator('.analysis-progress')).toContainText('1 / 3 篇已完成解读');
  const failed=await step(page);expect(failed.status).toBe('error');
  await expect(page.locator('.analysis-error')).toContainText('Synthetic reading service unavailable');
  await expect(page.locator('[data-analysis-generate]')).toBeEnabled();
  await page.locator('[data-analysis-tab="methods"]').click();await expect(page.locator('.analysis-profile')).toHaveCount(3);await expect(page.locator('.analysis-profile[data-profile-status="pending"]')).toHaveCount(2);
  control.failPaper='';await complete(page);
  expect(calls.filter(call=>call.paperId==='paper-0')).toHaveLength(1);
  expect(calls.filter(call=>call.paperId==='paper-1')).toHaveLength(2);
  await expect(page.locator('.analysis-status')).toHaveText('分析已更新');
  expect(errors).toEqual([]);
});

test('note edits refresh one paper and keep completed synthesis evidence while the next synthesis fails',async({page})=>{
  const {errors,calls,control}=await setup(page);await complete(page);
  await page.evaluate(async()=>{const {handleApi}=await import('/storage.js');const state=await handleApi('/api/state'),paper=state.papers.find(p=>p.id==='paper-0');await handleApi('/api/papers/paper-0',{method:'PUT',body:JSON.stringify({...paper,conversation:'New personal note: test evidence checking under equal budgets.',manualTags:['检索增强生成']})});window.__emitMessage({type:'paper-analyses-updated'});});
  await expect(page.locator('.analysis-coverage')).toContainText('1 篇论文的笔记或其他材料已变化');
  await expect(page.locator('.analysis-coverage')).toContainText('2 / 3 篇论文的最新材料');
  const callsBeforeUpdate=calls.length;await step(page);expect(calls).toHaveLength(callsBeforeUpdate);
  control.failSynthesis=true;await page.locator('[data-analysis-generate]').click();
  await step(page);const failed=await step(page);expect(failed.status).toBe('error');
  expect(calls.filter(call=>call.task==='profile_saved_paper_method')).toHaveLength(4);
  await expect(page.locator('.analysis-overview')).toContainText('什么时候检查证据');
  await expect(page.locator('.analysis-overview')).not.toContainText('paper-0:e1');
  await page.locator('[data-analysis-detail="common-0"] > summary').click();
  await page.locator('[data-analysis-detail="common-evidence-0"] > summary').click();
  await expect(page.locator('[data-analysis-detail="common-0"]')).toContainText('Personal note 0:');
  await expect(page.locator('[data-analysis-detail="common-0"]')).not.toContainText('New personal note:');
  control.failSynthesis=false;await complete(page);
  expect(calls.filter(call=>call.task==='profile_saved_paper_method')).toHaveLength(4);
  await expect(page.locator('.analysis-notice.stale')).toHaveCount(0);
  await expect(page.locator('[data-analysis-detail="common-0"]')).toContainText('New personal note:');
  expect(errors).toEqual([]);
});

test('English mobile, dark mode and complete membership remain readable with real stored analysis',async({page})=>{
  const {errors}=await setup(page,{count:12});await complete(page,12);
  await page.locator('[data-analysis-tab="methods"]').click();await expect(page.locator('.analysis-profile')).toHaveCount(12);
  await page.locator('#languageSelect').selectOption('en');await expect(page.locator('.analysis-heading h4')).toHaveText('Topic analysis');
  await page.locator('[data-analysis-detail="profile-paper-0"] > summary').click();
  await expect(page.locator('.analysis-personal').first()).toContainText('Your notes and interests');
  await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.analysis-methods-board').scrollIntoViewIfNeeded();
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.screenshot({path:'test-results/tag-analysis-mobile-dark.png'});
  await page.locator('[data-view="settings"]').click();
  await expect(page.locator('#autoPaperGraphs')).toHaveCount(0);
  await expect(page.locator('#topicAnalysisPolicyHint')).toContainText('Click “Analyze this topic” or “Update analysis”');
  expect(errors).toEqual([]);
});

test('new topic analysis has useful setup guidance and a readable desktop overview',async({page})=>{
  const {errors}=await setup(page,{shortFields:true});await complete(page);
  await page.locator('[data-analysis-expand]').click();
  await page.locator('#tagPaperAnalysis').scrollIntoViewIfNeeded();
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-desktop.png'});
  await page.locator('[data-analysis-tab="methods"]').click();
  await page.locator('.analysis-methods-board').scrollIntoViewIfNeeded();
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-methods.png'});
  expect(errors).toEqual([]);
});

test('reanalyzing keeps the saved model unless current settings are explicitly chosen',async({page})=>{
  const {errors,calls}=await setup(page);await complete(page);
  await page.locator('[data-view="settings"]').click();
  await page.locator('#qwenModelSelect').selectOption('__custom__');await page.locator('#qwenModel').fill('newly-selected-model');
  await page.locator('#settingsForm button[type="submit"]').click();await expect(page.locator('#toast')).toContainText('模型设置已保存');
  await page.locator('[data-view="tags"]').click();
  await expect(page.locator('.analysis-scope summary')).toContainText('synthetic-topic-model');
  await page.locator('.analysis-model-options summary').click();
  await expect(page.locator('.analysis-model-options')).toContainText('newly-selected-model');
  await page.locator('[data-analysis-full]').click();
  for(let i=0;i<5;i++){if((await step(page)).status==='ready')break;}
  expect(calls.at(-1).model).toBe('synthetic-topic-model');
  await page.locator('[data-analysis-current]').click();
  for(let i=0;i<5;i++){if((await step(page)).status==='ready')break;}
  expect(calls.at(-1).model).toBe('newly-selected-model');
  await expect(page.locator('.analysis-scope summary')).toContainText('newly-selected-model');
  expect(errors).toEqual([]);
});

test('insufficient material explains the comparison threshold rather than leaving a disabled action unexplained',async({page})=>{
  const {errors,calls}=await setup(page,{count:1});
  await expect(page.locator('.analysis-material-gap')).toContainText('目前 1 篇有可分析材料');
  await expect(page.locator('.analysis-material-gap')).toContainText('至少需要 2 篇');
  await expect(page.locator('[data-analysis-generate]')).toBeDisabled();
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.locator('.analysis-material-gap')).toContainText('at least 2 papers');
  expect(calls).toHaveLength(0);expect(errors).toEqual([]);
});

test('analysis requires a manual request even when the legacy automatic setting is enabled',async({page})=>{
  const {errors,calls}=await setup(page,{auto:true});
  await expect(page.locator('[data-analysis-generate]')).toHaveText('生成专题分析');
  await expect(page.locator('.analysis-status')).toHaveText('等待手动分析');
  await expect(page.locator('.analysis-progress')).toHaveCount(0);
  await step(page);expect(calls).toHaveLength(0);
  await expect(page.locator('[data-analysis-generate]')).toBeEnabled();
  await page.locator('[data-analysis-generate]').click();
  await expect(page.locator('[data-analysis-generate]')).toBeDisabled();
  await expect(page.locator('#toast')).toContainText('已加入后台分析队列');
  const analysis=await page.evaluate(async()=>{const {handleApi}=await import('/storage.js');return (await handleApi('/api/tags/topic-rag/paper-analysis')).analysis;});
  expect(analysis.manualRequested).toBe(true);
  await step(page);
  await expect(page.locator('.analysis-progress')).toContainText('1 / 3 篇已完成解读');
  expect(errors).toEqual([]);
});

test('background queue failures are visible even before a paper reading starts',async({page})=>{
  const {errors}=await setup(page,{auto:true});
  await expect(page.locator('.analysis-status')).toHaveText('等待手动分析');
  await page.evaluate(()=>window.__emitMessage({type:'paper-analyses-updated',error:'Synthetic background failure: could not claim the analysis job'}));
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Synthetic background failure: could not claim the analysis job');
  expect(errors).toEqual([]);
});

test('new papers remain outside the saved report until a manual incremental update',async({page})=>{
  const {errors,calls}=await setup(page,{auto:true});await complete(page);
  const savedOverview=await page.locator('.analysis-overview').textContent();
  const paperId=await page.evaluate(async()=>{
    const {handleApi}=await import('/storage.js');
    const result=await handleApi('/api/papers',{method:'POST',body:JSON.stringify({title:'New evidence gating study',abstract:'A new mechanism checks evidence before generation.',conversation:'Personal note: compare the cost of gating.',manualTags:['检索增强生成']})});
    window.__emitMessage({type:'paper-analyses-updated'});return result.paper.id;
  });
  await expect(page.locator('.analysis-coverage')).toContainText('有 1 篇新论文尚未纳入当前分析');
  await expect(page.locator('.analysis-coverage')).toContainText('3 / 4 篇论文的最新材料');
  await expect(page.locator('.analysis-progress')).toHaveCount(0);
  await expect(page.locator('[data-analysis-generate]')).toHaveText('更新分析');
  await expect(page.locator('[data-analysis-generate]')).toBeEnabled();
  await expect(page.locator('.analysis-overview')).toHaveText(savedOverview);
  const completedCalls=calls.length;await step(page);expect(calls).toHaveLength(completedCalls);
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.locator('.analysis-coverage')).toContainText('1 new paper is not yet included');
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.screenshot({path:'test-results/tag-analysis-pending-update.png',fullPage:true});
  await complete(page,4);
  expect(calls.slice(completedCalls).map(call=>call.task)).toEqual(['profile_saved_paper_method','synthesize_tag_method_analysis']);
  expect(calls[completedCalls].paperId).toBe(paperId);
  await expect(page.locator('.analysis-coverage')).toHaveCount(0);
  await expect(page.locator('.analysis-reading-path li')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('removed papers are identified while the previous report stays available',async({page})=>{
  const {errors,calls}=await setup(page);await complete(page);
  await page.evaluate(async()=>{
    const {handleApi}=await import('/storage.js');
    await handleApi('/api/papers/paper-2',{method:'DELETE'});window.__emitMessage({type:'paper-analyses-updated'});
  });
  await expect(page.locator('.analysis-coverage')).toContainText('1 篇论文已移出此标签');
  await expect(page.locator('.analysis-coverage')).toContainText('2 / 2 篇论文的最新材料');
  await expect(page.locator('.analysis-reading-path li')).toHaveCount(3);
  const completedCalls=calls.length;await step(page);expect(calls).toHaveLength(completedCalls);
  await complete(page,2);
  expect(calls.slice(completedCalls).map(call=>call.task)).toEqual(['synthesize_tag_method_analysis']);
  await expect(page.locator('.analysis-reading-path li')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('a manually requested running task shows progress and prevents duplicate submissions',async({page})=>{
  const {errors,control}=await setup(page);control.pausePaper='paper-0';
  await page.locator('[data-analysis-generate]').click();
  await expect(page.locator('.analysis-status')).toHaveText('分析任务已排队');
  await expect(page.locator('[data-analysis-generate]')).toBeDisabled();
  const reading=step(page);
  try {
    await expect.poll(()=>control.paperStarted).toBe(true);
    await page.evaluate(()=>window.__emitMessage({type:'paper-analyses-updated'}));
    await expect(page.locator('.analysis-status')).toContainText('正在阅读第 1 / 3 篇');
    await expect(page.locator('.analysis-progress')).toContainText('后续仅重读新增或材料变化');
    await expect(page.locator('[data-analysis-generate]')).toBeDisabled();
    await expect(page.locator('[data-analysis-full]')).toBeDisabled();
  } finally {control.releasePaper?.();await reading;}
  expect(errors).toEqual([]);
});

test('long legacy reports become a complete route map and compact matrix without another model request',async({page})=>{
  const {errors,calls}=await setup(page,{count:12,long:true});await complete(page,12);
  const completedCalls=calls.length;
  await page.locator('[data-analysis-expand]').click();
  await expect(page.locator('#tagPaperAnalysis')).toHaveAttribute('role','dialog');
  await expect(page.locator('.analysis-board-tag')).toHaveText('检索增强生成');
  await expect(page.locator('.analysis-story > h5')).toHaveCount(0);
  await page.locator('[data-analysis-detail="overview-full"] > summary').click();
  await expect(page.locator('[data-analysis-detail="overview-full"]')).toContainText('完整段落末尾保留：需要匹配计算预算再验证');
  await page.locator('[data-analysis-detail="overview-full"] > summary').click();
  await expect(page.locator('.analysis-upgrade-note')).toHaveCount(0);
  await expect(page.locator('.design-similarity .design-heatmap')).toBeVisible();
  await page.locator('[data-analysis-tab="matrix"]').click();
  await expect(page.locator('.analysis-branch-root')).toBeVisible();
  await expect(page.locator('.analysis-design-matrix tbody tr')).toHaveCount(12);
  await expect(page.locator('.analysis-design-matrix .matrix-dimension-col')).toHaveCount(2);
  await page.locator('[data-analysis-dimension]').selectOption('1');
  const routeIds=await page.locator('[data-route-paper]').evaluateAll(nodes=>nodes.map(node=>node.dataset.routePaper));
  expect(new Set(routeIds).size).toBe(12);
  await expect(page.locator('.analysis-route-unassigned [data-route-paper]')).toHaveCount(10);
  await expect(page.locator('.analysis-route-unassigned')).toContainText('本维度未比较');
  await page.locator('[data-analysis-dimension]').selectOption('0');
  expect(new Set(await page.locator('[data-route-paper]').evaluateAll(nodes=>nodes.map(node=>node.dataset.routePaper))).size).toBe(12);
  await page.locator('[data-analysis-matrix-dimension="1"]').click();
  await expect(page.locator('[data-analysis-dimension]')).toHaveValue('1');
  await page.locator('[data-analysis-tab="overview"]').click();
  await expect(page.locator('[data-analysis-detail="overview-full"]')).not.toHaveAttribute('open','');
  await page.locator('[data-analysis-tab="matrix"]').click();
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-long-overview.png'});
  await page.locator('[data-analysis-tab="methods"]').click();
  await expect(page.locator('.analysis-method-card')).toHaveCount(12);
  await expect(page.locator('.analysis-profile[open]')).toHaveCount(0);
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-long-matrix.png'});
  await page.locator('[data-analysis-detail="profile-paper-0"] > summary').click();
  await expect(page.locator('[data-analysis-detail="profile-paper-0"] .analysis-profile-body')).toContainText('完整段落末尾保留：需要匹配计算预算再验证');
  await page.locator('[data-analysis-detail="profile-evidence-paper-0"] > summary').click();
  await expect(page.locator('[data-analysis-detail="profile-evidence-paper-0"] blockquote').first()).toHaveText('Personal note 0: consider checking evidence before generation.');
  await page.locator('[data-analysis-detail="profile-paper-0"] > summary').click();
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.querySelector('#tagPaperAnalysis').scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-long-mobile.png'});
  await page.keyboard.press('Escape');
  await expect(page.locator('#tagPaperAnalysis')).not.toHaveAttribute('role','dialog');
  await expect(page.locator('[data-analysis-expand]')).toBeFocused();
  expect(calls).toHaveLength(completedCalls);expect(errors).toEqual([]);
});

test('new visual summaries stay escaped and their complete text and sources remain accessible',async({page})=>{
  const {errors}=await setup(page,{shortFields:true,malicious:true});await complete(page);
  await expect(page.locator('[data-analysis-detail="overview-full"]')).toContainText('生成之前先检查证据，还是生成之后再纠正？');
  await expect(page.locator('.analysis-common-card')).toContainText('把外部证据纳入生成决策');
  await page.locator('[data-analysis-tab="matrix"]').click();
  await expect(page.locator('.analysis-branch-block').first()).toContainText('检查证据');
  await page.locator('[data-analysis-expand]').click();
  await page.locator('[data-analysis-tab="methods"]').click();
  await expect(page.locator('.analysis-method-card').first()).toContainText('证据核验方法');
  await expect(page.locator('.analysis-fallback-structure')).toHaveCount(3);
  await page.locator('[data-analysis-detail="profile-paper-0"] > summary').click();
  await expect(page.locator('[data-analysis-detail="profile-paper-0"] .analysis-profile-body')).toContainText('可选短字段完整末尾');
  await expect(page.locator('#tagPaperAnalysis img')).toHaveCount(0);
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();
  await page.locator('[data-analysis-tab="ideas"]').click();
  await expect(page.locator('.analysis-idea-steps')).toContainText('固定预算');
  expect((await page.locator('.analysis-idea-steps').innerText()).length).toBeLessThan(90);
  await page.locator('[data-analysis-detail="idea-0"] > summary').click();
  await page.locator('[data-analysis-detail="idea-evidence-0"] > summary').click();
  await expect(page.locator('[data-analysis-detail="idea-evidence-0"] blockquote')).toHaveCount(3);
  await page.locator('[data-analysis-detail="idea-evidence-0"] [data-analysis-paper="paper-0"]').click();
  await expect(page.locator('#paperDetailTitle')).toHaveText(TITLES[0]);
  await expect(page.locator('#tagPaperAnalysis')).not.toHaveClass(/analysis-expanded/);
  expect(errors).toEqual([]);
});

test('method diagrams draw supported flow arrows and structural links, with keyboard-accessible node sources',async({page})=>{
  const {errors}=await setup(page,{methodDiagrams:true});await complete(page);
  await page.locator('[data-analysis-expand]').click();
  await page.locator('[data-analysis-tab="methods"]').click();
  await expect(page.locator('.analysis-method-svg')).toHaveCount(3);
  const first=page.locator('[data-method-paper="paper-0"]');
  await expect(first.locator('[data-diagram-kind="flow"]')).toHaveCount(1);
  await expect(first.locator('.analysis-diagram-note > summary')).toContainText('笔记视角');
  await first.locator('.analysis-diagram-note > summary').click();
  await expect(first.locator('.analysis-diagram-note p')).toContainText('提示可以优先比较核验时机');
  await first.locator('.analysis-diagram-note > summary').click();
  await expect(first.locator('.analysis-diagram-edge[marker-end]')).toHaveCount(2);
  const second=page.locator('[data-method-paper="paper-1"]');
  await expect(second.locator('[data-diagram-kind="structure"]')).toHaveCount(1);
  await expect(second.locator('.analysis-diagram-edge[marker-end]')).toHaveCount(0);
  await expect(second.locator('.analysis-diagram-edge')).toHaveCount(2);
  await expect(second.locator('[data-edge-from="retrieval"][data-edge-to="checking"]')).toHaveAttribute('d',/ H /);
  await first.locator('[data-analysis-diagram-node="checking"]').focus();
  await first.locator('[data-analysis-diagram-node="checking"]').press('Enter');
  await expect(page.locator('[data-analysis-detail="diagram-paper-0"]')).toHaveAttribute('open','');
  await expect(page.locator('[data-analysis-detail="diagram-evidence-paper-0"] blockquote')).toBeVisible();
  await expect(page.locator('[data-analysis-detail="diagram-evidence-paper-0"]')).toContainText('Personal note 0: consider checking evidence before generation.');
  await page.locator('[data-analysis-detail="diagram-paper-0"] > summary').click();
  await second.locator('[data-analysis-diagram-node="budget"]').click();
  await expect(page.locator('[data-analysis-detail="diagram-paper-1"] .analysis-node-source-note')).toHaveText('本节点未给出单独引用，下方为本篇已核验材料。');
  await page.locator('[data-analysis-detail="diagram-paper-1"] > summary').click();
  await page.locator('#tagPaperAnalysis').evaluate(node=>node.scrollTop=0);
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-method-diagrams.png'});
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#tagPaperAnalysis').scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-diagrams-mobile.png'});
  expect(errors).toEqual([]);
});

test('a synthesis timeout offers continuation without pretending analysis is still running',async({page})=>{
  const {errors,calls,control}=await setup(page);control.failSynthesis=true;
  await page.locator('[data-analysis-generate]').click();
  for(let i=0;i<4;i++)await step(page);
  await expect(page.locator('.analysis-progress')).toContainText('已完成逐篇解读，综合未完成；重试会继续这一步');
  await expect(page.locator('.analysis-progress')).not.toContainText('正在');
  await expect(page.locator('.analysis-progress progress')).toHaveCount(0);
  await expect(page.locator('.analysis-manual-hint')).toHaveCount(0);
  await page.locator('.analysis-error > summary').click();
  await expect(page.locator('.analysis-error [role="alert"]')).toContainText('Synthetic synthesis quota reached');
  control.failSynthesis=false;const prior=calls.length;await complete(page);
  expect(calls.slice(prior).map(call=>call.task)).toEqual(['synthesize_tag_method_analysis']);
  expect(errors).toEqual([]);
});

test('an old saved report can request diagrams through synthesis without rereading its papers',async({page})=>{
  const {errors,calls}=await setup(page,{synthesisDiagrams:true});await complete(page);
  await page.evaluate(async()=>{
    const {handleApi}=await import('/storage.js');
    const values=await handleApi('/api/export');
    const analysis=values.store.tags.find(tag=>tag.id==='topic-rag').paperAnalysis;
    delete analysis.result.visualVersion;delete analysis.result.paperDiagrams;
    await handleApi('/api/import',{method:'POST',body:JSON.stringify(values)});window.__emitMessage({type:'paper-analyses-updated'});
  });
  await expect(page.locator('[data-analysis-generate]')).toHaveText('生成设计图表');
  await expect(page.locator('.analysis-upgrade-note')).toContainText('生成设计图表');
  const prior=calls.length;await step(page);expect(calls).toHaveLength(prior);
  await complete(page);
  expect(calls.slice(prior).map(call=>call.task)).toEqual(['synthesize_tag_method_analysis']);
  await page.locator('[data-analysis-tab="methods"]').click();
  await expect(page.locator('.analysis-method-svg')).toHaveCount(3);
  expect(errors).toEqual([]);
});


test('branch and merge diagrams follow evidence-backed hierarchy rather than node or edge input order',async({page})=>{
  const {errors}=await setup(page,{count:2,branchDiagrams:true});await complete(page,2);
  await page.locator('[data-analysis-expand]').click();await page.locator('[data-analysis-tab="methods"]').click();
  const first=page.locator('[data-method-paper="paper-0"]');
  await expect(first.locator('svg')).toHaveAttribute('data-diagram-layout','layered');
  await expect(first.locator('.analysis-diagram-edge[marker-end]')).toHaveCount(4);
  await expect(first.locator('.analysis-edge-label text')).toHaveText(['不足','充分']);
  const positions=await first.locator('[data-analysis-diagram-node]').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.dataset.analysisDiagramNode,{x:Number(node.querySelector('rect').getAttribute('x')),y:Number(node.querySelector('rect').getAttribute('y'))}])));
  expect(positions.checking.y).toBeLessThan(positions.reuse.y);
  expect(positions.reuse.y).toBe(positions.retrieval.y);
  expect(positions.reuse.x).not.toBe(positions.retrieval.x);
  expect(positions.retrieval.y).toBeLessThan(positions.answer.y);
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-branch-merge.png'});
  expect(errors).toEqual([]);
});


test('long same-row relation labels stay above modules without overlapping diagonal labels',async({page})=>{
  const {errors}=await setup(page,{count:2,horizontalLabel:true});await complete(page,2);
  await page.locator('[data-analysis-expand]').click();await page.locator('[data-analysis-tab="methods"]').click();
  const first=page.locator('[data-method-paper="paper-0"]');
  await expect(first.locator('[data-label-from="policy"][data-label-to="evidence"] text')).toHaveText('PolicyLearning reuses checked evidence across both modules');
  await expect(first.locator('[data-edge-from="policy"][data-edge-to="evidence"]')).toHaveClass(/related/);
  await expect(first.locator('[data-edge-from="policy"][data-edge-to="evidence"]')).not.toHaveAttribute('marker-end');
  await expect(first.locator('[data-edge-from="policy"][data-edge-to="evidence"]')).toHaveAttribute('d',/ V .* H .* V /);
  const fits=await first.locator('svg').evaluate(svg=>{
    const label=svg.querySelector('[data-label-to="evidence"] rect').getBoundingClientRect(),diagonal=svg.querySelector('[data-label-to="evaluation"] rect').getBoundingClientRect(),box=svg.getBoundingClientRect();
    const nodes=[...svg.querySelectorAll('.analysis-diagram-node rect')].map(node=>node.getBoundingClientRect());
    const separate=label.right<diagonal.left||label.left>diagonal.right||label.bottom<diagonal.top||label.top>diagonal.bottom;
    return separate&&label.bottom<Math.min(...nodes.map(node=>node.top))&&label.left>=box.left&&label.right<=box.right&&label.top>=box.top;
  });
  expect(fits).toBe(true);
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-horizontal-label.png'});
  expect(errors).toEqual([]);
});

test('design matrix, design space and spectra show each paper’s choices and feed a tag-scoped comparison',async({page})=>{
  const {errors,calls}=await setup(page,{designCharts:true});await complete(page);
  await expect(page.locator('.analysis-hero')).toContainText('什么时候检查证据');
  await expect(page.locator('.design-scatter .design-point')).toHaveCount(3);
  await expect(page.locator('.design-spectrum')).toHaveCount(2);
  await expect(page.locator('.design-legend')).toContainText('先检索一次再生成 <b>粗体</b>');
  await expect(page.locator('#tagPaperAnalysis b')).toHaveCount(0);
  await expect(page.locator('.analysis-foundation-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.analysis-foundation-table .foundation-share')).toHaveText('3/3');
  await page.locator('.design-scatter [data-analysis-select="paper-0"]').click();
  await expect(page.locator('.analysis-selection-bar')).toContainText('已选 1 篇');
  await expect(page.locator('[data-analysis-compare-go]')).toBeDisabled();
  await expect(page.locator('.design-scatter [data-analysis-select="paper-0"]')).toHaveClass(/selected/);
  await page.locator('[data-analysis-tab="matrix"]').click();
  await expect(page.locator('.analysis-design-matrix tbody tr')).toHaveCount(3);
  await expect(page.locator('.analysis-design-matrix .analysis-choice')).toHaveCount(3);
  await expect(page.locator('.analysis-design-matrix .matrix-stance-col').nth(1)).toContainText('<b>粗体</b>');
  await expect(page.locator('.analysis-design-matrix [data-analysis-select="paper-0"]')).toBeChecked();
  await page.locator('.analysis-design-matrix [data-analysis-select="paper-1"]').check();
  await expect(page.locator('.design-heatmap .design-heat-cell')).toHaveCount(6);
  await expect(page.locator('.design-pairs')).toContainText('最相近');
  await page.locator('[data-analysis-compare-go]').first().click();
  await expect(page.locator('[data-analysis-tab="compare"]')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.compare-paper-option input:checked')).toHaveCount(2);
  await page.locator('#tagCompareQuestion').fill('核验时机有什么不同？');
  await page.locator('[data-compare-run]').click();
  await expect(page.locator('.compare-report')).toBeVisible();
  const compareCall=calls.find(call=>call.task==='compare_saved_papers');
  expect(compareCall.input.papers.map(paper=>paper.paperId)).toEqual(['paper-0','paper-1']);
  expect(compareCall.input.question).toBe('核验时机有什么不同？');
  expect(compareCall.input.tags.map(tag=>tag.id)).toEqual(['topic-rag']);
  await expect(page.locator('.compare-report h5')).toContainText('<img');
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();
  await expect(page.locator('.compare-headline')).toHaveText('差别在于证据在生成前还是生成中被检查');
  await expect(page.locator('.compare-stance')).toHaveCount(2);
  await expect(page.locator('.compare-table tbody tr')).toHaveCount(3);
  await expect(page.locator('.compare-table tbody tr').first().locator('.compare-row-badge')).toHaveText('各不相同');
  await expect(page.locator('.compare-row-badge.same')).toHaveText('选择一致');
  await expect(page.locator('.compare-table tbody tr').nth(2).locator('.analysis-choice')).toHaveCount(0);
  await expect(page.locator('.compare-section .design-dot')).toHaveCount(2);
  const reports=async()=>page.evaluate(async()=>{const {handleApi}=await import('/storage.js');return (await handleApi('/api/research')).reports;});
  const [report]=await reports();
  expect(report.scopeTagId).toBe('topic-rag');
  expect(report.comparison.dimensions[0].cells.map(cell=>cell.choice)).toEqual(['生成前核验','生成中核验']);
  expect(report.comparison.axes[0].positions.map(item=>item.value)).toEqual([-2,2]);
  await page.locator('#tagCompareChat').fill('为什么核验时机不同？');
  await page.locator('[data-compare-chat-send]').click();
  await expect(page.locator('.compare-turn')).toHaveCount(1);
  await expect(page.locator('.compare-answer')).toContainText('回答：为什么核验时机不同？');
  expect((await reports())[0].chatTurns).toHaveLength(1);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-compare-download]').click();
  const stream=await (await downloadPromise).createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const markdown=Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain('生成前核验');expect(markdown).toContain('Design axis: 核验发生在何时');expect(markdown).toContain('为什么核验时机不同？');
  await page.locator('[data-analysis-expand]').click();
  await page.locator('.compare-report').scrollIntoViewIfNeeded();
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.locator('#tagPaperAnalysis').screenshot({path:'test-results/tag-analysis-compare.png'});
  await page.keyboard.press('Escape');
  await page.locator('[data-view="research"]').click();
  await expect(page.locator('[data-research-report]')).toHaveCount(0);
  await expect(page.locator('.research-legacy')).toHaveCount(0);
  await page.evaluate(async()=>{const {handleApi}=await import('/storage.js');const backup=await handleApi('/api/export');await handleApi('/api/import',{method:'POST',body:backup});});
  await page.reload();
  await page.locator('[data-view="tags"]').click();await page.locator('#tagTree [data-tag-id="topic-rag"]').click();
  await page.locator('[data-analysis-tab="compare"]').click();
  await expect(page.locator('.compare-history-item')).toHaveCount(1);
  await expect(page.locator('.compare-turn')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#tagPaperAnalysis').scrollWidth<=innerWidth)).toBe(true);
  await page.locator('[data-analysis-tab="matrix"]').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-analysis-tab="compare"]').click();
  await page.locator('[data-compare-delete]').click();
  await expect(page.locator('.compare-empty')).toBeVisible();
  expect(await reports()).toEqual([]);
  expect(errors).toEqual([]);
});

test('comparison needs two usable papers of this tag and never starts a model call otherwise',async({page})=>{
  const {errors,calls}=await setup(page);
  await page.locator('[data-analysis-tab="compare"]').click();
  await expect(page.locator('[data-compare-run]')).toBeDisabled();
  await page.locator('.compare-paper-option [data-analysis-select="paper-0"]').check();
  await expect(page.locator('[data-compare-run]')).toBeDisabled();
  await expect(page.locator('.compare-count')).toHaveText('已选 1 / 8 篇');
  const rejected=await page.evaluate(async()=>{const {handleApi}=await import('/storage.js');const state=await handleApi('/api/state');const other=state.papers.find(paper=>paper.id==='paper-2');await handleApi('/api/papers/paper-2',{method:'PUT',body:JSON.stringify({...other,manualTags:['另一个标签']})});try{await handleApi('/api/research',{method:'POST',body:JSON.stringify({kind:'comparison',scopeTagId:'topic-rag',paperIds:['paper-0','paper-2']})});return '';}catch(error){return error.message;}});
  expect(rejected).toContain('都属于这个标签');
  expect(calls.filter(call=>call.task==='compare_saved_papers')).toHaveLength(0);
  await page.locator('[data-analysis-tab="overview"]').click();
  await expect(page.locator('.analysis-welcome')).toBeVisible();
  expect(errors).toEqual([]);
});
