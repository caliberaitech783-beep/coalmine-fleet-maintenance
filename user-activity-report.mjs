const DEFAULT_IDLE_MINUTES = 15;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function eventTime(event) {
  const value = new Date(event?.occurredAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function durationLabel(totalMilliseconds) {
  const totalSeconds = Math.max(0, Math.round(Number(totalMilliseconds || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sessionActiveMilliseconds(events, idleWindowMilliseconds) {
  const ordered = [...events].sort((left, right) => eventTime(left) - eventTime(right));
  if (!ordered.length) return 0;
  let active = 0;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const gap = eventTime(ordered[index + 1]) - eventTime(ordered[index]);
    if (gap > 0 && gap <= idleWindowMilliseconds) active += gap;
    else active += Math.max(0, Number(ordered[index]?.durationMs || 0));
  }
  active += Math.max(0, Number(ordered.at(-1)?.durationMs || 0));
  return active;
}

export function buildUserActivitySummary(events = [], {idleMinutes = DEFAULT_IDLE_MINUTES, sessions = []} = {}) {
  const idleWindowMilliseconds = Math.max(1, Number(idleMinutes || DEFAULT_IDLE_MINUTES)) * 60 * 1000;
  const users = new Map();
  for (const event of events) {
    const login = clean(event?.actorLogin).toLowerCase();
    const name = clean(event?.actorName);
    if ((!login && !name) || login === "system" || login === "cloud-runtime") continue;
    const key = login || name.toLowerCase();
    if (!users.has(key)) users.set(key, {
      login, name, role: clean(event?.actorRole), events: [], sessions: new Map(), modules: new Set(), actions: new Set(),
    });
    const user = users.get(key);
    if (!user.name && name) user.name = name;
    if (!user.role && event?.actorRole) user.role = clean(event.actorRole);
    user.events.push(event);
    if (event?.module) user.modules.add(clean(event.module));
    if (event?.action) user.actions.add(clean(event.action));
    const day = new Date(event?.occurredAt || 0).toISOString().slice(0, 10);
    const sessionKey = clean(event?.sessionId) || `${key}:${day}`;
    if (!user.sessions.has(sessionKey)) user.sessions.set(sessionKey, []);
    user.sessions.get(sessionKey).push(event);
  }

  for (const session of sessions) {
    const login = clean(session?.actorLogin).toLowerCase();
    const name = clean(session?.actorName);
    if ((!login && !name) || login === "system" || login === "cloud-runtime") continue;
    const key = login || name.toLowerCase();
    if (!users.has(key)) users.set(key, {
      login, name, role: clean(session?.actorRole), events: [], sessions: new Map(), modules: new Set(), actions: new Set(), ledgerMilliseconds: 0,
    });
    const user = users.get(key);
    user.ledgerMilliseconds = Number(user.ledgerMilliseconds || 0) + Math.max(0, Number(session?.activeSeconds || 0)) * 1000;
    const sessionKey = clean(session?.sessionId) || `${key}:session-${user.sessions.size + 1}`;
    if (!user.sessions.has(sessionKey)) user.sessions.set(sessionKey, []);
    if (!user.name && name) user.name = name;
    if (!user.role && session?.actorRole) user.role = clean(session.actorRole);
  }

  return [...users.values()].map((user) => {
    const ordered = [...user.events].sort((left, right) => eventTime(left) - eventTime(right));
    const eventMilliseconds = [...user.sessions.values()].reduce(
      (total, sessionEvents) => total + sessionActiveMilliseconds(sessionEvents, idleWindowMilliseconds), 0,
    );
    const activeMilliseconds = Number(user.ledgerMilliseconds || 0) || eventMilliseconds;
    const failed = ordered.filter((event) => clean(event?.outcome).toLowerCase() === "failed").length;
    return {
      userName: user.name || user.login || "Unknown user",
      login: user.login,
      role: user.role || "User",
      sessionCount: user.sessions.size,
      totalActivityCount: ordered.length,
      successfulCount: ordered.length - failed,
      failedCount: failed,
      totalWorkedTime: durationLabel(activeMilliseconds),
      totalWorkedMinutes: Math.round(activeMilliseconds / 60000 * 100) / 100,
      firstActivityAt: ordered[0]?.occurredAt || "",
      lastActivityAt: ordered.at(-1)?.occurredAt || "",
      modules: [...user.modules].join(", "),
      processes: [...user.actions].join(", "),
    };
  }).sort((left, right) => right.totalWorkedMinutes - left.totalWorkedMinutes || right.totalActivityCount - left.totalActivityCount);
}

export function totalUserWorkedMinutes(rows = []) {
  return Math.round(rows.reduce((total, row) => total + Number(row?.totalWorkedMinutes || 0), 0) * 100) / 100;
}
