import { comparisonInTag, reportToMarkdown, hasSourceMaterial, MAX_RESEARCH_PAPERS, MAX_RESEARCH_CHAT_TURNS } from './research.js';
import { choiceGroups } from './analysis-visuals.js';
import { choiceColor, spectrumHtml } from './analysis-charts.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const array = value => Array.isArray(value) ? value : [];
const UNKNOWN = ['材料未提供', 'Not available in saved material'];

// "Compare selected papers" inside a tag's topic analysis. Reports are ordinary
// research comparisons scoped to the tag; the picker shares the analysis selection.
export function createTagCompare({ getState, api, refresh, openPaper, toast }) {
  let tagId = '', activeId = '', question = '', busyTagId = '', error = '', status = '', chatDrafts = new Map(), chattingId = '', pendingQuestion = '';
  const ui = (zh, en) => getState().language === 'en' ? en : zh;
  const reports = () => Object.values(getState().meta?.researchReports || {}).filter(report => comparisonInTag(report, tagId, getState().papers)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const current = () => reports().find(report => report.id === activeId) || null;
  const configured = () => {
    const config = getState().config || {}, provider = config.provider || 'qwen';
    if (provider === 'custom') return Boolean(config.customModel && config.customBaseUrl);
    if (['claude', 'codex'].includes(provider)) return Boolean(config.hasBridgeToken);
    return Boolean(config[`has${provider[0].toUpperCase()}${provider.slice(1)}Key`]);
  };
  const defaultQuestion = () => ui('请从设计理念出发，对比这些论文的核心选择、机制、评估与局限，指出相同与不同之处。', 'Starting from design philosophy, compare these papers’ core choices, mechanisms, evaluation and limitations, showing where they agree and differ.');
  const isDefaultQuestion = value => ['请从设计理念出发，对比这些论文的核心选择、机制、评估与局限，指出相同与不同之处。', 'Starting from design philosophy, compare these papers’ core choices, mechanisms, evaluation and limitations, showing where they agree and differ.'].includes(value);
  const suggestions = () => [ui('它们在设计理念上最根本的分歧是什么？', 'What is the most fundamental design disagreement?'), ui('各自的设计适合什么场景、代价是什么？', 'Where does each design fit, and at what cost?'), ui('有哪些设计选择可以互相借鉴或组合？', 'Which design choices could be borrowed or combined?')];

  function sourceTitle(report, paperId) { return report.sources.find(source => source.paperId === paperId)?.title || paperId; }
  function evidenceHtml(report, items, key) {
    if (!array(items).length) return '';
    return `<details class="compare-evidence" data-analysis-detail="${escape(key)}"><summary>${ui(`依据 ${items.length}`, `${items.length} sources`)}</summary>${items.map(item => `<blockquote><p>${escape(item.quote)}</p><button type="button" class="text-button" data-compare-paper="${escape(item.paperId)}">${escape(sourceTitle(report, item.paperId))} ↗</button></blockquote>`).join('')}</details>`;
  }

  function pickerHtml({ papers, selected, label }) {
    const busy = busyTagId === tagId, elsewhere = Boolean(busyTagId) && !busy, full = selected.size >= MAX_RESEARCH_PAPERS, ready = selected.size >= 2 && selected.size <= MAX_RESEARCH_PAPERS;
    return `<section class="compare-picker" aria-labelledby="comparePickerTitle"><div class="analysis-section-heading"><h5 id="comparePickerTitle">${ui('挑几篇论文，直接对比设计理念', 'Pick papers and compare their design thinking')}</h5><span class="compare-count">${ui(`已选 ${selected.size} / ${MAX_RESEARCH_PAPERS} 篇`, `${selected.size} / ${MAX_RESEARCH_PAPERS} selected`)}</span></div>
      <p class="compare-intro">${ui('会完整读取所选论文的摘要、笔记、记忆线索和全部剪藏，逐个设计问题对照：相同的选择同色显示，再把每篇放到理念光谱上。也可以在“对照表”或图上点论文来勾选。', 'Reads the complete abstracts, notes, memory cues and clips of the selected papers, then compares them question by question: identical choices share a colour, and each paper is placed on design spectra. You can also tick papers in the design matrix or charts.')}</p>
      <div class="compare-paper-grid">${papers.map(paper => {
        const item = label(paper.id), usable = hasSourceMaterial(paper), checked = selected.has(paper.id);
        return `<label class="compare-paper-option${checked ? ' checked' : ''}${usable ? '' : ' unusable'}"><input type="checkbox" data-analysis-select="${escape(paper.id)}" ${checked ? 'checked' : ''} ${busy || !usable || (full && !checked) ? 'disabled' : ''}><span class="analysis-paper-number">${escape(item.number)}</span><span><strong>${escape(paper.title)}</strong><small>${escape(usable ? (item.stance || paper.memory || paper.abstract || '').replace(/\s+/g, ' ').slice(0, 90) : ui('缺少摘要、笔记或剪藏，暂不能对比', 'No abstract, notes or clips yet'))}</small></span></label>`;
      }).join('')}</div>
      <div class="compare-focus"><label for="tagCompareQuestion">${ui('想重点比较什么？（可选）', 'What should the comparison focus on? (optional)')}</label><textarea id="tagCompareQuestion" data-analysis-compare-question rows="2" maxlength="2000" ${busy ? 'disabled' : ''} placeholder="${ui('例如：它们对“证据何时被核验”的设计理念有什么不同？', 'For example: how do they differ in when evidence gets verified?')}">${escape(question)}</textarea><div class="compare-suggestions">${suggestions().map(text => `<button type="button" data-compare-suggestion="${escape(text)}" ${busy ? 'disabled' : ''}>${escape(text)}</button>`).join('')}</div></div>
      <div class="compare-actions"><button type="button" class="secondary-button small-button" data-analysis-clear-selection ${busy || !selected.size ? 'disabled' : ''}>${ui('清空选择', 'Clear selection')}</button><button type="button" class="primary-button" data-compare-run ${busy || elsewhere || !ready || !configured() ? 'disabled' : ''}>${busy ? ui('正在对比…', 'Comparing…') : ui(`对比所选 ${selected.size} 篇 ↗`, `Compare ${selected.size} papers ↗`)}</button></div>
      ${!configured() ? `<p class="compare-error">${ui('请先在“模型设置”中配置并测试模型。', 'Configure and test a model in Model settings first.')}</p>` : ''}${elsewhere ? `<p class="compare-status">${ui('另一个标签的对比正在进行，完成后即可开始新的对比。', 'A comparison for another tag is running; start this one when it finishes.')}</p>` : ''}
      <p class="compare-status" role="status" aria-live="polite">${busy ? `<span class="research-working-dot" aria-hidden="true"></span>${escape(status)}` : escape(status)}</p>${error ? `<p class="compare-error" role="alert">${escape(error)}</p>` : ''}</section>`;
  }

  function historyHtml(list) {
    if (!list.length) return '';
    return `<section class="compare-history"><h6>${ui(`对比记录 · ${list.length}`, `Saved comparisons · ${list.length}`)}</h6><div>${list.map(report => `<button type="button" class="compare-history-item${report.id === activeId ? ' active' : ''}" data-compare-report="${escape(report.id)}" aria-pressed="${report.id === activeId}"><strong>${escape(report.title)}</strong><small>${escape(new Date(report.createdAt).toLocaleDateString(getState().language === 'en' ? 'en-US' : 'zh-CN'))} · ${ui(`${report.paperIds.length} 篇`, `${report.paperIds.length} papers`)}</small></button>`).join('')}</div></section>`;
  }

  function reportHtml(report, label) {
    const comparison = report.comparison, ids = report.paperIds;
    const number = id => label(id)?.number || String(ids.indexOf(id) + 1).padStart(2, '0');
    const name = id => label(id)?.name || sourceTitle(report, id);
    const stanceById = new Map(array(comparison.stances).map(item => [item.paperId, item.stance]));
    const head = ids.map(id => `<th scope="col"><button type="button" class="compare-paper-head" data-compare-paper="${escape(id)}" title="${escape(sourceTitle(report, id))}"><span class="analysis-paper-number">${escape(number(id))}</span><span>${escape(name(id))}</span></button></th>`).join('');
    const rows = comparison.dimensions.map((dimension, row) => {
      const cells = ids.map(id => dimension.cells.find(cell => cell.paperId === id));
      const groups = choiceGroups(cells), kinds = new Set(groups.filter(group => group >= 0)), labelled = groups.filter(group => group >= 0).length;
      const badge = labelled >= 2 ? kinds.size === 1 ? `<span class="compare-row-badge same">${ui('选择一致', 'Same choice')}</span>` : kinds.size === labelled ? `<span class="compare-row-badge">${ui('各不相同', 'All differ')}</span>` : `<span class="compare-row-badge">${ui(`${kinds.size} 种选择`, `${kinds.size} options`)}</span>` : '';
      return `<tr><th scope="row"><strong>${escape(dimension.name)}</strong>${badge}</th>${cells.map((cell, column) => {
        if (!cell) return `<td class="compare-cell unknown">${ui('材料不足', 'Insufficient material')}</td>`;
        const unknown = UNKNOWN.includes(cell.finding);
        return `<td class="compare-cell${unknown ? ' unknown' : ''}">${cell.choice ? `<span class="analysis-choice" style="--choice-color:${choiceColor(groups[column])}">${escape(cell.choice)}</span>` : ''}<p>${escape(cell.finding)}</p>${evidenceHtml(report, cell.evidence, `compare-${report.id}-${row}-${column}`)}</td>`;
      }).join('')}</tr>`;
    }).join('');
    const stances = stanceById.size ? `<div class="compare-stances">${ids.map(id => `<article class="compare-stance"><header><span class="analysis-paper-number">${escape(number(id))}</span><button type="button" class="text-button" data-compare-paper="${escape(id)}">${escape(name(id))} ↗</button></header><p>${escape(stanceById.get(id) || ui('材料未给出明确立场', 'No clear stance in the saved material'))}</p></article>`).join('')}</div>` : '';
    const axes = array(comparison.axes).length ? `<section class="compare-section"><div class="analysis-section-heading"><h6>${ui('理念光谱', 'Design spectra')}</h6><span>${ui('相对位置 · 不是评分', 'Relative positions · not scores')}</span></div>${spectrumHtml({ axes: comparison.axes, label: id => ({ number: number(id), name: name(id), title: sourceTitle(report, id) }), ui, dotAttrs: id => `data-compare-paper="${escape(id)}"`, caption: ui('每个圆点是一篇论文；越靠哪端，设计越偏向那端的理念。悬停查看理由。', 'Each dot is a paper; the closer to a pole, the more its design leans that way. Hover for the reason.') })}</section>` : '';
    const findings = [['commonalities', ui('共同点', 'Common ground')], ['differences', ui('关键差异', 'Key differences')], ['gaps', ui('证据缺口', 'Evidence gaps')]].map(([key, title]) => `<section><h6>${title}</h6>${array(comparison[key]).length ? `<ul>${comparison[key].map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : `<p class="muted">${ui('无', 'None')}</p>`}</section>`).join('');
    const turns = array(report.chatTurns), full = turns.length >= MAX_RESEARCH_CHAT_TURNS, chatting = chattingId === report.id, busy = Boolean(chattingId) || busyTagId === tagId;
    const prompts = turns.at(-1)?.suggestedQuestions?.length ? turns.at(-1).suggestedQuestions : [ui('为什么它们在这一点上做出不同的选择？', 'Why do they choose differently here?'), ui('哪种设计更适合我的场景，需要什么证据才能判断？', 'Which design suits my setting, and what evidence would decide it?')];
    const chat = `<section class="compare-chat" aria-label="${ui('追问这次对比', 'Follow up on this comparison')}"><h6>${ui('追问', 'Follow up')}</h6>${turns.map(turn => `<div class="compare-turn"><p class="compare-question">${escape(turn.question)}</p><div class="compare-answer">${turn.answerKind === 'insufficient' ? `<span class="research-insufficient">${ui('材料不足，待补充证据', 'More source material needed')}</span>` : ''}<p>${escape(turn.answer)}</p>${evidenceHtml(report, turn.evidence, `compare-turn-${turn.id}`)}</div></div>`).join('')}${chatting ? `<div class="compare-turn pending"><p class="compare-question">${escape(pendingQuestion)}</p><p class="compare-answer muted"><span class="research-working-dot" aria-hidden="true"></span>${ui('正在结合材料回答…', 'Answering from the saved sources…')}</p></div>` : ''}
      <div class="compare-suggestions">${prompts.map(text => `<button type="button" data-compare-chat-prompt="${escape(text)}" ${busy || full ? 'disabled' : ''}>${escape(text)}</button>`).join('')}</div>
      <div class="compare-chat-box"><textarea id="tagCompareChat" data-analysis-compare-chat rows="2" maxlength="2000" ${busy || full ? 'disabled' : ''} placeholder="${ui('追问差异的原因、适用场景或验证方法…', 'Ask why they differ, where each fits, or how to test it…')}">${escape(chatDrafts.get(report.id) || '')}</textarea><button type="button" class="primary-button small-button" data-compare-chat-send ${busy || full || !configured() ? 'disabled' : ''}>${ui('发送', 'Send')}</button></div>
      <small class="muted">${full ? ui('已完成 20 轮追问，可以新建一次对比继续。', '20 follow-ups completed. Start a new comparison to continue.') : ui(`追问 ${turns.length} / ${MAX_RESEARCH_CHAT_TURNS} · ⌘ / Ctrl + Enter 发送`, `Follow-ups ${turns.length} / ${MAX_RESEARCH_CHAT_TURNS} · ⌘ / Ctrl + Enter to send`)}</small></section>`;
    return `<article class="compare-report" data-compare-report-id="${escape(report.id)}"><header class="compare-report-head"><div><p class="eyebrow">${ui('选篇对比 · 库内证据', 'PAPER COMPARISON · LIBRARY EVIDENCE')}</p><h5>${escape(report.title)}</h5><small>${escape(report.model?.provider)} / ${escape(report.model?.responseModel || report.model?.requestedModel)} · ${escape(new Date(report.updatedAt).toLocaleString(getState().language === 'en' ? 'en-US' : 'zh-CN'))} · ${ui(`${ids.length} 篇`, `${ids.length} papers`)}</small></div><div class="button-row"><button type="button" class="secondary-button small-button" data-compare-download>${ui('下载 Markdown', 'Download Markdown')}</button><button type="button" class="secondary-button small-button danger-button" data-compare-delete ${busy ? 'disabled' : ''}>${ui('删除', 'Delete')}</button></div></header>
      ${comparison.headline ? `<p class="compare-headline">${escape(comparison.headline)}</p>` : ''}<p class="compare-summary">${escape(comparison.summary)}</p>${report.question && !isDefaultQuestion(report.question) ? `<p class="compare-focus-note"><small>${ui('关注点', 'Focus')}</small>${escape(report.question)}</p>` : ''}
      ${stances}
      <section class="compare-section"><div class="analysis-section-heading"><h6>${ui('设计对照表', 'Design comparison')}</h6><span>${ui('同色 = 同一种选择', 'Same colour = same choice')}</span></div><div class="compare-table-scroll" tabindex="0" role="region" aria-label="${ui('论文对比表', 'Paper comparison table')}"><table class="compare-table"><thead><tr><th scope="col">${ui('设计问题', 'Design question')}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></section>
      ${axes}<div class="compare-findings">${findings}</div>
      <details class="compare-notice"><summary>${ui('说明与材料范围', 'Notes and source coverage')}</summary><p>${ui('以下为模型辅助分析。引用摘录来自生成时的材料快照，不能单凭摘录确认推论；光谱位置是相对判断，不是评分。', 'Model-assisted analysis. Excerpts come from the saved snapshot and do not by themselves verify an inference; spectrum positions are relative readings, not scores.')}</p><ul>${report.warnings.map(item => `<li>${escape(item)}</li>`).join('')}</ul><ul>${report.sources.map(source => `<li>${escape(source.title)} · ${escape(source.coverage.join(' · '))} · ${source.textLength} ${ui('字符', 'characters')}</li>`).join('')}</ul></details>
      ${chat}</article>`;
  }

  function html({ tag, papers, selected, label }) {
    if (tagId !== tag.id) { tagId = tag.id; activeId = ''; question = ''; error = ''; status = ''; }
    const list = reports();
    if (activeId && !list.some(report => report.id === activeId)) activeId = '';
    if (!activeId && list.length && busyTagId !== tagId) activeId = list[0].id;
    const report = current();
    return `<div class="compare-workbench">${pickerHtml({ papers, selected, label })}${historyHtml(list)}${report ? reportHtml(report, label) : `<div class="compare-empty"><strong>${ui('还没有对比记录', 'No comparisons yet')}</strong><p>${ui('勾选 2–8 篇后点击“对比所选”，结果会保存在这里，并随备份一起导出。', 'Tick 2–8 papers and choose Compare; results are saved here and included in backups.')}</p></div>`}</div>`;
  }

  async function run(selected, rerender) {
    if (busyTagId) return;
    const ids = [...selected], id = tagId, tag = getState().tags.find(item => item.id === id);
    if (ids.length < 2 || ids.length > MAX_RESEARCH_PAPERS) { error = ui('请选择 2–8 篇论文再对比。', 'Select 2–8 papers to compare.'); rerender(); return; }
    busyTagId = id; error = ''; status = ui(`正在完整阅读 ${ids.length} 篇论文并逐项对照，请保持页面打开…`, `Reading ${ids.length} papers in full and comparing them. Keep this page open…`); rerender();
    try {
      const { report } = await api('/api/research', { method: 'POST', body: JSON.stringify({ kind: 'comparison', scopeTagId: id, tagIds: tag && !tag.system ? [id] : [], paperIds: ids, question: question.trim() || defaultQuestion(), language: getState().language }) });
      await refresh();
      if (tagId === id) { activeId = report.id; question = ''; }
      status = ui('对比已保存。', 'Comparison saved.');
    } catch (err) { if (tagId === id) { error = err.message; status = ''; } }
    finally { busyTagId = ''; rerender(); }
  }

  async function sendChat(rerender) {
    const report = current(), message = (chatDrafts.get(report?.id) || '').trim();
    if (!report || chattingId || busyTagId) return;
    if (!message) { error = ui('请先输入想追问的问题。', 'Enter a question first.'); rerender(); return; }
    chattingId = report.id; pendingQuestion = message; error = ''; rerender();
    try {
      await api(`/api/research/${encodeURIComponent(report.id)}/chat`, { method: 'POST', body: JSON.stringify({ message, language: getState().language, action: 'followup' }) });
      await refresh();
      chatDrafts.set(report.id, '');
    } catch (err) { error = `${err.message}\n${ui('问题已保留，可修改后重新发送。', 'Your question is kept; edit it or send again.')}`; }
    finally { chattingId = ''; pendingQuestion = ''; rerender(); }
  }

  function bind(root, { selected, rerender }) {
    const workbench = root.querySelector('.compare-workbench');
    if (!workbench) return;
    workbench.querySelector('[data-analysis-compare-question]')?.addEventListener('input', event => { question = event.target.value; });
    workbench.querySelector('[data-analysis-compare-chat]')?.addEventListener('input', event => { chatDrafts.set(activeId, event.target.value); });
    workbench.querySelector('[data-analysis-compare-chat]')?.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) { event.preventDefault(); void sendChat(rerender); } });
    workbench.querySelectorAll('[data-compare-suggestion]').forEach(button => button.addEventListener('click', () => { question = button.dataset.compareSuggestion; rerender(); workbench.ownerDocument.getElementById('tagCompareQuestion')?.focus({ preventScroll: true }); }));
    workbench.querySelectorAll('[data-compare-chat-prompt]').forEach(button => button.addEventListener('click', () => { chatDrafts.set(activeId, button.dataset.compareChatPrompt); rerender(); workbench.ownerDocument.getElementById('tagCompareChat')?.focus({ preventScroll: true }); }));
    workbench.querySelector('[data-compare-run]')?.addEventListener('click', () => run(selected, rerender));
    workbench.querySelector('[data-compare-chat-send]')?.addEventListener('click', () => sendChat(rerender));
    workbench.querySelectorAll('[data-compare-report]').forEach(button => button.addEventListener('click', () => { activeId = button.dataset.compareReport; error = ''; status = ''; rerender(); }));
    workbench.querySelectorAll('[data-compare-paper]').forEach(button => button.addEventListener('click', () => {
      if (getState().papers.some(paper => paper.id === button.dataset.comparePaper)) openPaper(button.dataset.comparePaper);
      else toast(ui('原论文已删除，报告保留了生成时的材料快照。', 'The paper was deleted. The report keeps its source snapshot.'));
    }));
    workbench.querySelector('[data-compare-download]')?.addEventListener('click', () => {
      const report = current(); if (!report) return;
      const url = URL.createObjectURL(new Blob([reportToMarkdown(report)], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `Paper_Mind-${report.id}.md`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    workbench.querySelector('[data-compare-delete]')?.addEventListener('click', async () => {
      const report = current(); if (!report) return;
      if (!confirm(ui('删除这次对比及其追问记录？原论文会保留。', 'Delete this comparison and its follow-ups? The papers remain.'))) return;
      try { await api(`/api/research/${encodeURIComponent(report.id)}`, { method: 'DELETE' }); await refresh(); activeId = ''; status = ui('对比已删除。', 'Comparison deleted.'); }
      catch (err) { error = err.message; }
      rerender();
    });
  }

  return { html, bind, busy: () => Boolean(busyTagId || chattingId), count: () => reports().length };
}
