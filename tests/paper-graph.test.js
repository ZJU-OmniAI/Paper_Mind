import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePaperGraphInput, reconcilePaperGraphs, validatePaperGraph, generatePaperGraph, graphCoverage, validPaperGraphCache, PAPER_GRAPH_POLICY_VERSION } from '../extension/paper-graph.js';
import { handleApi } from '../extension/storage.js';

const sourceA = 'We retrieve evidence from a document collection.';
const sourceB = 'We retrieve supporting passages from saved documents.';
const fixture = () => ({ papers: [
  { id: 'a', title: 'Paper A', tagIds: ['tag'], abstract: sourceA },
  { id: 'b', title: 'Paper B', tagIds: ['tag'], clips: [{ id: 'bclip', markdown: sourceB }] },
  { id: 'empty', title: 'No saved text', tagIds: ['tag'] }
], tags: [{ id: 'tag', name: 'Retrieval' }], meta: {} });
const output = () => ({ summary: '保存材料支持方法之间的相似性，第三篇缺少材料。', edges: [{
  source: 'a', target: 'b', type: 'similar_method', methodAspect: '检索机制', explanation: '两者均从文档集合检索支撑材料；第二篇依据剪藏。', confidence: 0.8,
  evidence: [{ paperId: 'a', quote: sourceA }, { paperId: 'b', quote: sourceB }]
}] });

test('graph keeps all nodes and sends complete personal notes, memory, abstracts and clips without truncation', async () => {
  const store = fixture();
  const notes = '私有笔记完整内容'.repeat(24000) + '\nFINAL_NOTE';
  store.papers[0].abstract = notes + sourceA;
  store.papers[0].conversation = notes + '\nFINAL_PERSONAL_NOTE'; store.papers[0].memory = '个人记忆线索必须参与方法比较'; store.papers[0].links = [{ url: 'https://example.com', previewDescription: 'DO_NOT_SEND_LINK' }];
  store.papers[0].clips = Array.from({ length: 14 }, (_, index) => ({ id: `clip${index}`, markdown: `  # Clip ${index}\n` + 'saved text '.repeat(2000) + `\nEND_${index}`, sourceUrl: `https://example.com/${index}` }));
  for (let i = 0; i < 11; i++) store.papers.push({ id: `more${i}`, title: `More ${i}`, tagIds: ['tag'], abstract: 'Additional saved evidence.' });
  store.papers.push({ id: 'outside', title: 'Other tag', tagIds: ['other'], abstract: 'Out of scope' });
  const input = preparePaperGraphInput(store, store.tags[0]);
  assert.equal(input.nodes.length, 14);
  assert.ok(input.nodes.some(node => node.paperId === 'empty'));
  await generatePaperGraph(input, async messages => {
    const payload = JSON.parse(messages[1].content);
    assert.equal(payload.papers.length, 13);
    assert.match(JSON.stringify(payload.papers.find(paper => paper.paperId === 'a')), /FINAL_NOTE/);
    assert.equal(payload.papers.find(paper => paper.paperId === 'a').abstract, notes + sourceA);
    assert.equal(payload.papers.find(paper => paper.paperId === 'a').notes, notes + '\nFINAL_PERSONAL_NOTE');
    assert.equal(payload.papers.find(paper => paper.paperId === 'a').memory, '个人记忆线索必须参与方法比较');
    assert.doesNotMatch(messages[1].content, /DO_NOT_SEND_LINK/);
    assert.match(messages[0].content, /Prioritize.*personal notes/);
    assert.match(JSON.stringify(payload.papers.find(paper => paper.paperId === 'a')), /END_13/);
    assert.ok(messages[1].content.length > 140000);
    assert.ok(!messages[1].content.includes('quoteTexts'));
    return { content: output(), meta: { provider: 'codex', requestedModel: 'gpt-6-astra', responseModel: 'gpt-6-astra', effort: 'high' } };
  });
});

test('graph validation rejects invented endpoints, duplicate relations, fabricated quotes and section-header evidence', () => {
  const input = preparePaperGraphInput(fixture(), fixture().tags[0]);
  const valid = output();
  assert.equal(validatePaperGraph(valid, input).edges.length, 1);
  assert.deepEqual(validatePaperGraph({ summary: 'No supported relations.', edges: [] }, input).edges, []);
  const cases = [
    value => value.edges[0].source = 'unknown',
    value => value.edges[0].target = 'a',
    value => value.edges[0].target = 'empty',
    value => value.edges[0].type = 'cites',
    value => value.edges[0].confidence = 1.1,
    value => delete value.edges[0].methodAspect,
    value => value.edges[0].evidence[1].quote = 'Invented finding from a paper',
    value => value.edges[0].evidence[1].paperId = 'a',
    value => value.edges[0].evidence[0].quote = '[abstract]',
    value => value.edges.push({ ...value.edges[0], source: 'b', target: 'a' })
  ];
  for (const mutate of cases) { const value = structuredClone(valid); mutate(value); assert.throws(() => validatePaperGraph(value, input)); }
  const punctuationStore = fixture(); punctuationStore.papers[0].abstract += '\n------\n';
  const punctuation = output(); punctuation.edges[0].evidence[0].quote = '------';
  assert.throws(() => validatePaperGraph(punctuation, preparePaperGraphInput(punctuationStore, punctuationStore.tags[0])));
});

test('source identity excludes generated descriptions, progress and citations; stale edges are pruned on membership changes', () => {
  const store = fixture(); const tag = store.tags[0];
  const first = preparePaperGraphInput(store, tag).fingerprint;
  Object.assign(store.papers[0], { readingStatus: 'read', updatedAt: new Date().toISOString(), citationCount: 429, valueScore: 5 });
  Object.assign(tag, { description: 'Generated tag explanation', descriptionStatus: 'ready' });
  assert.equal(preparePaperGraphInput(store, tag).fingerprint, first);
  tag.paperGraph = { ...output(), ...graphCoverage(preparePaperGraphInput(store, tag)), status: 'ready', fingerprint: first };
  store.papers[0].abstract += ' Changed method detail.';
  reconcilePaperGraphs(store);
  assert.equal(tag.paperGraph.status, 'queued'); assert.equal(tag.paperGraph.stale, true); assert.equal(tag.paperGraph.edges.length, 1);
  store.papers = store.papers.filter(paper => paper.id !== 'a');
  reconcilePaperGraphs(store);
  assert.equal(tag.paperGraph.status, 'insufficient'); assert.equal(tag.paperGraph.nodes.length, 2); assert.equal(tag.paperGraph.edges.length, 0);
});

const values = {}, messages = [], locks = new Map();
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {} });
Object.defineProperty(globalThis.navigator, 'locks', { value: { request(name, fn) {
  const pending = (locks.get(name) || Promise.resolve()).then(fn); locks.set(name, pending.catch(() => {})); return pending;
} } });
globalThis.chrome = { storage: { local: {
  async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); },
  async set(value) { Object.assign(values, structuredClone(value)); },
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; }
} }, runtime: { sendMessage(message) { messages.push(message); return Promise.resolve(); } } };
const api = (path, body, method = 'POST') => handleApi(path, { method, body });
const state = () => handleApi('/api/state');
const graph = async (id = 'tag') => {
  try { return (await handleApi(`/api/tags/${id}/paper-graph`)).graph; }
  catch (error) { if (error.status === 404) return undefined; throw error; }
};
const next = () => api('/api/paper-graphs/update-next', {});
function mockModel(fn = () => output()) {
  globalThis.fetch = async (url, options) => {
    const content = JSON.stringify(await fn(JSON.parse(options.body), url));
    return { ok: true, json: async () => ({ model: 'mock-model', choices: [{ message: { content } }] }) };
  };
}
async function reset({ configured = true, auto = true, store = fixture() } = {}) {
  values.paperTagConfig = {};
  await api('/api/settings', { provider: 'qwen', qwenKey: configured ? 'test-graph-key' : '', autoPaperGraphs: auto });
  await api('/api/import', store); messages.length = 0; mockModel();
}

test('graph queue persists, complete generation is serialized and unchanged inputs do not generate again', async () => {
  await reset(); let calls = 0;
  mockModel(body => { calls++; const payload = JSON.parse(body.messages[1].content); assert.equal(payload.papers.length, 2); return output(); });
  assert.equal((await graph()).status, 'queued');
  const results = await Promise.all([next(), next(), next()]);
  assert.equal(calls, 1); assert.equal(results.filter(result => result.processed).length, 1);
  assert.equal((await graph()).status, 'ready'); assert.equal((await graph()).stale, false);
  assert.equal((await graph()).model.requestedModel, 'qwen3.7-max');
  const messagesBefore = messages.length;
  await next(); await handleApi('/api/tags/tag/paper-graph'); await state();
  assert.equal(messages.length, messagesBefore);
  await api('/api/papers/a', { readingStatus: 'read', valueScore: 5 }, 'PUT');
  await next(); assert.equal(calls, 1);
  assert.ok(!JSON.stringify(await handleApi('/api/export')).includes('test-graph-key'));
});

test('disabled auto updates require explicit queue, while unconfigured/insufficient graphs never call a model', async () => {
  await reset({ auto: false }); let calls = 0; mockModel(() => { calls++; return output(); });
  assert.equal((await next()).processed, false); assert.equal(calls, 0);
  const queued = await api('/api/tags/tag/paper-graph', {});
  assert.equal(queued.graph.status, 'queued'); assert.equal(queued.autoUpdate, false); assert.equal(calls, 0);
  await next(); assert.equal(calls, 1); assert.equal((await graph()).manualRequested, false);
  await api('/api/papers/a', { abstract: sourceA + ' New method detail.' }, 'PUT');
  assert.equal((await next()).processed, false); assert.equal(calls, 1);
  await reset({ configured: false }); mockModel(() => { throw new Error('Must not be called'); });
  assert.equal((await graph()).status, 'unconfigured'); assert.equal((await next()).configured, false);
  assert.equal((await graph('system-unsorted')).status, 'insufficient');
  await api('/api/settings', { qwenKey: 'new-test-key' }); mockModel();
  assert.equal((await next()).processed, true); assert.equal((await graph()).status, 'ready');
});

test('failure retains prior edges as stale and waits for explicit retry or changed backend settings', async () => {
  await reset(); await next(); let calls = 0;
  await api('/api/tags/tag/paper-graph', { mode: 'full' });
  assert.equal((await graph()).stale, true);
  mockModel(() => { calls++; throw new Error('Quota exceeded'); });
  const failed = await next(); assert.match(failed.error, /Quota/);
  assert.equal((await graph()).status, 'error'); assert.equal((await graph()).stale, true); assert.equal((await graph()).edges.length, 1);
  await next(); assert.equal(calls, 1);
  await api('/api/settings', { autoPaperGraphs: true }); await next(); assert.equal(calls, 1);
  await api('/api/settings', { qwenModel: 'other-model' }); await next(); assert.equal(calls, 1);
  await api('/api/settings', { qwenKey: 'replacement-key' }); mockModel(); await next();
  assert.equal((await graph()).status, 'ready'); assert.equal((await graph()).model.requestedModel, 'qwen3.7-max');
  let finalCalls = 0; mockModel(() => { finalCalls++; return output(); });
  await api('/api/settings', { qwenModel: 'another-model' }); await next(); assert.equal(finalCalls, 0);
});

test('source edits during inference discard stale results and preserve newly queued complete sources', async () => {
  await reset(); let begin, release;
  const started = new Promise(resolve => begin = resolve), gate = new Promise(resolve => release = resolve);
  mockModel(async () => { begin(); await gate; return output(); });
  const pending = next(); await started;
  assert.equal((await graph()).status, 'running');
  await api('/api/papers/a', { abstract: sourceA + ' Updated mechanism detail.' }, 'PUT');
  release(); const discarded = await pending;
  assert.equal(discarded.discarded, true); assert.equal(discarded.remaining, 1); assert.equal((await graph()).status, 'queued');
  mockModel(body => { assert.match(JSON.parse(body.messages[1].content).papers.find(paper => paper.paperId === 'a').abstract, /Updated mechanism/); return output(); });
  await next(); assert.equal((await graph()).status, 'ready');
});

test('tag deletion and same-source import cannot be overwritten by an in-flight graph result', async () => {
  for (const mutate of [() => api('/api/tags/tag', undefined, 'DELETE'), () => api('/api/import', fixture())]) {
    await reset(); let begin, release;
    const started = new Promise(resolve => begin = resolve), gate = new Promise(resolve => release = resolve);
    mockModel(async () => { begin(); await gate; return output(); });
    const pending = next(); await started; await mutate(); release();
    assert.equal((await pending).discarded, true);
    assert.notEqual((await graph())?.status, 'ready');
  }
});

test('new papers and tag merges queue the complete new membership, deleting a paper removes all its graph references', async () => {
  await reset(); await next();
  await api('/api/papers', { title: 'Paper C', abstract: 'Additional documents enable comparisons.', manualTags: ['Other'], duplicateAction: 'create' });
  const before = await state(); const other = before.tags.find(tag => tag.name === 'Other');
  await api('/api/tags/merge', { canonical: 'Retrieval', tags: ['Other'] });
  assert.equal((await graph()).status, 'queued'); assert.equal((await graph()).nodes.length, 4); assert.equal((await graph(other.id)), undefined);
  mockModel(body => { assert.equal(JSON.parse(body.messages[1].content).papers.length, 3); return { summary: 'New paper has no supported link.', edges: [] }; }); await next();
  await api('/api/papers/a', undefined, 'DELETE');
  assert.equal((await graph()).nodes.some(node => node.paperId === 'a'), false);
  assert.equal((await graph()).edges.some(edge => edge.source === 'a' || edge.target === 'a'), false);
});

test('automatic abstract translation and reading progress do not invalidate an original-abstract graph', async () => {
  await reset(); await next();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ translation: '我们从文档集合中检索证据。' }) } }] }) });
  await api('/api/papers/a/translate-abstract', {});
  assert.equal((await graph()).status, 'ready');
  await api('/api/papers/a', { readingStatus: 'read' }, 'PUT');
  assert.equal((await graph()).status, 'ready');
});

test('persisted interrupted jobs recover once, then stop until explicit retry', async () => {
  await reset();
  await api('/api/tags/tag/paper-graph', {});
  async function simulateCrash(recoveryCount) {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('paperTagLibrary'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tags', 'readwrite'), tags = tx.objectStore('tags'), request = tags.get('tag');
      request.onsuccess = () => { const tag = request.result; Object.assign(tag.paperGraph, { status: 'running', recoveryCount, attemptId: 'terminated-worker' }); tags.put(tag); };
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close();
  }
  await simulateCrash(0); assert.equal((await next()).processed, true); assert.equal((await graph()).status, 'ready');
  await simulateCrash(1); assert.equal((await next()).processed, false); assert.equal((await graph()).status, 'error');
  await api('/api/tags/tag/paper-graph', {}); await next(); assert.equal((await graph()).status, 'ready');
});

const sourceC = 'A retrieval module selects documents before generation.';
const sourceD = 'An evidence selector ranks documents using learned scores.';
const edge = (source, target, first, second) => ({ source, target, type: 'complementary', methodAspect: '证据选择模块', explanation: '两个具体证据选择模块具有互补设计；组合效果仍是待验证假设。', confidence: 0.75, evidence: [{ paperId: source, quote: first }, { paperId: target, quote: second }] });
async function addGraphPaper(title, abstract) {
  return (await api('/api/papers', { title, abstract, manualTags: ['Retrieval'], duplicateAction: 'create' })).paper;
}

test('adding two papers analyzes only new-to-old and new-to-new pairs, retaining the old edge byte for byte', async () => {
  await reset(); await next();
  const initial = await graph(), oldEdge = JSON.stringify(initial.edges[0]);
  const c = await addGraphPaper('Paper C', sourceC), d = await addGraphPaper('Paper D', sourceD);
  const pending = await graph();
  assert.equal(pending.updateMode, 'incremental'); assert.equal(pending.pendingPairCount, 5);
  assert.deepEqual([...pending.changedPaperIds].sort(), [c.id, d.id].sort());
  mockModel(body => {
    const input = JSON.parse(body.messages[1].content);
    assert.equal(input.updateMode, 'incremental'); assert.equal(input.pairsToAnalyze.length, 5);
    assert.ok(!input.pairsToAnalyze.some(pair => pair.includes('a') && pair.includes('b')));
    assert.ok(input.pairsToAnalyze.some(pair => pair.includes(c.id) && pair.includes(d.id)));
    assert.equal(JSON.stringify(input.previousGraph.edges[0]), oldEdge);
    return { summary: '本轮只新增两个模块关系。', edges: [edge('a', c.id, sourceA, sourceC), edge(c.id, d.id, sourceC, sourceD)] };
  });
  assert.equal((await next()).processed, true);
  const updated = await graph();
  assert.equal(JSON.stringify(updated.edges.find(item => item.source === 'a' && item.target === 'b')), oldEdge);
  assert.equal(updated.summary, initial.summary); assert.match(updated.lastUpdateSummary, /本轮/);
  assert.equal(Object.keys(updated.sourceFingerprints).length, 5); assert.ok(validPaperGraphCache(updated));
  assert.equal((await next()).processed, false);
});

test('incremental output cannot rewrite an old-old edge, and a successful no-edge delta is cached', async () => {
  await reset(); await next(); const original = JSON.stringify((await graph()).edges);
  const c = await addGraphPaper('Paper C', sourceC); let calls = 0;
  mockModel(() => { calls++; return output(); });
  const invalid = await next(); assert.match(invalid.error, /未变化/);
  assert.equal(JSON.stringify((await graph()).edges), original);
  await next(); assert.equal(calls, 1);
  await api('/api/tags/tag/paper-graph', {});
  mockModel(() => { calls++; return { summary: '新增方法的证据不足以连接。', edges: [] }; });
  await next(); assert.equal((await graph()).status, 'ready');
  assert.ok((await graph()).sourceFingerprints[c.id]); assert.ok((await graph()).sourceFingerprints.empty);
  assert.equal(JSON.stringify((await graph()).edges), original);
  await api('/api/tags/tag/paper-graph', {}); await next(); assert.equal(calls, 2);
});

test('changing one abstract recomputes its incident pairs; deletion only prunes without any model call', async () => {
  const store = fixture(); store.papers.push({ id: 'c', title: 'C', tagIds: ['tag'], abstract: sourceC });
  await reset({ store });
  const bc = edge('b', 'c', sourceB, sourceC);
  mockModel(() => ({ summary: 'Initial design comparison.', edges: [...output().edges, bc] }));
  await next(); const retained = JSON.stringify((await graph()).edges.find(item => item.source === 'b'));
  await api('/api/papers/a', { abstract: sourceA + ' A new retrieval objective is introduced.' }, 'PUT');
  assert.deepEqual((await graph()).changedPaperIds, ['a']);
  mockModel(body => {
    const input = JSON.parse(body.messages[1].content);
    assert.equal(input.pairsToAnalyze.length, 2); assert.ok(input.pairsToAnalyze.every(pair => pair.includes('a')));
    return { summary: 'A changed its training objective.', edges: [edge('a', 'c', sourceA, sourceC)] };
  });
  await next(); assert.equal(JSON.stringify((await graph()).edges.find(item => item.source === 'b')), retained);
  let calls = 0; mockModel(() => { calls++; throw new Error('Deletion must not call a model'); });
  await api('/api/papers/a', undefined, 'DELETE'); await next();
  assert.equal(calls, 0); assert.equal((await graph()).updateMode, 'prune');
  assert.equal(JSON.stringify((await graph()).edges[0]), retained); assert.equal((await graph()).edges.length, 1); assert.ok(!Object.hasOwn((await graph()).sourceFingerprints, 'a'));
});

test('title and reading-status edits during inference do not discard or strand a running graph', async () => {
  await reset(); let begin, release;
  const started = new Promise(resolve => begin = resolve), gate = new Promise(resolve => release = resolve);
  mockModel(async () => { begin(); await gate; return output(); });
  const pending = next(); await started;
  await api('/api/papers/a', { title: 'Renamed paper', readingStatus: 'read' }, 'PUT');
  release(); const result = await pending;
  assert.equal(result.discarded, undefined); assert.equal((await graph()).status, 'ready');
  assert.equal((await graph()).nodes.find(node => node.paperId === 'a').title, 'Renamed paper');
  assert.equal((await next()).processed, false);
});

test('same-policy imported graphs reuse valid coverage; changed source imports are incremental; legacy policy migrates once', async () => {
  await reset(); await next();
  const backup = await handleApi('/api/export'); let calls = 0;
  mockModel(() => { calls++; return { summary: 'Delta had no additional link.', edges: [] }; });
  await api('/api/import', backup); await next(); assert.equal(calls, 0);
  const changed = structuredClone(backup); changed.store.papers.find(paper => paper.id === 'a').abstract += ' A changed objective.';
  await api('/api/import', changed);
  assert.equal((await graph()).updateMode, 'incremental'); assert.deepEqual((await graph()).changedPaperIds, ['a']);
  await next(); assert.equal(calls, 1); assert.equal((await graph()).status, 'ready');
  const legacy = structuredClone(backup); delete legacy.store.tags.find(tag => tag.id === 'tag').paperGraph.sourceFingerprints;
  legacy.store.tags.find(tag => tag.id === 'tag').paperGraph.summary = 'OLD_NOTES_MUST_NOT_LEAK';
  await api('/api/import', legacy);
  mockModel(body => { calls++; const input = JSON.parse(body.messages[1].content); assert.equal(input.updateMode, 'full'); assert.equal(input.previousGraph, null); assert.doesNotMatch(body.messages[1].content, /OLD_NOTES_MUST_NOT_LEAK/); return output(); });
  await next(); await next(); assert.equal(calls, 2); assert.ok(validPaperGraphCache(await graph()));
  const invalid = await handleApi('/api/export'); invalid.store.tags.find(tag => tag.id === 'tag').paperGraph.edges[0].evidence[0].quote = 'Fabricated cached source quote';
  await api('/api/import', invalid); assert.equal((await graph()).updateMode, 'full');
});

test('incremental requests pin the actual previous provider/model/effort and use only that provider current connection', async () => {
  await reset();
  await api('/api/settings', { provider: 'codex', bridgeToken: 'bridge-key-one', codexModel: 'gpt-graph-old', codexEffort: 'high' });
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body); assert.equal(body.provider, 'codex'); assert.equal(body.model, 'gpt-graph-old'); assert.equal(body.effort, 'high');
    return { ok: true, json: async () => ({ content: JSON.stringify(output()), model: 'gpt-graph-old' }) };
  };
  await next();
  await api('/api/settings', { provider: 'qwen', qwenKey: 'qwen-key', qwenModel: 'qwen-current', codexModel: 'gpt-other', codexEffort: 'low', bridgeToken: 'bridge-key-two', bridgeUrl: 'http://127.0.0.1:39322' });
  await addGraphPaper('Paper C', sourceC);
  const status = await handleApi('/api/tags/tag/paper-graph');
  assert.equal(status.effectiveModel.provider, 'codex'); assert.equal(status.effectiveModel.requestedModel, 'gpt-graph-old'); assert.equal(status.effectiveModel.effort, 'high');
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body); assert.equal(url, 'http://127.0.0.1:39322/v1/generate'); assert.equal(options.headers.Authorization, 'Bearer bridge-key-two');
    assert.equal(body.provider, 'codex'); assert.equal(body.model, 'gpt-graph-old'); assert.equal(body.effort, 'high');
    return { ok: true, json: async () => ({ content: JSON.stringify({ summary: 'Only new-paper comparisons.', edges: [] }), model: 'gpt-graph-old' }) };
  };
  await next(); assert.equal((await graph()).model.provider, 'codex');
  await api('/api/settings', { clearBridgeToken: true }); await addGraphPaper('Paper D', sourceD);
  const unavailable = await handleApi('/api/tags/tag/paper-graph');
  assert.equal(unavailable.configured, false); assert.equal(unavailable.currentConfigured, true); assert.equal(unavailable.graph.status, 'error');
  let calls = 0; mockModel(() => { calls++; return output(); });
  await next(); assert.equal(calls, 0);
  await api('/api/tags/tag/paper-graph', { mode: 'full', useCurrentModel: true });
  mockModel((body, url) => { calls++; assert.match(url, /dashscope/); assert.equal(body.model, 'qwen-current'); return output(); });
  await next(); assert.equal(calls, 1); assert.equal((await graph()).model.provider, 'qwen');
});

test('unrelated global model changes do not retry pinned failures and explicit keep-model rebuild discards a failed override', async () => {
  await reset(); await next();
  await api('/api/tags/tag/paper-graph', { mode: 'full' }); let calls = 0;
  mockModel(() => { calls++; throw new Error('Pinned model quota exhausted'); }); await next();
  await api('/api/settings', { provider: 'codex', bridgeToken: 'new-global-bridge', codexModel: 'gpt-other', codexEffort: 'medium' });
  await next(); assert.equal(calls, 1);
  await api('/api/tags/tag/paper-graph', { mode: 'full', useCurrentModel: true });
  globalThis.fetch = async () => { calls++; throw new Error('New override backend unavailable'); }; await next();
  assert.equal((await graph()).model.provider, 'qwen');
  await api('/api/tags/tag/paper-graph', { mode: 'full', useCurrentModel: false });
  mockModel((body, url) => { assert.match(url, /dashscope/); assert.equal(body.model, 'qwen3.7-max'); return output(); });
  await next(); assert.equal((await graph()).status, 'ready'); assert.equal((await graph()).model.provider, 'qwen');
});

test('abstract fallback uses the complete saved translation only when the original is absent', () => {
  const store = fixture(); store.papers[0].abstractZh = '中文摘要完整内容';
  const first = preparePaperGraphInput(store, store.tags[0]);
  store.papers[0].abstractZh = '译文修订';
  assert.equal(preparePaperGraphInput(store, store.tags[0]).fingerprint, first.fingerprint);
  store.papers[0].abstract = '';
  const fallback = preparePaperGraphInput(store, store.tags[0]);
  assert.equal(fallback.papers.find(paper => paper.paperId === 'a').abstract, '译文修订');
  assert.notEqual(fallback.fingerprint, first.fingerprint);
  store.papers[0].abstractZh += '补充';
  assert.notEqual(preparePaperGraphInput(store, store.tags[0]).fingerprint, fallback.fingerprint);
});

test('an isolated new node is covered locally, while a clip Markdown edit queues only that endpoint', async () => {
  await reset(); await next(); const original = JSON.stringify((await graph()).edges);
  const isolated = await addGraphPaper('New title without material', '');
  let calls = 0; mockModel(() => { calls++; return { summary: 'No supported new edge.', edges: [] }; });
  await next(); assert.equal(calls, 0); assert.ok((await graph()).sourceFingerprints[isolated.id]);
  assert.equal(JSON.stringify((await graph()).edges), original);
  await api('/api/papers/b/clips/bclip', { markdown: sourceB + '\nAn added method section changes the evidence selector.' }, 'PUT');
  assert.deepEqual((await graph()).changedPaperIds, ['b']); assert.equal((await graph()).pendingPairCount, 1);
  await next(); assert.equal(calls, 1); assert.equal((await graph()).status, 'ready');
});
