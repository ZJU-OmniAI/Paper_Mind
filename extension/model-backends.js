// The extension never launches processes itself. Only this authenticated loopback
// endpoint can dispatch the two supported local CLIs.
export const isLocalProvider = (provider) => ["claude", "codex"].includes(provider);
export const EXTRA_DEFAULTS = {
  bridgeUrl: "http://127.0.0.1:39321", bridgeToken: "",
  claudeModel: "default", codexModel: "default",
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
  return next;
}

export async function bridgeRequest(config, path, body) {
  if (!config.bridgeToken) throw new Error("请先启动 npm run bridge，并在模型设置中填写连接码 / Configure the local bridge first");
  let response;
  try {
    response = await fetch(`${validatedBridgeUrl(config.bridgeUrl)}${path}`, {
      method: body ? "POST" : "GET", redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.bridgeToken}` },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(body ? 310000 : 20000)
    });
  } catch (error) {
    throw new Error(error.name === "TimeoutError" ? "本机模型调用超时 / Local model timed out" : "无法连接本机服务，请在项目目录运行 npm run bridge / Start the local bridge");
  }
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || `Bridge HTTP ${response.status}`);
  return result;
}
