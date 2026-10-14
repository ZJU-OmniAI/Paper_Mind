import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaperGraphRunner } from '../extension/paper-graph-worker.js';

function fixture(updateNext, options = {}) {
  const events = [];
  const runner = createPaperGraphRunner({ updateNext, debounce: async () => {},
    notify: async message => { events.push(message); },
    scheduleWake: async () => { events.push('armed'); },
    clearWake: async () => { events.push('cleared'); },
    keepAlive: () => { events.push('alive'); return () => events.push('stopped'); }, ...options });
  return { runner, events };
}

test('graph runner serializes work and keeps its durable wakeup for remaining batches', async () => {
  let calls = 0, running = 0;
  const { runner, events } = fixture(async () => {
    assert.equal(++running, 1);
    await Promise.resolve();
    running--;
    return { processed: true, remaining: 10 - ++calls, tagId: `tag-${calls}`, graph: { status: 'ready' } };
  });
  await Promise.all([runner.request(), runner.request(), runner.request()]);
  assert.equal(calls, 4);
  assert.ok(!events.includes('cleared'));
  assert.equal(events.filter(event => event?.type === 'paper-graphs-updated').length, 4);
  assert.equal(events.at(-1), 'stopped');
});

test('new source changes arriving during generation are drained even when previous response reports no remaining work', async () => {
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const { runner, events } = fixture(async () => {
    if (++calls === 1) { started(); await new Promise(resolve => { release = resolve; }); }
    return { processed: true, remaining: 0 };
  });
  const job = runner.request();
  await entered;
  const coalesced = runner.request();
  release();
  await Promise.all([job, coalesced]);
  assert.equal(calls, 2);
  assert.equal(events.filter(event => event === 'cleared').length, 1);
});

test('empty queues disarm the alarm while model errors preserve wakeups for other pending tags', async () => {
  const idle = fixture(async () => ({ processed: false, remaining: 0 }));
  await idle.runner.request({ recover: true });
  assert.ok(idle.events.includes('cleared'));
  let calls = 0;
  const failure = fixture(async () => { calls++; return { processed: true, remaining: 2, error: 'Weekly limit reached' }; });
  await failure.runner.request();
  assert.equal(calls, 1);
  assert.ok(!failure.events.includes('cleared'));
  assert.ok(failure.events.some(event => event?.error === 'Weekly limit reached'));
});

test('interrupted storage work keeps the alarm and propagates recovery on the next wakeup', async () => {
  const requests = [];
  const { runner, events } = fixture(async body => {
    requests.push(body);
    if (requests.length === 1) throw new Error('Storage interrupted');
    return { processed: false, remaining: 0 };
  });
  await runner.request();
  assert.ok(!events.includes('cleared'));
  assert.ok(events.some(event => event?.error === 'Storage interrupted'));
  await runner.request({ recover: true });
  assert.deepEqual(requests, [{ recover: false }, { recover: true }]);
  assert.ok(events.includes('cleared'));
});
