import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../extension/storage.js';
import { prepareResearchInput, validateResearchReports, reportToMarkdown, chatWithResearchReport, exploreResearchReport } from '../extension/research.js';
import { mergeStoreChanges } from '../extension/library-tools.js';

const values = {}, locks = new Map();
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {} });
Object.defineProperty(globalThis.navigator, 'locks', { value: { request(name, fn) { const task = (locks.get(name) || Promise.resolve()).then(fn); locks.set(name, task.catch(() => {})); return task; } } });
globalThis.chrome = { storage: { local: { async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); }, async set(data) { Object.assign(values, structuredClone(data)); }, async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; } } }, runtime: { sendMessage() { return Promise.resolve(); } } };
const api = (path, body, method = 'POST') => handleApi(path, { method, body });
const state = () => handleApi('/api/state');
const experiment = { setup: 'Test the proposed combination on held-out examples', baseline: 'The two standalone methods', metric: 'Evidence accuracy', successCriterion: 'A proposed 5-point gain; this is not an observed result' };
const quotes = papers => papers.map(paper => ({ paperId: paper.paperId, quote: paper.evidence.split('\n').find(line => !line.startsWith('[') && line.length >= 6) }));
function output(input) {
  const evidence = quotes(input.papers);
  if (input.task === 'discuss_saved_research') return { answerKind: 'grounded', answer: 'The saved evidence supports a bounded interpretation; the proposed experiment has not been run.', evidence, suggestedQuestions: ['Which missing result should we verify first?'] };
  if (input.task === 'compare_saved_papers') return { title: 'Paper comparison', comparison: { summary: 'Bounded comparison based on saved material', dimensions: [{ name: 'Method', cells: input.papers.map((paper, index) => ({ paperId: paper.paperId, finding: 'Described in the saved abstract', evidence: [evidence[index]] })) }], commonalities: ['Both discuss evidence'], differences: ['Different saved methods'], gaps: ['Full results are missing'] } };
  if (input.task === 'generate_cross_tag_ideas') return { title: 'Cross-tag ideas', ideas: [{ title: 'Evidence-aware adaptation', hypothesis: 'Combining the methods may improve accuracy', rationale: 'The saved methods might be complementary', evidence, assumptions: ['Methods are compatible'], experiment, risks: ['Additional compute cost'] }] };
  return { critique: ['The assumed compatibility has not been demonstrated'], refinedHypothesis: 'The combination may improve accuracy under a fixed compute budget', evidence, experiment, risks: ['Compute overhead may erase the benefit'], nextSteps: ['Collect missing full texts', 'Run a controlled baseline later'] };
}
function mockLLM(fn = output) {
  globalThis.fetch = async (_url, options) => ({ ok: true, json: async () => ({ model: 'test-model', choices: [{ message: { content: JSON.stringify(await fn(JSON.parse(JSON.parse(options.body).messages[1].content))) } }] }) });
}
async function setup() {
  await api('/api/import', { papers: [], tags: [], topicPacks: [] });
  await api('/api/settings', { provider: 'qwen', qwenKey: 'test-research-key', autoDescribeTags: false });
  await api('/api/papers', { title: 'Retrieval', abstract: 'Retrieved evidence supports factual answers.', manualTags: ['Retrieval'], duplicateAction: 'create' });
  await api('/api/papers', { title: 'Adaptation', abstract: 'Adaptive computation changes the reasoning budget.', manualTags: ['Adaptation'], duplicateAction: 'create' });
  mockLLM();
  const db = await state();
  return { paperIds: db.papers.map(paper => paper.id), tagIds: db.tags.filter(tag => !tag.system).map(tag => tag.id) };
}

function completeSourceLibrary() {
  return {
    tags: ['a', 'b'].map(id => ({ id, name: `Tag ${id} ${'name '.repeat(60)}`, description: `Description ${id} ${'scope '.repeat(400)}` })),
    papers: ['a', 'b'].map(id => ({
      id: `complete-${id}`, title: `Paper ${id} ${'full title '.repeat(110)}`, tagIds: [id],
      sourceUrl: `https://example.org/paper/${id}?source=${'x'.repeat(4100)}`,
      abstract: `  Abstract ${id}\n${'saved abstract '.repeat(500)}\nAbstract ${id} final evidence.  `,
      abstractZh: `  完整译文 ${id}\n${'保存的摘要译文。'.repeat(800)}\n译文末尾内容。  `,
      authors: ['First Author', 'Second Author'], year: 2026, venue: 'Saved Venue',
      links: [{ title: `Related ${id}`, url: `https://example.org/link/${id}`, previewDescription: `Full saved preview ${'preview '.repeat(700)}` }],
      memory: `  Memory ${id}\n${'saved memory '.repeat(50)}\nMemory ${id} final evidence.  `,
      conversation: `  Personal notes ${id}\n${'Important personal interpretation.\n'.repeat(1300)}\nPersonal notes ${id} final evidence.\n\n  `,
      clips: [0, 1].map(index => ({
        id: `clip-${id}-${index}`, title: `Clip ${id} ${index}`, sourceUrl: `https://example.org/clip/${id}/${index}`,
        markdown: `  # Saved Markdown ${id} ${index}\n\n${'Saved full text paragraph.\n'.repeat(1100)}\n\`\`\`python\n  print("complete")\n\`\`\`\n\nClip ${id} ${index} final evidence.\n\n  `
      }))
    }))
  };
}

test('snapshots retain all saved notes, multiple Markdown clips and source identity without character trimming', () => {
  const store = completeSourceLibrary();
  const input = prepareResearchInput(store, { kind: 'ideas', tagIds: ['a', 'b'] });
  assert.deepEqual(input.snapshot.tags, store.tags);
  for (const source of input.snapshot.papers) {
    const saved = store.papers.find(paper => paper.id === source.paperId);
    assert.equal(source.title, saved.title);
    assert.equal(source.sourceUrl, saved.sourceUrl);
    assert.deepEqual(source.coverage, ['abstract', 'abstractZh', 'memory', 'notes', 'clips', 'bibliography', 'links', 'tags']);
    for (const material of [saved.abstract, saved.abstractZh, saved.memory, saved.conversation, ...saved.clips.map(clip => clip.markdown)]) assert.ok(source.evidence.includes(material));
    for (const metadata of [...saved.authors, saved.venue, saved.links[0].previewDescription, store.tags.find(tag => tag.id === saved.tagIds[0]).description]) assert.ok(source.evidence.includes(metadata));
    assert.ok(source.evidence.indexOf(saved.clips[0].markdown) < source.evidence.indexOf(saved.clips[1].markdown));
    assert.equal(source.textLength, source.evidence.length);
    assert.equal(source.truncated, false);
  }
  assert.ok(input.snapshot.papers.reduce((sum, paper) => sum + paper.evidence.length, 0) > 140000);
  assert.ok(!input.warnings.some(warning => /截断|truncated/.test(warning)));
});

test('a translated abstract alone is usable but bibliography and links alone are not research evidence', () => {
  const store = { tags: [], papers: [
    { id: 'translation', title: 'Translated paper', abstractZh: '仅有已保存的摘要译文，也应完整用于分析。' },
    { id: 'notes', title: 'Notes paper', conversation: 'Personal notes contain saved source material.' }
  ] };
  const body = { kind: 'comparison', paperIds: ['translation', 'notes'] };
  const input = prepareResearchInput(store, body);
  assert.ok(input.snapshot.papers[0].evidence.includes(store.papers[0].abstractZh));
  delete store.papers[0].abstractZh;
  Object.assign(store.papers[0], { abstract: '   ', authors: ['An Author'], links: [{ url: 'https://example.org', previewDescription: 'A link preview without saved paper content.' }] });
  assert.throws(() => prepareResearchInput(store, body), /缺少摘要/);
});

test('complete large sources reach creation, follow-up and automatic exploration; tail citations survive export and import', async () => {
  await setup();
  const library = completeSourceLibrary();
  await api('/api/import', library);
  const saved = await state();
  const expected = prepareResearchInput(saved, { kind: 'ideas', tagIds: ['a', 'b'] });
  const stages = [];
  globalThis.fetch = async (_url, options) => {
    const messages = JSON.parse(options.body).messages, input = JSON.parse(messages[1].content);
    stages.push(input.task);
    assert.ok(messages.reduce((sum, message) => sum + message.content.length, 0) > 140000);
    assert.deepEqual(input.papers, expected.snapshot.papers);
    assert.deepEqual(input.tags, expected.snapshot.tags);
    // Quotes from the end of the notes and the final clip were beyond every
    // previous source limit. They must be sent, validated and saved unchanged.
    const evidence = input.papers.flatMap(paper => {
      const id = paper.paperId.at(-1);
      return [
        { paperId: paper.paperId, quote: `Personal notes ${id} final evidence.` },
        { paperId: paper.paperId, quote: `Clip ${id} 1 final evidence.` }
      ];
    });
    const result = output(input);
    if (input.task === 'compare_saved_papers') result.comparison.dimensions[0].cells.forEach(cell => { cell.evidence = evidence.filter(ref => ref.paperId === cell.paperId); });
    else if (input.task === 'generate_cross_tag_ideas') result.ideas[0].evidence = evidence;
    else result.evidence = evidence;
    return { ok: true, json: async () => ({ model: 'full-source-test-model', choices: [{ message: { content: JSON.stringify(result) } }] }) };
  };
  const { report: comparison } = await api('/api/research', { kind: 'comparison', paperIds: expected.paperIds, tagIds: ['a', 'b'] });
  assert.match(reportToMarkdown(comparison), /Personal notes b final evidence\./);
  let { report } = await api('/api/research', { kind: 'ideas', tagIds: ['a', 'b'] });
  ({ report } = await api(`/api/research/${report.id}/chat`, { message: 'Use the notes and final Markdown section', ideaIndex: 0 }));
  ({ report } = await api(`/api/research/${report.id}/explore`, { ideaIndex: 0, question: 'Check the final saved details' }));
  assert.deepEqual(stages, ['compare_saved_papers', 'generate_cross_tag_ideas', 'discuss_saved_research', 'critique_and_refine_library_idea']);
  validateResearchReports({ [report.id]: report });
  const exported = await handleApi('/api/export');
  await api('/api/import', exported);
  const restored = (await handleApi('/api/research')).reports.find(item => item.id === report.id);
  assert.deepEqual(restored, report);
  assert.deepEqual(restored.snapshot.papers, expected.snapshot.papers);
  const markdown = reportToMarkdown(restored);
  assert.match(markdown, /Personal notes a final evidence\./);
  assert.match(markdown, /Clip b 1 final evidence\./);
  assert.ok(!markdown.includes(' · excerpted'));
});

test('legacy excerpt snapshots still import and retain the exact historical evidence for later chat', async () => {
  const { paperIds } = await setup();
  const { report } = await api('/api/research', { kind: 'comparison', paperIds });
  for (const source of report.snapshot.papers) {
    source.evidence = source.evidence.split('\n\n[bibliography]')[0];
    source.coverage = ['abstract']; source.textLength = source.evidence.length; source.truncated = true;
  }
  report.sources = report.snapshot.papers.map(({ evidence, ...source }) => source);
  validateResearchReports({ [report.id]: report });
  const exported = await handleApi('/api/export');
  exported.store.meta.researchReports[report.id] = report;
  await api('/api/import', exported);
  mockLLM(input => { assert.deepEqual(input.papers, report.snapshot.papers); return output(input); });
  const { report: followedUp } = await api(`/api/research/${report.id}/chat`, { message: 'Explain the original saved excerpt' });
  assert.deepEqual(followedUp.snapshot, report.snapshot);
  assert.ok(reportToMarkdown(followedUp).includes(' · excerpted'));
});

test('comparison persists complete saved sources, validated quotes and safe model provenance; backup round-trips', async () => {
  const { paperIds } = await setup();
  const { report } = await api('/api/research', { kind: 'comparison', paperIds, language: 'en' });
  assert.equal(report.comparison.dimensions[0].cells.length, 2);
  assert.ok(report.warnings.some(warning => /No web search/.test(warning)));
  assert.equal(report.model.responseModel, 'test-model');
  assert.ok(report.sources.every(source => source.coverage.includes('abstract')));
  assert.ok(!JSON.stringify(report).includes('test-research-key'));
  assert.match(reportToMarkdown(report), /Retrieved evidence supports factual answers/);
  const exported = await handleApi('/api/export');
  await api('/api/import', exported);
  assert.deepEqual((await handleApi('/api/research')).reports[0], report);
});

test('research rejects invalid scope and missing material before making any model call', async () => {
  const selection = await setup(); let calls = 0;
  mockLLM(input => { calls++; return output(input); });
  await assert.rejects(api('/api/research', { kind: 'comparison', paperIds: selection.paperIds.slice(0, 1) }), /2/);
  await assert.rejects(api('/api/research', { kind: 'ideas', tagIds: [selection.tagIds[0], selection.tagIds[0]] }), /不同标签/);
  await assert.rejects(api('/api/research', { kind: 'ideas', tagIds: selection.tagIds, paperIds: [selection.paperIds[0]] }), /覆盖每个所选标签/);
  await assert.rejects(api('/api/research', { kind: 'comparison', paperIds: ['invented', selection.paperIds[0]] }), /不存在/);
  await api(`/api/papers/${selection.paperIds[0]}`, { abstract: '' }, 'PUT');
  await assert.rejects(api('/api/research', { kind: 'comparison', paperIds: selection.paperIds }), /缺少摘要/);
  assert.equal(calls, 0);
});

test('automatic cross-tag sampling balances both libraries, keeps every selected source complete and reports omitted papers', () => {
  const store = { tags: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], papers: ['a', 'b'].flatMap(tag => Array.from({ length: 7 }, (_, index) => ({ id: `${tag}${index}`, title: `${tag}${index}`, tagIds: [tag], abstract: 'Evidence '.repeat(2000), conversation: 'Notes '.repeat(2000), clips: [{ markdown: 'Content '.repeat(2000) }] }))) };
  const input = prepareResearchInput(store, { kind: 'ideas', tagIds: ['a', 'b'] });
  assert.equal(input.paperIds.length, 8);
  assert.equal(input.snapshot.papers.filter(paper => paper.tagIds.includes('a')).length, 4);
  assert.equal(input.snapshot.papers.filter(paper => paper.tagIds.includes('b')).length, 4);
  assert.ok(input.snapshot.papers.every(paper => paper.evidence.length > 8000 && !paper.truncated));
  for (const paper of input.snapshot.papers) {
    const saved = store.papers.find(item => item.id === paper.paperId);
    assert.ok(paper.evidence.includes(saved.abstract));
    assert.ok(paper.evidence.includes(saved.conversation));
    assert.ok(paper.evidence.includes(saved.clips[0].markdown));
  }
  assert.ok(!input.warnings.some(warning => /截断|truncated/.test(warning)));
  assert.ok(input.warnings.some(warning => /所选样本/.test(warning)));
  store.papers.unshift({ id: 'title-only', title: 'Title only', tagIds: ['a'], updatedAt: '2030-01-01T00:00:00Z' });
  const filtered = prepareResearchInput(store, { kind: 'ideas', tagIds: ['a', 'b'] });
  assert.equal(filtered.paperIds.length, 8);
  assert.ok(!filtered.paperIds.includes('title-only'));
  assert.ok(filtered.warnings.some(warning => /略过了 1 篇/.test(warning)));
});

test('invented paper IDs, forged quotes and unsupported cells are rejected without saving', async () => {
  const { paperIds } = await setup();
  for (const change of [ref => { ref.paperId = 'invented'; }, ref => { ref.quote = 'This sentence is fabricated.'; }]) {
    mockLLM(input => { const result = output(input); change(result.comparison.dimensions[0].cells[0].evidence[0]); return result; });
    await assert.rejects(api('/api/research', { kind: 'comparison', paperIds }), /不存在的论文|不匹配/);
  }
  mockLLM(input => { const result = output(input); result.comparison.dimensions[0].cells[0].evidence = []; return result; });
  await assert.rejects(api('/api/research', { kind: 'comparison', paperIds }), /证据/);
  assert.equal((await handleApi('/api/research')).reports.length, 0);
});

test('exploration is saved as a critique and experiment plan with a strict total three-round budget', async () => {
  const { tagIds } = await setup();
  let { report } = await api('/api/research', { kind: 'ideas', tagIds });
  for (let index = 0; index < 2; index++) ({ report } = await api(`/api/research/${report.id}/explore`, { ideaIndex: 0 }));
  const results = await Promise.allSettled([api(`/api/research/${report.id}/explore`, { ideaIndex: 0 }), api(`/api/research/${report.id}/explore`, { ideaIndex: 0 })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /3 轮/);
  const saved = (await handleApi('/api/research')).reports[0];
  assert.equal(saved.rounds.length, 3);
  assert.equal(saved.ideas[0].novelty, 'unverified');
  validateResearchReports({ [saved.id]: saved });
  const invalid = structuredClone(saved); invalid.rounds[0].evidence[0].quote = 'An invented quote.';
  await assert.rejects(api('/api/import', { papers: [], tags: [], meta: { researchReports: { [invalid.id]: invalid } } }), /不匹配/);
  assert.equal((await handleApi('/api/research')).reports[0].rounds.length, 3);
  const malformed = [
    value => { delete value.warnings; }, value => { value.warnings = [null]; }, value => { value.createdAt = 'not-a-date'; },
    value => { value.sources[0] = null; }, value => { delete value.sources[0].coverage; }, value => { value.maxRounds = 99; },
    value => { value.rounds[0].risks = null; }, value => { value.rounds[0].model = {}; }, value => { value.snapshot.papers[1] = value.snapshot.papers[0]; },
    value => { value.ideas[0].assumptions = 'bad array'; }, value => { value.ideas[0].novelty = 'verified'; }
  ];
  for (const mutate of malformed) {
    const altered = structuredClone(saved); mutate(altered);
    await assert.rejects(api('/api/import', { papers: [], tags: [], meta: { researchReports: { [altered.id]: altered } } }), /研究报告/);
  }
  assert.equal((await state()).papers.length, 2);
});

test('exploration can switch an English report to Chinese and Markdown retains followup, risks and per-round provenance safely', async () => {
  const { tagIds } = await setup();
  let { report } = await api('/api/research', { kind: 'ideas', tagIds, language: 'en' });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); assert.match(body.messages[0].content, /JSON in Chinese/);
    const result = output(JSON.parse(body.messages[1].content)); result.risks = ['<script>alert(1)</script>'];
    return { ok: true, json: async () => ({ model: 'second-model', choices: [{ message: { content: JSON.stringify(result) } }] }) };
  };
  ({ report } = await api(`/api/research/${report.id}/explore`, { ideaIndex: 0, language: 'zh', question: 'Use one GPU only' }));
  assert.equal(report.rounds[0].language, 'zh');
  const markdown = reportToMarkdown(report);
  assert.match(markdown, /Use one GPU only/); assert.match(markdown, /second-model/); assert.match(markdown, /&lt;script&gt;/); assert.ok(!markdown.includes('<script>'));
});

test('concurrent report generation preserves both reports and concurrent paper edits', async () => {
  const { paperIds } = await setup(); let release, started; let count = 0;
  const ready = new Promise(resolve => { started = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  mockLLM(async input => { if (++count === 2) started(); await gate; return output(input); });
  const first = api('/api/research', { kind: 'comparison', paperIds }); const second = api('/api/research', { kind: 'comparison', paperIds });
  await ready;
  await api('/api/papers', { title: 'Saved during research', manualTags: [], duplicateAction: 'create' });
  release(); await Promise.all([first, second]);
  assert.equal((await handleApi('/api/research')).reports.length, 2);
  assert.equal((await state()).papers.length, 3);
});

test('deleting a report during exploration cannot resurrect it when the model finishes', async () => {
  const { tagIds } = await setup(); const { report } = await api('/api/research', { kind: 'ideas', tagIds });
  let release, started;
  const ready = new Promise(resolve => { started = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  mockLLM(async input => { started(); await gate; return output(input); });
  const pending = api(`/api/research/${report.id}/explore`, { ideaIndex: 0 });
  await ready; await api(`/api/research/${report.id}`, {}, 'DELETE'); release();
  await assert.rejects(pending, /另一个页面/);
  assert.equal((await handleApi('/api/research')).reports.length, 0);
});

test('importing a replacement library rejects reports still being generated from the previous library', async () => {
  const { paperIds } = await setup(); let release, started;
  const ready = new Promise(resolve => { started = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  mockLLM(async input => { started(); await gate; return output(input); });
  const pending = api('/api/research', { kind: 'comparison', paperIds });
  await ready;
  await api('/api/import', { papers: [{ id: 'replacement', title: 'Replacement library' }], tags: [] });
  release(); await assert.rejects(pending, /另一个页面/);
  assert.equal((await handleApi('/api/research')).reports.length, 0);
  assert.deepEqual((await state()).papers.map(paper => paper.id), ['replacement']);
});

test('metadata three-way merge preserves independent report addition and deletion', () => {
  const base = { papers: [], tags: [], topicPacks: [], meta: { researchReports: { a: { id: 'a', rounds: [] }, b: { id: 'b', rounds: [] } } } };
  const edited = structuredClone(base), live = structuredClone(base);
  delete edited.meta.researchReports.a;
  live.meta.researchReports.c = { id: 'c', rounds: [] };
  assert.deepEqual(Object.keys(mergeStoreChanges(base, edited, live).meta.researchReports).sort(), ['b', 'c']);
  live.meta.researchReports.a.rounds.push('new round');
  assert.throws(() => mergeStoreChanges(base, edited, live), /另一个页面/);
});

test('comparison supports grounded multilingual follow-up with saved source snapshots and paired turns', async () => {
  const { paperIds } = await setup();
  let { report } = await api('/api/research', { kind: 'comparison', paperIds, language: 'en' });
  const original = structuredClone(report);
  await api(`/api/papers/${paperIds[0]}`, { abstract: 'A later edit must not replace the analysis snapshot.' }, 'PUT');
  let call = 0;
  globalThis.fetch = async (_url, options) => {
    const messages = JSON.parse(options.body).messages, input = JSON.parse(messages[1].content);
    assert.match(messages[0].content, /JSON in Chinese/);
    assert.equal(input.task, 'discuss_saved_research'); assert.equal(input.initialAnalysis.summary, original.comparison.summary);
    assert.deepEqual(input.papers, original.snapshot.papers);
    assert.equal(input.recentChat.length, call++);
    return { ok: true, json: async () => ({ model: 'chat-model', choices: [{ message: { content: JSON.stringify(output(input)) } }] }) };
  };
  ({ report } = await api(`/api/research/${report.id}/chat`, { message: '请解释方法差异', language: 'zh' }));
  ({ report } = await api(`/api/research/${report.id}/chat`, { message: '哪些结论需要进一步验证？', language: 'zh', action: 'critique' }));
  assert.equal(report.chatTurns.length, 2); assert.equal(report.chatTurns[0].ideaIndex, null);
  assert.equal(report.chatTurns[0].question, '请解释方法差异'); assert.equal(report.chatTurns[0].model.responseModel, 'chat-model');
  assert.equal(report.chatTurns[1].action, 'critique'); assert.equal(report.rounds.length, 0);
  assert.deepEqual(report.comparison, original.comparison);
  const backup = await handleApi('/api/export'); await api('/api/import', backup);
  assert.deepEqual((await handleApi('/api/research')).reports[0], report);
  const markdown = reportToMarkdown(report);
  assert.ok(markdown.indexOf('请解释方法差异') < markdown.indexOf('哪些结论需要进一步验证？')); assert.match(markdown, /chat-model/);
});

test('chat rejects invalid input and malformed output without storing a half turn; insufficient replies have explicit gates', async () => {
  const { paperIds } = await setup(); const { report } = await api('/api/research', { kind: 'comparison', paperIds });
  let calls = 0; mockLLM(input => { calls++; return output(input); });
  for (const body of [{ message: '' }, { message: 'x'.repeat(2001) }, { message: 'Question', ideaIndex: 0 }, { message: 'Question', action: 'invented' }]) await assert.rejects(api(`/api/research/${report.id}/chat`, body));
  assert.equal(calls, 0);
  const invalidOutputs = [
    input => ({ ...output(input), evidence: [] }),
    input => ({ ...output(input), evidence: [{ paperId: input.papers[0].paperId, quote: 'This quote does not exist.' }] }),
    input => ({ ...output(input), suggestedQuestions: null }),
    input => ({ ...output(input), answer: 'x'.repeat(8001) }),
    input => ({ ...output(input), answerKind: 'insufficient' }),
    input => ({ ...output(input), answerKind: 'insufficient', evidence: [], suggestedQuestions: [] })
  ];
  for (const invalidOutput of invalidOutputs) {
    mockLLM(invalidOutput);
    await assert.rejects(api(`/api/research/${report.id}/chat`, { message: 'What accuracy did the experiment achieve?' }));
    assert.deepEqual((await handleApi('/api/research')).reports[0].chatTurns, []);
  }
  globalThis.fetch = async () => { throw new Error('Temporary model error'); };
  await assert.rejects(api(`/api/research/${report.id}/chat`, { message: 'Question' }), /Temporary model/);
  assert.deepEqual((await handleApi('/api/research')).reports[0].chatTurns, []);
  mockLLM(() => ({ answerKind: 'insufficient', answer: 'The saved materials do not contain the evaluation scores. Please provide the results table.', evidence: [], suggestedQuestions: ['Can you add the paper results table?'] }));
  const completed = await api(`/api/research/${report.id}/chat`, { message: 'What accuracy did the experiment achieve?' });
  assert.equal(completed.report.chatTurns[0].answerKind, 'insufficient');
  validateResearchReports({ [report.id]: completed.report });
});

test('chat preserves legacy reports without chatTurns and validates imported turns before touching the library', async () => {
  const { tagIds } = await setup(); let { report } = await api('/api/research', { kind: 'ideas', tagIds });
  const backup = await handleApi('/api/export'); delete backup.store.meta.researchReports[report.id].chatTurns;
  await api('/api/import', backup);
  ({ report } = await api(`/api/research/${report.id}/chat`, { message: 'Design the smallest experiment', ideaIndex: 0, action: 'experiment' }));
  assert.equal(report.chatTurns[0].ideaIndex, 0);
  const malformed = [
    value => { value.chatTurns = null; }, value => { value.chatTurns[0].id = '<script>'; },
    value => { value.chatTurns.push(structuredClone(value.chatTurns[0])); }, value => { delete value.chatTurns[0].question; },
    value => { value.chatTurns[0].suggestedQuestions = [null]; }, value => { value.chatTurns[0].ideaIndex = 99; },
    value => { value.chatTurns[0].action = 'unknown'; }, value => { value.chatTurns[0].createdAt = 'not-a-date'; },
    value => { value.chatTurns[0].model = null; }, value => { value.chatTurns[0].evidence[0].paperId = 'invented'; },
    value => { value.chatTurns[0].answerKind = 'insufficient'; }, value => { delete value.chatTurns[0].answerKind; }
  ];
  for (const mutate of malformed) {
    const altered = structuredClone(report); mutate(altered);
    await assert.rejects(api('/api/import', { papers: [], tags: [], meta: { researchReports: { [altered.id]: altered } } }));
    assert.equal((await state()).papers.length, 2);
  }
});

test('twenty chat turns and three automated rounds use independent budgets with a six-turn context window', async () => {
  const { tagIds } = await setup(); let { report } = await api('/api/research', { kind: 'ideas', tagIds });
  for (let index = 0; index < 3; index++) ({ report } = await api(`/api/research/${report.id}/explore`, { ideaIndex: 0 }));
  let calls = 0;
  mockLLM(input => {
    assert.equal(input.previousRounds.length, 3);
    assert.equal(input.recentChat.length, Math.min(6, calls));
    assert.equal(input.contextWindow.totalPreviousChatTurns, calls);
    if (calls > 6) assert.equal(input.recentChat[0].question, `Follow-up ${calls - 6}`);
    calls++; return output(input);
  });
  for (let index = 0; index < 19; index++) ({ report } = await api(`/api/research/${report.id}/chat`, { message: `Follow-up ${index}`, ideaIndex: 0 }));
  const results = await Promise.allSettled([api(`/api/research/${report.id}/chat`, { message: 'Follow-up 19', ideaIndex: 0 }), api(`/api/research/${report.id}/chat`, { message: 'Exceeds budget', ideaIndex: 0 })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /20/);
  assert.equal(calls, 20);
  const saved = (await handleApi('/api/research')).reports[0];
  assert.equal(saved.chatTurns.length, 20); assert.equal(saved.rounds.length, 3);
  validateResearchReports({ [saved.id]: saved });
});

test('chat and automatic exploration share a lock and retain both results and the latest user constraint', async () => {
  const { tagIds } = await setup(); const { report } = await api('/api/research', { kind: 'ideas', tagIds });
  let release, started;
  const ready = new Promise(resolve => { started = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  mockLLM(async input => {
    if (input.task === 'discuss_saved_research') { started(); await gate; }
    else assert.equal(input.recentChat[0].question, 'Use one GPU only');
    return output(input);
  });
  const pendingChat = api(`/api/research/${report.id}/chat`, { message: 'Use one GPU only', ideaIndex: 0 });
  await ready; const pendingRound = api(`/api/research/${report.id}/explore`, { ideaIndex: 0 }); release();
  await Promise.all([pendingChat, pendingRound]);
  const saved = (await handleApi('/api/research')).reports[0]; assert.equal(saved.chatTurns.length, 1); assert.equal(saved.rounds.length, 1);
});

test('chat replies cannot resurrect deleted reports or leak into a replacement library', async () => {
  for (const operation of ['delete', 'import']) {
    const { paperIds } = await setup(); const { report } = await api('/api/research', { kind: 'comparison', paperIds });
    let release, started;
    const ready = new Promise(resolve => { started = resolve; }); const gate = new Promise(resolve => { release = resolve; });
    mockLLM(async input => { started(); await gate; return output(input); });
    const pending = api(`/api/research/${report.id}/chat`, { message: 'Explain the difference' });
    await ready;
    if (operation === 'delete') await api(`/api/research/${report.id}`, {}, 'DELETE');
    else await api('/api/import', { papers: [{ id: 'replacement', title: 'A replacement library' }], tags: [] });
    release(); await assert.rejects(pending, /另一个页面/);
    assert.equal((await handleApi('/api/research')).reports.length, 0);
  }
});

test('chat keeps a condensed recent history and Markdown interleaves conversations and automated rounds chronologically', async () => {
  const { tagIds } = await setup(); let { report } = await api('/api/research', { kind: 'ideas', tagIds });
  ({ report } = await api(`/api/research/${report.id}/chat`, { message: '<script>First question</script>', ideaIndex: 0 }));
  ({ report } = await api(`/api/research/${report.id}/explore`, { ideaIndex: 0 }));
  ({ report } = await api(`/api/research/${report.id}/chat`, { message: 'Second question', ideaIndex: 0 }));
  report.chatTurns[0].createdAt = '2026-01-01T00:00:00Z'; report.rounds[0].createdAt = '2026-01-01T00:00:01Z'; report.chatTurns[1].createdAt = '2026-01-01T00:00:02Z';
  const markdown = reportToMarkdown(report);
  assert.ok(markdown.indexOf('## Conversation 1') < markdown.indexOf('## Exploration 1'));
  assert.ok(markdown.indexOf('## Exploration 1') < markdown.indexOf('## Conversation 2'));
  assert.ok(!markdown.includes('<script>')); assert.match(markdown, /&lt;script&gt;/);
  report.chatTurns = Array.from({ length: 19 }, (_, index) => ({ ...report.chatTurns[0], id: `turn-${index}`, question: 'q'.repeat(2000), answer: 'a'.repeat(8000) }));
  report.snapshot.papers.forEach(paper => { paper.evidence = `${paper.evidence}\n${'x'.repeat(8000)}`.slice(0, 8000); });
  await chatWithResearchReport(report, { message: 'Continue', ideaIndex: 0 }, async messages => {
    const input = JSON.parse(messages[1].content);
    assert.equal(input.recentChat.length, 6); assert.equal(input.recentChat[0].question.length, 800); assert.equal(input.recentChat[0].answer.length, 1800);
    assert.deepEqual(input.papers, report.snapshot.papers);
    return { content: output(input), meta: { provider: 'test', requestedModel: 'test', responseModel: 'test' } };
  });
});

test('large valid research reports retain all sources and recent history above the former request budget', async () => {
  const { tagIds } = await setup(); const { report } = await api('/api/research', { kind: 'ideas', tagIds });
  const escapedText = '"\\'.repeat(4000);
  const longPlan = Object.fromEntries(Object.keys(experiment).map(key => [key, escapedText.slice(0, 3000)]));
  const sourceTemplates = structuredClone(report.snapshot.papers);
  report.snapshot.papers = Array.from({ length: 8 }, (_, index) => ({
    ...sourceTemplates[index % 2], paperId: `full-paper-${index}`, title: `Full paper ${index}`,
    evidence: `Source evidence from paper ${index}. ${'x'.repeat(40000)}`, truncated: false
  }));
  report.snapshot.papers.forEach(paper => { paper.textLength = paper.evidence.length; });
  report.sources = report.snapshot.papers.map(({ evidence, ...source }) => source);
  report.paperIds = report.sources.map(source => source.paperId);
  report.question = `Original goal ${escapedText.slice(0, 1900)}`;
  const references = report.snapshot.papers.map(paper => ({ paperId: paper.paperId, quote: paper.evidence.slice(0, 100) }));
  report.ideas = Array.from({ length: 5 }, (_, index) => ({
    title: `Idea ${index} ${escapedText.slice(0, 280)}`, hypothesis: escapedText.slice(0, 3000), rationale: escapedText.slice(0, 3000),
    evidence: references, assumptions: Array(12).fill(escapedText.slice(0, 2000)), experiment: longPlan,
    risks: Array(12).fill(escapedText.slice(0, 2000)), novelty: 'unverified'
  }));
  report.rounds = Array.from({ length: 3 }, () => ({
    ideaIndex: 0, question: escapedText.slice(0, 2000), language: 'en', critique: Array(12).fill(escapedText.slice(0, 2000)),
    refinedHypothesis: escapedText.slice(0, 3000), evidence: references, experiment: longPlan,
    risks: Array(12).fill(escapedText.slice(0, 2000)), nextSteps: Array(12).fill(escapedText.slice(0, 2000)),
    createdAt: report.createdAt, model: report.model
  }));
  report.chatTurns = Array.from({ length: 19 }, (_, index) => ({
    id: `turn-full-${index}`, question: escapedText.slice(0, 2000), answer: escapedText.slice(0, 8000), answerKind: 'grounded',
    evidence: references, suggestedQuestions: [escapedText.slice(0, 300)], language: 'en', createdAt: report.createdAt,
    model: report.model, ideaIndex: 0, action: 'followup'
  }));
  validateResearchReports({ [report.id]: report });
  const originalSnapshot = structuredClone(report.snapshot);
  const question = `Current question ${escapedText.slice(0, 1900)}`;
  const inspect = messages => {
    assert.ok(messages.reduce((sum, message) => sum + message.content.length, 0) > 140000);
    const input = JSON.parse(messages[1].content);
    assert.equal(input.question, question); assert.equal(input.originalQuestion, report.question);
    assert.deepEqual(input.papers, originalSnapshot.papers); assert.deepEqual(input.tags, originalSnapshot.tags);
    assert.notEqual(input.contextWindow.trimmedForBudget, true); assert.equal(input.contextWindow.historyIsCondensed, true);
    assert.equal(input.contextWindow.totalPreviousChatTurns, 19);
    assert.equal(input.recentChat.length, 6);
    assert.equal(input.contextWindow.includedChatTurns, input.recentChat.length);
    assert.equal(input.contextWindow.includedPreviousRounds, input.previousRounds.length);
    return input;
  };
  const chatted = await chatWithResearchReport(report, { message: question }, async messages => {
    const input = inspect(messages); assert.equal(input.contextWindow.totalPreviousRounds, 3);
    assert.equal(input.previousRounds.length, 3); assert.ok(input.initialAnalysis);
    return { content: { answerKind: 'grounded', answer: 'Bounded answer with saved evidence', evidence: [references[0]], suggestedQuestions: [] }, meta: report.model };
  });
  assert.equal(chatted.chatTurns.length, 20);
  // The third automatic round is still available with two saved rounds. A
  // report with all three completed correctly rejects further automatic work.
  const explorable = { ...report, rounds: report.rounds.slice(0, 2) };
  validateResearchReports({ [report.id]: explorable });
  const explored = await exploreResearchReport(explorable, { ideaIndex: 0, question }, async messages => {
    const input = inspect(messages); assert.equal(input.contextWindow.totalPreviousRounds, 2);
    assert.equal(input.previousRounds.length, 2); assert.ok(input.idea);
    return { content: { critique: ['Check this assumption'], refinedHypothesis: 'A falsifiable revised hypothesis', evidence: [references[0]], experiment, risks: [], nextSteps: [] }, meta: report.model };
  });
  assert.equal(explored.rounds.length, 3);
  assert.deepEqual(report.snapshot, originalSnapshot);
});

test('a reply missing only its final brackets is closed, and one invalid reply gets a single correction', async () => {
  const { paperIds } = await setup();
  let replies = [];
  globalThis.fetch = async (_url, options) => {
    const input = JSON.parse(JSON.parse(options.body).messages[1].content), next = replies.shift();
    return { ok: true, json: async () => ({ model: 'test-model', choices: [{ message: { content: next(input) } }] }) };
  };
  replies = [input => JSON.stringify(output(input)).slice(0, -1)];
  const { report } = await api('/api/research', { kind: 'comparison', paperIds });
  assert.equal(report.comparison.dimensions.length, 1);
  replies = [input => JSON.stringify(output(input)).replace(/"commonalities":\[/, '"commonalities":["unterminated')];
  replies.push(replies[0]);
  await assert.rejects(api('/api/research', { kind: 'comparison', paperIds }), /JSON/);
  let attempts = 0;
  replies = [input => { attempts++; const result = output(input); result.comparison.dimensions[0].cells[0].evidence[0].quote = 'This sentence is fabricated.'; return JSON.stringify(result); }, input => { attempts++; return JSON.stringify(output(input)); }];
  const corrected = await api('/api/research', { kind: 'comparison', paperIds });
  assert.equal(attempts, 2);
  assert.ok(corrected.report.comparison.dimensions[0].cells[0].evidence[0].quote.length > 6);
  let failures = 0;
  globalThis.fetch = async () => { failures++; return { ok: false, status: 503, json: async () => ({ error: { message: 'Synthetic outage' } }), text: async () => 'Synthetic outage' }; };
  await assert.rejects(api('/api/research', { kind: 'comparison', paperIds }), /Synthetic outage|503/);
  assert.equal(failures, 1, 'transport failures are not retried automatically');
  mockLLM();
});
