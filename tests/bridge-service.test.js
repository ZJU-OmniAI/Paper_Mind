import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createBridge } from '../bridge/server.mjs';
import { serviceConfig, servicePlist, bridgeHealth, SERVICE_RUNTIME_FILES } from '../bridge/service.mjs';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('the managed runtime includes every imported timeout policy dependency', async t => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), 'paper-mind-service-files-'));
  t.after(() => rm(runtime, { recursive: true, force: true }));
  await writeFile(path.join(runtime, 'package.json'), '{"type":"module"}');
  for (const file of SERVICE_RUNTIME_FILES) {
    const destination = path.join(runtime, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(new URL('../' + file, import.meta.url), destination);
  }
  const server = await import(pathToFileURL(path.join(runtime, 'bridge/server.mjs')).href);
  assert.equal(typeof server.createBridge, 'function');
  const budget = await import(pathToFileURL(path.join(runtime, 'extension/request-budget.js')).href);
  assert.equal(budget.tagAnalysisTimeoutMs('synthesis'), 900000);
});

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
  assert.throws(() => serviceConfig({ env: { PAPER_MIND_BRIDGE_MAX_REQUEST_MB: '0' } }), /MAX_REQUEST/);
  const largeSources = serviceConfig({ env: { PAPER_MIND_BRIDGE_MAX_REQUEST_MB: '96' } });
  assert.equal(largeSources.environment.PAPER_MIND_BRIDGE_MAX_REQUEST_MB, '96');
  assert.equal(serviceConfig({ env: {}, previous: largeSources }).environment.PAPER_MIND_BRIDGE_MAX_REQUEST_MB, '96');
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

test('managed service preserves proxy settings across reinstall without copying credentials or app internals', () => {
  const proxies = {
    HTTP_PROXY: 'http://127.0.0.1:8080', http_proxy: 'http://127.0.0.1:8081',
    HTTPS_PROXY: 'http://127.0.0.1:8082', https_proxy: 'http://127.0.0.1:8083',
    ALL_PROXY: 'socks5://127.0.0.1:8084', all_proxy: 'socks5://127.0.0.1:8085',
    NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1,::1'
  };
  const privateEnvironment = {
    OPENAI_API_KEY: 'never-copy-openai', ANTHROPIC_API_KEY: 'never-copy-anthropic',
    PAPER_MIND_BRIDGE_TOKEN: 'never-copy-token', CODEX_HOME: '/private/codex-home',
    CODEX_APP_TOOLS_PIPE_PATH: '/private/app-socket', UNRELATED_SETTING: 'never-copy-unrelated'
  };
  const installed = serviceConfig({ env: { ...proxies, ...privateEnvironment } });
  for (const [key, value] of Object.entries(proxies)) assert.equal(installed.environment[key], value);
  for (const key of Object.keys(privateEnvironment)) assert.ok(!Object.hasOwn(installed.environment, key));
  const reinstalled = serviceConfig({ env: {}, previous: { ...installed, environment: { ...installed.environment, ...privateEnvironment } } });
  for (const [key, value] of Object.entries(proxies)) assert.equal(reinstalled.environment[key], value);
  for (const key of Object.keys(privateEnvironment)) assert.ok(!Object.hasOwn(reinstalled.environment, key));
  const plist = servicePlist(reinstalled, '/Users/example/.paper-mind/service');
  assert.match(plist, /<key>https_proxy<\/key><string>http:\/\/127\.0\.0\.1:8083<\/string>/);
  assert.doesNotMatch(plist, /never-copy|private\/app-socket|private\/codex-home/);
});

test('current proxy spelling replaces stale opposite-case values and empty values clear saved proxy pairs', () => {
  const pairs = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'];
  for (const upper of pairs) {
    const lower = upper.toLowerCase();
    const previous = { environment: { [upper]: 'old-upper', [lower]: 'old-lower' } };
    for (const current of [upper, lower]) {
      const opposite = current === upper ? lower : upper;
      const replaced = serviceConfig({ env: { [current]: 'current-value' }, previous });
      assert.equal(replaced.environment[current], 'current-value');
      assert.ok(!Object.hasOwn(replaced.environment, opposite));
      const cleared = serviceConfig({ env: { [current]: '' }, previous });
      assert.ok(!Object.hasOwn(cleared.environment, upper));
      assert.ok(!Object.hasOwn(cleared.environment, lower));
      const reinstalled = serviceConfig({ env: {}, previous: cleared });
      assert.ok(!Object.hasOwn(reinstalled.environment, upper));
      assert.ok(!Object.hasOwn(reinstalled.environment, lower));
    }
  }
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
