// Shared by the extension client and local bridge so waiting for a CLI slot
// cannot consume the model's execution budget. These are finite per-step limits.
export const DEFAULT_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;
export const MAX_GENERATION_TIMEOUT_MS = 15 * 60 * 1000;
export const BRIDGE_QUEUE_TIMEOUT_MS = 2 * 60 * 1000;
export const BRIDGE_RESPONSE_GRACE_MS = 10 * 1000;

export function generationTimeoutMs(value = DEFAULT_GENERATION_TIMEOUT_MS) {
  if (!Number.isSafeInteger(value) || value < 1000 || value > MAX_GENERATION_TIMEOUT_MS) {
    throw new Error('模型执行时限无效（须为 1 秒至 15 分钟） / Invalid model execution timeout');
  }
  return value;
}

export function tagAnalysisTimeoutMs(phase) {
  return phase === 'synthesis' ? MAX_GENERATION_TIMEOUT_MS : 10 * 60 * 1000;
}

// A comparison or fusion reads up to eight complete saved papers in one request;
// follow-up chat and exploration rounds keep the ordinary execution limit.
export function researchTimeoutMs(stage) {
  return stage === 'create' ? 10 * 60 * 1000 : DEFAULT_GENERATION_TIMEOUT_MS;
}

export function bridgeResponseTimeoutMs(timeoutMs) {
  return generationTimeoutMs(timeoutMs) + BRIDGE_QUEUE_TIMEOUT_MS + BRIDGE_RESPONSE_GRACE_MS;
}
