import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeRequest } from '../extension/model-backends.js';
import { bridgeResponseTimeoutMs, generationTimeoutMs, tagAnalysisTimeoutMs } from '../extension/request-budget.js';

const config = { bridgeUrl: 'http://127.0.0.1:39321', bridgeToken: 'synthetic-token' };

test('topic deadlines include bounded queue time without changing model, effort or full inputs', async t => {
  const deadlines = [], requests = [];
  t.mock.method(AbortSignal, 'timeout', value => { deadlines.push(value); return new AbortController().signal; });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    requests.push(options.body ? JSON.parse(options.body) : null);
    return { ok: true, status: 200, json: async () => ({ content: 'ok' }) };
  });
  assert.equal(generationTimeoutMs(), 300000);
  assert.equal(tagAnalysisTimeoutMs('profiles'), 600000);
  assert.equal(tagAnalysisTimeoutMs('synthesis'), 900000);
  assert.equal(bridgeResponseTimeoutMs(900000), 1030000);
  const messages = [{ role: 'user', content: '完整个人笔记'.repeat(30000) }];
  for (const phase of ['profiles', 'synthesis']) {
    const body = { provider: 'codex', model: 'test-model', effort: 'xhigh', messages, timeoutMs: tagAnalysisTimeoutMs(phase) };
    await bridgeRequest(config, '/v1/generate', body);
    assert.deepEqual(requests.at(-1), body);
  }
  await bridgeRequest(config, '/v1/generate', {});
  await bridgeRequest(config, '/health');
  assert.deepEqual(deadlines, [730000, 1030000, 430000, 20000]);
  const calls = requests.length;
  for (const timeoutMs of [0, 999, 900001, Infinity, '900000', null]) {
    await assert.rejects(bridgeRequest(config, '/v1/generate', { timeoutMs }), /Invalid model execution timeout/);
  }
  assert.equal(requests.length, calls);
});

test('bridge distinguishes unreachable service from interrupted, malformed and timed-out response bodies', async t => {
  const fetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = fetch; });
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(bridgeRequest(config, '/health'), /无法连接本机服务/);
  for (const error of [new SyntaxError('Invalid JSON'), new TypeError('terminated')]) {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw error; } });
    await assert.rejects(bridgeRequest(config, '/v1/generate', {}), /响应中断或格式无效/);
  }
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new DOMException('timed out reading heartbeat response', 'TimeoutError'); } });
  await assert.rejects(bridgeRequest(config, '/v1/generate', {}), /响应超时/);
  for (const result of [null, [], 'invalid']) {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => result });
    await assert.rejects(bridgeRequest(config, '/health'), /响应中断或格式无效/);
  }
});

test('bridge preserves actionable quota errors after an HTTP 200 heartbeat and rejects bad config before fetching', async t => {
  const fetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = fetch; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ error: '本周模型额度已用尽。重置时间：3pm (Asia/Shanghai)' }) }; };
  await assert.rejects(bridgeRequest(config, '/v1/generate', {}), /本周模型额度已用尽.*3pm/);
  await assert.rejects(bridgeRequest({ ...config, bridgeUrl: 'https://example.org' }, '/health'), /本机桥接地址必须/);
  await assert.rejects(bridgeRequest({ ...config, bridgeToken: '' }, '/health'), /Configure the local bridge first/);
  assert.equal(calls, 1);
  const result = { content: '{"ok":true}', model: 'test-model' };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => result });
  assert.deepEqual(await bridgeRequest(config, '/v1/generate', {}), result);
});
