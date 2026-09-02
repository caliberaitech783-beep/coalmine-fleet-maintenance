import { calculateBreakdownDaysFromStart } from "./breakdown-duration.mjs";

const HOUR_MS = 60 * 60 * 1000;

export const AI_FEEDER_THRESHOLDS = {
  newRequestHours: 12,
  etcDueSoonHours: 2,
  longRunningDays: 3,
  awaitingVerificationHours: 12,
  staleUpdateHours: 24,
  maxAlerts: 60,
};

export const AI_FEEDER_ALERT_TYPES = [
  "etc-overdue",
  "long-running",
  "idle-vehicle",
  "etc-due-soon",
  "awaiting-verification",
  "stale-update",
  "new-request",
];

const EVERY_ALERT = [...AI_FEEDER_ALERT_TYPES];

// Each role only hears about the work it can actually act on. Admins and
// managers oversee the whole flow, so they receive every feed item.
export const AI_FEEDER_ROLE_ALERTS = {
  Admin: EVERY_ALERT,
  Manager: EVERY_ALERT,
  "Production User": ["etc-overdue", "long-running", "idle-vehicle", "new-request"],
  "Maintenance User": ["etc-overdue", "long-running", "idle-vehicle", "etc-due-soon", "stale-update", "new-request"],
  "MIS User": ["etc-overdue", "long-running", "awaiting-verification"],
};

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

export function alertTypesForRole(role = "") {
  const name = String(role || "").trim();
  return AI_FEEDER_ROLE_ALERTS[name] || AI_FEEDER_ROLE_ALERTS.Admin;
}

export function parseIstTimestamp(value) {
  const match = String(value || "").trim().match(
    /^(\d{4}-\d{2}-\d{2})\D+((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)$/,
  );
  if (!match) return Number.NaN;
  const time = match[2].length === 5 ? `${match[2]}:00` : match[2];
  return Date.parse(`${match[1]}T${time}+05:30`);
}

const statusOf = (request) => String(request?.status || "").trim().toLowerCase();
const isClosed = (request) => statusOf(request) === "closed" || Boolean(String(request?.closedAt || "").trim());
const isIdle = (request) => ["idle", "ideal"].includes(statusOf(request));
const labelFor = (request) =>
  [request?.equipmentGroup || request?.equipment, request?.door].map((part) => String(part || "").trim()).filter(Boolean).join(" · ") ||
  String(request?.ref || "").trim() ||
  "Unknown equipment";

const hoursBetween = (fromMs, toMs) => Math.max(0, Math.round((toMs - fromMs) / HOUR_MS));

const durationLabel = (hours) => {
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
};

function buildAlerts(requests, nowMs) {
  const alerts = [];
  const add = (request, type, severity, title, detail, atMs) =>
    alerts.push({
      id: `${type}:${String(request?.ref || labelFor(request))}`,
      type,
      severity,
      title,
      detail,
      ref: String(request?.ref || ""),
      site: String(request?.site || "").trim() || "Not assigned",
      equipment: labelFor(request),
      at: Number.isFinite(atMs) ? atMs : nowMs,
    });

  for (const request of Array.isArray(requests) ? requests : []) {
    if (!request) continue;
    const closed = isClosed(request);
    const startedAt = parseIstTimestamp(request.start);
    const etcAt = parseIstTimestamp(request.expectedCompletionAt);
    const closedAt = parseIstTimestamp(request.closedAt);

    if (!closed && Number.isFinite(etcAt) && etcAt < nowMs) {
      const late = hoursBetween(etcAt, nowMs);
      add(request, "etc-overdue", "critical",
        `${labelFor(request)} has passed its ETC`,
        `Expected back on road ${durationLabel(late)} ago and the request is still ${request.status || "open"}.`,
        etcAt);
    }

    if (!closed && Number.isFinite(etcAt) && etcAt >= nowMs && etcAt - nowMs <= AI_FEEDER_THRESHOLDS.etcDueSoonHours * HOUR_MS) {
      add(request, "etc-due-soon", "warning",
        `${labelFor(request)} is due back soon`,
        `ETC is within ${AI_FEEDER_THRESHOLDS.etcDueSoonHours} hours. Confirm the work will finish on time.`,
        etcAt);
    }

    if (!closed) {
      const days = calculateBreakdownDaysFromStart(request.start, new Date(nowMs));
      if (days >= AI_FEEDER_THRESHOLDS.longRunningDays) {
        add(request, "long-running", "critical",
          `${labelFor(request)} has been down ${days} days`,
          `Maintenance is taking longer than ${AI_FEEDER_THRESHOLDS.longRunningDays} days. Escalate if parts or manpower are blocking it.`,
          startedAt);
      }
    }

    if (isIdle(request)) {
      add(request, "idle-vehicle", "warning",
        `${labelFor(request)} is sitting idle`,
        `Idle reason: ${String(request.idleReason || "").trim() || "not recorded"}. Awaiting manager approval to return it to road.`,
        startedAt);
    }

    if (closed && !String(request.verifiedAt || "").trim() && Number.isFinite(closedAt) &&
      nowMs - closedAt >= AI_FEEDER_THRESHOLDS.awaitingVerificationHours * HOUR_MS) {
      add(request, "awaiting-verification", "warning",
        `${labelFor(request)} is waiting on MIS verification`,
        `Closed ${durationLabel(hoursBetween(closedAt, nowMs))} ago and still unverified.`,
        closedAt);
    }

    if (!closed && Number.isFinite(startedAt) && nowMs - startedAt >= AI_FEEDER_THRESHOLDS.staleUpdateHours * HOUR_MS &&
      !String(request.dailyRemarks || "").trim()) {
      add(request, "stale-update", "warning",
        `${labelFor(request)} has no daily update`,
        `Open for ${durationLabel(hoursBetween(startedAt, nowMs))} with no maintenance remark recorded.`,
        startedAt);
    }

    if (!closed && Number.isFinite(startedAt) && nowMs - startedAt <= AI_FEEDER_THRESHOLDS.newRequestHours * HOUR_MS) {
      add(request, "new-request", "info",
        `New request for ${labelFor(request)}`,
        `${String(request.complaint || "").trim() || "No reason recorded"} — raised by ${String(request.owner || request.requesterLogin || "").trim() || "unknown user"}.`,
        startedAt);
    }
  }
  return alerts;
}

export function aiFeederAlerts(requests = [], { role = "", now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) return [];
  const allowed = new Set(alertTypesForRole(role));
  return buildAlerts(requests, nowMs)
    .filter((alert) => allowed.has(alert.type))
    .sort((left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      right.at - left.at ||
      left.id.localeCompare(right.id),
    )
    .slice(0, AI_FEEDER_THRESHOLDS.maxAlerts);
}

export function aiFeederSummary(alerts = []) {
  const list = Array.isArray(alerts) ? alerts : [];
  return {
    total: list.length,
    critical: list.filter((alert) => alert.severity === "critical").length,
    warning: list.filter((alert) => alert.severity === "warning").length,
    info: list.filter((alert) => alert.severity === "info").length,
  };
}
