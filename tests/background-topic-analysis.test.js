import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../extension/storage.js';

test('background startup and source wakeups never analyze a topic until the user requests it', async () => {
  const values = {}, locks = new Map(), listeners = [], alarms = new Map(), broadcasts = [];
  if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {} });
  Object.defineProperty(navigator, 'locks', { value: { request(name, run) {
    const job = (locks.get(name) || Promise.resolve()).then(run);
    locks.set(name, job.catch(() => {}));
    return job;
  } } });
  const event = { addListener() {} };
  globalThis.chrome = {
    storage: { local: {
      async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); },
      async set(data) { Object.assign(values, structuredClone(data)); },
      async remove(key) { delete values[key]; }
    } },
    runtime: {
      id: 'manual-topic-test', onInstalled: event, onStartup: event,
      onMessage: { addListener(fn) { listeners.push(fn); } },
      getPlatformInfo(callback) { callback?.({}); },
      async sendMessage(message) {
        broadcasts.push(message);
        for (const listener of listeners) listener(message, { id: 'manual-topic-test' });
      }
    },
    alarms: {
      onAlarm: event,
      async get(name) { return alarms.get(name); },
      async create(name, options) { alarms.set(name, options); },
      async clear(name) { return alarms.delete(name); }
    },
    downloads: {}
  };
  const post = (path, body) => handleApi(path, { method: 'POST', body });
  let modelCalls = 0;
  globalThis.fetch = async () => {
    modelCalls++;
    throw new Error('Test model is unavailable');
  };
  await post('/api/settings', { provider: 'qwen', qwenKey: 'test-only-key', autoDescribeTags: false, autoPaperGraphs: true });
  await post('/api/import', {
    papers: [
      { id: 'one', title: 'First paper', tagIds: ['topic'], abstract: 'The first method selects evidence before inference.' },
      { id: 'two', title: 'Second paper', tagIds: ['topic'], abstract: 'The second method selects evidence during inference.' }
    ],
    tags: [{ id: 'topic', name: 'Evidence selection' }]
  });
  const waitFor = async predicate => {
    const deadline = Date.now() + 5000;
    while (!await predicate()) {
      if (Date.now() > deadline) throw new Error('Background topic task did not settle');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  await import('../extension/background.js');
  await waitFor(() => broadcasts.some(message => message.type === 'paper-analyses-updated'));
  assert.equal(modelCalls, 0, 'the legacy automatic flag must not start model work');
  assert.equal(alarms.has('paper-analyses-update'), false);

  const previousNotifications = broadcasts.length;
  // Older extensions can still send the legacy graph wakeup after a source edit.
  await handleApi('/api/papers/one', { method: 'PUT', body: { conversation: 'A new personal note changes the comparison.' } });
  await chrome.runtime.sendMessage({ type: 'auto-update-paper-graphs' });
  await waitFor(() => broadcasts.slice(previousNotifications).some(message => message.type === 'paper-analyses-updated'));
  assert.equal(modelCalls, 0, 'saving sources and legacy wakeups must remain read-only for the model');
  assert.equal(alarms.has('paper-analyses-update'), false);

  await post('/api/tags/topic/paper-analysis', {});
  await waitFor(() => broadcasts.some(message => message.type === 'paper-analyses-updated' && message.error));
  assert.equal(modelCalls, 1, 'clicking the manual action starts one model step');
  const { analysis } = await handleApi('/api/tags/topic/paper-analysis');
  assert.equal(analysis.status, 'error');
  assert.equal(analysis.manualRequested, false, 'failure must require another explicit click');
  assert.equal(alarms.has('paper-analyses-update'), false);
});
