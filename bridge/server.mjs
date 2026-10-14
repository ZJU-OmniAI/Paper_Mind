import http from 'node:http';
import { getModels } from './models.mjs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { generate, health, validateRequest } from './cli.mjs';
import { BRIDGE_QUEUE_TIMEOUT_MS } from '../extension/request-budget.js';

export function bridgeRequestLimitBytes(value = 32) {
  const bytes = Number(value) * 1024 * 1024;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('Invalid PAPER_MIND_BRIDGE_MAX_REQUEST_MB');
  return bytes;
}

export async function loadToken(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'bridge-token');
  try { await writeFile(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await chmod(file, 0o600);
  const token = (await readFile(file, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid bridge-token file');
  return token;
}

export function createBridge({ token, run = generate, inspect = health, list = getModels,
  maxRequestBytes = bridgeRequestLimitBytes(process.env.PAPER_MIND_BRIDGE_MAX_REQUEST_MB),
  queueTimeoutMs = BRIDGE_QUEUE_TIMEOUT_MS } = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('Bridge token must contain at least 32 characters');
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes <= 0) throw new Error('Invalid bridge request byte limit');
  if (!Number.isSafeInteger(queueTimeoutMs) || queueTimeoutMs <= 0 || queueTimeoutMs > BRIDGE_QUEUE_TIMEOUT_MS) throw new Error('Invalid bridge queue timeout');
  let active = 0;
  let running = 0;
  const waiting = [];
  const controllers = new Set();
  const server = http.createServer(async (req, res) => {
    const reply = (status, data) => {
      if (res.destroyed) return;
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    const port = server.address()?.port;
    const origin = req.headers.origin;
    if (req.headers.host !== `127.0.0.1:${port}` || (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))) return reply(403, { error: 'Origin or host rejected' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.writeHead(204); return res.end();
    }
    const given = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return reply(401, { error: '连接码不正确，请复制启动终端里的连接码 / Incorrect bridge token' });
    if (req.method === 'GET' && req.url === '/health') {
      try { return reply(200, await inspect()); } catch { return reply(503, { error: 'CLI 检测失败 / CLI check failed' }); }
    }
    if (req.method === 'GET' && ['/models', '/models?refresh=1'].includes(req.url)) {
      try { return reply(200, await list(req.url.includes('refresh=1'))); }
      catch { return reply(503, { error: '模型目录读取失败 / Model catalog unavailable' }); }
    }
    if (req.method !== 'POST' || req.url !== '/v1/generate') return reply(404, { error: 'Not found' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415, { error: 'Use application/json' });
    const rejectLargeRequest = () => {
      req.resume();
      reply(413, { error: `桥接请求超过 ${maxRequestBytes / 1024 / 1024} MiB 传输保护，资料未截断。可调高 PAPER_MIND_BRIDGE_MAX_REQUEST_MB 后重启桥接（自动启动服务需重新安装） / Bridge request exceeds the transport limit; no source was truncated. Increase PAPER_MIND_BRIDGE_MAX_REQUEST_MB and restart or reinstall the managed bridge.` });
    };
    if (Number(req.headers['content-length']) > maxRequestBytes) return rejectLargeRequest();
    if (active >= 8) return reply(429, { error: '本机模型正在处理其他请求，请稍后重试 / Bridge busy; retry shortly' });
    active++;
    const controller = new AbortController(); controllers.add(controller);
    const startedAt = Date.now();
    let heartbeat, body, phase = 'request';
    let acquired = false;
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > maxRequestBytes) return rejectLargeRequest();
        chunks.push(chunk);
      }
      try { body = validateRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { return reply(400, { error: error.message }); }
      // Send headers promptly: extension service workers limit how long a fetch
      // can wait for its first response. JSON permits leading whitespace.
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.write(' ');
      heartbeat = setInterval(() => { if (!res.destroyed) res.write('\n'); }, 15000);
      phase = 'queue';
      if (running >= 2) await new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); };
        const fail = error => { const index = waiting.indexOf(entry); if (index >= 0) waiting.splice(index, 1); cleanup(); reject(error); };
        const entry = { resolve: () => { cleanup(); resolve(); } };
        const abort = () => fail(Object.assign(new Error('Request cancelled'), { code: 'REQUEST_CANCELLED' }));
        const timer = setTimeout(() => fail(Object.assign(new Error('等待本机模型空闲超时；此请求尚未执行，请稍后手动重试 / Local model queue timed out before execution; retry later'), { code: 'QUEUE_TIMEOUT' })), queueTimeoutMs);
        waiting.push(entry);
        controller.signal.addEventListener('abort', abort, { once: true });
        if (controller.signal.aborted) abort();
      });
      else running++;
      acquired = true;
      phase = 'generation';
      const result = await run(body, controller.signal);
      reply(200, result);
    } catch (error) {
      const code = ['MODEL_TIMEOUT', 'QUEUE_TIMEOUT', 'REQUEST_CANCELLED'].includes(error.code) ? error.code : 'LOCAL_MODEL_FAILED';
      // Only operational metadata: never prompts, credentials, CLI output, or
      // provider error text (which can contain parts of the submitted sources).
      if (code !== 'REQUEST_CANCELLED') console.warn('[Paper Mind bridge] request failed', { provider: body?.provider || '', phase, elapsedMs: Date.now() - startedAt, code });
      reply(502, { error: error.message || 'Local model failed', code });
    }
    finally {
      clearInterval(heartbeat); active--; controllers.delete(controller);
      if (acquired) running--;
      while (running < 2 && waiting.length) { running++; waiting.shift().resolve(); }
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => controllers.forEach(controller => controller.abort()));
  server.stop = () => { controllers.forEach(controller => controller.abort()); server.close(); server.closeAllConnections(); };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PAPER_MIND_BRIDGE_PORT || 39321);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid bridge port');
  const token = await loadToken(process.env.PAPER_MIND_BRIDGE_DIR || path.join(os.homedir(), '.paper-mind'));
  const server = createBridge({ token });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口已被占用 / Port in use. Set PAPER_MIND_BRIDGE_PORT to another port.' : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Paper_Mind 本机模型桥接 / Local model bridge\n地址 / URL: http://127.0.0.1:${port}`);
    if (process.env.PAPER_MIND_BRIDGE_MANAGED === '1') console.log('后台服务运行中；连接码沿用本机配置 / Managed service; using the saved local token.');
    else console.log(`连接码 / Token: ${token}\n在插件「模型设置」填入地址和连接码，然后检测连接。手动模式需保持终端运行；macOS 可用 npm run bridge:install 开启自动启动。`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.stop());
}
