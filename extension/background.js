import { handleApi } from "./storage.js";

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
  runDailyBackup()
    .catch(() => {})
    .finally(() => {
      scheduleDailyBackup().catch(() => {});
    });
});

scheduleDailyBackup().catch(() => {});
