import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../extension/storage.js';
import { tagAnalysisSource, validateMethodProfile, generateMethodProfile, generateTagSynthesis, validateTagSynthesis, originalEvidenceQuote, prepareTagAnalysis, validateImportedTagAnalysis, reconcileTagAnalyses, normalizeMethodDiagram, TAG_ANALYSIS_VISUAL_VERSION } from '../extension/tag-analysis.js';

const aText = 'A retrieval gate chooses evidence only when uncertainty is high.';
const bText = 'A retrieval module always adds document evidence before decoding.';
const cText = 'A learned selector ranks evidence using an explicit relevance objective.';
const fixture = () => ({ papers: [
  { id: 'a', title: 'A paper', tagIds: ['tag'], abstract: aText, conversation: '个人理解：A 的关键设计是先判断不确定性，再决定是否检索证据。', memory: '按需检索减少无效查询' },
  { id: 'b', title: 'B paper', tagIds: ['tag'], abstract: bText, clips: [{ id: 'clip-b', markdown: '## Mechanism\n' + bText }], conversation: '个人想法：B 总是补充证据，可能增加查询成本，仍需要实测。' },
  { id: 'empty', title: 'No material', tagIds: ['tag'] }
], tags: [{ id: 'tag', name: 'Evidence selection' }], meta: {} });
const quoteFor = source => source.notes || source.memory || source.abstract || source.clips.find(Boolean);
function profileOutput(source) {
  return { researchQuestion: '何时检索证据以及证据如何进入推理？', approach: '使用保存材料描述的检索策略。', mechanism: '以检索触发决策和证据选择模块为设计关注点。', distinctiveChoice: '保存材料给出了该策略的触发方式，不据此声称新颖性。', tradeoffs: '查询成本与覆盖率需要进一步验证，不能从笔记推断实验结果。', personalTake: source.notes || source.memory ? '重点参考用户对触发条件的理解；成本推断属于用户假设。' : '未保存个人笔记或记忆线索。', evidence: [{ paperId: source.paperId, quote: quoteFor(source).slice(0, 1000) }] };
}
function synthesisOutput(profiles) {
  const available = profiles.filter(profile => profile.evidence.length), ids = available.map(profile => profile.paperId), evidence = available.map(profile => profile.evidence[0].id);
  return { overview: '围绕检索触发与证据选择形成方法对照；用户笔记提供理解线索，成本效果仍待验证。', commonalities: [{ title: '检索控制机制', finding: '这些方法均关注证据何时进入推理，具体触发条件需要区分。', paperIds: ids, evidenceIds: evidence }], differences: [{ dimension: '检索触发条件', finding: '触发决策影响查询数量，但性能取舍尚需验证。', groups: [{ label: '第一种控制流程', paperIds: [ids[0]], approach: '按保存材料理解该触发设计。', tradeoff: '缺少同协议实验。' }, { label: '其他控制流程', paperIds: ids.slice(1), approach: '按其他画像比较机制。', tradeoff: '查询成本仍待验证。' }], evidenceIds: evidence }], inspirations: [{ title: '触发策略消融', hypothesis: '按需触发可能减少部分查询。', rationale: '基于保存的机制差异与个人成本假设。', nextStep: '同一测试集比较固定触发与按需触发，记录查询次数和回答正确率。', caveat: '未执行实验，效果与新颖性尚未验证。', paperIds: ids, evidenceIds: evidence }], readingPath: profiles.map(profile => ({ paperId: profile.paperId, reason: profile.evidence.length ? '阅读该方法以理解设计取舍。' : '先补充摘要或个人笔记。' })), openQuestions: ['不同触发条件在相同评测协议下有何差异？'] };
}

const values = {}, messages = [], locks = new Map();
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {} });
Object.defineProperty(globalThis.navigator, 'locks', { value: { request(name, fn) { const task = (locks.get(name) || Promise.resolve()).then(fn); locks.set(name, task.catch(() => {})); return task; } } });
globalThis.chrome = { storage: { local: { async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); }, async set(data) { Object.assign(values, structuredClone(data)); }, async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; } } }, runtime: { sendMessage(message) { messages.push(message); return Promise.resolve(); } } };
const api = (path, body, method = 'POST') => handleApi(path, { method, body });
const state = () => handleApi('/api/state');
const analysis = async (id = 'tag') => (await state()).tags.find(tag => tag.id === id)?.paperAnalysis;
const next = () => api('/api/paper-analyses/update-next', {});
const requestAnalysis = () => api('/api/tags/tag/paper-analysis', {});
let calls = [];
function mockModel(fn) {
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body), payload = JSON.parse(body.messages[1].content);
    calls.push({ url, body, payload });
    const output = fn ? await fn(payload, body, url, options) : payload.task === 'profile_saved_paper_method' ? profileOutput(payload.paper) : synthesisOutput(payload.profiles);
    const content = typeof output === 'string' ? output : JSON.stringify(output);
    return { ok: true, json: async () => url.includes('/v1/generate') ? { content, model: body.model === 'default' ? 'resolved-model' : body.model } : { choices: [{ message: { content } }], model: body.model } };
  };
}
async function reset({ store = fixture(), configured = true, auto = true } = {}) {
  values.paperTagConfig = {};
  await api('/api/settings', { provider: 'qwen', qwenKey: configured ? 'analysis-test-key' : '', autoPaperGraphs: auto });
  await api('/api/import', store); calls = []; messages.length = 0; mockModel();
}
async function finish(limit = 20) {
  for (let i = 0; i < limit; i++) { const result = await next(); if (!result.remaining) return result; }
  throw new Error('Analysis did not finish');
}

 test('profiles preserve all long personal notes and clips, prioritize notes, and derive exact source labels', async () => {
  const note = '完整个人方法理解'.repeat(24000) + '\n最终笔记证据：触发时机可能影响成本，需要实验验证。';
  const source = tagAnalysisSource({ id: 'long', title: 'Long source', conversation: note, memory: '按需触发需要验证', abstract: aText, clips: [{ markdown: '正文'.repeat(90000) + '\nEND_CLIP' }] });
  const profile = await generateMethodProfile(source, async messages => {
    const input = JSON.parse(messages[1].content);
    assert.equal(input.paper.notes, note); assert.deepEqual(input.paper.clips, source.clips); assert.equal(input.paper.abstract, source.abstract); assert.equal(input.paper.memory, source.memory); assert.match(input.paper.clips[0], /END_CLIP/); assert.match(messages[0].content, /PRIORITIZE personal notes/);
    assert.ok(input.schema.card); assert.match(input.rules[0], /8–18/); assert.ok(input.schema.methodDiagram);
    return { content: { ...profileOutput(source), card: { label: '按需检索', method: '不确定时触发检索', note: '个人假设：触发时机影响成本，尚待验证' }, evidence: [{ paperId: 'long', quote: '最终笔记证据：触发时机可能影响成本，需要实验验证。', sourceType: 'abstract' }] }, meta: {} };
  });
  assert.equal(profile.card.note, '个人假设：触发时机影响成本，尚待验证');
  assert.equal(profile.evidence[0].sourceType, 'notes'); assert.equal(profile.evidence[0].id, 'long:e1');
  const repeated = tagAnalysisSource({ id: 'x', title: 'X', abstract: aText, conversation: aText });
  assert.deepEqual(validateMethodProfile(profileOutput(repeated), repeated).evidence[0].matchedSourceTypes, ['notes', 'abstract']);
  const onlyNotes = tagAnalysisSource({ id: 'notes', title: 'Notes only', conversation: '我的方法理解是先判断不确定性，再决定是否检索证据。' });
  assert.equal(onlyNotes.hasMaterial, true); assert.equal(validateMethodProfile(profileOutput(onlyNotes), onlyNotes).evidence[0].sourceType, 'notes');
});

test('method cards are optional and bounded without changing complete profile fields or evidence', () => {
  const source = tagAnalysisSource(fixture().papers[0]), original = profileOutput(source);
  const legacy = validateMethodProfile(original, source);
  assert.equal(Object.hasOwn(legacy, 'card'), false);
  const card = { label: '按需检索 A', focus: '何时引入外部证据', method: '高不确定性才触发检索', tradeoff: '查询量或可下降，准确率待测', note: '个人解读：触发规则可能影响成本' };
  const displayed = validateMethodProfile({ ...original, card }, source);
  assert.deepEqual(displayed.card, card);
  const { card: omitted, ...detailed } = displayed; assert.deepEqual(detailed, legacy);
  assert.equal(Object.hasOwn(validateMethodProfile({ ...original, card: { label: '  ', note: '' } }, source), 'card'), false);
  for (const [key, limit] of Object.entries({ label: 60, focus: 160, method: 160, tradeoff: 160, note: 160 })) {
    assert.equal(validateMethodProfile({ ...original, card: { [key]: '文'.repeat(limit) } }, source).card[key].length, limit);
    assert.equal(Object.hasOwn(validateMethodProfile({ ...original, card: { [key]: '文'.repeat(limit + 1) } }, source), 'card'), false);
    assert.equal(Object.hasOwn(validateMethodProfile({ ...original, card: { [key]: 42 } }, source), 'card'), false);
  }
  assert.deepEqual(validateMethodProfile({ ...original, card: [] }, source), legacy);
});

test('presentation summaries preserve full synthesis details, evidence and complete cached cards', async () => {
  const profiles = fixture().papers.filter(paper => paper.abstract).map(paper => {
    const source = tagAnalysisSource(paper);
    return validateMethodProfile({ ...profileOutput(source), mechanism: '完整机制与限定条件。'.repeat(900), card: { label: paper.title, method: '检索触发条件不同', note: '个人假设：查询成本需实测' } }, source);
  });
  const legacy = synthesisOutput(profiles), output = structuredClone(legacy);
  output.headline = '检索触发时机影响查询成本，性能取舍仍需同协议验证';
  output.commonalities[0].summary = '都在解码前引入外部证据，触发控制方式不同';
  output.differences[0].summary = '按需触发与固定触发的区别在于是否先判断不确定性';
  output.differences[0].groups[0].methodSummary = '高不确定性时调用检索';
  output.differences[0].groups[0].tradeoffSummary = '查询量可能下降，但漏检风险待测';
  output.inspirations[0].hypothesisSummary = '假设按需触发可降低查询量，效果尚待验证';
  output.inspirations[0].testSummary = '对比固定与按需触发，测查询次数和正确率';
  const result = await generateTagSynthesis({ tag: { id: 'tag', name: 'Evidence selection' }, profiles }, async messages => {
    const input = JSON.parse(messages[1].content);
    assert.deepEqual(input.profiles, profiles); assert.equal(input.profiles[0].mechanism.length, 9000);
    assert.ok(input.schema.headline); assert.ok(input.schema.differences[0].groups[0].methodSummary);
    assert.match(input.rules[0], /8–18/);
    return { content: output, meta: {} };
  });
  assert.equal(result.result.headline, output.headline);
  assert.equal(result.result.overview, legacy.overview);
  assert.equal(result.result.commonalities[0].finding, legacy.commonalities[0].finding);
  assert.equal(result.result.commonalities[0].summary, output.commonalities[0].summary);
  assert.deepEqual(result.result.differences[0].evidenceIds, legacy.differences[0].evidenceIds);
  assert.deepEqual(result.result.differences[0].groups[0], output.differences[0].groups[0]);
  assert.equal(result.result.inspirations[0].testSummary, output.inspirations[0].testSummary);
  assert.deepEqual(result.result.readingPath, legacy.readingPath);
  assert.equal(Object.hasOwn(validateTagSynthesis(legacy, profiles), 'headline'), false);
  const optionalPaths = [
    [['headline'], 160], [['commonalities', 0, 'summary'], 200], [['differences', 0, 'summary'], 200],
    [['differences', 0, 'groups', 0, 'methodSummary'], 200], [['differences', 0, 'groups', 0, 'tradeoffSummary'], 200],
    [['inspirations', 0, 'hypothesisSummary'], 200], [['inspirations', 0, 'testSummary'], 200]
  ];
  for (const [path, limit] of optionalPaths) {
    const candidate = structuredClone(legacy), key = path.at(-1), parent = path.slice(0, -1).reduce((value, field) => value[field], candidate);
    parent[key] = '文'.repeat(limit); assert.ok(validateTagSynthesis(candidate, profiles));
    parent[key] += '文'; assert.equal(Object.hasOwn(path.slice(0, -1).reduce((value, field) => value[field], validateTagSynthesis(candidate, profiles)), key), false);
    parent[key] = 42; assert.equal(Object.hasOwn(path.slice(0, -1).reduce((value, field) => value[field], validateTagSynthesis(candidate, profiles)), key), false);
    parent[key] = '  '; const validated = validateTagSynthesis(candidate, profiles);
    assert.equal(Object.hasOwn(path.slice(0, -1).reduce((value, field) => value[field], validated), key), false);
  }
});

test('method diagrams keep supported flow, degrade unsupported arrows and bound optional malformed data', () => {
  const source = tagAnalysisSource(fixture().papers[0]), original = profileOutput(source);
  const evidence = validateMethodProfile(original, source).evidence;
  const diagram = {
    kind: 'flow',
    nodes: [{ id: 'gate', label: '判断当前推理不确定性', role: 'decision' }, { id: 'fetch', label: '按需查询外部证据', role: 'step' }, { id: 'answer', label: '输出当前回答', role: 'output' }],
    edges: [{ from: 'gate', to: 'fetch', relation: 'flow', label: '高不确定性', evidenceIds: ['e1'] }, { from: 'fetch', to: 'answer', relation: 'flow', evidenceIds: ['other:e1'] }, { from: 'gate', to: 'missing', relation: 'flow', evidenceIds: [1] }, { from: 'gate', to: 'gate', relation: 'flow', evidenceIds: [1] }]
  };
  const normalized = normalizeMethodDiagram(diagram, evidence);
  assert.equal(normalized.kind, 'flow'); assert.equal(normalized.edges.length, 2);
  assert.deepEqual(normalized.edges[0].evidenceIds, [evidence[0].id]);
  assert.equal(normalized.edges[1].relation, 'related'); assert.deepEqual(normalized.edges[1].evidenceIds, []);
  assert.deepEqual(normalizeMethodDiagram(normalized, evidence), normalized);
  const structure = normalizeMethodDiagram({ ...diagram, kind: 'structure' }, evidence);
  assert.equal(structure.kind, 'structure'); assert.ok(structure.edges.every(edge => edge.relation !== 'flow'));
  const withDiagram = validateMethodProfile({ ...original, methodDiagram: diagram }, source);
  assert.deepEqual(withDiagram.methodDiagram, normalized);
  const { methodDiagram, ...complete } = withDiagram; assert.deepEqual(complete, validateMethodProfile(original, source));
  const crowded = normalizeMethodDiagram({ nodes: [...Array.from({ length: 30 }, (_, i) => ({ id: i, label: `第${i}个模块` })), null], edges: Array.from({ length: 30 }, (_, i) => ({ from: 0, to: (i % 9) + 1, relation: i < 9 ? 'contains' : 'related' })) }, evidence);
  assert.equal(crowded.nodes.length, 10); assert.equal(crowded.edges.length, 14); assert.equal(crowded.kind, 'structure');
  for (const invalid of [null, [], 'diagram', {}, { nodes: [{ id: 'one', label: '唯一模块' }] }, { nodes: [{ id: 'bad id', label: '错误标识' }, { id: 'a', label: '超'.repeat(81) }] }]) assert.equal(normalizeMethodDiagram(invalid, evidence), undefined);
});

test('broken optional visuals do not retry or discard valid reasoning while core evidence remains strict', async () => {
  const source = tagAnalysisSource(fixture().papers[0]), output = profileOutput(source); let profileCalls = 0;
  const profile = await generateMethodProfile(source, async () => {
    profileCalls++; return { content: { ...output, card: ['not a card'], methodDiagram: { nodes: 42 } }, meta: {} };
  });
  assert.equal(profileCalls, 1); assert.equal(profile.mechanism, output.mechanism); assert.equal(profile.methodDiagram, undefined);
  assert.throws(() => validateMethodProfile({ ...output, methodDiagram: {}, evidence: [{ quote: 'This claim does not exist in the saved source.' }] }, source), /does not match/);
  const profiles = fixture().papers.filter(paper => paper.abstract).map(paper => { const src = tagAnalysisSource(paper); return validateMethodProfile(profileOutput(src), src); });
  const report = synthesisOutput(profiles); let synthesisCalls = 0;
  const generated = await generateTagSynthesis({ tag: { id: 'tag', name: 'Topic' }, profiles }, async () => {
    synthesisCalls++; return { content: { ...report, headline: 42, paperDiagrams: [null, { paperId: 'unknown', nodes: [] }], commonalities: report.commonalities.map(item => ({ ...item, summary: '超'.repeat(201) })) }, meta: {} };
  });
  assert.equal(synthesisCalls, 1); assert.equal(generated.result.overview, report.overview);
  assert.equal(generated.result.headline, undefined); assert.equal(generated.result.commonalities[0].summary, undefined); assert.equal(generated.result.paperDiagrams, undefined);
  assert.equal(generated.result.visualVersion, TAG_ANALYSIS_VISUAL_VERSION);
});

test('synthesis upgrades old profiles with optional per-paper diagrams and reuses only matching source snapshots', async () => {
  const profiles = fixture().papers.filter(paper => paper.abstract).map(paper => { const src = tagAnalysisSource(paper); return validateMethodProfile(profileOutput(src), src); });
  const diagram = { kind: 'structure', nodes: [{ id: 'a', label: '证据选择模块', role: 'component' }, { id: 'b', label: '生成解码模块', role: 'component' }], edges: [{ from: 'a', to: 'b', relation: 'related' }] };
  profiles[0].methodDiagram = normalizeMethodDiagram(diagram, profiles[0].evidence);
  const target = profiles[1]; let requested;
  const first = await generateTagSynthesis({ tag: { id: 'tag', name: 'Topic' }, profiles }, async messages => {
    requested = JSON.parse(messages[1].content); return { content: { ...synthesisOutput(profiles), paperDiagrams: [{ paperId: profiles[0].paperId, ...diagram }, { paperId: target.paperId, ...diagram }, { paperId: target.paperId, ...diagram }, { paperId: 'other', ...diagram }] }, meta: {} };
  });
  assert.deepEqual(requested.diagramPaperIds, [target.paperId]); assert.deepEqual(requested.profiles, profiles);
  assert.equal(first.result.paperDiagrams.length, 1); assert.equal(first.result.paperDiagrams[0].paperId, target.paperId);
  assert.equal(first.result.paperDiagrams[0].sourceFingerprint, target.sourceFingerprint);
  const reused = await generateTagSynthesis({ tag: { id: 'tag', name: 'Topic' }, profiles, previousResult: first.result }, async messages => {
    assert.deepEqual(JSON.parse(messages[1].content).diagramPaperIds, []); return { content: synthesisOutput(profiles), meta: {} };
  });
  assert.deepEqual(reused.result.paperDiagrams, first.result.paperDiagrams);
  const changed = profiles.map(profile => profile.paperId === target.paperId ? { ...profile, sourceFingerprint: 'changed-source' } : profile);
  const updated = await generateTagSynthesis({ tag: { id: 'tag', name: 'Topic' }, profiles: changed, previousResult: first.result }, async messages => {
    assert.deepEqual(JSON.parse(messages[1].content).diagramPaperIds, [target.paperId]); return { content: synthesisOutput(changed), meta: {} };
  });
  assert.equal(updated.result.paperDiagrams, undefined);
});

test('evidence whitespace normalization restores the original substring but rejects changed words or punctuation', () => {
  const body = 'A retrieval\n  gate\tchooses evidence.';
  assert.equal(originalEvidenceQuote(body, 'A retrieval gate chooses evidence.'), body);
  assert.equal(originalEvidenceQuote(body, 'A retrieval gate picks evidence.'), '');
  assert.equal(originalEvidenceQuote(body, 'A retrieval gate chooses evidence!'), '');
  const source = tagAnalysisSource({ id: 'space', title: 'Whitespace', abstract: body });
  const result = validateMethodProfile({ ...profileOutput(source), evidence: [{ quote: 'A retrieval gate chooses evidence.' }] }, source);
  assert.equal(result.evidence[0].quote, body); assert.equal(result.evidence[0].sourceType, 'abstract');
});

test('analysis persists one profile per step, then synthesizes every profile once without pair enumeration', async () => {
  await reset(); await requestAnalysis();
  assert.equal((await analysis()).phase, 'profiles'); assert.deepEqual((await analysis()).progress, { completed: 0, total: 2, changed: 2 });
  assert.deepEqual((await analysis()).coverage, { included: 0, total: 3, added: 3, changed: 0, removed: 0 });
  const first = await next(); assert.equal(first.remaining, 1); assert.equal(first.analysis.progress.completed, 1); assert.equal(calls.length, 1);
  assert.deepEqual(first.analysis.coverage, { included: 0, total: 3, added: 3, changed: 0, removed: 0 });
  const second = await next(); assert.equal(second.analysis.phase, 'synthesis'); assert.equal(second.analysis.progress.completed, 2);
  const third = await next(); assert.equal(third.analysis.status, 'ready'); assert.equal(third.remaining, 0); assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.payload.task), ['profile_saved_paper_method', 'profile_saved_paper_method', 'synthesize_tag_method_analysis']);
  assert.equal(calls[2].payload.profiles.length, 3); assert.equal((await analysis()).resultProfiles.length, 3);
  assert.deepEqual(third.analysis.coverage, { included: 3, total: 3, added: 0, changed: 0, removed: 0 });
  assert.equal(third.analysis.manualRequested, false);
  assert.ok(calls.every(call => !Object.hasOwn(call.payload, 'pairsToAnalyze')));
  await next(); assert.equal(calls.length, 3);
  assert.ok(!JSON.stringify(await handleApi('/api/export')).includes('analysis-test-key'));
  assert.ok(!messages.some(message => message.type === 'auto-update-paper-graphs'));
});

test('adding or editing a paper refreshes only its profile plus synthesis and retains the old report snapshot while working', async () => {
  await reset(); await requestAnalysis(); await finish(); const before = await analysis(), snapshot = JSON.stringify(before.resultProfiles), previousA = JSON.stringify(before.profiles.find(profile => profile.paperId === 'a'));
  const c = (await api('/api/papers', { title: 'C paper', abstract: cText, conversation: '个人想法：显式选择目标值得与触发规则联合验证。', manualTags: ['Evidence selection'], duplicateAction: 'create' })).paper;
  assert.equal((await analysis()).stale, true); assert.equal(JSON.stringify((await analysis()).resultProfiles), snapshot);
  assert.deepEqual((await analysis()).coverage, { included: 3, total: 4, added: 1, changed: 0, removed: 0 });
  assert.equal((await analysis()).manualRequested, false);
  calls = []; assert.equal((await next()).processed, false); assert.equal(calls.length, 0);
  await requestAnalysis(); await next();
  assert.deepEqual((await analysis()).coverage, { included: 3, total: 4, added: 1, changed: 0, removed: 0 });
  assert.equal(JSON.stringify((await analysis()).resultProfiles), snapshot);
  await finish(); assert.deepEqual(calls.map(call => call.payload.task), ['profile_saved_paper_method', 'synthesize_tag_method_analysis']);
  assert.equal(calls[0].payload.paper.paperId, c.id); assert.equal(JSON.stringify((await analysis()).profiles.find(profile => profile.paperId === 'a')), previousA);
  await api('/api/papers/b', { conversation: '新的个人理解：始终检索能够提高覆盖，但成本需要同协议验证。' }, 'PUT');
  assert.deepEqual((await analysis()).coverage, { included: 3, total: 4, added: 0, changed: 1, removed: 0 });
  assert.deepEqual((await analysis()).changedPaperIds, ['b']); calls = []; await next(); assert.equal(calls.length, 0);
  await requestAnalysis(); await finish(); assert.equal(calls.length, 2); assert.equal(calls[0].payload.paper.paperId, 'b');
  calls = []; await api('/api/papers/a', undefined, 'DELETE');
  assert.deepEqual((await analysis()).coverage, { included: 3, total: 3, added: 0, changed: 0, removed: 1 });
  assert.equal((await next()).processed, false); await requestAnalysis(); await finish();
  assert.equal(calls.length, 1); assert.equal(calls[0].payload.task, 'synthesize_tag_method_analysis'); assert.ok(!(await analysis()).resultProfiles.some(profile => profile.paperId === 'a'));
});

test('failed profile and failed synthesis stop automatically, retain progress, and retry the unfinished stage', async () => {
  await reset(); await requestAnalysis(); await next();
  mockModel(() => { throw new Error('429 quota exhausted'); }); const failure = await next();
  assert.match(failure.error, /B paper/); assert.match(failure.error, /1\/2/); assert.equal((await analysis()).progress.completed, 1);
  assert.equal((await analysis()).manualRequested, false);
  const failedCalls = calls.length; await next(); assert.equal(calls.length, failedCalls);
  await api('/api/tags/tag/paper-analysis', {}); mockModel(); await next();
  assert.equal((await analysis()).progress.completed, 2);
  mockModel(() => { throw new Error('Backend timed out'); }); await next(); assert.match((await analysis()).error, /综合比较失败/);
  await api('/api/tags/tag/paper-analysis', {}); calls = []; mockModel(); await finish();
  assert.equal(calls.length, 1); assert.equal(calls[0].payload.task, 'synthesize_tag_method_analysis');
});

test('malformed JSON or an invalid quote receives one correction, while a transport/quota failure is never retried', async () => {
  await reset(); await requestAnalysis(); let attempts = 0;
  mockModel(payload => ++attempts === 1 ? 'not JSON' : profileOutput(payload.paper));
  await next(); assert.equal(attempts, 2); assert.equal((await analysis()).progress.completed, 1); assert.equal(calls[1].body.messages.length, 3);
  attempts = 0; mockModel(payload => { attempts++; const value = profileOutput(payload.paper); value.evidence[0].quote = 'Invented source phrase that was never saved'; return value; });
  const failed = await next(); assert.equal(attempts, 2); assert.match(failed.error, /引用 1/); assert.equal((await analysis()).progress.completed, 1);
  await api('/api/tags/tag/paper-analysis', {}); attempts = 0; mockModel(() => { attempts++; throw new Error('429 provider quota'); });
  await next(); assert.equal(attempts, 1);
});

test('a source edit during its profile request discards it, while another-paper edit preserves useful in-flight work', async () => {
  for (const id of ['a', 'b']) {
    await reset(); await requestAnalysis(); let begin, release;
    const started = new Promise(resolve => begin = resolve), gate = new Promise(resolve => release = resolve);
    mockModel(async payload => { begin(); await gate; return profileOutput(payload.paper); });
    const pending = next(); await started; await api(`/api/papers/${id}`, { conversation: '更新后的个人笔记需要重新提炼，不得覆盖为旧内容。' }, 'PUT'); release();
    const result = await pending;
    assert.equal(result.discarded, id === 'a' ? true : undefined);
    assert.equal((await analysis()).progress.completed, id === 'a' ? 0 : 1);
    assert.equal((await analysis()).status, 'queued');
    assert.equal((await analysis()).manualRequested, false);
    const callCount = calls.length; assert.equal((await next()).processed, false); assert.equal(calls.length, callCount);
  }
});

test('synthesis cannot overwrite changed sources or an imported library; title/progress edits never strand a step', async () => {
  await reset(); await requestAnalysis(); let begin, release;
  const started = new Promise(resolve => begin = resolve), gate = new Promise(resolve => release = resolve);
  mockModel(async payload => { begin(); await gate; return profileOutput(payload.paper); });
  const profileStep = next(); await started; await api('/api/papers/a', { title: 'Renamed A', readingStatus: 'read' }, 'PUT'); release();
  assert.equal((await profileStep).discarded, undefined); assert.equal((await analysis()).profiles.find(profile => profile.paperId === 'a').title, 'Renamed A');
  for (const change of [() => api('/api/papers/a', { memory: '新记忆线索改变理解，需要重新分析' }, 'PUT'), () => api('/api/import', fixture())]) {
    await reset(); await requestAnalysis(); await next(); await next(); let start, unlock;
    const ready = new Promise(resolve => start = resolve), wait = new Promise(resolve => unlock = resolve);
    mockModel(async payload => { start(); await wait; return synthesisOutput(payload.profiles); });
    const pending = next(); await ready; await change(); unlock(); assert.equal((await pending).discarded, true); assert.notEqual((await analysis()).status, 'ready');
  }
});

test('the model is pinned from the first profile, aliases resolve once, and explicit full switching rebuilds every profile', async () => {
  await reset(); await requestAnalysis(); await api('/api/settings', { provider: 'codex', bridgeToken: 'bridge-test-token', codexModel: 'default', codexEffort: 'high' });
  await next(); assert.equal(calls[0].body.model, 'default');
  await api('/api/settings', { provider: 'qwen', qwenModel: 'global-other', codexModel: 'other-codex', codexEffort: 'low' });
  await finish();
  assert.ok(calls.slice(1).every(call => call.body.provider === 'codex' && call.body.model === 'resolved-model' && call.body.effort === 'high'));
  assert.equal(calls.length, 3); await next(); assert.equal(calls.length, 3);
  await api('/api/tags/tag/paper-analysis', { mode: 'full', useCurrentModel: true }); calls = []; await finish();
  assert.equal(calls.length, 3); assert.ok(calls.every(call => call.body.model === 'global-other')); assert.equal((await analysis()).model.provider, 'qwen');
});

test('only requested analyses run regardless of the legacy automatic setting, and one click continues every stage', async () => {
  const store = fixture(); store.tags.unshift({ id: 'older', name: 'Older tag' });
  store.papers.push({ id: 'older-a', title: 'Older A', abstract: aText, tagIds: ['older'] }, { id: 'older-b', title: 'Older B', abstract: bText, tagIds: ['older'] });
  await reset({ store, auto: false }); assert.equal((await next()).processed, false);
  await api('/api/tags/tag/paper-analysis', {}); const first = await next(); assert.equal(first.tagId, 'tag');
  await finish(); assert.equal((await analysis()).status, 'ready'); assert.equal((await analysis('older')).progress.completed, 0);
  await api('/api/settings', { autoPaperGraphs: true });
  assert.equal((await next()).processed, false);
  assert.equal((await handleApi('/api/tags/older/paper-analysis')).autoUpdate, false);
  assert.equal((await analysis('older')).manualRequested, false);
  await api('/api/tags/tag/paper-analysis', { mode: 'full' });
  assert.equal((await next()).tagId, 'tag');
});

test('legacy automatic settings, source saves, and connection changes never authorize an unrequested report', async () => {
  await reset({ auto: true });
  assert.equal((await next()).processed, false);
  assert.deepEqual((await analysis()).coverage, { included: 0, total: 3, added: 3, changed: 0, removed: 0 });
  await api('/api/papers/a', { conversation: '保存新的方法理解并不等于请求模型处理。' }, 'PUT');
  await api('/api/settings', { qwenModel: 'updated-global-model', qwenKey: 'updated-test-key', autoPaperGraphs: true });
  assert.equal((await analysis()).manualRequested, false);
  assert.equal((await next()).processed, false); assert.equal(calls.length, 0);
  await requestAnalysis(); await finish();
  assert.equal(calls.length, 3); assert.equal((await analysis()).status, 'ready');
});

test('a failed manual run loses authorization, so later settings and source edits still require a new click', async () => {
  for (const change of [
    () => api('/api/settings', { qwenKey: 'replacement-key' }),
    () => api('/api/papers/b', { conversation: '修改后的个人理解只标记报告需要更新。' }, 'PUT')
  ]) {
    await reset(); await requestAnalysis(); await next();
    mockModel(() => { throw new Error('Backend temporarily unavailable'); });
    await next(); assert.equal((await analysis()).status, 'error');
    assert.equal((await analysis()).manualRequested, false);
    await change(); mockModel(); calls = [];
    assert.equal((await next()).processed, false); assert.equal(calls.length, 0);
    assert.equal((await analysis()).progress.completed, 1);
    await requestAnalysis(); await finish(); assert.equal(calls.length, 2);
    assert.equal((await analysis()).status, 'ready');
  }
  const legacy = await state(), tag = legacy.tags.find(tag => tag.id === 'tag');
  Object.assign(tag.paperAnalysis, { status: 'error', error: 'Legacy failure', manualRequested: true, needsSynthesis: true });
  reconcileTagAnalyses(legacy, { resetFailures: true });
  assert.equal(tag.paperAnalysis.status, 'queued');
  assert.equal(tag.paperAnalysis.manualRequested, false);
});

test('connection changes during a failing request do not turn the failed click into an automatic retry', async () => {
  await reset(); await requestAnalysis();
  let begin, release;
  const started = new Promise(resolve => begin = resolve), gate = new Promise(resolve => release = resolve);
  mockModel(async () => { begin(); await gate; throw new Error('Old connection failed'); });
  const pending = next(); await started;
  await api('/api/settings', { qwenKey: 'new-connection-key' }); release();
  const result = await pending;
  assert.equal(result.analysis.manualRequested, false); assert.equal(result.remaining, 0);
  calls = []; mockModel(); assert.equal((await next()).processed, false); assert.equal(calls.length, 0);
  await requestAnalysis(); await finish(); assert.equal(calls.length, 3);
});

test('settings reset a persisted legacy failure without reauthorizing its old manualRequested flag', async () => {
  await reset(); await requestAnalysis(); await next();
  const tag = (await state()).tags.find(tag => tag.id === 'tag');
  Object.assign(tag.paperAnalysis, { status: 'error', error: 'Legacy failure', manualRequested: true });
  // Simulate a record saved by the previous extension version, without an
  // import that would itself clear pending authorization. This DB is in-memory.
  const db = await new Promise((resolve, reject) => {
    const opening = indexedDB.open('paperTagLibrary');
    opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error);
  });
  const transaction = db.transaction('tags', 'readwrite');
  transaction.objectStore('tags').put(tag);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  await api('/api/settings', { qwenKey: 'replacement-legacy-key' }); calls = [];
  assert.equal((await analysis()).status, 'queued'); assert.equal((await analysis()).manualRequested, false);
  assert.equal((await next()).processed, false); assert.equal(calls.length, 0);
  await requestAnalysis(); await finish(); assert.equal(calls.length, 2);
});

test('adding a paper during an authorized step saves valid work but requires a new click before continuing', async () => {
  await reset(); await requestAnalysis();
  let begin, release;
  const started = new Promise(resolve => begin = resolve), gate = new Promise(resolve => release = resolve);
  mockModel(async payload => { begin(); await gate; return profileOutput(payload.paper); });
  const pending = next(); await started;
  await api('/api/papers', { title: 'New C', abstract: cText, manualTags: ['Evidence selection'], duplicateAction: 'create' });
  release(); const completed = await pending;
  assert.equal(completed.discarded, undefined); assert.equal(completed.remaining, 0);
  assert.equal(completed.analysis.progress.completed, 1);
  assert.equal(completed.analysis.manualRequested, false);
  assert.deepEqual(completed.analysis.coverage, { included: 0, total: 4, added: 4, changed: 0, removed: 0 });
  calls = []; mockModel(); assert.equal((await next()).processed, false); assert.equal(calls.length, 0);
  await requestAnalysis(); await finish(); assert.equal(calls.length, 3);
  assert.deepEqual((await analysis()).coverage, { included: 4, total: 4, added: 0, changed: 0, removed: 0 });
});

test('backup validation rejects forged provenance and incomplete result coverage while preserving valid partial progress', async () => {
  await reset(); await requestAnalysis(); await finish(); const backup = await handleApi('/api/export');
  const tag = backup.store.tags.find(tag => tag.id === 'tag');
  assert.equal(validateImportedTagAnalysis(backup.store, tag), true);
  const forged = structuredClone(backup); forged.store.tags.find(tag => tag.id === 'tag').paperAnalysis.resultProfiles[0].evidence[0].sourceType = 'clip';
  assert.equal(validateImportedTagAnalysis(forged.store, forged.store.tags.find(tag => tag.id === 'tag')), false);
  const omitted = structuredClone(backup), incomplete = omitted.store.tags.find(tag => tag.id === 'tag').paperAnalysis;
  incomplete.resultProfiles.pop(); incomplete.result.readingPath.pop(); assert.equal(validateImportedTagAnalysis(omitted.store, omitted.store.tags.find(tag => tag.id === 'tag')), false);
  await api('/api/import', backup); calls = []; await next(); assert.equal(calls.length, 0);
  await api('/api/papers/a', { conversation: '新的个人理解要求刷新方法画像。' }, 'PUT'); await requestAnalysis(); await next();
  const partial = await handleApi('/api/export'); await api('/api/import', partial); calls = [];
  assert.equal((await next()).processed, false); await requestAnalysis(); await finish();
  assert.equal(calls.length, 1); assert.equal(calls[0].payload.task, 'synthesize_tag_method_analysis');
});

test('synthesis validates evidence IDs without copied quotes and covers unavailable-material papers in the reading path', async () => {
  await reset(); await requestAnalysis(); await next(); await next(); const input = prepareTagAnalysis((await state()), (await state()).tags.find(tag => tag.id === 'tag'));
  const result = synthesisOutput(input.profiles); assert.ok(validateTagSynthesis(result, input.profiles));
  result.commonalities[0].evidenceIds[0] = 'invented:e1'; assert.throws(() => validateTagSynthesis(result, input.profiles), /证据/);
  const missing = synthesisOutput(input.profiles); missing.readingPath.pop(); assert.throws(() => validateTagSynthesis(missing, input.profiles), /覆盖/);
});

test('an incremental update explains changed understanding using the previous report and accumulated changed-paper IDs', async () => {
  await reset(); await requestAnalysis(); await finish(); const previous = (await analysis()).result;
  const c = (await api('/api/papers', { title: 'Selector C', abstract: cText, manualTags: ['Evidence selection'], duplicateAction: 'create' })).paper;
  await requestAnalysis();
  mockModel(payload => {
    if (payload.task === 'profile_saved_paper_method') return profileOutput(payload.paper);
    assert.deepEqual(payload.previousResult, previous); assert.deepEqual(payload.changedPaperIds, [c.id]); assert.deepEqual(payload.removedPaperIds, []);
    return { ...synthesisOutput(payload.profiles), updateSummary: '新增选择目标后，比较从触发时机扩展到证据排序目标；需要区分触发规则与选择损失的独立贡献。' };
  });
  await finish(); assert.match((await analysis()).lastUpdateSummary, /证据排序目标/); assert.deepEqual((await analysis()).pendingChangedPaperIds, []);
});
