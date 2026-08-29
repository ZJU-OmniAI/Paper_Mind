import { handleApi } from "./storage.js";
import { archiveClipImages } from "./clip-archive.js";

const DAILY_BACKUP_ALARM = "daily-json-backup";
const BACKUP_META_KEY = "paperTagDailyBackupMeta";
const BACKUP_HOUR = 16;
const BACKUP_MINUTE = 0;
const ALARM_DRIFT_TOLERANCE_MS = 60 * 1000;

function todayString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function backupTimeFor(date = new Date()) {
  const backupTime = new Date(date);
  backupTime.setHours(BACKUP_HOUR, BACKUP_MINUTE, 0, 0);
  return backupTime;
}

function nextBackupTime(from = new Date()) {
  const backupTime = backupTimeFor(from);
  if (backupTime <= from) {
    backupTime.setDate(backupTime.getDate() + 1);
  }
  return backupTime;
}

function isPastBackupTime(date = new Date()) {
  return date >= backupTimeFor(date);
}

async function scheduleDailyBackup() {
  const existing = await chrome.alarms.get(DAILY_BACKUP_ALARM);
  const nextTime = nextBackupTime();
  if (existing && Math.abs((existing.scheduledTime || 0) - nextTime.getTime()) < ALARM_DRIFT_TOLERANCE_MS) {
    return;
  }
  if (existing) {
    await chrome.alarms.clear(DAILY_BACKUP_ALARM);
  }
  await chrome.alarms.create(DAILY_BACKUP_ALARM, {
    when: nextTime.getTime()
  });
}

async function shouldBackupNow() {
  const values = await chrome.storage.local.get([BACKUP_META_KEY]);
  const meta = values[BACKUP_META_KEY] || {};
  const now = new Date();
  if (meta.lastDate === todayString()) return false;
  return isPastBackupTime(now);
}

async function markBackupComplete() {
  await chrome.storage.local.set({
    [BACKUP_META_KEY]: {
      lastDate: todayString(),
      lastBackupAt: new Date().toISOString()
    }
  });
}

// Chrome 把 URL 长度卡在 2MB，中文用 encodeURIComponent 一个字要 9 个字符，
// 库大一点（尤其存了网页剪藏正文）就会超限导致备份静默失败；base64 只涨 1/3。
function jsonDataUrl(json) {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:application/json;base64,${btoa(binary)}`;
}

async function runDailyBackup() {
  if (!(await shouldBackupNow())) return;
  const payload = await handleApi("/api/export");
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const url = jsonDataUrl(json);
  if (url.length > 2 * 1024 * 1024) {
    console.warn("论文库已超过每日自动备份的体积上限，请到管理页手动导出 JSON");
    return;
  }
  await chrome.downloads.download({
    url,
    filename: `Paper_Mind-backup-${todayString()}.json`,
    saveAs: false,
    conflictAction: "uniquify"
  });
  await markBackupComplete();
}

/* ----- 新论文自动生成 LLM 相似推荐 ----- */

// 连续添加多篇时排队串行执行，避免并发写库互相覆盖
let autoRecommendQueue = Promise.resolve();

// LLM 一次要跑几十秒，期间每 20 秒调一次扩展 API 重置 service worker
// 的 30 秒空闲计时，避免后台中途被杀导致推荐丢失
function startKeepAlive() {
  const timer = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000);
  return () => clearInterval(timer);
}

async function autoRecommendForPaper(paperId) {
  const stopKeepAlive = startKeepAlive();
  try {
    const result = await handleApi(`/api/papers/${encodeURIComponent(paperId)}/similar-llm`, { method: "POST" });
    // 只有真的调通模型并落库时才广播；模型没配 key 或调用失败时静默跳过
    if (result?.llmUsed && result.paper) {
      chrome.runtime
        .sendMessage({ type: "auto-recommend-similar-done", paperId, paper: result.paper })
        .catch(() => {});
    }
  } catch (err) {
    console.warn("自动相似推荐失败", paperId, err?.message || err);
  } finally {
    stopKeepAlive();
  }
}

async function autoTranslateForPaper(paperId) {
  const stopKeepAlive = startKeepAlive();
  try {
    const result = await handleApi(`/api/papers/${encodeURIComponent(paperId)}/translate-abstract`, { method: "POST" });
    if (result?.translated && result.paper) {
      chrome.runtime
        .sendMessage({ type: "auto-translate-abstract-done", paperId, paper: result.paper })
        .catch(() => {});
    }
  } catch (err) {
    console.warn("自动翻译摘要失败", paperId, err?.message || err);
  } finally {
    stopKeepAlive();
  }
}

/* ----- 网页剪藏：把正文里的图片存成磁盘上的真实文件 ----- */

const OFFSCREEN_URL = "offscreen.html";

// 存图必须在后台做：popup 保存完就关了，在 popup 里下载会被中途掐断。
// 具体流程在 clip-archive.js（跑在这个 SW 里，因为只有这里能用 chrome.downloads），
// 其中"把 Blob 变成一个可下载的地址"这一步 SW 干不了，转交给 offscreen 文档。
let offscreenReady = null;

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) return;
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ["BLOBS"],
        justification: "把剪藏正文里的图片写成本地文件"
      })
      .catch((err) => {
        // 并发调用时可能已经被别的任务建好了，这种报错忽略
        if (!String(err?.message || err).includes("Only a single offscreen")) throw err;
      })
      .finally(() => {
        offscreenReady = null;
      });
  }
  await offscreenReady;
}

async function runClipArchive(paperId, { clipId = "", refresh = false } = {}) {
  const stopKeepAlive = startKeepAlive();
  try {
    await ensureOffscreen();
    const result = await archiveClipImages(paperId, { clipId, refresh });
    if (result.archived) {
      chrome.runtime
        .sendMessage({
          type: "clip-archive-images-done",
          paperId,
          paper: result.paper,
          saved: result.saved,
          total: result.total,
          status: result.status,
          dir: result.dir,
          error: result.error
        })
        .catch(() => {});
    }
  } catch (err) {
    const reason = err?.message || String(err);
    console.warn("剪藏图片存档失败", paperId, reason);
    // 写进论文记录：不然失败只在 service worker 控制台里，用户永远看不到
    if (clipId) {
      await handleApi(`/api/papers/${encodeURIComponent(paperId)}/clips/${encodeURIComponent(clipId)}/assets`, {
        method: "PUT",
        body: JSON.stringify({ status: "error", error: `图片存盘失败：${reason}` })
      }).catch(() => {});
    }
    chrome.runtime.sendMessage({ type: "clip-archive-images-failed", paperId, error: reason }).catch(() => {});
  } finally {
    stopKeepAlive();
  }
}

// 存图必须和 LLM 任务分开排队：LLM 一跑几十秒，挤在同一条队列里存图会被拖到
// service worker 被回收，任务就永远停在 pending 了
let clipArchiveQueue = Promise.resolve();

function queueClipArchive(paperId, { clipId = "", refresh = false } = {}) {
  clipArchiveQueue = clipArchiveQueue.then(() => runClipArchive(paperId, { clipId, refresh }));
  return clipArchiveQueue;
}

// 上次没存成的（service worker 中途被杀、Chrome 关掉等）在这里补上，不然会一直卡着
async function sweepPendingClipArchives() {
  try {
    const state = await handleApi("/api/state");
    const pending = (state.papers || [])
      .filter((paper) => (paper.clips || []).some((clip) => clip.imageCount && clip.assetStatus === "pending"))
      .slice(0, 10);
    for (const paper of pending) queueClipArchive(paper.id);
  } catch (err) {
    console.warn("补跑剪藏图片存档失败", err?.message || err);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target === "offscreen") return;
  if (message?.type === "clip-archive-sweep") {
    sweepPendingClipArchives();
    return;
  }
  if (!message?.paperId) return;
  if (message.type === "auto-translate-abstract") {
    autoRecommendQueue = autoRecommendQueue.then(() => autoTranslateForPaper(message.paperId));
  } else if (message.type === "auto-recommend-similar") {
    autoRecommendQueue = autoRecommendQueue.then(() => autoRecommendForPaper(message.paperId));
  } else if (message.type === "clip-archive-images") {
    queueClipArchive(message.paperId, { clipId: message.clipId || "", refresh: Boolean(message.refresh) });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  scheduleDailyBackup();
  sweepPendingClipArchives();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleDailyBackup();
  runDailyBackup().catch(() => {});
  sweepPendingClipArchives();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== DAILY_BACKUP_ALARM) return;
  runDailyBackup()
    .catch(() => {})
    .finally(() => {
      scheduleDailyBackup().catch(() => {});
    });
});

scheduleDailyBackup().catch(() => {});
