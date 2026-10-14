import { safeWebUrl } from './library-tools.js';
import { prepareResearchInput, reportToMarkdown, fusionSample, hasSourceMaterial, comparisonInTag, MAX_FUSION_TAGS, MAX_RESEARCH_PAPERS } from './research.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const list = values => (values || []).length ? `<ul>${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : '';
// One hue per fused tag, in the order the tags were chosen.
const TAG_COLORS = ['#168a81', '#6e76b5', '#b18b54', '#b5577a'];

// Deep exploration fuses the design principles of 2–4 tags into new ideas, then
// discusses, critiques and refines them. Comparing papers within one tag lives
// in that tag's topic analysis; older comparison sessions remain readable here.
export function createResearchWorkspace({ root, getState, api, refresh, openPaper, toast }) {
  let fusionTags = [], customPapers = null, question = '';
  let activeId = localStorage.getItem('paperMindResearchActive') || '', busy = false, exploring = false, stopping = false, status = '', error = '', ideaIndex = 0, rounds = 1, followup = '';
  let chatting = false, pendingQuestion = '', artifactOpen = true, composing = false, renderPending = false, restoreConversation = true, mapObserver = null;
  const drafts = new Map();
  const chatDraft = () => drafts.get(activeId) || { message: '', ideaIndex: '', action: 'followup' };
  const updateDraft = patch => drafts.set(activeId, { ...chatDraft(), ...patch });
  const ui = (zh, en) => getState().language === 'en' ? en : zh;
  const reports = () => Object.values(getState().meta?.researchReports || {}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  // Comparisons started inside a tag are shown there; only unscoped legacy ones stay here.
  const legacyComparisons = () => reports().filter(report => report.kind === 'comparison' && !getState().tags.some(tag => comparisonInTag(report, tag.id, getState().papers)));
  const sessions = () => reports().filter(report => report.kind === 'ideas');
  const currentReport = () => reports().find(report => report.id === activeId);
  const configured = () => {
    const config = getState().config;
    if (config.provider === 'custom') return Boolean(config.customModel && config.customBaseUrl);
    if (['claude', 'codex'].includes(config.provider)) return config.hasBridgeToken;
    const provider = config.provider || 'qwen';
    return config[`has${provider[0].toUpperCase() + provider.slice(1)}Key`];
  };
  const tagColor = (report, tagId) => TAG_COLORS[Math.max(0, (report ? report.tagIds : fusionTags).indexOf(tagId)) % TAG_COLORS.length];
  const tagName = (report, tagId) => report?.snapshot?.tags?.find(tag => tag.id === tagId)?.name || getState().tags.find(tag => tag.id === tagId)?.name || tagId;
  const references = (items, report) => (items || []).length ? `<div class="research-evidence">${items.length > 2 ? `<details><summary>${ui(`查看 ${items.length} 条来源摘录`, `View ${items.length} source excerpts`)}</summary>` : ''}${items.map(item => {
    const source = report.sources.find(source => source.paperId === item.paperId);
    return `<blockquote><p>${escape(item.quote)}</p><button class="research-source-link" type="button" data-research-paper="${escape(item.paperId)}">${escape(source?.title || item.paperId)}</button></blockquote>`;
  }).join('')}${items.length > 2 ? '</details>' : ''}</div>` : '';
  const experimentHtml = experiment => `<dl class="research-experiment">${[
    ['setup', ui('最小实验', 'Minimal experiment')], ['baseline', ui('对照基线', 'Baseline')],
    ['metric', ui('评估指标', 'Metric')], ['successCriterion', ui('成功 / 否证条件', 'Success / falsification criterion')]
  ].map(([key, label]) => `<div><dt>${label}</dt><dd>${escape(experiment?.[key] || ui('待补充', 'Not specified'))}</dd></div>`).join('')}</dl>`;

  function activate(id) {
    activeId = id; localStorage.setItem('paperMindResearchActive', id);
    ideaIndex = 0; followup = ''; error = ''; status = ''; artifactOpen = !(currentReport()?.chatTurns || []).length;
  }

  function scrollToLatest() {
    const thread = root.querySelector('#researchConversation');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  const modeName = kind => kind === 'comparison' ? ui('论文对比（旧版）', 'Paper comparison (earlier)') : ui('跨标签融合', 'Cross-tag fusion');
  const defaultQuestion = () => ui('请提炼这些标签各自的核心设计理念，再把它们交叉融合成可检验的新研究想法，并给出最小实验方案。', 'Distill the core design principles of each tag, then fuse them into testable research ideas with minimal experiment plans.');
  const starterQuestions = () => [ui('把 A 的核心机制用到 B 上会怎样？', 'What if A’s core mechanism were applied to B?'), ui('这些方向的设计理念有哪些互补或冲突？', 'Where do these design philosophies complement or conflict?'), ui('有哪些低成本的验证实验？', 'What low-cost experiments could test them?')];

  // The papers a new fusion will read: the automatic balanced sample unless the
  // user adjusted it. Explicit choices are re-validated by the backend.
  function chosenPapers() {
    if (fusionTags.length < 2) return [];
    if (customPapers) return [...customPapers];
    try { return fusionSample(getState(), fusionTags).papers.map(paper => paper.id); } catch { return []; }
  }

  function tagPickerHtml() {
    const state = getState();
    const options = state.tags.filter(tag => !tag.system && tag.id !== 'system-unsorted').map(tag => ({ tag, count: state.papers.filter(paper => paper.tagIds?.includes(tag.id)).length }));
    const full = fusionTags.length >= MAX_FUSION_TAGS;
    return `<div class="fusion-tag-list" role="group" aria-label="${ui('选择要融合的标签', 'Choose tags to fuse')}">${options.map(({ tag, count }) => {
      const on = fusionTags.includes(tag.id), analyzed = Boolean(tag.paperAnalysis?.result);
      return `<button type="button" class="fusion-tag-option${on ? ' on' : ''}" data-fusion-tag="${escape(tag.id)}" aria-pressed="${on}" ${busy || (!on && (full || !count)) ? 'disabled' : ''} style="--tag-color:${on ? tagColor(null, tag.id) : 'var(--line)'}"><span class="fusion-tag-order" aria-hidden="true">${on ? fusionTags.indexOf(tag.id) + 1 : '+'}</span><span><strong>${escape(tag.name)}</strong><small>${ui(`${count} 篇`, `${count} papers`)}${analyzed ? ui(' · 有专题分析', ' · topic analysis') : ''}</small></span></button>`;
    }).join('') || `<p class="empty">${ui('还没有标签。先收藏论文并添加标签。', 'No tags yet. Save papers and add tags first.')}</p>`}</div>`;
  }

  function samplePreview() {
    if (fusionTags.length < 2) return `<p class="muted fusion-hint">${ui(`再选 ${2 - fusionTags.length} 个标签即可开始；最多 ${MAX_FUSION_TAGS} 个。`, `Choose ${2 - fusionTags.length} more tag${fusionTags.length ? '' : 's'} to begin; up to ${MAX_FUSION_TAGS}.`)}</p>`;
    const state = getState(), chosen = new Set(chosenPapers());
    let problem = customPapers && !customPapers.size ? ui('请为每个标签至少勾选一篇论文。', 'Tick at least one paper for each tag.') : '';
    if (!problem) try { prepareResearchInput(state, { kind: 'ideas', tagIds: fusionTags, paperIds: customPapers ? [...customPapers] : [], language: state.language }); }
    catch (err) { problem = err.message; }
    const groups = fusionTags.map(tagId => {
      const papers = state.papers.filter(paper => paper.tagIds?.includes(tagId) && hasSourceMaterial(paper));
      return `<section class="fusion-sample-group" style="--tag-color:${tagColor(null, tagId)}"><h4>${escape(tagName(null, tagId))}<small>${ui(`已选 ${papers.filter(paper => chosen.has(paper.id)).length} 篇`, `${papers.filter(paper => chosen.has(paper.id)).length} chosen`)}</small></h4>${papers.length ? papers.map(paper => `<label class="fusion-sample-paper"><input type="checkbox" data-fusion-paper="${escape(paper.id)}" ${chosen.has(paper.id) ? 'checked' : ''} ${busy || (!chosen.has(paper.id) && chosen.size >= MAX_RESEARCH_PAPERS) ? 'disabled' : ''}><span>${escape(paper.title)}</span></label>`).join('') : `<p class="research-error">${ui('这个标签还没有带摘要、笔记或剪藏的论文。', 'This tag has no paper with an abstract, notes or clips yet.')}</p>`}</section>`;
    }).join('');
    return `<details class="research-sample" open><summary>${ui(`本次将完整阅读 ${chosen.size} 篇论文`, `${chosen.size} papers will be read in full`)}</summary><p class="muted">${customPapers ? ui('已按你的勾选取样。', 'Using your selection.') : ui(`按标签平衡自动取样，最多 ${MAX_RESEARCH_PAPERS} 篇；可以勾选调整。`, `Balanced automatic sample, up to ${MAX_RESEARCH_PAPERS} papers; tick to adjust.`)}${customPapers ? ` <button type="button" class="text-button" data-fusion-reset>${ui('恢复自动取样', 'Use automatic sample')}</button>` : ''}</p><div class="fusion-sample-groups">${groups}</div>${problem ? `<p class="research-error">${escape(problem)}</p>` : ''}</details>`;
  }

  function contextHtml(report) {
    if (report) return `<section class="research-context"><div class="research-context-heading"><h3>${ui('本次研究材料', 'Session sources')}</h3><span>${report.sources.length} ${ui('篇', 'papers')}</span></div><p class="muted">${ui('对话持续使用这次探索的材料快照。更新资料或更换论文请新建探索。', 'This conversation uses the session’s saved source snapshot. Start a new exploration to use updated material or different papers.')}</p>${report.sources.some(source => source.truncated) ? `<p class="muted">${ui('此会话的部分旧材料曾被截取；新建探索可使用当前完整资料。', 'Some sources in this older session were excerpted. Start a new exploration to use all currently saved text.')}</p>` : ''}<span class="research-context-kind">${modeName(report.kind)}</span>${report.snapshot.tags.map(tag => `<span class="research-context-kind" style="--tag-color:${report.kind === 'ideas' ? tagColor(report, tag.id) : 'var(--accent)'}">${escape(tag.name)}</span>`).join('')}<div class="research-session-sources">${report.sources.map((source, index) => `<button type="button" class="research-session-source" data-research-paper="${escape(source.paperId)}"><small>${String(index + 1).padStart(2, '0')}</small><span>${escape(source.title)}</span></button>`).join('')}</div></section>`;
    return `<section class="research-compose research-context"><h3>${ui('选择要融合的标签', 'Choose tags to fuse')}</h3><p class="muted">${ui(`选 2–${MAX_FUSION_TAGS} 个标签。先提炼每个标签的设计理念，再交叉组合成新想法；有专题分析的标签会把分析结论作为背景。`, `Pick 2–${MAX_FUSION_TAGS} tags. Each tag’s design principles are distilled first, then combined into new ideas; a tag’s topic analysis is used as background when available.`)}</p>
      <fieldset ${busy ? 'disabled' : ''}><legend class="sr-only">${ui('融合标签', 'Tags to fuse')}</legend>${tagPickerHtml()}${samplePreview()}</fieldset></section>`;
  }

  function chatComposer(report) {
    const draft = chatDraft(), turns = report?.chatTurns || [], full = turns.length >= 20;
    const prompts = report ? (turns.at(-1)?.suggestedQuestions?.length ? turns.at(-1).suggestedQuestions : [ui('哪个融合想法最值得先验证？为什么？', 'Which fused idea is most worth testing first, and why?'), ui('请设计一个最小验证实验。', 'Design a minimal validation experiment.')]) : starterQuestions();
    return `<div class="research-chat-composer"><div class="research-chat-suggestions">${prompts.map(prompt => `<button type="button" data-research-prompt="${escape(prompt)}" ${busy || full ? 'disabled' : ''}>${escape(prompt)}</button>`).join('')}</div>
      ${report ? `<div class="research-chat-options">${report.ideas.length ? `<label>${ui('讨论范围', 'Discuss')}<select id="researchChatIdea" ${busy ? 'disabled' : ''}><option value="">${ui('整份分析', 'Whole analysis')}</option>${report.ideas.map((idea, index) => `<option value="${index}" ${String(draft.ideaIndex) === String(index) ? 'selected' : ''}>${escape(idea.title)}</option>`).join('')}</select></label>` : ''}<label>${ui('智能体操作', 'Agent action')}<select id="researchChatAction" ${busy ? 'disabled' : ''}><option value="followup" ${draft.action === 'followup' ? 'selected' : ''}>${ui('继续追问', 'Follow up')}</option><option value="critique" ${draft.action === 'critique' ? 'selected' : ''}>${ui('质疑与反例', 'Critique')}</option><option value="experiment" ${draft.action === 'experiment' ? 'selected' : ''}>${ui('实验设计', 'Experiment plan')}</option></select></label><button class="research-source-link" type="button" id="researchShowReport">${ui('查看研究报告', 'Open research report')}</button></div>` : ''}
      <label class="research-message-label" for="${report ? 'researchChatInput' : 'researchQuestion'}">${report ? ui('继续与研究智能体讨论', 'Continue with your research agent') : ui('你想要什么样的灵感？（可选）', 'What kind of inspiration are you after? (optional)')}</label>
      <div class="research-message-box"><textarea id="${report ? 'researchChatInput' : 'researchQuestion'}" maxlength="2000" rows="3" ${busy || full ? 'disabled' : ''} placeholder="${report ? ui('补充约束、追问融合机制，或一起细化实验方案…', 'Add constraints, question a fusion mechanism, or refine an experiment…') : ui('例如：把检索增强的“按需取证”用到智能体规划上，会产生什么新方法？', 'For example: what new method appears if on-demand evidence from RAG drives agent planning?')}">${escape(report ? draft.message : question)}</textarea><div class="research-message-footer"><small>${report ? ui(`追问 ${turns.length} / 20 · ⌘ / Ctrl + Enter 发送`, `Follow-ups ${turns.length} / 20 · ⌘ / Ctrl + Enter to send`) : ui('⌘ / Ctrl + Enter 发送', '⌘ / Ctrl + Enter to send')}</small><button class="primary-button" id="${report ? 'researchChatSend' : 'researchGenerate'}" type="button" ${busy || full || !configured() ? 'disabled' : ''}>${busy ? ui('正在研究…', 'Working…') : report ? ui('发送', 'Send') : ui('开始融合 ↗', 'Start fusing ↗')}</button></div></div>
      <p class="research-disclosure">${full ? ui('本次已完成 20 轮追问，可以新建探索继续。', '20 follow-ups completed. Start a new exploration to continue.') : report ? ui('基于当前材料与近期对话回答；更早的讨论可能省略，请重述重要约束。', 'Answers use current sources and recent conversation; repeat important constraints from older turns.') : ui('发送后会将所选论文已保存的论文信息、完整摘要与译文、记忆、个人笔记和全部剪藏 Markdown 交给当前模型分析，不截取文字。', 'Sending shares the selected papers’ saved paper information, complete abstracts and translations, memories, personal notes and all clip Markdown with your configured model, without excerpting the source text.')}</p>
      ${!configured() ? `<p class="research-error">${ui('请先在“模型设置”中配置并测试模型。', 'Configure and test a model in Model settings first.')}</p>` : ''}</div>`;
  }

  function assistantSummary(report) {
    if (report.comparison) return report.comparison.summary;
    const principles = report.principles || [];
    return principles.length
      ? ui(`已从 ${report.sources.length} 篇材料中提炼出 ${principles.length} 条设计理念，并融合出 ${report.ideas.length} 个新想法。先看融合图，再选一个想法继续讨论。`, `Distilled ${principles.length} design principles from ${report.sources.length} papers and fused them into ${report.ideas.length} new ideas. Start with the fusion map, then pick an idea to discuss.`)
      : ui(`已从 ${report.sources.length} 篇材料中整理出 ${report.ideas.length} 个交叉 idea。可以先查看依据，再选择一个方向继续讨论。`, `Found ${report.ideas.length} cross-tag ideas from ${report.sources.length} papers. Review the evidence and choose a direction to discuss.`);
  }

  function transcriptHtml(report) {
    if (!report) return busy ? `<div class="agent-message user"><div class="agent-message-body">${escape(pendingQuestion)}</div></div>` : `<div class="research-agent-welcome"><div class="research-agent-mark">P<span>✦</span></div><p class="eyebrow">${ui('跨标签理念融合', 'CROSS-TAG FUSION')}</p><h3>${ui('融合不同标签的设计理念，<br>碰撞出新的研究想法。', 'Fuse design principles across tags.<br>Spark new research ideas.')}</h3><p>${ui(`选 2–${MAX_FUSION_TAGS} 个标签：我先提炼每个标签的核心设计理念，再把它们交叉组合成可检验的想法；之后可以继续追问、质疑和细化实验。`, `Choose 2–${MAX_FUSION_TAGS} tags. I distill each tag’s core design principles, combine them into testable ideas, and then we can question, critique and refine the experiments.`)}</p><div class="research-agent-capabilities"><span>${ui('提炼设计理念', 'Distill principles')}</span><span>${ui('交叉融合想法', 'Fuse ideas')}</span><span>${ui('多轮推演验证', 'Refine in rounds')}</span></div><p class="muted research-agent-note">${ui('比较同一标签下的几篇论文，请到“标签库”打开该标签的“专题分析 → 选篇对比”。', 'To compare papers within one tag, open that tag’s Topic analysis → Compare papers in Tags.')}</p></div>`;
    return `<div class="agent-message user"><small>${ui('你', 'You')}</small><div class="agent-message-body">${escape(report.question || defaultQuestion())}</div></div><div class="agent-message assistant"><small>${ui('研究智能体', 'Research agent')} · ${escape(report.model.responseModel || report.model.requestedModel)}</small><p>${escape(assistantSummary(report))}</p><details id="researchArtifact" class="research-artifact" ${artifactOpen ? 'open' : ''}><summary><span>${report.kind === 'comparison' ? '▦' : '✦'} ${escape(report.title)}</span><small>${ui('分析报告与来源', 'Report and sources')}</small></summary><div id="researchReport"></div></details></div>
      ${(report.chatTurns || []).map(turn => `<div class="agent-chat-turn" data-research-turn="${escape(turn.id)}"><div class="agent-message user"><small>${ui('你', 'You')}${turn.ideaIndex !== null && turn.ideaIndex !== undefined ? ` · ${escape(report.ideas[turn.ideaIndex]?.title)}` : ''}</small><div class="agent-message-body">${escape(turn.question)}</div></div><div class="agent-message assistant"><small>${ui('研究智能体', 'Research agent')} · ${escape(turn.model?.responseModel || turn.model?.requestedModel)} · ${escape(new Date(turn.createdAt).toLocaleTimeString(getState().language === 'en' ? 'en-US' : 'zh-CN', {hour:'2-digit',minute:'2-digit'}))}</small>${turn.answerKind === 'insufficient' ? `<span class="research-insufficient">${ui('材料不足，待补充证据', 'More source material needed')}</span>` : ''}<div class="agent-answer">${escape(turn.answer)}</div>${references(turn.evidence, report)}</div></div>`).join('')}
      ${chatting ? `<div class="agent-message user research-pending-message"><small>${ui('你 · 发送中', 'You · Sending')}</small><div class="agent-message-body">${escape(pendingQuestion)}</div></div>` : ''}`;
  }

  function historyHtml(state) {
    const items = sessions(), legacy = legacyComparisons();
    const item = report => `<button type="button" class="research-history-item ${report.id === activeId ? 'active' : ''}" data-research-report="${escape(report.id)}" ${busy ? 'disabled' : ''}><small>${modeName(report.kind)} · ${escape(new Date(report.createdAt).toLocaleDateString(state.language === 'en' ? 'en-US' : 'zh-CN'))}</small><strong>${escape(report.title)}</strong></button>`;
    return `<section class="research-history"><h3>${ui('探索会话', 'Conversations')}</h3><div>${items.length ? items.map(item).join('') : `<p class="empty">${ui('完成首次融合后，会话会自动保存在这里。', 'Your first fusion will be saved here automatically.')}</p>`}${legacy.length ? `<details class="research-legacy" ${legacy.some(report => report.id === activeId) ? 'open' : ''}><summary>${ui(`旧版论文对比 · ${legacy.length}`, `Earlier paper comparisons · ${legacy.length}`)}</summary><p class="muted">${ui('新的论文对比请在标签专题分析的“选篇对比”中进行。', 'New comparisons now live in a tag’s Topic analysis → Compare papers.')}</p>${legacy.map(item).join('')}</details>` : ''}</div></section>`;
  }

  function render() {
    // Background library refreshes must not interrupt a Chinese IME composition.
    if (composing) { renderPending = true; return; }
    renderPending = false;
    const focus = root.contains(document.activeElement) ? document.activeElement : null;
    const focusState = focus?.id ? { id: focus.id, start: focus.selectionStart, end: focus.selectionEnd } : focus?.dataset?.fusionTag ? { fusionTag: focus.dataset.fusionTag } : focus?.dataset?.fusionPaper ? { fusionPaper: focus.dataset.fusionPaper } : null;
    const scroll = root.querySelector('#researchConversation')?.scrollTop || 0;
    const state = getState();
    fusionTags = fusionTags.filter(id => state.tags.some(tag => tag.id === id && !tag.system && id !== 'system-unsorted'));
    if (customPapers) customPapers = new Set([...customPapers].filter(id => state.papers.some(paper => paper.id === id && fusionTags.some(tagId => paper.tagIds?.includes(tagId)))));
    if (activeId && !currentReport()) activate('');
    const report = currentReport();
    if (restoreConversation && report?.chatTurns?.length) artifactOpen = false;
    root.innerHTML = `<div class="research-agent-layout">
      <aside class="research-agent-sidebar"><button class="secondary-button research-new" type="button" id="researchNew" ${busy ? 'disabled' : ''}>＋ ${ui('新建融合', 'New fusion')}</button>${contextHtml(report)}
        ${historyHtml(state)}
      </aside>
      <section class="research-agent-main"><header class="research-agent-header"><div class="research-agent-avatar" aria-hidden="true">✦</div><div><h3>${ui('研究智能体', 'Research agent')}</h3><p>${ui('跨标签理念融合 · 灵感推演 · 证据追问', 'Cross-tag fusion · Idea refinement · Evidence')}</p></div><span class="research-agent-scope">${ui('库内材料', 'Library sources')}</span></header>
        <div id="researchConversation" class="research-conversation" role="region" aria-label="${ui('研究智能体对话', 'Research agent conversation')}" tabindex="0">${transcriptHtml(report)}<div id="researchLatest"></div></div>
        <div class="research-agent-progress" ${!status && !error ? 'hidden' : ''}><p id="researchStatus" class="research-status" role="status" aria-live="polite">${busy ? '<span class="research-working-dot" aria-hidden="true"></span>' : ''}${escape(status)}</p><p id="researchError" class="research-error" role="alert">${escape(error)}</p></div>
        ${chatComposer(report)}
      </section></div>`;
    if (report) renderReport();
    root.querySelector('#researchConversation').scrollTop = scroll;
    if (restoreConversation && root.classList.contains('active')) {
      if (report?.chatTurns?.length) scrollToLatest();
      restoreConversation = false;
    }
    if (focusState) {
      const target = focusState.id ? document.getElementById(focusState.id) : root.querySelector(focusState.fusionTag ? `[data-fusion-tag="${CSS.escape(focusState.fusionTag)}"]` : `[data-fusion-paper="${CSS.escape(focusState.fusionPaper)}"]`);
      if (target && !target.disabled) { target.focus({preventScroll:true}); if (typeof target.setSelectionRange === 'function' && focusState.start !== null && focusState.start !== undefined) target.setSelectionRange(focusState.start, focusState.end); }
    }
  }

  // Principles on the left (or both sides for two tags), ideas in the middle;
  // curves are drawn after layout from the boxes' measured positions.
  function fusionMapHtml(report) {
    const principles = report.principles || [];
    if (!principles.length) return '';
    const column = tagId => `<div class="fusion-column" style="--tag-color:${tagColor(report, tagId)}"><h5>${escape(tagName(report, tagId))}</h5>${principles.filter(item => item.tagId === tagId).map(item => `<button type="button" class="fusion-principle" data-fusion-principle="${escape(item.id)}" style="--tag-color:${tagColor(report, tagId)}" title="${escape(item.summary)}"><strong>${escape(item.name)}</strong><small>${escape(item.summary)}</small></button>`).join('')}</div>`;
    const ideas = `<div class="fusion-column fusion-ideas"><h5>${ui('融合出的想法', 'Fused ideas')}</h5>${report.ideas.map((idea, index) => `<button type="button" class="fusion-idea" data-fusion-idea="${index}" data-principles="${escape((idea.principleIds || []).join(' '))}"><span class="research-number">${String(index + 1).padStart(2, '0')}</span><strong>${escape(idea.title)}</strong></button>`).join('')}</div>`;
    const two = report.tagIds.length === 2;
    return `<section class="fusion-map-section"><div class="fusion-map-heading"><h4>${ui('融合图', 'Fusion map')}</h4><p class="muted">${ui('两侧是各标签提炼出的设计理念，中间是它们组合出的想法；连线表示“这个想法借用了这条理念”。点想法可跳到详情。', 'Each tag’s design principles sit beside the ideas they produced; a line means the idea borrows that principle. Select an idea to jump to it.')}</p></div><div class="fusion-map ${two ? 'two-sided' : 'many'}" data-fusion-map><svg class="fusion-links" aria-hidden="true"></svg>${two ? `${column(report.tagIds[0])}${ideas}${column(report.tagIds[1])}` : `<div class="fusion-sources">${report.tagIds.map(column).join('')}</div>${ideas}`}</div></section>`;
  }

  function drawFusionLinks() {
    const map = root.querySelector('[data-fusion-map]'), report = currentReport();
    if (!map || !report) return;
    const svg = map.querySelector('.fusion-links'), box = map.getBoundingClientRect();
    if (!box.width) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
    const paths = [];
    map.querySelectorAll('[data-fusion-idea]').forEach(ideaElement => {
      const idea = ideaElement.getBoundingClientRect();
      for (const id of ideaElement.dataset.principles.split(' ').filter(Boolean)) {
        const principleElement = map.querySelector(`[data-fusion-principle="${CSS.escape(id)}"]`), principle = report.principles?.find(item => item.id === id);
        if (!principleElement || !principle) continue;
        const source = principleElement.getBoundingClientRect(), leftSide = source.right <= idea.left + 1;
        if (!leftSide && source.left < idea.right - 1) continue;
        const x1 = (leftSide ? source.right : source.left) - box.left, y1 = source.top + source.height / 2 - box.top;
        const x2 = (leftSide ? idea.left : idea.right) - box.left, y2 = idea.top + idea.height / 2 - box.top;
        const bend = Math.max(28, Math.abs(x2 - x1) * 0.5) * (leftSide ? 1 : -1);
        paths.push(`<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + bend).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - bend).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}" style="--tag-color:${tagColor(report, principle.tagId)}" data-link-idea="${escape(ideaElement.dataset.fusionIdea)}" data-link-principle="${escape(id)}"/>`);
      }
    });
    svg.innerHTML = paths.join('');
  }

  function highlightFusion(map, { idea = null, principle = null } = {}) {
    const links = [...map.querySelectorAll('.fusion-links path')];
    const active = links.filter(link => (idea !== null && link.dataset.linkIdea === idea) || (principle !== null && link.dataset.linkPrinciple === principle));
    const ideas = new Set(active.map(link => link.dataset.linkIdea)), principles = new Set(active.map(link => link.dataset.linkPrinciple));
    if (idea !== null) ideas.add(idea);
    if (principle !== null) principles.add(principle);
    const on = idea !== null || principle !== null;
    map.classList.toggle('highlighting', on);
    links.forEach(link => link.classList.toggle('on', active.includes(link)));
    map.querySelectorAll('[data-fusion-idea]').forEach(element => element.classList.toggle('on', on && ideas.has(element.dataset.fusionIdea)));
    map.querySelectorAll('[data-fusion-principle]').forEach(element => element.classList.toggle('on', on && principles.has(element.dataset.fusionPrinciple)));
  }

  function principlesHtml(report) {
    const principles = report.principles || [];
    if (!principles.length) return '';
    return `<section class="fusion-principles"><h4>${ui('各标签的设计理念', 'Design principles by tag')}</h4><div class="fusion-principle-grid">${report.tagIds.map(tagId => `<div class="fusion-principle-group" style="--tag-color:${tagColor(report, tagId)}"><h5>${escape(tagName(report, tagId))}</h5>${principles.filter(item => item.tagId === tagId).map(item => `<article class="fusion-principle-card"><strong>${escape(item.name)}</strong><p>${escape(item.summary)}</p>${references(item.evidence, report)}</article>`).join('') || `<p class="muted">${ui('材料不足以提炼这个标签的理念。', 'Not enough material to distill this tag’s principles.')}</p>`}</div>`).join('')}</div></section>`;
  }

  function ideaHtml(report, idea, index) {
    const principles = (idea.principleIds || []).map(id => report.principles?.find(item => item.id === id)).filter(Boolean);
    const formula = principles.length ? `<div class="fusion-formula" aria-label="${ui('融合来源', 'Fused from')}">${principles.map(item => `<span class="fusion-chip" style="--tag-color:${tagColor(report, item.tagId)}" title="${escape(tagName(report, item.tagId))}"><small>${escape(tagName(report, item.tagId))}</small>${escape(item.name)}</span>`).join('<span class="fusion-plus" aria-hidden="true">＋</span>')}<span class="fusion-arrow" aria-hidden="true">→</span><span class="fusion-result">${ui('新想法', 'new idea')}</span></div>` : '';
    return `<section class="research-idea" id="research-idea-${index}"><div class="research-idea-heading"><span class="research-number">${String(index + 1).padStart(2, '0')}</span><div><small>${ui('研究假设 · 新颖性待验证', 'HYPOTHESIS · NOVELTY UNVERIFIED')}</small><h4>${escape(idea.title)}</h4></div></div>${formula}${idea.fusion ? `<p class="fusion-mechanism"><small>${ui('怎么融合', 'How it combines')}</small>${escape(idea.fusion)}</p>` : ''}<p class="research-hypothesis">${escape(idea.hypothesis)}</p><p>${escape(idea.rationale)}</p>${references(idea.evidence, report)}<h5>${ui('关键假设', 'Assumptions')}</h5>${list(idea.assumptions)}${experimentHtml(idea.experiment)}<h5>${ui('风险与局限', 'Risks and limitations')}</h5>${list(idea.risks)}<button class="secondary-button small-button" type="button" data-research-discuss-idea="${index}" ${busy ? 'disabled' : ''}>${ui('与智能体讨论这个 Idea', 'Discuss this idea')}</button></section>`;
  }

  function renderReport() {
    const report = currentReport(), host = root.querySelector('#researchReport');
    if (!host) return;
    if (!report) { host.innerHTML = ''; return; }
    const comparison = report.comparison;
    ideaIndex = Math.min(ideaIndex, Math.max(0, report.ideas.length - 1));
    const remaining = Math.max(0, report.maxRounds - report.rounds.length);
    rounds = Math.max(1, Math.min(rounds, remaining));
    host.innerHTML = `<article class="panel research-report"><div class="panel-head"><div><p class="eyebrow">${comparison ? ui('论文对比 · 库内证据', 'PAPER COMPARISON · LIBRARY EVIDENCE') : ui('跨标签融合 · 库内证据', 'CROSS-TAG FUSION · LIBRARY EVIDENCE')}</p><h3>${escape(report.title)}</h3></div><div class="button-row"><button class="secondary-button small-button" type="button" id="researchDownload">${ui('下载 Markdown', 'Download Markdown')}</button><button class="secondary-button small-button danger-button" type="button" id="researchDelete" ${busy ? 'disabled' : ''}>${ui('删除报告', 'Delete report')}</button></div></div>
      <p class="muted">${escape(report.model?.provider)} / ${escape(report.model?.responseModel || report.model?.requestedModel)} · ${escape(new Date(report.updatedAt).toLocaleString(getState().language === 'en' ? 'en-US' : 'zh-CN'))}</p>
      ${report.question ? `<p class="research-focus">${escape(report.question)}</p>` : ''}
      <div class="research-notice">${ui('以下为模型辅助分析。引用摘录来自保存时的材料快照，不能单凭摘录确认推论正确；idea 的新颖性未经外部检索验证。', 'Model-assisted analysis. Source excerpts refer to the saved material snapshot and do not by themselves verify an inference. Idea novelty has not been checked against external literature.')}${list(report.warnings)}</div>
      ${comparison ? `<h4>${ui('对比概览', 'Overview')}</h4><p>${escape(comparison.summary)}</p><div class="research-table-scroll" tabindex="0" role="region" aria-label="${ui('论文对比表', 'Paper comparison table')}"><table class="research-table"><thead><tr><th>${ui('维度', 'Dimension')}</th>${report.sources.map(source => `<th><button type="button" class="research-source-link" data-research-paper="${escape(source.paperId)}">${escape(source.title)}</button></th>`).join('')}</tr></thead><tbody>${comparison.dimensions.map(dimension => `<tr><th scope="row">${escape(dimension.name)}</th>${report.sources.map(source => { const cell = dimension.cells.find(cell => cell.paperId === source.paperId); return `<td>${cell?.choice ? `<span class="analysis-choice">${escape(cell.choice)}</span>` : ''}<p>${escape(cell?.finding || ui('材料不足', 'Insufficient material'))}</p>${references(cell?.evidence, report)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div><div class="research-findings"><section><h4>${ui('共同点', 'Common ground')}</h4>${list(comparison.commonalities)}</section><section><h4>${ui('关键差异', 'Key differences')}</h4>${list(comparison.differences)}</section><section><h4>${ui('证据缺口', 'Evidence gaps')}</h4>${list(comparison.gaps)}</section></div>` : ''}
      ${fusionMapHtml(report)}${report.ideas.length && report.principles?.length ? `<h4 class="fusion-ideas-heading">${ui('融合想法', 'Fused ideas')}</h4>` : ''}
      ${report.ideas.map((idea, index) => ideaHtml(report, idea, index)).join('')}
      ${principlesHtml(report)}
      ${report.ideas.length ? `<section class="research-explore"><h4>${ui('深入探索 · AutoResearch', 'Deep exploration · AutoResearch')}</h4><p class="muted">${ui('每轮自动质疑上一轮方案、修订假设并细化实验。最多 3 轮，仅做库内推演，不执行实验或联网检索。关闭页面会停止后续轮次；已经完成的轮次会保留。', 'Each round critiques the previous proposal, revises the hypothesis and refines the experiment. Up to 3 rounds of library-based reasoning, without running experiments or web searches. Closing this page stops future rounds; completed rounds remain saved.')}</p><fieldset ${busy || !remaining ? 'disabled' : ''}><div class="research-explore-fields"><label>${ui('选择 Idea', 'Choose an idea')}<select id="researchIdea">${report.ideas.map((idea, index) => `<option value="${index}" ${index === ideaIndex ? 'selected' : ''}>${escape(idea.title)}</option>`).join('')}</select></label><label>${ui('连续轮次', 'Consecutive rounds')}<select id="researchRounds">${Array.from({length: remaining || 1}, (_, i) => `<option value="${i + 1}" ${rounds === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label></div><label>${ui('补充约束或追问（可选）', 'Constraints or follow-up question (optional)')}<textarea id="researchFollowup" rows="2" maxlength="2000" placeholder="${ui('例如：只能使用一张 GPU；优先检验最可能失败的假设。', 'For example: one GPU only; test the weakest assumption first.')}">${escape(followup)}</textarea></label><button type="button" class="primary-button" id="researchExplore" ${!configured() ? 'disabled' : ''}>${remaining ? ui('开始深入探索', 'Start deep exploration') : ui('已完成 3 轮探索', '3 rounds completed')}</button></fieldset>${exploring ? `<button class="secondary-button" type="button" id="researchStop" ${stopping ? 'disabled' : ''}>${stopping ? ui('本轮结束后停止', 'Stopping after this round') : ui('本轮结束后停止', 'Stop after this round')}</button>` : ''}
      <div class="research-rounds">${report.rounds.map((round, index) => `<section class="research-round"><h4>${ui(`第 ${index + 1} 轮`, `Round ${index + 1}`)} · ${escape(report.ideas[round.ideaIndex]?.title || '')}</h4><p class="muted">${escape(round.model?.provider || report.model?.provider)} / ${escape(round.model?.responseModel || round.model?.requestedModel || report.model?.requestedModel)}</p>${round.question ? `<p class="muted">${escape(round.question)}</p>` : ''}<h5>${ui('质疑与反例', 'Critique and counterexamples')}</h5>${list(round.critique)}<h5>${ui('修订后的假设', 'Refined hypothesis')}</h5><p>${escape(round.refinedHypothesis)}</p>${references(round.evidence, report)}${experimentHtml(round.experiment)}<h5>${ui('仍存在的风险', 'Remaining risks')}</h5>${list(round.risks)}<h5>${ui('下一步验证', 'Next validation steps')}</h5>${list(round.nextSteps)}</section>`).join('')}</div></section>` : ''}
      <details class="research-sources"><summary>${ui(`来源与材料范围（${report.sources.length} 篇）`, `Sources and coverage (${report.sources.length} papers)`)}</summary>${report.sources.map(source => `<div><button type="button" class="research-source-link" data-research-paper="${escape(source.paperId)}">${escape(source.title)}</button><p class="muted">${escape((source.coverage || []).join(' · '))} · ${source.textLength} ${ui('字符', 'characters')}${source.truncated ? ui(' · 旧快照已截取片段', ' · Older snapshot: excerpted') : ui(' · 完整保存文字', ' · Complete saved text')}</p>${safeWebUrl(source.sourceUrl) ? `<a href="${escape(safeWebUrl(source.sourceUrl))}" target="_blank" rel="noopener noreferrer">${ui('原始来源', 'Original source')}</a>` : ''}</div>`).join('')}</details></article>`;
    const map = host.querySelector('[data-fusion-map]');
    mapObserver?.disconnect(); mapObserver = null;
    if (map) {
      requestAnimationFrame(drawFusionLinks);
      if (typeof ResizeObserver === 'function') { mapObserver = new ResizeObserver(() => drawFusionLinks()); mapObserver.observe(map); }
      map.addEventListener('pointerover', event => { const target = event.target.closest('[data-fusion-idea],[data-fusion-principle]'); highlightFusion(map, target ? { idea: target.dataset.fusionIdea ?? null, principle: target.dataset.fusionPrinciple ?? null } : {}); });
      map.addEventListener('pointerleave', () => highlightFusion(map));
      map.addEventListener('focusin', event => { const target = event.target.closest('[data-fusion-idea],[data-fusion-principle]'); if (target) highlightFusion(map, { idea: target.dataset.fusionIdea ?? null, principle: target.dataset.fusionPrinciple ?? null }); });
      map.addEventListener('focusout', () => highlightFusion(map));
    }
  }

  async function generate() {
    if (busy) return;
    error = '';
    if (fusionTags.length < 2) error = ui('请至少选择两个不同的标签。', 'Choose at least two different tags.');
    else if (customPapers && !customPapers.size) error = ui('请为每个标签至少勾选一篇论文。', 'Tick at least one paper for each tag.');
    if (error) { render(); return; }
    const body = { kind: 'ideas', tagIds: [...fusionTags], paperIds: customPapers ? [...customPapers] : [], question: question.trim() || defaultQuestion(), language: getState().language };
    busy = true; pendingQuestion = body.question; status = ui('正在完整阅读所选论文、提炼设计理念并交叉融合，请保持页面打开…', 'Reading the selected papers, distilling principles and fusing them. Keep this page open…'); render();
    try {
      const {report} = await api('/api/research', {method: 'POST', body: JSON.stringify(body)});
      await refresh(); activate(report.id);
      status = ui('融合报告已保存。', 'Fusion report saved.');
    } catch (err) { error = err.message; status = ''; }
    finally { busy = false; pendingQuestion = ''; render(); }
  }

  async function sendChat() {
    const report = currentReport(), draft = chatDraft(), message = draft.message.trim();
    if (busy || !report) return;
    if (!message) { error = ui('请先输入想讨论的问题。', 'Enter a question to discuss.'); render(); root.querySelector('#researchChatInput')?.focus(); return; }
    if ((report.chatTurns || []).length >= 20) return;
    const id = report.id;
    const body = { message, language: getState().language, action: draft.action, ...(draft.ideaIndex === '' ? {} : {ideaIndex: Number(draft.ideaIndex)}) };
    busy = true; chatting = true; error = ''; pendingQuestion = message; artifactOpen = false;
    status = ui('正在结合材料与对话分析，等待模型回复…', 'Analyzing the sources and conversation. Waiting for the model…');
    render(); scrollToLatest();
    try {
      await api(`/api/research/${encodeURIComponent(id)}/chat`, {method:'POST', body:JSON.stringify(body)});
      await refresh();
      drafts.set(id, {...draft, message:''});
      status = ui('回复与对话已保存。', 'Reply and conversation saved.');
    } catch (err) {
      error = `${err.message}\n${ui('问题已保留，可修改后重新发送。', 'Your question is retained. Edit it or send again.')}`;
      status = '';
    } finally {
      const thread = root.querySelector('#researchConversation');
      const followReply = root.classList.contains('active') && thread && thread.scrollHeight - thread.scrollTop - thread.clientHeight < 90;
      const focusInput = document.activeElement === document.body || ['researchChatInput', 'researchChatSend', 'researchConversation'].includes(document.activeElement?.id);
      busy = false; chatting = false; pendingQuestion = ''; render();
      if (followReply) {
        scrollToLatest();
        if (focusInput) root.querySelector('#researchChatInput')?.focus({preventScroll:true});
      }
    }
  }

  async function explore() {
    const report = currentReport();
    if (busy || !report || report.rounds.length >= report.maxRounds) return;
    const budget = Math.min(rounds, report.maxRounds - report.rounds.length), id = report.id;
    const body = {ideaIndex, question: followup, language: getState().language};
    busy = true; exploring = true; stopping = false; error = '';
    try {
      for (let index = 0; index < budget && !stopping; index++) {
        status = ui(`深入探索 ${index + 1} / ${budget}：正在质疑、修订假设和设计实验…`, `Exploring ${index + 1} / ${budget}: critiquing, refining and planning experiments…`); render();
        await api(`/api/research/${encodeURIComponent(id)}/explore`, {method: 'POST', body: JSON.stringify(body)});
        await refresh();
      }
      status = stopping ? ui('已停止后续探索；完成的轮次已保存。', 'Further exploration stopped; completed rounds are saved.') : ui('深入探索完成，所有轮次已保存。', 'Exploration complete. All rounds are saved.');
    } catch (err) { error = err.message; status = ui('探索中断，已完成的报告和轮次仍保留。', 'Exploration interrupted. Completed reports and rounds are retained.'); }
    finally { busy = false; exploring = false; stopping = false; render(); }
  }

  function toggleFusionTag(id) {
    if (fusionTags.includes(id)) fusionTags = fusionTags.filter(item => item !== id);
    else if (fusionTags.length < MAX_FUSION_TAGS) fusionTags = [...fusionTags, id];
    customPapers = null; error = '';
    render();
  }

  function toggleFusionPaper(id, checked) {
    const next = new Set(chosenPapers());
    if (checked && next.size >= MAX_RESEARCH_PAPERS) { toast(ui(`最多完整阅读 ${MAX_RESEARCH_PAPERS} 篇论文`, `Up to ${MAX_RESEARCH_PAPERS} papers can be read`)); render(); return; }
    if (checked) next.add(id); else next.delete(id);
    customPapers = next;
    render();
  }

  root.addEventListener('input', event => {
    if (event.target.id === 'researchQuestion') question = event.target.value;
    if (event.target.id === 'researchFollowup') followup = event.target.value;
    if (event.target.id === 'researchChatInput') updateDraft({message:event.target.value});
  });
  root.addEventListener('compositionstart', () => { composing = true; });
  root.addEventListener('compositionend', () => { composing = false; setTimeout(() => { if (renderPending && !composing) render(); }, 0); });
  root.addEventListener('keydown', event => {
    if (!['researchQuestion','researchChatInput'].includes(event.target.id) || event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.isComposing || composing) return;
    event.preventDefault();
    if (configured()) { if (event.target.id === 'researchChatInput') void sendChat(); else void generate(); }
  });
  root.addEventListener('toggle', event => {
    if (event.target.id === 'researchArtifact' && event.target.isConnected) { artifactOpen = event.target.open; if (artifactOpen) requestAnimationFrame(drawFusionLinks); }
  }, true);
  root.addEventListener('change', event => {
    if (event.target.matches('[data-fusion-paper]')) { toggleFusionPaper(event.target.dataset.fusionPaper, event.target.checked); return; }
    if (event.target.id === 'researchIdea') ideaIndex = Number(event.target.value);
    if (event.target.id === 'researchRounds') rounds = Number(event.target.value);
    if (event.target.id === 'researchChatIdea') updateDraft({ideaIndex:event.target.value});
    if (event.target.id === 'researchChatAction') updateDraft({action:event.target.value});
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.fusionTag) toggleFusionTag(button.dataset.fusionTag);
    if (button.hasAttribute('data-fusion-reset')) { customPapers = null; render(); }
    if (button.hasAttribute('data-fusion-idea')) { const card = root.querySelector(`#research-idea-${CSS.escape(button.dataset.fusionIdea)}`); card?.scrollIntoView({block:'start', behavior:'smooth'}); }
    if (button.id === 'researchGenerate') await generate();
    if (button.id === 'researchChatSend') await sendChat();
    if (button.id === 'researchNew') { activate(''); customPapers = null; question = ''; render(); }
    if (button.id === 'researchShowReport') { artifactOpen = true; const artifact = root.querySelector('#researchArtifact'); if (artifact) { artifact.open = true; artifact.scrollIntoView({block:'start', behavior:'smooth'}); } }
    if (button.hasAttribute('data-research-discuss-idea')) {
      updateDraft({ideaIndex:button.dataset.researchDiscussIdea}); artifactOpen = false; render(); scrollToLatest(); root.querySelector('#researchChatInput')?.focus({preventScroll:true});
    }
    if (button.hasAttribute('data-research-prompt')) {
      if (currentReport()) updateDraft({message:button.dataset.researchPrompt}); else question = button.dataset.researchPrompt;
      render(); root.querySelector(currentReport() ? '#researchChatInput' : '#researchQuestion')?.focus({preventScroll:true});
    }
    if (button.dataset.researchReport) { activate(button.dataset.researchReport); render(); if (currentReport()?.chatTurns?.length) scrollToLatest(); }
    if (button.dataset.researchPaper) {
      if (getState().papers.some(paper => paper.id === button.dataset.researchPaper)) openPaper(button.dataset.researchPaper);
      else toast(ui('原论文已删除，报告保留了生成时的材料快照。', 'The paper was deleted. The report retains its source snapshot.'));
    }
    if (button.id === 'researchExplore') await explore();
    if (button.id === 'researchStop') { stopping = true; renderReport(); }
    if (button.id === 'researchDelete') {
      if (!confirm(ui('删除这份报告及其探索记录？原论文会保留。', 'Delete this report and its exploration history? Source papers will remain.'))) return;
      try { await api(`/api/research/${encodeURIComponent(activeId)}`, {method: 'DELETE'}); await refresh(); activate(''); render(); }
      catch (err) { error = err.message; render(); }
    }
    if (button.id === 'researchDownload') {
      const report = currentReport();
      const blob = new Blob([reportToMarkdown(report)], {type: 'text/markdown;charset=utf-8'}), url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `Paper_Mind-${report.id}.md`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  // Opened from a tag: start a new fusion with that tag already chosen.
  return { render, selectTag(id) { if (busy) return; activate(''); fusionTags = getState().tags.some(tag => tag.id === id && !tag.system) ? [id] : []; customPapers = null; question = ''; render(); } };
}
