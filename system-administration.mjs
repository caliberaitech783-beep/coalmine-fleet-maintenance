export const SYSTEM_ADMINISTRATION_OPTIONS = [
  "Daily Backup",
  "Backup History",
  "Export Backup",
  "Create Schedule Backup",
  "Backup Settings",
  "Storage and Retention",
  "Backup Activity Logs",
  "Login Sessions",
  "Login History",
  "Device Access",
  "Audit Trail",
];

export const DEFAULT_BACKUP_SETTINGS = Object.freeze({
  enabled: true,
  scheduleTime: "02:00",
  weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  namePrefix: "BDMS-Daily",
  includeAuditTrail: true,
  includeLoginHistory: true,
  retentionDays: 30,
  maxBackups: 30,
  storageTarget: "Application database",
});

const WEEKDAYS = DEFAULT_BACKUP_SETTINGS.weekdays;

export function normalizeBackupSettings(value = {}) {
  const weekdays = Array.isArray(value.weekdays)
    ? [...new Set(value.weekdays.filter((day) => WEEKDAYS.includes(day)))]
    : [...WEEKDAYS];
  const scheduleTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.scheduleTime || ""))
    ? String(value.scheduleTime)
    : DEFAULT_BACKUP_SETTINGS.scheduleTime;
  return {
    enabled: value.enabled !== false,
    scheduleTime,
    weekdays: weekdays.length ? weekdays : [...WEEKDAYS],
    namePrefix: String(value.namePrefix || DEFAULT_BACKUP_SETTINGS.namePrefix).replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").slice(0, 50) || DEFAULT_BACKUP_SETTINGS.namePrefix,
    includeAuditTrail: value.includeAuditTrail !== false,
    includeLoginHistory: value.includeLoginHistory !== false,
    retentionDays: Math.min(365, Math.max(1, Math.floor(Number(value.retentionDays) || DEFAULT_BACKUP_SETTINGS.retentionDays))),
    maxBackups: Math.min(365, Math.max(1, Math.floor(Number(value.maxBackups) || DEFAULT_BACKUP_SETTINGS.maxBackups))),
    storageTarget: DEFAULT_BACKUP_SETTINGS.storageTarget,
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
    time: `${parts.hour}:${parts.minute}`,
    slotKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function scheduledBackupDue(settings, now = new Date()) {
  const normalized = normalizeBackupSettings(settings);
  const slot = indiaBackupSlot(now);
  return normalized.enabled && normalized.weekdays.includes(slot.weekday) && slot.time >= normalized.scheduleTime;
}
