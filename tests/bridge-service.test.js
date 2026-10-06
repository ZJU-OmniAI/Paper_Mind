import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createBridge } from '../bridge/server.mjs';
import { serviceConfig, servicePlist, bridgeHealth } from '../bridge/service.mjs';

test('service installation preserves configured endpoints without copying model secrets into launchd', () => {
  const previous = { port: 40444, directory: '/Users/example/private bridge', environment: { PAPER_MIND_CLAUDE_BIN: '/opt/bin/claude' } };
  const config = serviceConfig({ previous, node: '/opt/node/bin/node', home: '/Users/example', env: { ANTHROPIC_API_KEY: 'must-not-copy', PAPER_MIND_BRIDGE_TOKEN: 'also-private', PATH: '/untrusted/shell/path' } });
  assert.equal(config.port, 40444); assert.equal(config.directory, previous.directory);
  assert.equal(config.environment.PAPER_MIND_CLAUDE_BIN, '/opt/bin/claude');
  assert.match(config.environment.PATH, /^\/opt\/node\/bin:/);
  assert.ok(!JSON.stringify(config).includes('must-not-copy'));
  assert.ok(!JSON.stringify(config).includes('also-private'));
  assert.ok(!config.environment.PATH.includes('/untrusted'));
  assert.throws(() => serviceConfig({ env: { PAPER_MIND_BRIDGE_PORT: '80' } }), /port/);
  assert.throws(() => serviceConfig({ env: { PAPER_MIND_CODEX_BIN: 'codex --unsafe' } }), /absolute/);
});

test('launchd receives separate escaped path arguments and a durable private runtime, not a shell command', () => {
  const config = serviceConfig({ env: {}, node: '/Users/A & B/Node/node', home: '/Users/A & B' });
  const plist = servicePlist(config, '/Users/A & B/.paper-mind/service');
  assert.match(plist, /<string>\/Users\/A &amp; B\/Node\/node<\/string>/);
  assert.match(plist, /runtime\/bridge\/server\.mjs/);
  assert.match(plist, /<key>KeepAlive<\/key><true\/>/);
  assert.match(plist, /<key>Umask<\/key><integer>63<\/integer>/);
  assert.ok(!plist.includes('/bin/sh'));
});

test('managed-service health checks require the existing token and never invoke generation', async t => {
  let generations = 0;
  const token = 'a'.repeat(64);
  const server = createBridge({ token, inspect: async () => ({ ok: true, backends: { codex: { status: 'ready' } } }), run: async () => { generations++; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.stop());
  const port = server.address().port;
  assert.equal((await bridgeHealth(port, token)).backends.codex.status, 'ready');
  await assert.rejects(bridgeHealth(port, 'wrong-token'), /health check failed/);
  assert.equal(generations, 0);
});
