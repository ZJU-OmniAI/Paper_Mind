import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnCli, resolveCli, killTree } from './cli.mjs';
import { EFFORTS } from '../extension/local-models.js';

// Only capability requests, never a user message or generation. Bound both
// runtime and total output, and reap the child before deleting its workspace.
export async function probeModels(provider, { timeout = 12000 } = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'paper-mind-models-'));
  try {
    return await new Promise((resolve, reject) => {
      const args = provider === 'claude'
        ? ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
          '--permission-mode', 'dontAsk', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
          '--disable-slash-commands', '--tools', '', '--no-session-persistence', '--settings', '{"disableAllHooks":true}']
        : ['app-server'];
      const child = spawnCli(resolveCli(provider), args, cwd);
      let buffer = '', bytes = 0, finished = false, result, failure;
      const models = [], cursors = new Set();
      const finish = (data, error) => {
        if (finished) return;
        finished = true; result = data; failure = error;
        clearTimeout(timer); killTree(child, 'SIGKILL');
      };
      const timer = setTimeout(() => finish(null, new Error('模型目录读取超时 / Model catalog timed out')), timeout);
      const send = data => { if (!finished) child.stdin.write(JSON.stringify(data) + '\n'); };
      child.stdin.on('error', () => {});
      child.stderr.resume();
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        if (finished) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > 1024 * 1024) return finish(null, new Error('模型目录过大 / Model catalog too large'));
        buffer += chunk;
        let end;
        while (!finished && (end = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let message; try { message = JSON.parse(line); } catch { continue; }
          if (provider === 'claude') {
            if (message.type === 'control_response' && message.response?.request_id === 'models') {
              const data = message.response?.response?.models;
              finish(Array.isArray(data) ? data : null);
            }
          } else if (message.id === 1) {
            if (message.error) return finish(null);
            send({ jsonrpc: '2.0', method: 'initialized' });
            send({ jsonrpc: '2.0', id: 2, method: 'model/list', params: { includeHidden: false } });
          } else if (message.id === 2) {
            if (!Array.isArray(message.result?.data)) return finish(null);
            models.push(...message.result.data.filter(item => !item.hidden));
            const cursor = message.result.nextCursor;
            if (!cursor) return finish(models);
            if (cursors.has(cursor) || cursors.size >= 20) return finish(null);
            cursors.add(cursor);
            send({ jsonrpc: '2.0', id: 2, method: 'model/list', params: { includeHidden: false, cursor } });
          }
        }
      });
      child.on('error', () => finish(null, new Error('未找到或无法启动 CLI / CLI unavailable')));
      child.on('close', () => {
        clearTimeout(timer);
        if (Array.isArray(result) && result.length) resolve(result);
        else reject(failure || new Error('CLI 未提供模型目录，请检查登录或升级 CLI / Check CLI login or update the CLI'));
      });
      send(provider === 'claude'
        ? { type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } }
        : { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'paper-mind', version: '1.5.1' } } });
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

export function normalizeModels(provider, data) {
  const models = new Map();
  for (const item of data) {
    const id = provider === 'claude' ? item.value : item.model || item.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(id) || id === 'default') continue;
    const levels = provider === 'codex' ? item.supportedReasoningEfforts : item.supportedEffortLevels ?? (item.supportsEffort === false || data.some(model => model.supportsEffort === true) && !item.supportsEffort ? [] : undefined);
    const efforts = Array.isArray(levels) ? [...new Set(levels.map(e => typeof e === 'string' ? e : e?.reasoningEffort).filter(e => EFFORTS[provider].includes(e)))] : undefined;
    models.set(id, { id, label: String(item.displayName || id).slice(0, 200),
      description: String(item.description || '').slice(0, 500),
      ...(efforts ? { efforts } : {}) });
  }
  return [...models.values()];
}

let cache, inflight;
export function getModels(force = false) {
  if (inflight) return inflight;
  if (!force && cache && Date.now() - cache.at < 5 * 60 * 1000) return Promise.resolve(cache.data);
  inflight = Promise.all(['claude', 'codex'].map(async provider => {
    try {
      const models = normalizeModels(provider, await probeModels(provider));
      if (!models.length) throw new Error('CLI 返回空模型目录 / Empty model catalog');
      return [provider, { models, source: 'cli', updatedAt: new Date().toISOString() }];
    } catch (error) { return [provider, { error: error.message }]; }
  })).then(entries => {
    const data = Object.fromEntries(entries);
    cache = { at: Date.now(), data };
    return data;
  }).finally(() => { inflight = null; });
  return inflight;
}
