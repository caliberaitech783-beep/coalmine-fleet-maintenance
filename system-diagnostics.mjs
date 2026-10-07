/**
 * Diagnostics: a one-page health check of everything Caliber Pulse depends on. Each
 * check runs with its own time limit so one slow service cannot hang the page,
 * and reports one of four states:
 *   ok   - working
 *   warn - working, but needs attention (e.g. last backup is old)
 *   fail - not working
 *   off  - not set up on this server (e.g. no Oracle settings)
 */
export const DIAGNOSTIC_TIMEOUT_MS = 8000;
export const BACKUP_MAX_AGE_HOURS = 26;
const STATES = new Set(["ok", "warn", "fail", "off"]);

export class DiagnosticState extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
  }
}
/** Ends a check early with a non-"ok" state that is not an error. */
export const diagnosticState = (status, detail) => { throw new DiagnosticState(status, detail); };

/** Runs one check; its function returns {status?, detail, facts?}. */
export async function runDiagnostic({key, label, run}, {timeoutMs = DIAGNOSTIC_TIMEOUT_MS, now = () => Date.now()} = {}) {
  const started = now();
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(run),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new DiagnosticState("fail", `No answer within ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs); }),
    ]);
    const status = STATES.has(result?.status) ? result.status : "ok";
    return {key, label, status, detail: String(result?.detail || ""), facts: result?.facts || [], ms: now() - started};
  } catch (error) {
    const status = error instanceof DiagnosticState ? error.status : "fail";
    return {key, label, status, detail: String(error?.message || "Check failed.").slice(0, 300), facts: [], ms: now() - started};
  } finally {
    clearTimeout(timer);
  }
}

export async function runDiagnostics(checks = [], options) {
  const results = await Promise.all(checks.map((check) => runDiagnostic(check, options)));
  const summary = {ok: 0, warn: 0, fail: 0, off: 0};
  for (const result of results) summary[result.status] += 1;
  return {checkedAt: new Date().toISOString(), overall: summary.fail ? "fail" : summary.warn ? "warn" : "ok", summary, checks: results};
}

/** Latest backup run → state. `run` is {status, completedAt|startedAt, errorMessage}. */
export function backupDiagnostic(run, now = new Date()) {
  if (!run) return {status: "warn", detail: "No backup has been taken yet."};
  const finished = new Date(run.completedAt || run.startedAt);
  const hours = (now - finished) / 3600000;
  const age = hours < 1 ? `${Math.max(1, Math.round(hours * 60))} minutes ago` : hours < 48 ? `${Math.round(hours)} hours ago` : `${Math.round(hours / 24)} days ago`;
  if (/fail/i.test(run.status)) return {status: "fail", detail: `The last backup failed ${age}: ${String(run.errorMessage || "no reason recorded").slice(0, 160)}`};
  if (/running/i.test(run.status)) return {status: "ok", detail: `A backup is running now (started ${age}).`};
  if (hours > BACKUP_MAX_AGE_HOURS) return {status: "warn", detail: `The last backup finished ${age}. Backups are expected at least daily.`};
  return {status: "ok", detail: `The last backup finished ${age}.`};
}

/** Message deliveries in the last 24 hours → state, surfacing the latest failure reason. */
export function deliveryDiagnostic({sent = 0, failed = 0, lastError = ""} = {}, channel = "WhatsApp") {
  if (!failed) return {status: "ok", detail: sent ? `${sent} ${channel} messages delivered in the last 24 hours, none failed.` : `No ${channel} messages in the last 24 hours.`};
  const detail = `${failed} of ${sent + failed} ${channel} messages failed in the last 24 hours. Latest reason: ${String(lastError || "not recorded").slice(0, 200)}`;
  return {status: failed >= sent ? "fail" : "warn", detail};
}

export function formatBytes(bytes = 0) {
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let value = Number(bytes) || 0, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${unit ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
