export const BACKUP_SETTING_KEY = "disaster_recovery_backup";

export const BACKUP_WEEKDAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

export const DEFAULT_BACKUP_SETTINGS = Object.freeze({
  enabled: true,
  scheduleTime: "02:00",
  weekdays: [...BACKUP_WEEKDAYS],
  storageFolder: "scheduled",
  retentionDays: 30,
  maxBackups: 30,
});

export function normalizeBackupSettings(value = {}) {
  const weekdays = Array.isArray(value.weekdays)
    ? [...new Set(value.weekdays.map(String).filter((day) => BACKUP_WEEKDAYS.includes(day)))]
    : [...BACKUP_WEEKDAYS];
  const scheduleTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.scheduleTime || ""))
    ? String(value.scheduleTime)
    : DEFAULT_BACKUP_SETTINGS.scheduleTime;
  const storageFolder = String(value.storageFolder || DEFAULT_BACKUP_SETTINGS.storageFolder)
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-"))
    .filter(Boolean)
    .join("/")
    .slice(0, 180) || DEFAULT_BACKUP_SETTINGS.storageFolder;
  return {
    enabled: value.enabled !== false,
    scheduleTime,
    weekdays: weekdays.length ? weekdays : [...BACKUP_WEEKDAYS],
    storageFolder,
    retentionDays: Math.min(365, Math.max(1, Math.floor(Number(value.retentionDays) || DEFAULT_BACKUP_SETTINGS.retentionDays))),
    maxBackups: Math.min(365, Math.max(1, Math.floor(Number(value.maxBackups) || DEFAULT_BACKUP_SETTINGS.maxBackups))),
  };
}

export function indiaBackupSlot(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
    slotKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function scheduledBackupDue(settings, now = new Date()) {
  const normalized = normalizeBackupSettings(settings);
  const slot = indiaBackupSlot(now);
  return normalized.enabled
    && normalized.weekdays.includes(slot.weekday)
    && slot.time >= normalized.scheduleTime;
}
