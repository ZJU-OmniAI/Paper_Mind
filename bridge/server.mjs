import http from 'node:http';
import { getModels } from './models.mjs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { generate, health, validateRequest } from './cli.mjs';

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

export function createBridge({ token, run = generate, inspect = health, list = getModels } = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('Bridge token must contain at least 32 characters');
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
    if (active >= 8) return reply(429, { error: '本机模型正在处理其他请求，请稍后重试 / Bridge busy; retry shortly' });
    active++;
    const controller = new AbortController(); controllers.add(controller);
    let heartbeat;
    let acquired = false;
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) { reply(413, { error: 'Request too large' }); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = validateRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { return reply(400, { error: error.message }); }
      // Send headers promptly: extension service workers limit how long a fetch
      // can wait for its first response. JSON permits leading whitespace.
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.write(' ');
      heartbeat = setInterval(() => { if (!res.destroyed) res.write('\n'); }, 15000);
      if (running >= 2) await new Promise((resolve, reject) => {
        const entry = { resolve: () => { controller.signal.removeEventListener('abort', abort); resolve(); } };
        const abort = () => { const index = waiting.indexOf(entry); if (index >= 0) waiting.splice(index, 1); reject(new Error('Request cancelled')); };
        waiting.push(entry);
        controller.signal.addEventListener('abort', abort, { once: true });
        if (controller.signal.aborted) abort();
      });
      else running++;
      acquired = true;
      const result = await run(body, controller.signal);
      reply(200, result);
    } catch (error) { reply(502, { error: error.message || 'Local model failed' }); }
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
