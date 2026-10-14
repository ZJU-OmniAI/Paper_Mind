import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../extension/storage.js';

const values = {};
const locks = new Map();
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {} });
Object.defineProperty(globalThis.navigator, 'locks', { value: { request(name, run) {
  const next = (locks.get(name) || Promise.resolve()).then(run);
  locks.set(name, next.catch(() => {}));
  return next;
} } });
globalThis.chrome = { storage: { local: {
  async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); },
  async set(data) { Object.assign(values, structuredClone(data)); },
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; }
} }, runtime: { sendMessage() { return Promise.resolve(); } } };
const api = (path, body = {}, method = 'POST') => handleApi(path, { method, body });
const state = () => handleApi('/api/state');
const add = (title, manualTags, extra = {}) => api('/api/papers', { title, manualTags, duplicateAction: 'create', ...extra });
async function reset() {
  await api('/api/import', { papers: [], tags: [], topicPacks: [] });
  await api('/api/settings', { provider: 'qwen', qwenKey: 'test-only-key', autoDescribeTags: false });
}
function mockLLM(run) {
  globalThis.fetch = async (_url, options) => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(await run(JSON.parse(options.body))) } }] }) });
}
const suggestion = (canonical = 'RAG', tags = ['检索增强生成']) => ({ canonical, tags, confidence: 0.9, reason: 'Both describe retrieval-grounded generation in Paper A.' });

test('tag suggestions use paper evidence, preview unique papers and topic packs, and require explicit merge', async () => {
  await reset();
  await add('Paper A', ['RAG'], { abstract: 'Retrieval evidence grounds generation.', memory: '通过检索提供证据', conversation: '用户解释该概念' });
  await add('Paper B', ['检索增强生成']);
  await add('Paper C', ['RAG', '检索增强生成']);
  const before = await state();
  const rag = before.tags.find(tag => tag.name === 'RAG');
  await api('/api/topic-packs', { name: 'My research', includeTagIds: [rag.id] });
  mockLLM(body => {
    const catalog = JSON.parse(body.messages[1].content).tagCatalog;
    const paper = catalog.find(tag => tag.name === 'RAG').papers.find(paper => paper.title === 'Paper A');
    assert.match(paper.abstract, /Retrieval evidence/);
    assert.equal(paper.memory, '通过检索提供证据');
    assert.match(paper.notes, /用户解释/);
    return { merges: [{ ...suggestion(), aliases: ['invented-model-alias'] }] };
  });
  const result = await api('/api/tags/rebuild');
  assert.equal(result.llmUsed, true);
  assert.equal(result.merges.length, 1);
  const merge = result.merges[0];
  assert.equal(merge.impact.paperCount, 3);
  assert.equal(merge.impact.sharedPaperCount, 1);
  assert.deepEqual(merge.impact.topicPacks.map(pack => pack.name), ['My research']);
  assert.equal((await state()).tags.filter(tag => !tag.system).length, 2);
  assert.equal((await state()).meta.tagCuration.status, 'stale');
  // Changing the kept name during review preserves the same participant fingerprint.
  await api('/api/tags/merge', { ...merge, canonical: '检索增强生成', tags: ['RAG'] });
  const after = await state();
  const kept = after.tags.find(tag => !tag.system);
  assert.equal(after.papers.length, 3);
  assert.equal(kept.name, '检索增强生成');
  assert.ok(kept.aliases.includes('RAG'));
  assert.ok(!kept.aliases.includes('invented-model-alias'));
  assert.deepEqual(after.topicPacks[0].includeTagIds, [kept.id]);
});

test('malformed, invented and overlapping model suggestions cannot produce a false clean review', async () => {
  await reset();
  await add('Paper A', ['RAG', '检索增强生成', 'Retrieval generation']);
  mockLLM(() => ({ explanation: 'No valid schema' }));
  assert.equal((await api('/api/tags/rebuild')).llmUsed, false);
  assert.equal((await state()).meta.tagCuration.status, 'stale');
  mockLLM(() => ({ merges: [null, suggestion('Invented'), { ...suggestion(), confidence: 7 }] }));
  const invalid = await api('/api/tags/rebuild');
  assert.equal(invalid.llmUsed, false);
  assert.equal(invalid.rejected, 3);
  assert.equal((await state()).meta.tagCuration.status, 'stale');
  mockLLM(() => ({ merges: [suggestion(), suggestion('RAG', ['Retrieval generation'])] }));
  const overlap = await api('/api/tags/rebuild');
  assert.equal(overlap.merges.length, 1);
  assert.equal(overlap.rejected, 1);
});

test('review rejects changed paper evidence and newly affected topic packs without changing tags', async () => {
  await reset();
  const saved = await add('Paper A', ['RAG', '检索增强生成']);
  mockLLM(() => ({ merges: [suggestion()] }));
  const first = (await api('/api/tags/rebuild')).merges[0];
  await api(`/api/papers/${saved.paper.id}`, { memory: 'New meaning' }, 'PUT');
  await assert.rejects(api('/api/tags/merge', first), /已经更新/);
  const second = (await api('/api/tags/rebuild')).merges[0];
  await api('/api/topic-packs', { name: 'New affected pack', includeTagIds: [second.targetId] });
  await assert.rejects(api('/api/tags/merge', second), /已经更新/);
  assert.equal((await state()).tags.filter(tag => !tag.system).length, 2);
});

test('evidence edited while the model is running invalidates the response', async () => {
  await reset();
  const saved = await add('Paper A', ['RAG', '检索增强生成']);
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  mockLLM(async () => { started(); await gate; return { merges: [suggestion()] }; });
  const pending = api('/api/tags/rebuild');
  await ready;
  await api(`/api/papers/${saved.paper.id}`, { abstract: 'Changed evidence' }, 'PUT');
  release();
  const result = await pending;
  assert.equal(result.llmUsed, false);
  assert.deepEqual(result.merges, []);
  assert.match(result.error, /分析期间/);
});

test('overlapping batch confirmation is rejected atomically', async () => {
  await reset();
  await add('Paper A', ['RAG', '检索增强生成', 'Retrieval generation']);
  await assert.rejects(api('/api/tags/merge', { merges: [suggestion(), suggestion('RAG', ['Retrieval generation'])] }), /重复标签/);
  assert.equal((await state()).tags.filter(tag => !tag.system).length, 3);
});

test('independent reviewed groups stay valid when their papers and topic packs overlap', async () => {
  await reset();
  await add('Paper A', ['RAG', '检索增强生成', 'Agents', '智能体']);
  const before = await state();
  await api('/api/topic-packs', { name: 'Combined topic', includeTagIds: before.tags.filter(tag => !tag.system).map(tag => tag.id) });
  mockLLM(() => ({ merges: [suggestion(), suggestion('Agents', ['智能体'])] }));
  const result = await api('/api/tags/rebuild');
  assert.equal(result.merges.length, 2);
  await api('/api/tags/merge', result.merges[0]);
  await api('/api/tags/merge', result.merges[1]);
  const after = await state();
  assert.equal(after.tags.filter(tag => !tag.system).length, 2);
  assert.equal(after.topicPacks[0].includeTagIds.length, 2);
});

test('large tag catalogs retain every tag and evidence inside the bridge message budget', async () => {
  await reset();
  const tags = Array.from({ length: 40 }, (_, index) => ({
    id: `topic-${index}`, name: `Research topic ${index}`, aliases: [`Topic ${index}`], description: 'A detailed tag explanation. '.repeat(100)
  }));
  const papers = tags.flatMap(tag => Array.from({ length: 3 }, (_, index) => ({
    id: `${tag.id}-paper-${index}`, title: `${tag.name} paper ${index}: ` + 'Long title '.repeat(50), tagIds: [tag.id],
    abstract: 'Quoted "evidence" with a backslash \\ and newline\n'.repeat(200),
    memory: 'Remember this contribution. '.repeat(20), conversation: 'Extensive personal research notes. '.repeat(200)
  })));
  await api('/api/import', { papers, tags });
  let calls = 0;
  let request;
  mockLLM(body => { calls++; request = body; return { merges: [] }; });
  const result = await api('/api/tags/rebuild');
  assert.equal(result.llmUsed, true, result.error);
  assert.equal(calls, 1);
  assert.ok(request.messages.reduce((total, message) => total + message.content.length, 0) < 160000);
  const input = JSON.parse(request.messages[1].content);
  assert.ok(JSON.stringify(input.tagCatalog).length <= 120000);
  assert.equal(input.tagCatalog.length, 40);
  assert.deepEqual(new Set(input.tagCatalog.map(tag => tag.id)), new Set(tags.filter(tag => !tag.system).map(tag => tag.id)));
  assert.ok(input.tagCatalog.every(tag => tag.papers.length >= 1 && tag.papers.every(paper => paper.abstract.length > 0 && paper.notes.length > 0)));
  assert.ok(input.rules.some(rule => /截断/.test(rule)));
});

test('an oversized name-only catalog fails explicitly before calling the model', async () => {
  await reset();
  await api('/api/import', { papers: [{ id: 'paper-large-name', title: 'Paper', tagIds: ['tag-large-name'], abstract: 'Saved evidence.' }], tags: [{ id: 'tag-large-name', name: 'Imported long name '.repeat(7000) }] });
  let calls = 0;
  mockLLM(() => { calls++; return { merges: [] }; });
  const result = await api('/api/tags/rebuild');
  assert.equal(result.llmUsed, false);
  assert.match(result.error, /名称列表.*预算/);
  assert.equal(calls, 0);
});
