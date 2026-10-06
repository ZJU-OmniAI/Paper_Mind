import { execFileSync } from 'node:child_process';
import { access, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadToken } from './server.mjs';

export const SERVICE_LABEL = 'org.paper-mind.bridge';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceDir = path.join(os.homedir(), '.paper-mind', 'service');
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);
const configPath = path.join(serviceDir, 'config.json');
const files = ['bridge/server.mjs', 'bridge/cli.mjs', 'bridge/models.mjs', 'extension/local-models.js'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const exists = async file => { try { await access(file); return true; } catch { return false; } };

export function serviceConfig({ env = process.env, previous = {}, node = process.execPath, home = os.homedir() } = {}) {
  const port = Number(env.PAPER_MIND_BRIDGE_PORT || previous.port || 39321);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid bridge port');
  const directory = env.PAPER_MIND_BRIDGE_DIR || previous.directory || path.join(home, '.paper-mind');
  if (!path.isAbsolute(directory) || !path.isAbsolute(node)) throw new Error('Use absolute service paths');
  const environment = {
    PATH: [...new Set([path.dirname(node), path.join(home, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':'),
    PAPER_MIND_BRIDGE_PORT: String(port), PAPER_MIND_BRIDGE_DIR: directory,
    PAPER_MIND_BRIDGE_MANAGED: '1'
  };
  for (const key of ['PAPER_MIND_CLAUDE_BIN', 'PAPER_MIND_CODEX_BIN']) {
    const value = env[key] || previous.environment?.[key];
    if (value) {
      if (!path.isAbsolute(value)) throw new Error(`${key} must be an absolute path`);
      environment[key] = value;
    }
  }
  return { node, port, directory, environment };
}

function xml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

export function servicePlist(config, directory) {
  const env = Object.entries(config.environment).map(([key, value]) => `<key>${xml(key)}</key><string>${xml(value)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${SERVICE_LABEL}</string>
<key>ProgramArguments</key><array><string>${xml(config.node)}</string><string>${xml(path.join(directory, 'runtime/bridge/server.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(path.join(directory, 'runtime'))}</string>
<key>EnvironmentVariables</key><dict>${env}</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>ProcessType</key><string>Background</string>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(path.join(directory, 'bridge.out.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(directory, 'bridge.err.log'))}</string>
</dict></plist>\n`;
}

function launchctl(...args) {
  return execFileSync('/bin/launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function isLoaded(target) {
  try { launchctl('print', target); return true; } catch { return false; }
}

export function bridgeHealth(port, token) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', headers: { Authorization: `Bearer ${token}` } }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; if (body.length > 65536) req.destroy(new Error('Unexpected health response')); });
      res.on('error', reject);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (res.statusCode !== 200 || result.ok !== true) throw new Error('Bridge health check failed');
          resolve(result);
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('Bridge health check timed out')));
    req.on('error', reject);
  });
}

async function portBusy(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve(false) : reject(error));
    socket.setTimeout(2000, () => socket.destroy(new Error('Port check timed out')));
  });
}

async function waitForHealth(config) {
  const token = (await readFile(path.join(config.directory, 'bridge-token'), 'utf8')).trim();
  for (let attempt = 0; attempt < 8; attempt++) {
    try { return await bridgeHealth(config.port, token); }
    catch (error) {
      if (error.code !== 'ECONNREFUSED' || attempt === 7) throw error;
      await delay(1000);
    }
  }
}

export async function manageService(action) {
  if (process.platform !== 'darwin') throw new Error('自动启动目前支持 macOS；其他系统请使用 npm run bridge / macOS only');
  if (!['install', 'status', 'restart', 'uninstall', 'token'].includes(action)) throw new Error('Use install, status, restart, uninstall, or token');
  const domain = `gui/${process.getuid()}`, target = `${domain}/${SERVICE_LABEL}`;
  const previous = await exists(configPath) ? JSON.parse(await readFile(configPath, 'utf8')) : {};
  const config = action === 'install' || !previous.node ? serviceConfig({ previous }) : previous;
  if (action === 'token') {
    console.log((await readFile(path.join(config.directory, 'bridge-token'), 'utf8')).trim());
    return;
  }
  if (action === 'uninstall') {
    if (isLoaded(target)) launchctl('bootout', target);
    await rm(plistPath, { force: true });
    console.log('已停用自动启动；保留连接码及设置 / Autostart removed; token and settings retained.');
    return;
  }
  if (action === 'install') {
    // Read all runtime files before stopping a working installation. A private
    // copy avoids depending on a moved checkout or macOS Desktop/Documents access.
    const runtime = await Promise.all(files.map(async name => [name, await readFile(path.join(root, name))]));
    if (!isLoaded(target) && await portBusy(config.port)) throw new Error(`端口 ${config.port} 已占用，请先停止正在手动运行的桥接 / Stop the existing manual bridge first`);
    if (isLoaded(target)) launchctl('bootout', target);
    for (let attempt = 0; attempt < 20 && await portBusy(config.port); attempt++) await delay(250);
    if (await portBusy(config.port)) throw new Error(`Port ${config.port} is still in use`);
    await mkdir(serviceDir, { recursive: true, mode: 0o700 });
    await chmod(serviceDir, 0o700);
    for (const [name, data] of runtime) {
      const destination = path.join(serviceDir, 'runtime', name);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, data, { mode: 0o600 });
    }
    await writeFile(path.join(serviceDir, 'runtime/package.json'), '{"type":"module"}\n', { mode: 0o600 });
    await loadToken(config.directory);
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    await mkdir(path.dirname(plistPath), { recursive: true });
    await writeFile(plistPath, servicePlist(config, serviceDir), { mode: 0o600 });
    await chmod(plistPath, 0o600);
    execFileSync('/usr/bin/plutil', ['-lint', plistPath], { stdio: 'pipe' });
    launchctl('enable', target);
    launchctl('bootstrap', domain, plistPath);
  } else if (action === 'restart') {
    if (!isLoaded(target)) throw new Error('请先运行 npm run bridge:install / Install the service first');
    launchctl('kickstart', '-k', target);
  } else if (!isLoaded(target)) {
    console.log('自动启动服务未运行，使用 npm run bridge:install 安装或恢复 / Service not loaded.');
    process.exitCode = 1;
    return;
  }
  const health = await waitForHealth(config);
  console.log(JSON.stringify({ service: SERVICE_LABEL, running: true, autostart: await exists(plistPath), url: `http://127.0.0.1:${config.port}`, backends: health.backends }, null, 2));
  if (action === 'install') console.log('已启用登录自启动与退出自动恢复，无需保持终端开启。连接码不变；首次配置可运行 npm run bridge:token 查看。\nAutostart and automatic recovery enabled. Existing token retained. Use npm run bridge:token for first-time setup.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  manageService(process.argv[2] || 'status').catch(error => { console.error(error.message); process.exitCode = 1; });
}
