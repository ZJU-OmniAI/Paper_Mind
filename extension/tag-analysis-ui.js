import { normalizeMethodDiagram, normalizeDesignAxes, normalizePaperStances, TAG_ANALYSIS_VISUAL_VERSION } from './tag-analysis.js';
import { designMatrix, designSimilarity, similarityOrder, notablePairs } from './analysis-visuals.js';
import { bestAxisPair, choiceColor, heatmapHtml, scatterHtml, spectrumHtml } from './analysis-charts.js';
import { createTagCompare } from './tag-compare-ui.js';
import { hasSourceMaterial, MAX_RESEARCH_PAPERS } from './research.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const array = value => Array.isArray(value) ? value : [];

export function createTagAnalysis({getState, api, openPaper, toast, syncLibrary = async () => {}}) {
  let root = null, tagId = '', active = false, tab = 'overview', timer = null, request = 0, refreshing = '', submitting = false;
  let configured = null, currentConfigured = null, effectiveModel = null, error = '', optionsOpen = false, selectedDimension = 0, boardOpen = false, selectedDiagramNode = {};
  // Papers ticked in the matrix, charts or picker; shared by "Compare papers".
  let selected = new Set(), axisPair = null, composing = false, renderPending = false;
  const expanded = new Set();
  // Opening a paper from a comparison first closes the board, like other paper links.
  const compare = createTagCompare({getState, api, refresh: syncLibrary, openPaper: id => { if (boardOpen) { boardOpen = false; render(); } openPaper(id); }, toast});
  const ui = (zh,en) => getState().language === 'en' ? en : zh;
  const tag = () => getState().tags.find(item => item.id === tagId);
  const analysis = () => tag()?.paperAnalysis || {};
  const members = () => getState().papers.filter(paper => paper.tagIds?.includes(tagId));
  const blocksAction = data => data.status === 'running' || (data.status === 'queued' && data.manualRequested);
  const pending = blocksAction;
  const currentModel = () => { const config = getState().config, provider = config.provider || 'qwen'; return {provider,requestedModel:config[provider + 'Model'],effort:config[provider + 'Effort']}; };
  const modelLabel = model => [model?.provider,model?.requestedModel || model?.responseModel,model?.effort].filter(Boolean).join(' / ');
  const fallbackConfigured = () => { const cfg = getState().config, provider = cfg.provider || 'qwen'; return ['claude','codex'].includes(provider) ? !!cfg.hasBridgeToken : provider === 'custom' ? !!(cfg.customModel && cfg.customBaseUrl) : !!cfg[`has${provider[0].toUpperCase()}${provider.slice(1)}Key`]; };
  const sourceLabel = type => ({notes:ui('个人笔记 / 对话记录 · 保存原文','Personal notes / conversation · saved text'),memory:ui('记忆线索 · 保存原文','Memory cue · saved text'),abstract:ui('摘要','Abstract'),clip:ui('剪藏 Markdown','Clipped Markdown')})[type] || ui('已保存材料','Saved source');
  function schedule() { clearTimeout(timer); if (active && pending(analysis())) timer = setTimeout(refresh,2500); }
  async function refresh() {
    if (!active || !tagId || refreshing === tagId) { schedule(); return; }
    const id = tagId, revision = request; refreshing = id;
    try {
      const data = await api(`/api/tags/${encodeURIComponent(id)}/paper-analysis`);
      if (id !== tagId || revision !== request) return;
      if (tag()) tag().paperAnalysis = data.analysis;
      configured = data.configured ?? configured; currentConfigured = data.currentConfigured ?? currentConfigured; effectiveModel = data.effectiveModel || effectiveModel;
      error = ''; render();
    } catch (err) { if (id === tagId && revision === request) {error=err.message;render();} }
    finally { if (refreshing===id) refreshing=''; schedule(); }
  }
  function statusLabel(data) {
    if (data.status === 'running') return data.phase === 'synthesis' ? ui('正在综合比较与提炼启发','Synthesizing comparisons and ideas') : ui(`正在阅读第 ${Math.min((Number(data.progress?.completed)||0)+1,Number(data.progress?.total)||1)} / ${Number(data.progress?.total)||1} 篇`, 'Reading papers one by one');
    if (data.status === 'queued') return pending(data) ? ui('分析任务已排队','Analysis queued') : data.result ? ui('等待手动更新','Ready to update') : ui('等待手动分析','Ready for manual analysis');
    return ({ready:ui('分析已更新','Analysis up to date'),error:ui('分析未完成','Analysis incomplete'),unconfigured:ui('请先配置模型','Configure a model first'),insufficient:ui('等待论文材料','Waiting for source material')})[data.status] || ui('尚未开始','Not started');
  }
  function evidenceHtml(evidence, titles, key) {
    if (!evidence.length) return '';
    return `<details class="analysis-evidence" data-analysis-detail="${escape(key)}" ${expanded.has(key)?'open':''}><summary>${ui(`查看材料依据（${evidence.length}）`,`Read source evidence (${evidence.length})`)}</summary>${evidence.map(item=>`<figure><figcaption><button type="button" class="text-button" data-analysis-paper="${escape(item.paperId)}">${escape(titles.get(item.paperId) || item.paperId)} ↗</button><small>${escape(sourceLabel(item.sourceType))}</small></figcaption><blockquote>${escape(item.quote)}</blockquote></figure>`).join('')}</details>`;
  }
  function paperLinks(ids,titles) { return array(ids).map(id=>`<button type="button" class="analysis-paper-link" data-analysis-paper="${escape(id)}">${escape(titles.get(id) || id)}</button>`).join(''); }
  function coverageHtml(data, papers) {
    if (!data.result) return pending(data)||data.status==='error' ? '' : `<p class="analysis-manual-hint">${ui('点击按钮开始分析；新增论文和修改材料不会自动调用模型。','Use the analysis button to begin. Adding papers or editing sources does not start model analysis.')}</p>`;
    const savedIds=new Set(array(data.resultProfiles).map(profile=>profile.paperId)), currentIds=new Set(papers.map(paper=>paper.id));
    const changedIds=new Set(array(data.changedPaperIds));
    const rawCoverage=data.coverage||{
      included:[...savedIds].filter(id=>currentIds.has(id)&&!changedIds.has(id)).length,total:papers.length,
      added:[...currentIds].filter(id=>!savedIds.has(id)).length,
      changed:array(data.changedPaperIds).filter(id=>savedIds.has(id)&&currentIds.has(id)).length,
      removed:[...savedIds].filter(id=>!currentIds.has(id)).length
    };
    const coverage=Object.fromEntries(['included','total','added','changed','removed'].map(key=>[key,Number.isFinite(Number(rawCoverage[key]))?Math.max(0,Math.floor(Number(rawCoverage[key]))):0]));
    const messages=[];
    if (coverage.added) messages.push(ui(`有 ${coverage.added} 篇新论文尚未纳入当前分析。`,`${coverage.added} new ${coverage.added===1?'paper is':'papers are'} not yet included in this analysis.`));
    if (coverage.changed) messages.push(ui(`${coverage.changed} 篇论文的笔记或其他材料已变化，当前分析尚未反映这些修改。`,`Saved notes or other sources changed for ${coverage.changed} papers; this analysis does not yet reflect those edits.`));
    if (coverage.removed) messages.push(ui(`${coverage.removed} 篇论文已移出此标签，旧报告中仍保留相关分析。`,`${coverage.removed} papers were removed from this tag; their analysis remains in the saved report.`));
    if (!messages.length && !data.stale) return '';
    const action=data.status==='error'?ui('重试','Retry'):ui('更新分析','Update analysis');
    return `<div class="analysis-notice stale analysis-coverage" role="status"><strong>${ui(`当前报告已覆盖 ${coverage.included} / ${coverage.total} 篇论文的最新材料`,`Saved report covers current sources for ${coverage.included} / ${coverage.total} papers`)}</strong>${messages.map(message=>`<p>${escape(message)}</p>`).join('')}<p>${pending(data)?ui('当前仍可查看上次完成的报告；正在根据本次请求更新分析。','The last completed report remains available while this analysis request is being processed.'):ui(`点击“${action}”后，只重读新增或材料变化的论文，再更新整体分析。旧报告会保留到更新完成。`,`Click “${action}” to reread only new or changed papers and refresh the overall analysis. The saved report stays available until the update completes.`)}</p></div>`;
  }
  function render() {
    if (!root || !tag()) return;
    // A background refresh must not interrupt an IME composition in a text box.
    if (composing) { renderPending = true; return; }
    renderPending = false;
    // Native toggle events are queued. Snapshot current disclosures before a
    // dimension/tab render, rather than reopening a recently closed detail.
    if(root.dataset.analysisTagId===tagId){
      root.querySelectorAll('[data-analysis-detail]').forEach(details=>{const key=details.dataset.analysisDetail;if(details.open)expanded.add(key);else expanded.delete(key);});
      const modelOptions=root.querySelector('.analysis-model-options');if(modelOptions)optionsOpen=modelOptions.open;
    }
    const oldFocus=root.contains(document.activeElement)?document.activeElement:null;
    const focusKey=oldFocus?Object.keys(oldFocus.dataset).find(key=>key.startsWith('analysis')):'';
    const focusValue=focusKey?oldFocus.dataset[focusKey]:'';
    const focusRange=oldFocus&&typeof oldFocus.selectionStart==='number'?[oldFocus.selectionStart,oldFocus.selectionEnd]:null;
    const data=analysis(), papers=members(), result=data.result;
    selected=new Set([...selected].filter(id=>papers.some(paper=>paper.id===id&&hasSourceMaterial(paper))));
    const profiles=result ? array(data.resultProfiles).length ? data.resultProfiles : array(data.profiles) : array(data.profiles);
    const titles=new Map([...profiles.map(p=>[p.paperId,p.title]),...papers.map(p=>[p.id,p.title])]);
    const evidence=new Map(profiles.flatMap(profile=>array(profile.evidence)).map(item=>[item.id,item]));
    const inlineIds=[...evidence.keys()].filter(id=>typeof id==='string'&&id).sort((a,b)=>b.length-a.length);
    const citationPattern=inlineIds.length?new RegExp(`(^|[^A-Za-z0-9_.:-])(${inlineIds.map(id=>id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})(?=$|[^A-Za-z0-9_.:-])`,'g'):null;
    const prose=value=>escape(String(value??'').replace(citationPattern||/$^/g,(match,before,id)=>{const ref=evidence.get(id);if(!ref)return match;const title=titles.get(ref.paperId)||ui('来源论文','Source paper');const short=title.length>34?title.slice(0,32)+'…':title;const kind=({notes:ui('笔记','notes'),memory:ui('记忆','memory'),abstract:ui('摘要','abstract'),clip:ui('剪藏','clip')})[ref.sourceType]||ui('材料','source');return `${before}[${short} · ${kind}]`;}));
    const refs=(ids,key)=>evidenceHtml(array(ids).map(id=>evidence.get(id)).filter(Boolean),titles,key);
    const preview=(value,limit=92)=>{const text=String(value??'').replace(/\s+/g,' ').trim();const sentence=text.match(/^.*?[。！？](?:[”’"']|$|\s)?|^.*?[.!?](?:\s|$)/)?.[0]||text;const excerpt=sentence.slice(0,limit-1).trim();return excerpt.length<text.length?excerpt+'…':excerpt;};
    const phrase=(value,limit=18)=>{
      const original=String(value??'').replace(/\s+/g,' ').replace(/^[#*\-\s]+/,'').trim();
      const width=/[\u3400-\u9fff]/.test(original)?limit:Math.max(24,limit*2);
      const clause=original.length<=width?original:original.split(/[，,；;。！？!?]|\.(?=\s)/)[0].trim();
      const shown=clause.slice(0,width).trim();
      return shown.length<original.length?shown+'…':shown||ui('材料未说明','Not specified');
    };
    const profileById=new Map(profiles.map(profile=>[profile.paperId,profile]));
    const reportPapers=[...profiles,...papers.filter(paper=>!profileById.has(paper.id)).map(paper=>({paperId:paper.id,title:paper.title,sourceStatus:'pending'}))];
    const numberById=new Map(reportPapers.map((profile,index)=>[profile.paperId,String(index+1).padStart(2,'0')]));
    const shortName=id=>phrase(profileById.get(id)?.card?.label||titles.get(id)||id,16);
    const stanceById=new Map(normalizePaperStances(result?.paperStances,profiles).map(item=>[item.paperId,item.stance]));
    const labelOf=id=>({number:numberById.get(id)||'··',name:shortName(id),title:titles.get(id)||id,stance:stanceById.get(id)||''});
    const usable=new Set(papers.filter(hasSourceMaterial).map(paper=>paper.id));
    const selectAttrs=id=>usable.has(id)?`data-analysis-select="${escape(id)}"`:'';
    const detail=(key,label,body,classes='')=>`<details class="analysis-detail ${classes}" data-analysis-detail="${escape(key)}" ${expanded.has(key)?'open':''}><summary>${label}</summary>${body}</details>`;
    const shortDetails=(values)=>Object.entries(values).filter(([,value])=>value).map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${prose(value)}</dd></div>`).join('');
    const routeCards=(ids,key)=>`${ids.slice(0,6).map(paperCard).join('')}${ids.length>6?detail(`route-more-${key}`,ui(`其余 ${ids.length-6} 篇`,`Show ${ids.length-6} more`),`<div class="analysis-route-papers">${ids.slice(6).map(paperCard).join('')}</div>`,'analysis-route-more'):''}`;
    const paperCard=id=>`<button type="button" class="analysis-route-paper" data-route-paper="${escape(id)}" data-analysis-paper="${escape(id)}" title="${escape(titles.get(id)||id)}" aria-label="${escape(ui('打开论文：','Open paper: ')+(titles.get(id)||id))}"><span class="analysis-paper-number">${numberById.get(id)||''}</span><strong>${prose(shortName(id))}</strong></button>`;
    const renderRoutes=()=>{
      const dimensions=array(result?.differences);selectedDimension=Math.max(0,Math.min(selectedDimension,dimensions.length-1));
      const dimension=dimensions[selectedDimension],allIds=reportPapers.map(profile=>profile.paperId),allowed=new Set(allIds),assigned=new Set();
      const lanes=array(dimension?.groups).map((group,index)=>{
        const ids=[...new Set(array(group.paperIds))].filter(id=>allowed.has(id));ids.forEach(id=>assigned.add(id));
        const groupEvidence=array(dimension.evidenceIds).map(id=>evidence.get(id)).filter(item=>item&&ids.includes(item.paperId));
        return `<section class="analysis-route-lane" data-route-group="${index}"><header><span class="analysis-route-dot" aria-hidden="true"></span><h6 title="${escape(group.label)}">${prose(phrase(group.label))}</h6><span class="analysis-route-count">${ids.length}</span></header><div class="analysis-branch-structure"><div class="analysis-branch-block"><small>${ui('方法','METHOD')}</small><strong>${prose(phrase(group.methodSummary||group.approach))}</strong></div><div class="analysis-branch-block tradeoff"><small>${ui('取舍','TRADEOFF')}</small><strong>${prose(phrase(group.tradeoffSummary||group.tradeoff))}</strong></div></div><div class="analysis-route-papers">${routeCards(ids,`${selectedDimension}-${index}`)}</div>${detail(`route-group-${selectedDimension}-${index}`,ui('解释 / 依据','Details / sources'),`<h6>${prose(group.label)}</h6><dl>${shortDetails({[ui('方法摘要','Method summary')]:group.methodSummary,[ui('取舍摘要','Tradeoff summary')]:group.tradeoffSummary})}</dl><p>${prose(group.approach)}</p><p>${prose(group.tradeoff)}</p>${evidenceHtml(groupEvidence,titles,`route-evidence-${selectedDimension}-${index}`)}`)}</section>`;
      });
      const pendingIds=allIds.filter(id=>!profileById.has(id)),unassigned=allIds.filter(id=>!assigned.has(id)&&profileById.has(id));
      if(unassigned.length)lanes.push(`<section class="analysis-route-lane analysis-route-unassigned"><header><h6>${ui('本维度未比较','Not compared here')}</h6><span class="analysis-route-count">${unassigned.length}</span></header><div class="analysis-route-papers">${routeCards(unassigned,`unassigned-${selectedDimension}`)}</div></section>`);
      if(pendingIds.length)lanes.push(`<section class="analysis-route-lane analysis-route-unassigned"><header><h6>${ui('待纳入分析','Awaiting analysis')}</h6><span class="analysis-route-count">${pendingIds.length}</span></header><div class="analysis-route-papers">${routeCards(pendingIds,'pending')}</div></section>`);
      return `<section class="analysis-section analysis-route-map analysis-branch-map"><div class="analysis-section-heading"><h5>${ui('维度详情 · 方法分支','Dimension detail · approach map')}</h5>${dimensions.length?`<label class="analysis-dimension-picker"><span>${ui('比较维度','Compare by')}</span><select data-analysis-dimension aria-label="${ui('选择比较维度','Choose a comparison dimension')}">${dimensions.map((item,index)=>`<option value="${index}" ${index===selectedDimension?'selected':''}>${escape(preview(item.dimension,48))}</option>`).join('')}</select></label>`:''}</div><div class="analysis-branch-root" title="${escape(dimension?.dimension||tag().name)}"><span>${prose(phrase(dimension?.dimension||tag().name))}</span><small>${ui('分组关系','GROUP MEMBERSHIP')}</small></div><div class="analysis-route-lanes">${lanes.join('')}</div>${dimension?detail(`dimension-${selectedDimension}`,ui('完整比较 / 图例 / 依据','Full comparison / legend / sources'),`<p>${ui('连接线仅表示分组归属；不表示时间、因果或优劣。短语为材料摘录，完整限定请见以下解读。','Lines indicate group membership, not time, causality or ranking. Nodes are short excerpts; read the full interpretation for qualifications.')}</p><h6>${prose(dimension.dimension)}</h6>${dimension.summary?`<p>${prose(dimension.summary)}</p>`:''}<p>${prose(dimension.finding)}</p>${refs(dimension.evidenceIds,`difference-${selectedDimension}`)}`):`<p class="analysis-route-legend">${ui('现有报告没有足够依据作方法分组。','The saved report does not establish method groups.')}</p>`}</section>`;
    };
    const analyzedIds=profiles.map(profile=>profile.paperId);
    const selectionBar=()=>selected.size?`<div class="analysis-selection-bar" role="status"><span class="analysis-selection-count">${ui(`已选 ${selected.size} 篇`,`${selected.size} selected`)}</span><span class="analysis-selection-chips">${[...selected].map(id=>`<button type="button" class="analysis-selection-chip" data-analysis-select="${escape(id)}" title="${escape(ui('取消选择：','Deselect: ')+(titles.get(id)||id))}">${escape(labelOf(id).number)} ${escape(labelOf(id).name)} <span aria-hidden="true">×</span></button>`).join('')}</span><span class="analysis-selection-actions"><button type="button" class="secondary-button small-button" data-analysis-clear-selection>${ui('清空','Clear')}</button><button type="button" class="primary-button small-button" data-analysis-compare-go ${selected.size<2?'disabled':''}>${selected.size<2?ui('再选 1 篇即可对比','Select one more to compare'):ui(`对比这 ${selected.size} 篇 ↗`,`Compare these ${selected.size} ↗`)}</button></span></div>`:'';
    const isSelected=id=>selected.has(id);
    const renderSimilarity=()=>{
      if(analyzedIds.length<3||(!array(result.differences).length&&!array(result.commonalities).length))return '';
      const similarity=designSimilarity(result,analyzedIds),order=similarityOrder(similarity),pairs=notablePairs(similarity);
      const pairList=(items,title)=>items.length?`<div class="design-pair-group"><h6>${title}</h6><ul>${items.map(item=>`<li><button type="button" class="design-pair" data-analysis-pair-a="${escape(item.a)}" data-analysis-pair-b="${escape(item.b)}" title="${escape(ui('选中这两篇，用于选篇对比','Select this pair for comparison'))}">${escape(labelOf(item.a).number)} × ${escape(labelOf(item.b).number)}</button><span>${escape(labelOf(item.a).name)} / ${escape(labelOf(item.b).name)}<small>${item.compared?ui(`${item.same}/${item.compared} 个维度选择相同`,`same choice in ${item.same}/${item.compared} dimensions`):ui('没有共同比较的维度','no shared dimension')}${item.foundations?ui(` · 共享 ${item.foundations} 条共同基础`,` · ${item.foundations} shared foundations`):''}</small></span></li>`).join('')}</ul></div>`:'';
      return `<section class="analysis-section design-similarity"><div class="analysis-section-heading"><div><h5>${ui('设计相似度','Design similarity')}</h5><p class="design-chart-lead">${ui('颜色越深，两篇论文在各设计维度上的选择越一致（依据上方对照表的分组与共同基础，本地计算）。','Darker means two papers made more of the same design choices (computed locally from the groups and shared foundations).')}</p></div></div><div class="design-similarity-grid"><div class="design-heatmap-wrap">${heatmapHtml({similarity,order,label:labelOf,ui})}</div><div class="design-pairs">${pairList(pairs.closest,ui('最相近','Most alike'))}${pairList(pairs.furthest,ui('分歧最大','Most different'))}</div></div></section>`;
    };
    const renderDesignSpace=()=>{
      const axes=normalizeDesignAxes(result.designAxes,profiles);
      if(!axes.length)return `${Number(result.visualVersion||0)<TAG_ANALYSIS_VISUAL_VERSION?`<p class="analysis-upgrade-note">${ui('这份报告生成于旧版本，还没有“设计空间图”和“理念光谱”。点击右上角“生成设计图表”即可补上：只重新综合，不重读论文。','This report predates design charts. Use “Generate design charts” above to add them: only the synthesis reruns, papers are not reread.')}</p>`:''}${renderSimilarity()}`;
      const fallback=bestAxisPair(axes),[x,y]=axisPair&&axes[axisPair[0]]&&axes[axisPair[1]]&&axisPair[0]!==axisPair[1]?axisPair:fallback;
      const picker=(axis,value)=>`<label class="design-axis-picker"><span>${axis==='x'?ui('横轴','X axis'):ui('纵轴','Y axis')}</span><select data-analysis-axis="${axis}" aria-label="${axis==='x'?ui('选择横轴','Choose the X axis'):ui('选择纵轴','Choose the Y axis')}">${axes.map((item,index)=>`<option value="${index}" ${index===value?'selected':''}>${escape(item.axis)}</option>`).join('')}</select></label>`;
      const placed=new Set(axes.flatMap(axis=>axis.positions.map(position=>position.paperId)));
      const legend=analyzedIds.filter(id=>placed.has(id)).map(id=>`<li><button type="button" class="design-legend-item${isSelected(id)?' selected':''}" ${selectAttrs(id)} title="${escape(labelOf(id).title+(labelOf(id).stance?`\n${labelOf(id).stance}`:''))}"><span class="analysis-paper-number">${escape(labelOf(id).number)}</span><span>${prose(labelOf(id).name)}</span></button>${labelOf(id).stance?`<small>${prose(phrase(labelOf(id).stance,26))}</small>`:''}</li>`).join('');
      const reasons=axes.map((axis,index)=>`<div class="design-axis-reasons"><h6>${prose(axis.axis)}<small>${prose(axis.low)} ←→ ${prose(axis.high)}</small></h6><ul>${axis.positions.map(position=>`<li><span class="analysis-paper-number">${escape(labelOf(position.paperId).number)}</span>${prose(labelOf(position.paperId).name)}：${position.value>0?'+':''}${position.value}${position.reason?` · ${prose(position.reason)}`:''}</li>`).join('')}</ul>${refs(axis.evidenceIds,`axis-evidence-${index}`)}</div>`).join('');
      return `<section class="analysis-section design-space" aria-labelledby="designSpaceTitle-${escape(tagId)}"><div class="analysis-section-heading"><div><h5 id="designSpaceTitle-${escape(tagId)}">${ui('设计空间图','Design space')}</h5><p class="design-chart-lead">${ui('把每篇论文放到两条宏观设计轴上：离得越近，设计理念越接近。','Each paper sits on two macro design axes: the closer two papers are, the closer their design thinking.')}</p></div>${y>=0?`<div class="design-axis-pickers">${picker('x',x)}${picker('y',y)}</div>`:''}</div><div class="design-space-grid">${y>=0?`<div class="design-scatter-wrap">${scatterHtml({axes,x,y,label:labelOf,ui,isSelected,dotAttrs:selectAttrs})}</div>`:''}<ol class="design-legend" aria-label="${ui('图中论文','Papers in the chart')}">${legend}</ol></div><h6 class="design-subheading">${ui(`理念光谱 · ${axes.length} 条设计轴`,`Design spectra · ${axes.length} axes`)}</h6>${spectrumHtml({axes,label:labelOf,ui,isSelected,dotAttrs:selectAttrs})}<p class="design-chart-caption">${ui('位置是模型依据已保存材料作出的相对判断（−2 到 +2），不是评分或优劣排序。点击圆点可勾选论文，用于“选篇对比”。','Positions are relative readings of the saved material (−2 to +2), not scores or rankings. Click a dot to tick that paper for comparison.')}</p>${detail('axes-reasons',ui('定位理由与依据','Placement reasons and sources'),reasons,'design-axes-detail')}</section>`;
    };
    const renderFoundations=()=>{
      const items=array(result.commonalities);if(!items.length)return '';
      return `<section class="analysis-section analysis-common-map analysis-foundations"><div class="analysis-section-heading"><div><h5>${ui('共同基础','Shared foundations')}</h5><p class="design-chart-lead">${ui('大家都在做的事：● 表示这篇论文具备这一点。','What the papers share: ● marks a paper that has it.')}</p></div></div><div class="analysis-foundation-scroll" tabindex="0" role="region" aria-label="${ui('共同基础矩阵','Shared foundation matrix')}"><table class="analysis-foundation-table"><thead><tr><th scope="col">${ui('共同点','Foundation')}</th>${analyzedIds.map(id=>`<th scope="col"><button type="button" class="analysis-paper-number" data-analysis-paper="${escape(id)}" title="${escape(titles.get(id)||id)}">${numberById.get(id)||'↗'}</button></th>`).join('')}<th scope="col">${ui('覆盖','Share')}</th></tr></thead><tbody>${items.map((item,index)=>{const owners=new Set(array(item.paperIds).filter(id=>analyzedIds.includes(id)));return `<tr class="analysis-common-card"><th scope="row"><div class="analysis-common-node"><span>${String(index+1).padStart(2,'0')}</span><h6>${prose(phrase(item.summary||item.title,22))}</h6></div>${detail(`common-${index}`,ui('解释 / 依据','Details / sources'),`<h6>${prose(item.title)}</h6>${item.summary?`<p>${prose(item.summary)}</p>`:''}<p>${prose(item.finding)}</p><div class="analysis-paper-links">${paperLinks(item.paperIds,titles)}</div>${refs(item.evidenceIds,`common-evidence-${index}`)}`)}</th>${analyzedIds.map(id=>`<td>${owners.has(id)?`<span class="foundation-dot" role="img" aria-label="${escape(`${numberById.get(id)} ${titles.get(id)||id}`)}">●</span>`:'<span class="foundation-empty" aria-hidden="true">·</span>'}</td>`).join('')}<td class="foundation-share">${owners.size}/${analyzedIds.length}</td></tr>`;}).join('')}</tbody></table></div></section>`;
    };
    const renderOverview=()=>`<section class="analysis-overview analysis-summary-strip"><div class="analysis-hero"><small>${ui('核心结论','KEY TAKEAWAY')}</small><p>${prose(result.headline||preview(result.overview,120))}</p></div><div class="analysis-story-stats"><span><strong>${profiles.length}</strong>${ui('论文','papers')}</span><span><strong>${array(result.differences).length}</strong>${ui('设计维度','design dimensions')}</span><span><strong>${array(result.commonalities).length}</strong>${ui('共同基础','shared foundations')}</span><span><strong>${array(result.inspirations).length}</strong>${ui('想法','ideas')}</span></div>${detail('overview-full',ui('完整研究脉络','Full overview'),`${result.headline?`<h6>${prose(result.headline)}</h6>`:''}<p>${prose(result.overview)}</p>`)}</section>${selectionBar()}${renderDesignSpace()}${renderFoundations()}${array(result.readingPath).length?detail('reading-path',ui(`阅读顺序 · ${result.readingPath.length} 篇`,`Reading path · ${result.readingPath.length} papers`),`<ol class="analysis-reading-path">${array(result.readingPath).map(item=>`<li><button type="button" class="text-button" data-analysis-paper="${escape(item.paperId)}">${escape(titles.get(item.paperId)||item.paperId)} ↗</button><p>${prose(item.reason)}</p></li>`).join('')}</ol>`,'analysis-reading-section'):''}`;
    const renderMatrix=()=>{
      const matrix=designMatrix(result,analyzedIds),dims=matrix.dimensions;
      const order=analyzedIds.length>=3?similarityOrder(designSimilarity(result,analyzedIds)):analyzedIds;
      const pendingIds=reportPapers.filter(profile=>!profileById.has(profile.paperId)).map(profile=>profile.paperId);
      const hasStances=stanceById.size>0,active=index=>index===selectedDimension?' active':'';
      const head=`<tr><th scope="col" class="matrix-paper-col">${ui('论文（勾选可对比）','Paper (tick to compare)')}</th>${hasStances?`<th scope="col" class="matrix-stance-col">${ui('核心理念','Design stance')}</th>`:''}${dims.map(item=>`<th scope="col" class="matrix-dimension-col${active(item.index)}"><button type="button" data-analysis-matrix-dimension="${item.index}" aria-pressed="${item.index===selectedDimension}" title="${escape(item.dimension.dimension)}"><strong>${prose(phrase(item.dimension.summary||item.dimension.dimension,14))}</strong><small>${ui(`${matrix.coverage[item.index]}/${analyzedIds.length} 篇 · ${item.groups.length} 种选择`,`${matrix.coverage[item.index]}/${analyzedIds.length} · ${item.groups.length} options`)}</small></button></th>`).join('')}</tr>`;
      const row=id=>{const cells=matrix.cells.get(id)||[];return `<tr data-matrix-paper="${escape(id)}" class="${isSelected(id)?'selected':''}"><th scope="row" class="matrix-paper-col"><div>${usable.has(id)?`<input type="checkbox" data-analysis-select="${escape(id)}" ${isSelected(id)?'checked':''} aria-label="${escape(ui('选择论文：','Select paper: ')+(titles.get(id)||id))}">`:'<span class="matrix-check-gap" aria-hidden="true"></span>'}<button type="button" data-analysis-paper="${escape(id)}" title="${escape(titles.get(id)||id)}"><span class="analysis-paper-number">${numberById.get(id)}</span><span>${prose(shortName(id))}</span></button></div></th>${hasStances?`<td class="matrix-stance-col">${stanceById.has(id)?prose(stanceById.get(id)):'<span class="muted">—</span>'}</td>`:''}${dims.map(item=>{const group=cells[item.index];if(!(group>=0))return `<td class="matrix-empty${active(item.index)}" title="${escape(ui('这一维度未比较这篇论文','Not compared on this dimension'))}">·</td>`;const info=item.groups[group];return `<td class="matrix-cell${active(item.index)}"><span class="analysis-choice" style="--choice-color:${choiceColor(group)}" title="${escape(`${info.label}${info.methodSummary||info.approach?`：${info.methodSummary||info.approach}`:''}`)}">${prose(phrase(info.label,10))}</span></td>`;}).join('')}</tr>`;};
      const body=[...order.map(row),...pendingIds.map(id=>`<tr class="matrix-pending"><th scope="row" class="matrix-paper-col"><div><span class="matrix-check-gap" aria-hidden="true"></span><button type="button" data-analysis-paper="${escape(id)}"><span class="analysis-paper-number">${numberById.get(id)}</span><span>${prose(shortName(id))}</span></button></div></th><td colspan="${dims.length+(hasStances?1:0)}" class="muted">${ui('待纳入分析：点击“更新分析”后加入对照','Awaiting analysis: update the analysis to include it')}</td></tr>`)].join('');
      return `${selectionBar()}<section class="analysis-section analysis-design-matrix-section"><div class="analysis-section-heading"><div><h5>${ui('设计对照表','Design matrix')}</h5><p class="design-chart-lead">${ui('每行一篇论文，每列一个设计问题；同一列里颜色相同 = 做了同一种选择。行按相似度排列，点列名看该维度详情，勾选论文可去“选篇对比”。','One row per paper, one column per design question; the same colour in a column means the same choice. Rows are ordered by similarity; click a column for its detail and tick papers to compare them.')}</p></div></div>${dims.length?`<div class="analysis-matrix-scroll" tabindex="0" role="region" aria-label="${ui('设计对照表','Design matrix')}"><table class="analysis-design-matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>`:`<p class="analysis-route-legend">${ui('现有报告没有足够依据作设计分组。','The saved report does not establish design groups.')}</p>`}</section>${renderSimilarity()}${dims.length?renderRoutes():''}`;
    };
    const diagramFor=profile=>normalizeMethodDiagram(array(result?.paperDiagrams).find(item=>item?.paperId===profile.paperId),array(profile.evidence))||normalizeMethodDiagram(profile.methodDiagram,array(profile.evidence));
    const renderMethodDiagram=profile=>{
      const diagram=diagramFor(profile);
      if(!diagram)return `<div class="analysis-fallback-structure" data-diagram-kind="excerpt">${[[ui('问题','QUESTION'),profile.card?.focus||profile.researchQuestion],[ui('方法','METHOD'),profile.card?.method||profile.approach],[ui('取舍','TRADEOFF'),profile.card?.tradeoff||profile.tradeoffs],[ui('笔记','NOTES'),profile.card?.note||profile.personalTake]].map(([label,value])=>`<div class="analysis-structure-block"><small>${label}</small><strong>${prose(phrase(value))}</strong></div>`).join('')}</div><p class="analysis-diagram-caption">${ui('内容结构 · 原文摘录','Content structure · source excerpts')}</p>`;
      const nodes=diagram.nodes, width=360, nodeHeight=62;
      // Rank only explicit flow/containment. Related links carry no ordering.
      const orderedEdges=diagram.edges.filter(edge=>['flow','contains'].includes(edge.relation));
      const incoming=new Map(nodes.map(node=>[node.id,0])),level=new Map(nodes.map(node=>[node.id,0]));
      for(const edge of orderedEdges)incoming.set(edge.to,incoming.get(edge.to)+1);
      const queue=nodes.filter(node=>incoming.get(node.id)===0).map(node=>node.id),ordered=[];
      while(queue.length){const id=queue.shift();ordered.push(id);for(const edge of orderedEdges.filter(item=>item.from===id)){level.set(edge.to,Math.max(level.get(edge.to),level.get(id)+1));incoming.set(edge.to,incoming.get(edge.to)-1);if(incoming.get(edge.to)===0)queue.push(edge.to);}}
      const layered=orderedEdges.length>0&&ordered.length===nodes.length;
      const levels=layered?Array.from({length:Math.max(...level.values())+1},(_,index)=>nodes.filter(node=>level.get(node.id)===index)):[];
      const linear=layered&&levels.every(items=>items.length===1),nodeWidth=linear?272:150;
      const positions=new Map();let rows=0;
      if(layered){for(const items of levels){for(let index=0;index<items.length;index++){const rowItems=items.slice(Math.floor(index/2)*2,Math.floor(index/2)*2+2);positions.set(items[index].id,{x:linear?44:rowItems.length===1?105:15+(index%2)*180,y:8+(rows+Math.floor(index/2))*108});}rows+=Math.ceil(items.length/2);}}
      else {for(const [index,node] of nodes.entries())positions.set(node.id,{x:15+(index%2)*180,y:8+Math.floor(index/2)*108});rows=Math.ceil(nodes.length/2);}
      const charWidth=char=>/[\u3400-\u9fff]/.test(char)?9:5;
      const labelLinesFor=label=>{const lines=[];let line='',lineWidth=0;for(const char of Array.from(label)){const size=charWidth(char);if(line&&lineWidth+size>240){lines.push(line);line='';lineWidth=0;}line+=char;lineWidth+=size;}if(line)lines.push(line);return lines;};
      // Reserve a separate lane above each row with a horizontal edge label.
      // Its lane is distinct from labels on incoming diagonal relationships.
      const rowLabels=new Map();for(const edge of diagram.edges){const a=positions.get(edge.from),b=positions.get(edge.to);if(edge.label&&a.y===b.y)rowLabels.set(a.y,Math.max(rowLabels.get(a.y)||0,labelLinesFor(edge.label).length*12+4));}
      const rowYs=[...new Set([...positions.values()].map(pos=>pos.y))].sort((a,b)=>a-b),newRows=new Map();let rowY=0;
      for(const [index,oldY] of rowYs.entries()){const labelHeight=rowLabels.get(oldY)||0;rowY=index===0?(labelHeight?labelHeight+24:8):rowY+nodeHeight+(labelHeight?Math.max(46,2*labelHeight+72):46);newRows.set(oldY,rowY);}
      for(const pos of positions.values())pos.y=newRows.get(pos.y);
      const height=rowY+nodeHeight+38,arrowId=`analysis-flow-arrow-${numberById.get(profile.paperId)}`;
      const edges=diagram.edges.map(edge=>{
        const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)return '';
        const dx=b.x-a.x,dy=b.y-a.y,scale=Math.min(dx?nodeWidth/2/Math.abs(dx):Infinity,dy?nodeHeight/2/Math.abs(dy):Infinity);
        const from={x:a.x+nodeWidth/2+dx*scale,y:a.y+nodeHeight/2+dy*scale},to={x:b.x+nodeWidth/2-dx*scale,y:b.y+nodeHeight/2-dy*scale};
        const flow=diagram.kind==='flow'&&edge.relation==='flow'&&edge.evidenceIds.length;
        // A line crossing an unrelated box looks like a relationship. Route
        // around that box through an outside gutter, preserving the same edge.
        const crossesNode=nodes.some(node=>{
          if([edge.from,edge.to].includes(node.id))return false;
          const pos=positions.get(node.id);let enter=0,leave=1;
          for(const [start,delta,min,max] of [[from.x,to.x-from.x,pos.x-4,pos.x+nodeWidth+4],[from.y,to.y-from.y,pos.y-4,pos.y+nodeHeight+4]]){
            if(!delta){if(start<min||start>max)return false;continue;}
            const interval=[(min-start)/delta,(max-start)/delta].sort((a,b)=>a-b);enter=Math.max(enter,interval[0]);leave=Math.min(leave,interval[1]);if(enter>leave)return false;
          }
          return enter<=leave;
        });
        let path=`M ${from.x} ${from.y} L ${to.x} ${to.y}`,labelX=(from.x+to.x)/2,labelY=(from.y+to.y)/2;
        if(crossesNode&&dy){const direction=dy>0?1:-1,startY=a.y+(dy>0?nodeHeight:0),endY=b.y+(dy>0?0:nodeHeight),rail=(a.x+b.x+nodeWidth)/2<width/2?4:width-4;path=`M ${a.x+nodeWidth/2} ${startY} V ${startY+direction*18} H ${rail} V ${endY-direction*18} H ${b.x+nodeWidth/2} V ${endY}`;labelX=(a.x+nodeWidth/2+rail)/2;labelY=startY+direction*18;}
        const sameRow=dy===0,label=edge.label?(sameRow?edge.label:phrase(edge.label,8)):'';
        const labelLines=labelLinesFor(label);
        const labelWidth=label?Math.max(...labelLines.map(line=>Array.from(line).reduce((sum,char)=>sum+charWidth(char),16))):0,labelHeight=labelLines.length*12+4;
        // The gap between same-row boxes is too narrow for a relation label.
        // Keep the complete label above the boxes, with its line below the text.
        if(sameRow&&label){labelY=a.y-labelHeight/2-18;const railY=a.y-12;path=`M ${a.x+nodeWidth/2} ${a.y} V ${railY} H ${b.x+nodeWidth/2} V ${b.y}`;}
        return `<path class="analysis-diagram-edge ${flow?'flow':edge.relation==='contains'?'contains':'related'}" data-edge-from="${escape(edge.from)}" data-edge-to="${escape(edge.to)}" d="${path}" ${flow?`marker-end="url(#${arrowId})"`:''}><title>${escape(edge.label||edge.relation)}</title></path>${label?`<g class="analysis-edge-label" data-label-from="${escape(edge.from)}" data-label-to="${escape(edge.to)}" transform="translate(${labelX},${labelY})"><title>${escape(edge.label)}</title><rect x="${-labelWidth/2}" y="${-labelHeight/2}" width="${labelWidth}" height="${labelHeight}" rx="3"/><text text-anchor="middle">${labelLines.map((line,index)=>`<tspan x="0" y="${3-(labelLines.length-1)*6+index*12}">${escape(line)}</tspan>`).join('')}</text></g>`:''}`;
      }).join('');
      const roleLabel=role=>({input:ui('输入','INPUT'),step:ui('步骤','STEP'),decision:ui('判断','DECISION'),output:ui('输出','OUTPUT'),component:ui('模块','COMPONENT')})[role]||ui('模块','COMPONENT');
      return `<svg class="analysis-method-svg" data-diagram-kind="${diagram.kind}" data-diagram-layout="${layered?'layered':'grid'}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escape(ui('方法框图：','Method diagram: ')+(titles.get(profile.paperId)||profile.title))}"><defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>${edges}${nodes.map(node=>{const pos=positions.get(node.id),label=phrase(node.label),mid=pos.x+nodeWidth/2,characters=Array.from(label),lineLength=/[\u3400-\u9fff]/.test(label)?(linear?18:9):(linear?32:18),lines=[];for(let start=0;start<characters.length;start+=lineLength)lines.push(characters.slice(start,start+lineLength).join(''));return `<g class="analysis-diagram-node" role="button" tabindex="0" data-analysis-diagram-node="${escape(node.id)}" data-node-level="${layered?level.get(node.id):''}" data-analysis-diagram-paper="${escape(profile.paperId)}" aria-label="${escape(ui('查看节点依据：','Read node sources: ')+node.label)}"><title>${escape(node.label)}</title><rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}" rx="${node.role==='decision'?15:7}"/><text class="analysis-node-role" x="${mid}" y="${pos.y+16}" text-anchor="middle">${roleLabel(node.role)}</text><text class="analysis-node-label" text-anchor="middle">${lines.slice(0,2).map((line,index)=>`<tspan x="${mid}" y="${pos.y+35+index*16}">${escape(line)}</tspan>`).join('')}</text></g>`;}).join('')}</svg><p class="analysis-diagram-caption">${diagram.kind==='flow'?ui('有向流程 · 点击节点查看依据','Directed flow · select a node for sources'):ui('模块结构 · 点击节点查看依据','Module structure · select a node for sources')}</p>`;
    };
    const diagramEvidence=profile=>{
      const diagram=diagramFor(profile);if(!diagram)return '';
      const node=selectedDiagramNode.paperId===profile.paperId?diagram.nodes.find(item=>item.id===selectedDiagramNode.nodeId):null;
      const edges=node?diagram.edges.filter(edge=>edge.from===node.id||edge.to===node.id):diagram.edges;
      const refsUsed=new Set(edges.flatMap(edge=>edge.evidenceIds));
      const quotes=array(profile.evidence).filter(item=>refsUsed.has(item.id));
      return detail(`diagram-${profile.paperId}`,ui('框图节点与依据','Diagram nodes & sources'),`${node?`<h6>${prose(node.label)}</h6>`:''}<dl>${diagram.nodes.map((item,index)=>`<div><dt>${String(index+1).padStart(2,'0')}</dt><dd>${prose(item.label)}</dd></div>`).join('')}</dl>${edges.length?`<ul>${edges.map(edge=>`<li>${prose(diagram.nodes.find(node=>node.id===edge.from)?.label)} ${edge.relation==='flow'?'→':'—'} ${prose(diagram.nodes.find(node=>node.id===edge.to)?.label)}${edge.label?`：${prose(edge.label)}`:''}</li>`).join('')}</ul>`:''}${node&&!quotes.length?`<p class="analysis-node-source-note">${ui('本节点未给出单独引用，下方为本篇已核验材料。','This node has no separate citation. The sources below are verified excerpts for this paper.')}</p>`:''}${evidenceHtml(quotes.length?quotes:array(profile.evidence),titles,`diagram-evidence-${profile.paperId}`)}`);
    };
    const renderNote=profile=>{
      const hasNotes=array(profile.evidence).some(item=>['notes','memory'].includes(item.sourceType));
      const note=profile.card?.note||(hasNotes?profile.personalTake:'');
      return note?detail(`note-${profile.paperId}`,`<small>${ui('笔记视角','NOTE PERSPECTIVE')}</small><span>${prose(phrase(note))}</span>`,`${profile.card?.note?`<p>${prose(profile.card.note)}</p>`:''}${profile.personalTake?`<p>${prose(profile.personalTake)}</p>`:''}`,'analysis-diagram-note'):'';
    };
    const profileBody=profile=>`<div class="analysis-profile-body"><h6>${escape(titles.get(profile.paperId)||profile.title)}</h6>${profile.sourceStatus==='pending'?`<p>${ui('点击“更新分析”后，将把这篇论文纳入专题报告。','Click “Update analysis” to include this paper in the report.')}</p>`:`<dl>${shortDetails({[ui('短名','Short label')]:profile.card?.label,[ui('问题摘要','Focus summary')]:profile.card?.focus,[ui('方法摘要','Method summary')]:profile.card?.method,[ui('取舍摘要','Tradeoff summary')]:profile.card?.tradeoff,[ui('笔记摘要','Note summary')]:profile.card?.note})}${[['researchQuestion',ui('研究问题','Research question')],['approach',ui('方法重点','Method')],['mechanism',ui('关键机制','Mechanism')],['distinctiveChoice',ui('关键设计选择','Distinctive choice')],['tradeoffs',ui('取舍与局限','Tradeoffs and limitations')]].map(([key,label])=>`<div><dt>${label}</dt><dd>${prose(profile[key])}</dd></div>`).join('')}</dl><section class="analysis-personal"><h6>${ui('你的笔记与关注点','Your notes and interests')}</h6><p>${prose(profile.personalTake||ui('尚无可用的个人笔记解读。','No personal interpretation is available yet.'))}</p></section>${evidenceHtml(array(profile.evidence),titles,`profile-evidence-${profile.paperId}`)}`}<button type="button" class="text-button" data-analysis-paper="${escape(profile.paperId)}">${ui('打开论文详情 ↗','Open paper details ↗')}</button></div>`;
    const renderMethods=()=>`<section class="analysis-section"><div class="analysis-section-heading"><h5>${ui('论文方法图','Paper method diagrams')}</h5><span>${ui('短节点总览 · 完整解释可展开','Short nodes · full interpretation below')}</span></div><div class="analysis-methods-board">${reportPapers.map(profile=>`<article class="analysis-method-card" data-method-paper="${escape(profile.paperId)}"><header><span class="analysis-paper-number">${numberById.get(profile.paperId)}</span><button type="button" data-analysis-paper="${escape(profile.paperId)}" title="${escape(titles.get(profile.paperId)||profile.title)}">${prose(shortName(profile.paperId))}</button></header>${profile.sourceStatus==='pending'?`<div class="analysis-pending-node">${ui('待纳入分析','Awaiting analysis')}</div>`:renderMethodDiagram(profile)}${diagramFor(profile)?renderNote(profile):''}${diagramEvidence(profile)}<details class="analysis-profile" data-profile-status="${escape(profile.sourceStatus||'ready')}" data-analysis-detail="profile-${escape(profile.paperId)}" ${expanded.has(`profile-${profile.paperId}`)?'open':''}><summary>${ui('完整解读 / 依据','Full reading / sources')}</summary>${profileBody(profile)}</details></article>`).join('')}</div></section>`;
    const renderIdeas=()=>`<section class="analysis-section"><div class="analysis-section-heading"><h5>${ui('从假设到验证','From hypothesis to test')}</h5><span>${ui('待验证','NOT YET VALIDATED')}</span></div><div class="analysis-ideas-grid">${array(result.inspirations).map((item,index)=>`<article class="analysis-idea"><div class="analysis-idea-heading"><span class="analysis-index">${String(index+1).padStart(2,'0')}</span><h6 title="${escape(item.title)}">${prose(phrase(item.title))}</h6></div><div class="analysis-idea-steps"><section><span class="analysis-step-label">${ui('假设','HYPOTHESIS')}</span><strong>${prose(phrase(item.hypothesisSummary||item.hypothesis))}</strong></section><span class="analysis-step-arrow" aria-hidden="true">→</span><section><span class="analysis-step-label">${ui('对照实验','TEST')}</span><strong>${prose(phrase(item.testSummary||item.nextStep))}</strong></section></div>${detail(`idea-${index}`,ui('推导 / 实验 / 限制 / 依据','Reasoning / test / caveats / sources'),`<h6>${prose(item.title)}</h6><dl>${shortDetails({[ui('假设摘要','Hypothesis summary')]:item.hypothesisSummary,[ui('验证摘要','Test summary')]:item.testSummary})}${[['hypothesis',ui('完整假设','Full hypothesis')],['rationale',ui('为什么值得尝试','Why explore it')],['nextStep',ui('如何验证','How to test')],['caveat',ui('局限与待确认之处','Caveat')]].map(([key,label])=>`<div><dt>${label}</dt><dd>${prose(item[key])}</dd></div>`).join('')}</dl><div class="analysis-paper-links">${paperLinks(item.paperIds,titles)}</div>${refs(item.evidenceIds,`idea-evidence-${index}`)}`)}</article>`).join('')}</div>${!array(result.inspirations).length?`<p>${ui('现有材料尚不足以提出有依据的启发。','The current sources do not yet support a grounded research direction.')}</p>`:''}</section>${array(result.openQuestions).length?detail('open-questions',ui(`待解问题 · ${result.openQuestions.length}`,`Open questions · ${result.openQuestions.length}`),`<ul>${result.openQuestions.map(question=>`<li>${prose(question)}</li>`).join('')}</ul>`,'analysis-open-questions'):''}<div class="analysis-fusion-cta"><div><strong>${ui('想要更多灵感？','Want more ideas?')}</strong><p>${ui('到“深度探索”把这个标签和其他标签的设计理念融合，碰撞出新的研究想法。','In Deep exploration, fuse this tag’s design principles with other tags to spark new research ideas.')}</p></div><button type="button" class="secondary-button" data-research-tag="${escape(tagId)}">${ui('跨标签融合 ↗','Fuse with other tags ↗')}</button></div>`;
    const busy=pending(data), canRun=!submitting&&!blocksAction(data)&&papers.length>0&&data.status!=='insufficient';
    const hasModel=configured??fallbackConfigured(), hasCurrentModel=currentConfigured??fallbackConfigured();
    const completed=Number(data.progress?.completed)||0, total=Number(data.progress?.total)||papers.length;
    const boundModel=data.model?.provider?data.model:null;
    const visibleModel=boundModel||effectiveModel||currentModel();
    const needsDiagramUpgrade=result&&Number(result.visualVersion||0)<TAG_ANALYSIS_VISUAL_VERSION&&!data.stale&&!['added','changed','removed'].some(key=>Number(data.coverage?.[key])>0);
    const buttonText=data.status==='error'?ui('重试','Retry'):needsDiagramUpgrade?ui('生成设计图表','Generate design charts'):result?ui('更新分析','Update analysis'):ui('生成专题分析','Analyze this topic');
    const welcomeHtml=`<div class="analysis-welcome"><div class="analysis-welcome-mark" aria-hidden="true">▤</div><h5>${ui('看清同一标签下的设计理念差异','See how papers under one tag differ in design')}</h5><p>${ui('先逐篇整理研究问题、方法机制和个人笔记，再把整个标签放在一起：用设计对照表、设计空间图和理念光谱看清谁和谁相近、分歧在哪里，并提出可验证的思路。','First read each paper’s question, mechanism and your notes. Then see the whole tag at once: a design matrix, a design-space chart and design spectra show who is alike, where they diverge, and which ideas are worth testing.')}</p><div><span>${ui('01 逐篇理解','01 Read')}</span><span>${ui('02 设计对照','02 Compare designs')}</span><span>${ui('03 形成启发','03 Explore')}</span></div>${!hasModel?`<p class="analysis-setup">${ui('请先在模型设置中配置并测试模型。','Configure and test a model in Model settings first.')}</p>`:''}${papers.filter(hasSourceMaterial).length>=2?`<p class="analysis-welcome-compare">${ui('只想比较其中几篇？','Only want a few papers?')}<button type="button" class="text-button" data-analysis-tab-link="compare">${ui('去“选篇对比” →','Go to Compare papers →')}</button></p>`:''}</div>`;
    const tabs=[['overview',ui('全景','Overview')],['matrix',ui('对照表','Design matrix')],['compare',ui('选篇对比','Compare papers')],['methods',ui('方法图','Methods')],['ideas',ui('研究启发','Ideas')]];
    if(!tabs.some(([id])=>id===tab))tab='overview';
    root.dataset.analysisTagId=tagId;
    root.className=`tag-analysis${boardOpen?' analysis-expanded':''}`;
    document.body.classList.toggle('analysis-board-open',boardOpen);
    if(boardOpen){root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',ui('专题分析看板','Topic analysis board'));}else{root.removeAttribute('role');root.removeAttribute('aria-modal');root.removeAttribute('aria-label');}
    root.innerHTML=`<header class="analysis-heading"><div><p class="eyebrow">${ui('从读懂论文，到形成自己的问题','FROM PAPERS TO YOUR OWN QUESTIONS')}</p><h4>${ui('标签专题分析','Topic analysis')}</h4>${boardOpen?`<span class="analysis-board-tag">${escape(tag().name)}</span>`:''}<p>${ui('比较同一标签下各篇论文的设计理念：哪里相同、哪里不同、为什么。','Compare the design thinking of papers under this tag: what they share, where they differ, and why.')}</p></div><div class="analysis-heading-actions"><button type="button" class="secondary-button small-button" data-analysis-expand aria-expanded="${boardOpen}">${boardOpen?ui('收起看板','Close board'):ui('展开看板 ↗','Expand board ↗')}</button><button type="button" class="primary-button" data-analysis-generate ${!canRun||!hasModel?'disabled':''}>${submitting?ui('正在提交…','Queuing…'):buttonText}</button></div></header>
      <div class="analysis-meta"><span>${ui(`${papers.length} 篇论文 · 个人笔记优先`,`${papers.length} papers · personal notes prioritized`)}</span><span class="analysis-status ${['error','queued','running'].includes(data.status)?data.status:''}" role="status">${escape(statusLabel(data))}</span></div>
      ${data.status==='insufficient'?`<p class="analysis-notice analysis-material-gap">${ui(`目前 ${Number(data.progress?.total)||0} 篇有可分析材料。至少需要 2 篇含摘要、个人笔记、记忆线索或剪藏的论文，才能进行专题比较。请先为论文补充材料。`,`${Number(data.progress?.total)||0} papers currently have source material. Topic comparison needs at least 2 papers with an abstract, personal notes, memory cues or clips. Add source material to continue.`)}</p>`:Number.isInteger(data.progress?.total)&&data.progress.total<papers.length?`<p class="analysis-notice analysis-material-gap">${ui(`${papers.length-data.progress.total} 篇尚无可分析文字，仍会保留在阅读建议中；可以先补充摘要、笔记或剪藏。`,`${papers.length-data.progress.total} papers have no saved source text and remain in the reading suggestions. Add abstracts, notes or clips when available.`)}</p>`:''}
      ${busy||data.status==='error'?`<div class="analysis-progress"><div><strong>${data.phase==='synthesis'?ui('02 综合理解','02 Synthesize'):ui('01 逐篇理解','01 Read each paper')}</strong><span>${ui(`${completed} / ${total} 篇已完成解读`,`${completed} / ${total} papers read and saved`)}</span></div>${data.status!=='error'?`<progress value="${Math.max(0,Math.min(completed,total))}" max="${Math.max(1,total)}" aria-label="${ui('论文理解进度','Paper reading progress')}"></progress>`:''}<p>${data.status==='error'?(data.phase==='synthesis'?ui('已完成逐篇解读，综合未完成；重试会继续这一步。','Individual reading is saved. Synthesis is incomplete; retry resumes this step.'):ui('已完成的解读已保存；重试会从未完成的论文继续。','Completed readings are saved. Retry resumes unfinished papers.')):data.status==='queued'?ui('任务已排队；复用已有解读，仅处理尚未完成的步骤。','Queued. Previous readings are reused; only unfinished steps will run.'):data.phase==='synthesis'?ui('正在整理方法关系与框图。','Building method relationships and diagrams.'):ui('正在阅读论文；后续仅重读新增或材料变化的论文。','Reading papers; later updates reread only new or changed sources.')}</p></div>`:''}
      ${coverageHtml(data,papers)}
      ${error||data.error?detail('error',ui('查看失败原因','View failure details'),`<p role="alert">${escape(error||data.error)}</p>`,'analysis-error'):''}
      <details class="analysis-scope" data-analysis-detail="scope" ${expanded.has('scope')?'open':''}><summary>${ui('材料范围与模型','Sources and model')}<span>${escape(modelLabel(visibleModel))}</span></summary><p>${ui('重点参考完整个人笔记 / 对话记录，同时读取记忆线索、完整摘要及全部剪藏 Markdown。个人理解和假设会与论文陈述区分，来源文字不会按字符数截取。','Complete personal notes / conversations are a priority, alongside memory cues, complete abstracts and all clip Markdown. Personal interpretations and hypotheses are distinguished from paper claims. Source text is not shortened by character count.')}</p><p>${boundModel?ui('默认沿用这个标签上次成功使用的模型与 effort。','Updates reuse this tag’s last successful model and effort.'):effectiveModel?.provider ? ui('本次使用上述模型与 effort；后续沿用上次成功的设置。','This run uses the model and effort shown above; later updates keep the last successful settings.') : ui('首次使用当前保存的模型设置。','The first analysis uses your currently saved model settings.')}${effectiveModel&&modelLabel(effectiveModel)!==modelLabel(visibleModel)?` ${ui('本次模型','Model for this run')}：${escape(modelLabel(effectiveModel))}`:''}</p></details>
      ${data.lastUpdateSummary?`<div class="analysis-update-summary"><strong>${ui('本次更新带来的变化','What changed in this update')}</strong>${prose(phrase(data.lastUpdateSummary))}${detail('last-update',ui('展开更新说明','Read the full update'),`<p>${prose(data.lastUpdateSummary)}</p>`)}</div>`:''}
      ${result||profiles.length||papers.length>=2?`<div class="analysis-tabs" role="tablist" aria-label="${ui('专题分析视图','Topic analysis views')}">${tabs.map(([id,label])=>`<button type="button" id="analysis-tab-${id}" role="tab" data-analysis-tab="${id}" aria-selected="${tab===id}" aria-controls="analysis-content" tabindex="${tab===id?'0':'-1'}">${label}</button>`).join('')}</div><div id="analysis-content" class="analysis-content" role="tabpanel" aria-labelledby="analysis-tab-${tab}">
      ${tab==='overview'?(result?renderOverview():profiles.length?`<div class="analysis-waiting"><h5>${ui('先读懂每篇，再把研究串起来','Read each paper, then connect the research')}</h5><p>${ui(`已有 ${profiles.length} 篇论文可在“方法图”查看。`,`Readings for ${profiles.length} papers are available in Methods.`)}</p></div>`:welcomeHtml):''}
      ${tab==='matrix'?(result?renderMatrix():`<p class="analysis-waiting">${ui('对照表会在逐篇理解与综合比较完成后生成；现在也可以去“选篇对比”直接比较几篇。','The matrix appears after reading and synthesis; meanwhile you can compare a few papers directly.')}</p>`):''}
      ${tab==='compare'?compare.html({tag:tag(),papers,selected,label:labelOf}):''}
      ${tab==='methods'?renderMethods():''}
      ${tab==='ideas'?(result?renderIdeas():`<p class="analysis-waiting">${ui('启发会在逐篇理解与综合比较完成后生成。','Ideas follow after individual reading and cross-paper synthesis are complete.')}</p>`):''}
      </div>`:welcomeHtml}
      <details class="analysis-model-options" ${optionsOpen?'open':''}><summary>${ui('重新分析与模型','Reanalysis and model')}</summary><p>${ui('默认复用未变化论文的阅读结果。重新分析会重读全部材料；只有明确选择当前设置，才切换这个标签使用的模型。','Updates reuse previous reading of unchanged papers. Reanalysis rereads all sources; this tag changes models only when you explicitly choose current settings.')}</p><div class="button-row"><button type="button" class="secondary-button small-button" data-analysis-full ${!canRun||!hasModel?'disabled':''}>${ui('沿用模型，重新分析','Reanalyze with the same model')}</button><button type="button" class="secondary-button small-button" data-analysis-current ${!canRun||!hasCurrentModel?'disabled':''}>${ui('使用当前设置模型，重新分析','Reanalyze with current settings')}</button></div><p class="muted">${ui('当前设置','Current settings')}：${escape(modelLabel(currentModel()))}</p></details>
      <footer class="analysis-footer">${data.updatedAt?`<span>${ui('上次完成','Last completed')} ${escape(new Date(data.updatedAt).toLocaleString(getState().language==='en'?'en-US':'zh-CN'))}</span>`:''}<span>${ui('手动触发 · 复用已有阅读结果','Manual updates · previous reading reused')}</span></footer>`;
    root.querySelector('[data-analysis-expand]')?.addEventListener('click',()=>{boardOpen=!boardOpen;render();root.querySelector('[data-analysis-expand]')?.focus({preventScroll:true});});
    root.querySelector('[data-analysis-dimension]')?.addEventListener('change',event=>{selectedDimension=Number(event.target.value)||0;render();root.querySelector('[data-analysis-dimension]')?.focus({preventScroll:true});});
    root.onkeydown=event=>{if(!boardOpen)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();boardOpen=false;render();root.querySelector('[data-analysis-expand]')?.focus({preventScroll:true});}else if(event.key==='Tab'){const focusable=[...root.querySelectorAll('button:not([disabled]),select,summary,input:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(element=>element.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
    root.querySelector('[data-analysis-generate]')?.addEventListener('click',()=>generate());
    root.querySelector('[data-analysis-full]')?.addEventListener('click',()=>generate({mode:'full',useCurrentModel:false}));
    root.querySelector('[data-analysis-current]')?.addEventListener('click',()=>generate({mode:'full',useCurrentModel:true}));
    root.querySelectorAll('[data-analysis-diagram-node]').forEach(node=>{
      const choose=()=>{selectedDiagramNode={paperId:node.dataset.analysisDiagramPaper,nodeId:node.dataset.analysisDiagramNode};root.querySelectorAll('[data-analysis-detail]').forEach(panel=>{if([`diagram-${selectedDiagramNode.paperId}`,`diagram-evidence-${selectedDiagramNode.paperId}`].includes(panel.dataset.analysisDetail))panel.open=true;});render();const panel=[...root.querySelectorAll('[data-analysis-detail]')].find(item=>item.dataset.analysisDetail===`diagram-${selectedDiagramNode.paperId}`);panel?.scrollIntoView({block:'nearest'});panel?.querySelector('summary')?.focus({preventScroll:true});};
      node.addEventListener('click',choose);node.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();choose();}});
    });
    root.querySelectorAll('[data-analysis-paper]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.analysisPaper;if(boardOpen){boardOpen=false;render();}openPaper(id);}));
    root.querySelector('[data-research-tag]')?.addEventListener('click',()=>{if(boardOpen){boardOpen=false;root.classList.remove('analysis-expanded');root.removeAttribute('role');root.removeAttribute('aria-modal');document.body.classList.remove('analysis-board-open');}});
    root.querySelectorAll('[data-analysis-detail]').forEach(details=>details.addEventListener('toggle',()=>{if(!root.contains(details))return;const key=details.dataset.analysisDetail; if(details.open)expanded.add(key);else expanded.delete(key);}));
    root.querySelector('.analysis-model-options')?.addEventListener('toggle',event=>{if(root.contains(event.target))optionsOpen=event.target.open;});
    root.querySelectorAll('[data-analysis-tab]').forEach(button=>{
      button.addEventListener('click',()=>{tab=button.dataset.analysisTab;render();root.querySelector(`[data-analysis-tab="${tab}"]`)?.focus({preventScroll:true});});
      button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabs.findIndex(([id])=>id===tab),count=tabs.length;tab=tabs[event.key==='Home'?0:event.key==='End'?count-1:(index+(event.key==='ArrowRight'?1:count-1))%count][0];render();root.querySelector(`[data-analysis-tab="${tab}"]`)?.focus({preventScroll:true});});
    });
    root.querySelectorAll('[data-analysis-select]').forEach(element=>{
      const id=element.dataset.analysisSelect;
      if(element.tagName==='INPUT'){element.addEventListener('change',()=>toggleSelection(id,element.checked));return;}
      element.addEventListener('click',event=>{event.preventDefault();toggleSelection(id);});
      if(element.tagName!=='BUTTON')element.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();toggleSelection(id);}});
    });
    root.querySelectorAll('[data-analysis-pair-a]').forEach(button=>button.addEventListener('click',()=>{selected=new Set([button.dataset.analysisPairA,button.dataset.analysisPairB].filter(id=>usable.has(id)));render();}));
    root.querySelectorAll('[data-analysis-clear-selection]').forEach(button=>button.addEventListener('click',()=>{selected.clear();render();}));
    root.querySelectorAll('[data-analysis-compare-go],[data-analysis-tab-link]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.analysisTabLink||'compare';render();root.querySelector(`[data-analysis-tab="${tab}"]`)?.focus({preventScroll:true});root.querySelector('.analysis-tabs')?.scrollIntoView({block:'nearest'});}));
    root.querySelectorAll('[data-analysis-axis]').forEach(select=>select.addEventListener('change',()=>{
      const axes=normalizeDesignAxes(result?.designAxes,profiles),next=[...(axisPair&&axes[axisPair[0]]&&axes[axisPair[1]]?axisPair:bestAxisPair(axes))],value=Number(select.value),axis=select.dataset.analysisAxis==='x'?0:1;
      if(next[1-axis]===value)next[1-axis]=next[axis];
      next[axis]=value;axisPair=next;render();root.querySelector(`[data-analysis-axis="${select.dataset.analysisAxis}"]`)?.focus({preventScroll:true});
    }));
    root.querySelectorAll('[data-analysis-matrix-dimension]').forEach(button=>button.addEventListener('click',()=>{selectedDimension=Number(button.dataset.analysisMatrixDimension)||0;render();root.querySelector('.analysis-branch-map')?.scrollIntoView({block:'nearest',behavior:'smooth'});}));
    compare.bind(root,{selected,rerender:render});
    if(focusKey){const target=[...root.querySelectorAll('*')].find(element=>element.dataset?.[focusKey]===focusValue&&element.tagName===oldFocus.tagName);target?.focus({preventScroll:true});if(target&&focusRange&&typeof target.setSelectionRange==='function')target.setSelectionRange(...focusRange);}
    schedule();
  }
  function toggleSelection(id,force) {
    const paper=members().find(item=>item.id===id);
    if(!paper||!hasSourceMaterial(paper))return;
    const add=force===undefined?!selected.has(id):force;
    if(add&&!selected.has(id)&&selected.size>=MAX_RESEARCH_PAPERS){toast(ui(`最多选择 ${MAX_RESEARCH_PAPERS} 篇论文`,`Select up to ${MAX_RESEARCH_PAPERS} papers`));render();return;}
    if(add)selected.add(id);else selected.delete(id);
    render();
  }
  async function generate(options={}) {
    if(submitting||blocksAction(analysis()))return;
    const id=tagId;submitting=true;error='';render();
    try {const data=await api(`/api/tags/${encodeURIComponent(id)}/paper-analysis`,{method:'POST',body:JSON.stringify(options)});if(id!==tagId)return;if(tag()&&data.analysis)tag().paperAnalysis=data.analysis;configured=data.configured??configured;currentConfigured=data.currentConfigured??currentConfigured;effectiveModel=data.effectiveModel||effectiveModel;toast(data.analysis?.status==='ready'?ui('当前分析已是最新','The analysis is already up to date'):ui('已加入后台分析队列','Topic analysis queued'));}
    catch(err){if(id===tagId)error=err.message;}
    finally{submitting=false;render();}
  }
  function watchComposition(host) {
    if(!host||host.dataset.analysisComposition)return;
    host.dataset.analysisComposition='1';
    host.addEventListener('compositionstart',()=>{composing=true;});
    host.addEventListener('compositionend',()=>{composing=false;setTimeout(()=>{if(renderPending&&!composing)render();},0);});
  }
  return {mount(host,currentTag){watchComposition(host);root=host;const changed=tagId!==currentTag?.id;if(changed){tagId=currentTag?.id||'';request++;configured=null;currentConfigured=null;effectiveModel=null;tab='overview';error='';optionsOpen=false;selectedDimension=0;selectedDiagramNode={};boardOpen=false;selected=new Set();axisPair=null;composing=false;document.body.classList.remove('analysis-board-open');expanded.clear();}render();if(changed&&active)refresh();},setActive(value){active=value;if(active)refresh();else {clearTimeout(timer);boardOpen=false;root?.classList.remove('analysis-expanded');root?.removeAttribute('role');root?.removeAttribute('aria-modal');root?.removeAttribute('aria-label');document.body.classList.remove('analysis-board-open');render();}},refresh,render};
}
