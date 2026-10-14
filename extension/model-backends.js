import { validatedEffort } from './local-models.js';
import { bridgeResponseTimeoutMs } from './request-budget.js';
// The extension never launches processes itself. Only this authenticated loopback
// endpoint can dispatch the two supported local CLIs.
export const isLocalProvider = (provider) => ["claude", "codex"].includes(provider);
export const EXTRA_DEFAULTS = {
  bridgeUrl: "http://127.0.0.1:39321", bridgeToken: "",
  claudeModel: "default", codexModel: "default",
  claudeEffort: "default", codexEffort: "default",
  customKey: "", customModel: "", customBaseUrl: "https://api.openai.com/v1",
  customJsonMode: false
};

export function validatedBridgeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("本机桥接地址无效 / Invalid bridge URL"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("本机桥接地址必须是 http://127.0.0.1:端口 / Use a loopback bridge URL");
  }
  return url.origin;
}

export function extraConfig(config, body) {
  const next = { ...config };
  for (const field of ["bridgeUrl", "claudeModel", "codexModel", "customModel", "customBaseUrl"]) {
    if (typeof body[field] === "string") next[field] = body[field].trim();
  }
  for (const field of ["bridgeToken", "customKey"]) {
    if (typeof body[field] === "string" && body[field].trim()) next[field] = body[field].trim();
  }
  if (body.clearBridgeToken) next.bridgeToken = "";
  if (body.clearCustomKey) next.customKey = "";
  if (typeof body.customJsonMode === "boolean") next.customJsonMode = body.customJsonMode;
  next.bridgeUrl = validatedBridgeUrl(next.bridgeUrl);
  for (const field of ["claudeModel", "codexModel"]) {
    next[field] ||= "default";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(next[field])) throw new Error("本机模型名称无效 / Invalid local model name");
  }
  for (const provider of ["claude", "codex"]) {
    const field = provider + "Effort";
    next[field] = validatedEffort(provider, body[field] ?? next[field]);
  }
  return next;
}

export async function bridgeRequest(config, path, body) {
  if (!config.bridgeToken) throw new Error("请先启动 npm run bridge，并在模型设置中填写连接码 / Configure the local bridge first");
  const endpoint = `${validatedBridgeUrl(config.bridgeUrl)}${path}`;
  const signal = AbortSignal.timeout(body ? bridgeResponseTimeoutMs(body.timeoutMs) : 20000);
  let response, result;
  try {
    response = await fetch(endpoint, {
      method: body ? "POST" : "GET", redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.bridgeToken}` },
      ...(body ? { body: JSON.stringify(body) } : {}), signal
    });
    result = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid bridge response');
  } catch (error) {
    if (signal.aborted || error.name === "TimeoutError") throw new Error("本机服务响应超时，请检查模型状态后重试 / Local backend timed out; check model status and retry");
    if (response) throw new Error("本机服务响应中断或格式无效，请检查桥接日志后重试 / Bridge response was interrupted or invalid; check the bridge logs and retry");
    throw new Error("无法连接本机服务：macOS 可运行 npm run bridge:install；手动启动使用 npm run bridge / Start the bridge; on macOS, bridge:install enables autostart");
  }
  if (response.status === 404 && path.startsWith("/models")) throw new Error("请重启 npm run bridge 后刷新模型列表 / Restart npm run bridge to load models");
  if (!response.ok || result.error) throw new Error(result.error || `Bridge HTTP ${response.status}`);
  return result;
}
