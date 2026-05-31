import { handleApi } from "./storage.js";

const DAILY_BACKUP_ALARM = "daily-json-backup";
const BACKUP_META_KEY = "paperTagDailyBackupMeta";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function todayString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function scheduleDailyBackup() {
  const existing = await chrome.alarms.get(DAILY_BACKUP_ALARM);
  if (existing) return;
  await chrome.alarms.create(DAILY_BACKUP_ALARM, {
    delayInMinutes: 5,
    periodInMinutes: 24 * 60
  });
}

async function shouldBackupNow() {
  const values = await chrome.storage.local.get([BACKUP_META_KEY]);
  const meta = values[BACKUP_META_KEY] || {};
  const now = Date.now();
  if (meta.lastDate === todayString()) return false;
  return !meta.lastBackupAt || now - Date.parse(meta.lastBackupAt) >= ONE_DAY_MS * 0.8;
}

async function markBackupComplete() {
  await chrome.storage.local.set({
    [BACKUP_META_KEY]: {
      lastDate: todayString(),
      lastBackupAt: new Date().toISOString()
    }
  });
}

async function runDailyBackup() {
  if (!(await shouldBackupNow())) return;
  const payload = await handleApi("/api/export");
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  await chrome.downloads.download({
    url,
    filename: `paper-tag-library-backup-${todayString()}.json`,
    saveAs: false,
    conflictAction: "uniquify"
  });
  await markBackupComplete();
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleDailyBackup();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleDailyBackup();
  runDailyBackup().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== DAILY_BACKUP_ALARM) return;
  runDailyBackup().catch(() => {});
});

scheduleDailyBackup().catch(() => {});
