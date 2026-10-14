import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../extension/storage.js';
import { TAG_ANALYSIS_VISUAL_VERSION } from '../extension/tag-analysis.js';

const values = {}, locks = new Map();
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {} });
Object.defineProperty(navigator, 'locks', { value: { request(name, run) {
  const task = (locks.get(name) || Promise.resolve()).then(run); locks.set(name, task.catch(() => {})); return task;
} } });
globalThis.chrome = { storage: { local: {
  async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); },
  async set(data) { Object.assign(values, structuredClone(data)); }, async remove(key) { delete values[key]; }
} }, runtime: { async sendMessage() {} } };
const api = (path, body) => handleApi(path, { method: 'POST', body });
const next = () => api('/api/paper-analyses/update-next', {});
const current = async () => (await handleApi('/api/tags/topic/paper-analysis')).analysis;
const request = () => api('/api/tags/topic/paper-analysis', {});
const calls = [];

function resultFor(input) {
  if (input.task === 'profile_saved_paper_method') return {
    researchQuestion: '检索何时触发？', approach: '保存材料中的检索策略。', mechanism: '使用触发条件控制检索。',
    distinctiveChoice: '比较触发时机。', tradeoffs: '查询成本需要实测。', personalTake: '笔记中的判断属于个人假设。',
    evidence: [{ paperId: input.paper.paperId, quote: (input.paper.notes || input.paper.abstract).slice(0, 120) }]
  };
  return { overview: '比较检索触发时机和查询成本；效果仍需实验验证。', commonalities: [], differences: [], inspirations: [],
    readingPath: input.profiles.map(profile => ({ paperId: profile.paperId, reason: '阅读该方法的触发机制。' })), openQuestions: [] };
}

async function reset() {
  values.paperTagConfig = {};
  await api('/api/settings', { provider: 'codex', bridgeToken: 'test-only-token', codexModel: 'fixture-model', codexEffort: 'xhigh', autoPaperGraphs: true });
  await api('/api/import', { tags: [{ id: 'topic', name: 'Topic' }], papers: [
    { id: 'a', title: 'A', tagIds: ['topic'], abstract: 'A saved retrieval mechanism triggers only when uncertain.', conversation: '完整个人笔记：需要验证触发条件。'.repeat(15000), clips: [{ markdown: '完整剪藏机制材料。'.repeat(18000) + 'END_CLIP' }] },
    { id: 'b', title: 'B', tagIds: ['topic'], abstract: 'Another saved mechanism always retrieves before decoding.' }
  ] });
  calls.length = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body), input = JSON.parse(body.messages[1].content); calls.push({ body, input });
    return { ok: true, status: 200, json: async () => ({ content: JSON.stringify(resultFor(input)), model: body.model }) };
  };
}

test('storage supplies stage-specific finite budgets while preserving full sources and the pinned xhigh model', async () => {
  await reset(); assert.equal((await next()).processed, false); await request();
  await next(); await next(); await next();
  assert.deepEqual(calls.map(call => call.body.timeoutMs), [600000, 600000, 900000]);
  assert.ok(calls.every(call => call.body.provider === 'codex' && call.body.model === 'fixture-model' && call.body.effort === 'xhigh'));
  assert.equal(calls[0].input.paper.notes, '完整个人笔记：需要验证触发条件。'.repeat(15000));
  assert.equal(calls[0].input.paper.clips[0], '完整剪藏机制材料。'.repeat(18000) + 'END_CLIP');
  assert.equal((await current()).status, 'ready');
});

test('a manual visual upgrade only resynthesizes legacy reports, retains their snapshot, and never repeats without new work', async () => {
  await reset(); await request(); await next(); await next(); await next();
  const backup = await handleApi('/api/export');
  delete backup.store.tags.find(tag => tag.id === 'topic').paperAnalysis.result.visualVersion;
  await api('/api/import', backup); calls.length = 0;
  const old = await current(), snapshot = structuredClone(old.result), profiles = structuredClone(old.profiles);
  assert.equal(old.status, 'ready'); assert.equal((await next()).processed, false); assert.equal(calls.length, 0);
  await request();
  const queued = await current();
  assert.equal(queued.status, 'queued'); assert.equal(queued.needsSynthesis, true); assert.equal(queued.stale, true);
  assert.deepEqual(queued.result, snapshot); assert.deepEqual(queued.profiles, profiles);
  const successfulModel = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body), input = JSON.parse(body.messages[1].content); calls.push({ body, input });
    return { ok: true, status: 200, json: async () => ({ error: '本机模型执行超过 900 秒 / Local model timed out', code: 'MODEL_TIMEOUT' }) };
  };
  await next();
  const failed = await current();
  assert.equal(failed.status, 'error'); assert.match(failed.error, /综合比较失败.*900 秒/);
  assert.deepEqual(failed.result, snapshot); assert.deepEqual(failed.profiles, profiles);
  assert.equal((await next()).processed, false); assert.equal(calls.length, 1);
  globalThis.fetch = successfulModel; await request(); await next();
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.input.task === 'synthesize_tag_method_analysis'));
  assert.equal(calls[0].body.timeoutMs, 900000); assert.deepEqual((await current()).profiles, profiles);
  assert.equal((await current()).result.visualVersion, TAG_ANALYSIS_VISUAL_VERSION);
  await request(); assert.equal((await next()).processed, false); assert.equal(calls.length, 2);
});
