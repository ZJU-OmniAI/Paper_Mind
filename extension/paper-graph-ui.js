const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const TYPES = {
  similar_method: ['方法相似', 'Similar methods'], shared_problem: ['共同设计目标', 'Shared design objective'],
  similar: ['方法相似', 'Similar methods'], similarity: ['方法相似', 'Similar methods'],
  complementary: ['设计互补', 'Complementary design'], complement: ['互补', 'Complementary'],
  contrast: ['方法差异', 'Contrasting approaches'], contradicts: ['结论冲突', 'Conflicting findings'], contradiction: ['结论冲突', 'Conflicting findings'],
  extends: ['方法延伸', 'Method extension'], extension: ['延伸', 'Extends'], builds_on: ['基于 / 延伸', 'Builds on'],
  shared_task: ['共同问题', 'Shared task'], shared_method: ['共同方法', 'Shared method'],
  shared_data: ['共同数据', 'Shared data'], related: ['相关', 'Related']
};
const arrow = edge => edge.type === 'extends' ? '→' : '↔';

// Layout uses every member. A scrollable, zoomable canvas keeps large tags navigable.
function positions(nodes) {
  const width = Math.max(680, Math.ceil(Math.sqrt(nodes.length || 1)) * 135);
  const height = Math.max(380, Math.ceil((nodes.length || 1) / 6) * 100);
  const points = new Map();
  nodes.forEach((node, index) => {
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt((index + .8) / Math.max(1, nodes.length));
    points.set(node.paperId, {x: width / 2 + Math.cos(angle) * radius * (width / 2 - 100), y: height / 2 + Math.sin(angle) * radius * (height / 2 - 65)});
  });
  return {width, height, points};
}

export function createPaperGraph({getState, api, openPaper, toast}) {
  let root = null, tagId = '', active = false, configured = null, currentBackendConfigured = null, effectiveModel = null, type = '', focusId = '', edgeKey = '', zoom = 1;
  let timer = null, request = 0, refreshing = false, submitting = false, loadError = '', rebuildOptionsOpen = false;
  const ui = (zh, en) => getState().language === 'en' ? en : zh;
  const label = value => TYPES[value]?.[getState().language === 'en' ? 1 : 0] || value;
  const sourceLabel = value => ({abstract:ui('摘要', 'Abstract'), notes:ui('个人笔记 / 对话记录', 'Personal notes / conversation'), memory:ui('记忆线索', 'Memory cue'), clip:ui('剪藏 Markdown', 'Clipped Markdown')})[value] || ui('已保存来源（旧摘录）', 'Saved source (older excerpt)');
  const evidenceHtml = evidence => {
    const interpretation = ['notes', 'memory'].includes(evidence.sourceType);
    const matches = [...new Set(Array.isArray(evidence.matchedSourceTypes) ? evidence.matchedSourceTypes : [])].filter(type => type !== evidence.sourceType && ['abstract', 'notes', 'memory', 'clip'].includes(type));
    return `<div class="paper-graph-evidence-excerpt"><small class="muted">${escape(sourceLabel(evidence.sourceType))}${interpretation ? ` · ${ui('用户解读 / 假设', 'User interpretation / hypothesis')}` : ''}${matches.length ? ` · ${ui('同句也见于', 'Also found in')} ${escape(matches.map(sourceLabel).join('、'))}` : ''}</small><blockquote>${escape(evidence.quote)}</blockquote></div>`;
  };
  const tag = () => getState().tags.find(item => item.id === tagId);
  const graph = () => tag()?.paperGraph || {};
  const pending = data => data?.status === 'running' || (data?.status === 'queued' && (getState().config.autoPaperGraphs !== false || data.manualRequested));
  const graphEdges = () => Array.isArray(graph().edges) ? graph().edges : [];
  const key = edge => `${edge.source}\u0000${edge.target}\u0000${edge.type}`;
  const members = () => getState().papers.filter(paper => paper.tagIds?.includes(tagId)).map(paper => ({paperId:paper.id, title:paper.title}));
  const currentConfigured = () => {
    if (currentBackendConfigured !== null) return currentBackendConfigured;
    const cfg = getState().config, provider = cfg.provider || 'qwen';
    return ['codex','claude'].includes(provider) ? !!cfg.hasBridgeToken : provider === 'custom' ? !!(cfg.customModel && cfg.customBaseUrl) : !!cfg[`has${provider[0].toUpperCase()}${provider.slice(1)}Key`];
  };
  const isConfigured = () => configured !== null ? configured : currentConfigured();
  const modelLabel = model => [model?.provider, model?.requestedModel || model?.responseModel, model?.effort].filter(Boolean).join(' / ');
  const currentModel = () => { const cfg = getState().config, provider = cfg.provider || 'qwen'; return {provider, requestedModel:cfg[provider + 'Model'], effort:cfg[provider + 'Effort']}; };
  function schedule() {
    clearTimeout(timer);
    if (active && pending(graph())) timer = setTimeout(() => refresh(), 3500);
  }
  async function refresh() {
    if (!tagId || !active || refreshing === tagId) { schedule(); return; }
    const id = tagId, revision = request;
    refreshing = id;
    try {
      const data = await api(`/api/tags/${encodeURIComponent(id)}/paper-graph`);
      if (id !== tagId || revision !== request) return;
      const current = tag();
      if (current) current.paperGraph = data.graph;
      configured = data.configured ?? configured;
      currentBackendConfigured = data.currentConfigured ?? currentBackendConfigured;
      effectiveModel = data.effectiveModel || effectiveModel;
      loadError = '';
      render();
    } catch (error) {
      if (id === tagId && revision === request) { loadError = error.message; render(); }
    } finally { if (refreshing === id) refreshing = ''; schedule(); }
  }
  function statusText(data, count) {
    if (!isConfigured()) return ui('配置模型后可分析', 'Configure a model to analyze');
    if (data.status === 'queued' && !pending(data)) return ui('待手动分析', 'Ready for manual analysis');
    if (count < 2 || data.status === 'insufficient') return ui('至少需两篇含材料的论文', 'At least two papers with saved text needed');
    return ({ready: ui('已更新', 'Up to date'), queued: ui('等待后台分析', 'Queued for analysis'), running: data.updateMode === 'full' ? ui('正在全量构建', 'Building the full graph') : ui('正在增量分析', 'Analyzing changed paper pairs'), stale: ui('待更新', 'Update needed'), error: ui('本次分析失败', 'Analysis failed'), unconfigured: ui('配置模型后可分析', 'Configure a model to analyze')})[data.status] || ui('尚未分析', 'Not analyzed yet');
  }
  function selectNode(id) { focusId = focusId === id ? '' : id; edgeKey = ''; render(); }
  function render() {
    if (!root || !tag()) return;
    const oldFocus = root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = oldFocus ? Object.keys(oldFocus.dataset).find(name => name.startsWith('graph')) : '';
    const focusValue = focusKey ? oldFocus.dataset[focusKey] : '';
    const scroll = root.querySelector('.paper-graph-canvas');
    const oldScroll = {left:scroll?.scrollLeft || 0, top:scroll?.scrollTop || 0};
    const data = graph(), nodes = members(), ids = new Set(nodes.map(node => node.paperId));
    if (!ids.has(focusId)) focusId = '';
    const edges = graphEdges().filter(edge => ids.has(edge.source) && ids.has(edge.target));
    const types = [...new Set(edges.map(edge => edge.type))];
    if (!types.includes(type)) type = '';
    const filtered = edges.filter(edge => (!type || edge.type === type) && (!focusId || edge.source === focusId || edge.target === focusId));
    const selectedEdge = filtered.find(edge => key(edge) === edgeKey);
    if (!selectedEdge) edgeKey = '';
    const titles = new Map(nodes.map(node => [node.paperId, node.title]));
    const connected = new Set(filtered.flatMap(edge => [edge.source, edge.target]));
    const layout = positions(nodes);
    const stale = data.stale || data.status === 'stale';
    const oldResult = stale && !!(data.resultFingerprint || data.updatedAt || edges.length);
    const buttonText = data.status === 'error' ? ui('重试', 'Retry') : !data.updatedAt ? ui('首次构建关系图', 'Build initial graph') : data.updateMode === 'full' && data.status !== 'ready' ? ui('全量重建', 'Rebuild full graph') : ui('增量更新', 'Update incrementally');
    const canSubmit = !submitting && !pending(data) && nodes.length >= 2 && data.status !== 'insufficient';
    const boundModel = data.model?.provider ? data.model : null;
    const pendingCount = Array.isArray(data.changedPaperIds) ? data.changedPaperIds.filter(id => ids.has(id)).length : 0;
    const pairCount = Number.isInteger(data.pendingPairCount) ? data.pendingPairCount : null;
    const error = loadError || data.error;
    root.className = 'paper-graph';
    root.innerHTML = `<header class="paper-graph-heading"><div><p class="eyebrow">${ui('标签内的研究脉络', 'RESEARCH CONNECTIONS')}</p><h4>${ui('论文关系图', 'Paper relationship graph')}</h4></div><button type="button" class="secondary-button small-button" data-graph-rebuild ${!canSubmit || !isConfigured() ? 'disabled' : ''}>${submitting ? ui('提交中…', 'Queuing…') : buttonText}</button></header>
      <div class="paper-graph-meta"><span>${ui(`${nodes.length} 篇论文 · ${edges.length} 条关系`, `${nodes.length} papers · ${edges.length} relationships`)}</span><span class="paper-graph-status ${['error','queued','running'].includes(data.status) ? data.status : ''}" role="status">${escape(statusText(data, nodes.length))}</span></div>
      ${data.migrationRequired ? `<p class="paper-graph-stale">${ui('旧图需要加入完整个人笔记、对话与记忆线索，重新构建方法设计关系。', 'The older graph needs a new method-design analysis that includes complete personal notes, conversations and memory cues.')}</p>` : ''}
      ${oldResult ? `<p class="paper-graph-stale" role="status">${ui('当前显示上次结果；新的关系分析尚未完成。', 'Showing the previous result; the latest relationship analysis has not completed.')}</p>` : ''}
      ${error ? `<p class="paper-graph-error" role="alert">${escape(error)}</p>` : ''}
      <p class="paper-graph-notice">${ui('AI 推断的方法设计关系，并非已核实的引用关系。点击节点聚焦，点击连线查看依据。', 'AI-inferred method-design relationships, not verified citations. Select a paper to focus, or a connection to inspect evidence.')}</p>
      <div class="paper-graph-plan"><p class="paper-graph-sources">${ui('资料范围：完整个人笔记 / 对话记录、记忆线索、完整摘要（无原文摘要时使用译文）及全部剪藏 Markdown。重点参考个人笔记；用户解读和假设会与论文陈述区分。', 'Sources: complete personal notes / conversations, memory cues, complete abstract (translation if the original is absent) and all clip Markdown. Personal notes are a priority; user interpretations and hypotheses are distinguished from paper claims.')}</p><p class="paper-graph-model"><strong>${boundModel ? ui('默认沿用模型', 'Default: reuse last successful model') : ui('首次使用当前设置', 'First build uses current settings')}</strong><span>${escape(modelLabel(boundModel || currentModel()))}</span></p>${effectiveModel && modelLabel(effectiveModel) !== modelLabel(boundModel || currentModel()) ? `<p>${ui('本次分析模型', 'Model for this update')}：${escape(modelLabel(effectiveModel))}</p>` : ''}<p>${ui('自动增量更新：只比对涉及新增论文，或笔记、记忆、摘要、剪藏变更的组合，保留其他关系。', 'Automatic incremental updates compare pairs involving new papers or changed notes, memories, abstracts or clips, preserving all other relationships.')}</p>${data.status !== 'ready' && pairCount !== null ? `<p class="paper-graph-pending-pairs">${data.updateMode === 'full' ? ui(`全量构建 · 待比较 ${pairCount} 对论文`, `Full build · ${pairCount} paper pairs pending`) : ui(`新增或变更 ${pendingCount} 篇 · 待比较 ${pairCount} 对论文`, `${pendingCount} new or changed papers · ${pairCount} paper pairs pending`)}</p>` : ''}</div>
      <details class="paper-graph-rebuild-options" ${rebuildOptionsOpen ? 'open' : ''}><summary>${ui('全量重建与模型', 'Full rebuild and model')}</summary><p>${ui('全量重建会重新分析所有论文对。默认沿用该标签上次成功的模型；切换模型需选择下面的操作。', 'A full rebuild reanalyzes every paper pair. This tag keeps its last successful model unless you explicitly switch below.')}</p><div class="button-row"><button type="button" class="secondary-button small-button" data-graph-full ${!canSubmit || !isConfigured() ? 'disabled' : ''}>${ui('沿用模型，全量重建', 'Rebuild with the same model')}</button><button type="button" class="secondary-button small-button" data-graph-current ${!canSubmit || !currentConfigured() ? 'disabled' : ''}>${ui('使用当前设置模型，全量重建', 'Rebuild with current settings')}</button></div><p class="muted">${ui('当前设置', 'Current settings')}：${escape(modelLabel(currentModel()))}</p></details>
      ${data.lastUpdateSummary ? `<p class="paper-graph-update-summary"><strong>${ui('最近增量变化', 'Latest incremental changes')}</strong> ${escape(data.lastUpdateSummary)}</p>` : ''}
      ${data.summary ? `<p class="paper-graph-summary"><strong>${ui('上次全量分析概述', 'Last full analysis summary')}</strong> ${escape(data.summary)}</p>` : ''}
      ${nodes.length ? `<div class="paper-graph-tools"><label>${ui('关系类型', 'Relationship type')}<select data-graph-type><option value="">${ui('全部关系', 'All relationships')}</option>${types.map(value => `<option value="${escape(value)}" ${type === value ? 'selected' : ''}>${escape(label(value))}</option>`).join('')}</select></label><label>${ui('聚焦论文', 'Focus paper')}<select data-graph-focus><option value="">${ui('全部论文', 'All papers')}</option>${nodes.map(node => `<option value="${escape(node.paperId)}" ${focusId === node.paperId ? 'selected' : ''}>${escape(node.title)}</option>`).join('')}</select></label><div class="paper-graph-zoom" role="group" aria-label="${ui('图谱缩放', 'Graph zoom')}"><button type="button" data-graph-zoom="out" aria-label="${ui('缩小关系图', 'Zoom out graph')}">−</button><button type="button" data-graph-zoom="reset" aria-label="${ui('重置缩放', 'Reset zoom')}">${Math.round(zoom * 100)}%</button><button type="button" data-graph-zoom="in" aria-label="${ui('放大关系图', 'Zoom in graph')}">＋</button></div></div>
      <div class="paper-graph-canvas" tabindex="0" role="region" aria-label="${ui('论文关系图，可滚动浏览', 'Paper graph, scroll to explore')}"><svg class="paper-graph-svg" viewBox="0 0 ${layout.width} ${layout.height}" style="width:${zoom * 100}%;min-width:${Math.round(420 * zoom)}px" role="group" aria-label="${ui('标签下全部论文与关系', 'All papers and relationships in this tag')}"><defs><marker id="paperGraphArrow" viewBox="0 0 10 10" refX="24" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs><g class="paper-graph-edges">${filtered.map((edge, index) => { const source = layout.points.get(edge.source), target = layout.points.get(edge.target); const description = `${titles.get(edge.source)} ${arrow(edge)} ${titles.get(edge.target)} · ${label(edge.type)}`; return `<g class="paper-graph-edge ${key(edge) === edgeKey ? 'selected' : ''}" data-graph-edge="${index}" tabindex="0" role="button" aria-label="${escape(description)}"><title>${escape(description)}</title><line class="paper-graph-edge-hit" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"/><line class="paper-graph-edge-line" ${edge.type === 'extends' ? 'marker-end="url(#paperGraphArrow)"' : ''} x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"/></g>`; }).join('')}</g><g>${nodes.map((node, index) => { const point = layout.points.get(node.paperId), dimmed = focusId && focusId !== node.paperId && !connected.has(node.paperId); return `<g class="paper-graph-node ${focusId === node.paperId ? 'selected' : ''} ${dimmed ? 'dimmed' : ''}" data-graph-node="${escape(node.paperId)}" transform="translate(${point.x} ${point.y})" tabindex="0" role="button" aria-label="${escape(node.title)}" aria-pressed="${focusId === node.paperId}"><title>${escape(node.title)}</title><circle r="22"/><text class="paper-graph-number" text-anchor="middle" dy="4">${String(index + 1).padStart(2, '0')}</text><text class="paper-graph-node-label" text-anchor="middle" y="40">${escape(node.title.length > 24 ? node.title.slice(0, 22) + '…' : node.title)}</text></g>`; }).join('')}</g></svg></div>
      <div class="paper-graph-selection">${selectedEdge ? `<div class="paper-graph-evidence-heading"><span class="paper-graph-type">${escape(label(selectedEdge.type))}</span>${Number.isFinite(Number(selectedEdge.confidence)) ? `<small>${ui('模型把握程度（估计）', 'Model confidence (estimate)')} ${Math.round(Number(selectedEdge.confidence) * 100)}%</small>` : ''}</div>${selectedEdge.methodAspect ? `<p class="paper-graph-method-aspect">${ui('方法维度', 'Method aspect')}：${escape(selectedEdge.methodAspect)}</p>` : ''}<h5>${escape(titles.get(selectedEdge.source))} ${arrow(selectedEdge)} ${escape(titles.get(selectedEdge.target))}</h5><p>${escape(selectedEdge.explanation)}</p><div class="paper-graph-evidence">${[selectedEdge.source, selectedEdge.target].map(id => `<section><button type="button" class="text-button" data-graph-open="${escape(id)}">${escape(titles.get(id))} ↗</button>${(selectedEdge.evidence || []).filter(evidence => evidence.paperId === id).map(evidenceHtml).join('') || `<p class="muted">${ui('没有可核对的摘录。', 'No source excerpt available.')}</p>`}</section>`).join('')}</div>` : focusId ? `<h5>${escape(titles.get(focusId))}</h5><p>${ui(`当前显示 ${filtered.length} 条相关关系。`, `Showing ${filtered.length} connected relationships.`)}</p><button type="button" class="text-button" data-graph-open="${escape(focusId)}">${ui('打开论文详情 ↗', 'Open paper details ↗')}</button>` : `<p class="muted">${filtered.length ? ui('选择一条关系，查看解释与两篇论文的材料摘录。', 'Select a relationship to read its explanation and excerpts from both papers.') : data.status === 'ready' ? ui('当前没有有充分材料支撑的关系。所有论文仍保留在图中。', 'No supported relationships found in this view. Every paper remains visible.') : ui('所有论文已显示；后台分析完成后会添加有材料依据的关系。', 'Every paper is shown. Evidence-backed connections appear after analysis.')}</p>`}</div>
      ${filtered.length ? `<details class="paper-graph-relationship-list" open><summary>${ui(`关系列表（${filtered.length}）`, `Relationships (${filtered.length})`)}</summary><div>${filtered.map((edge, index) => `<button type="button" data-graph-edge="${index}" aria-pressed="${key(edge) === edgeKey}"><span class="paper-graph-type">${escape(label(edge.type))}</span><span>${escape(titles.get(edge.source))}<span class="paper-graph-between">${arrow(edge)}</span>${escape(titles.get(edge.target))}</span></button>`).join('')}</div></details>` : ''}` : `<p class="empty">${ui('为这个标签添加论文后，即可建立它们之间的联系。', 'Add papers to this tag to explore their connections.')}</p>`}
      <footer class="paper-graph-footer">${data.updatedAt ? `${ui('上次分析', 'Last analysis')} ${escape(new Date(data.updatedAt).toLocaleString(getState().language === 'en' ? 'en-US' : 'zh-CN'))}${data.model ? ` · ${escape([data.model.provider, data.model.responseModel || data.model.requestedModel, data.model.effort].filter(Boolean).join(' / '))}` : ''}` : ''}<span>${getState().config.autoPaperGraphs !== false ? ui('自动更新已开启', 'Automatic updates on') : ui('自动更新已关闭', 'Automatic updates off')}</span></footer>`;
    root.querySelectorAll('[data-graph-node]').forEach(button => button.addEventListener('click', () => selectNode(button.dataset.graphNode)));
    root.querySelectorAll('[data-graph-edge]').forEach(button => button.addEventListener('click', () => { edgeKey = key(filtered[Number(button.dataset.graphEdge)]); render(); }));
    root.querySelectorAll('svg [role="button"]').forEach(button => button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.dispatchEvent(new MouseEvent('click', {bubbles:true})); } }));
    root.querySelectorAll('[data-graph-open]').forEach(button => button.addEventListener('click', () => openPaper(button.dataset.graphOpen)));
    root.querySelector('[data-graph-type]')?.addEventListener('change', event => { type = event.target.value; edgeKey = ''; render(); });
    root.querySelector('[data-graph-focus]')?.addEventListener('change', event => { focusId = event.target.value; edgeKey = ''; render(); });
    root.querySelectorAll('[data-graph-zoom]').forEach(button => button.addEventListener('click', () => { zoom = button.dataset.graphZoom === 'reset' ? 1 : Math.max(.6, Math.min(3, zoom + (button.dataset.graphZoom === 'in' ? .25 : -.25))); render(); }));
    root.querySelector('[data-graph-rebuild]')?.addEventListener('click', () => rebuild());
    root.querySelector('[data-graph-full]')?.addEventListener('click', () => rebuild({mode:'full',useCurrentModel:false}));
    root.querySelector('[data-graph-current]')?.addEventListener('click', () => rebuild({mode:'full',useCurrentModel:true}));
    root.querySelector('.paper-graph-rebuild-options')?.addEventListener('toggle', event => { rebuildOptionsOpen = event.target.open; });
    const canvas = root.querySelector('.paper-graph-canvas');
    if (canvas) { canvas.scrollLeft = oldScroll.left; canvas.scrollTop = oldScroll.top; }
    if (focusKey) [...root.querySelectorAll('*')].find(element => element.dataset[focusKey] === focusValue && element.tagName === oldFocus.tagName)?.focus({preventScroll:true});
    schedule();
  }
  async function rebuild(options = {}) {
    if (submitting || pending(graph())) return;
    const id = tagId;
    submitting = true; loadError = ''; render();
    try {
      const data = await api(`/api/tags/${encodeURIComponent(id)}/paper-graph`, {method:'POST', body:JSON.stringify(options)});
      if (id !== tagId) return;
      if (tag() && data.graph) tag().paperGraph = data.graph;
      configured = data.configured ?? configured;
      currentBackendConfigured = data.currentConfigured ?? currentBackendConfigured;
      effectiveModel = data.effectiveModel || effectiveModel;
      toast(data.graph?.status === 'ready' ? ui('当前关系图已是最新', 'The graph is already up to date') : ui('已加入后台分析队列', 'Graph analysis queued'));
    } catch (error) { if (id === tagId) loadError = error.message; }
    finally { submitting = false; render(); }
  }
  return {
    mount(host, currentTag) {
      root = host;
      const changed = tagId !== currentTag?.id;
      if (changed) { tagId = currentTag?.id || ''; request++; configured = null; currentBackendConfigured = null; effectiveModel = null; type = ''; focusId = ''; edgeKey = ''; zoom = 1; loadError = ''; rebuildOptionsOpen = false; }
      render();
      if (changed && active) refresh();
    },
    setActive(value) { active = value; if (active) refresh(); else clearTimeout(timer); },
    refresh,
    render
  };
}
