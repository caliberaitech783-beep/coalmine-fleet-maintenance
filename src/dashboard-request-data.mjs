import {parseRequestTimelineTimestamp} from "../request-timeline.mjs";

const INDIA_OFFSET_MS = 330 * 60_000;

// Calendar-only values already name an Indian operational day. Timestamp
// offsets, including UTC, must be converted before choosing that day.
export function requestDateKey(value) {
  const text = typeof value === "string" ? value.trim() : "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = parseRequestTimelineTimestamp(dateOnly ? `${text}T00:00:00` : value);
  if (!parsed) return "";
  const day = new Date(parsed.getTime() + INDIA_OFFSET_MS).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

export function requestEventDate(record = {}, event) {
  if (!record || typeof record !== "object") return "";
  const fields = {
    opened: ["start", "startedAt", "createdAt"],
    closed: ["closedAt"],
    verified: ["verifiedAt"],
    idle: ["idealRequestedAt", "idleRequestedAt"],
  }[event];
  for (const field of fields || []) {
    const day = requestDateKey(record[field]);
    if (day) return day;
  }
  return "";
}

// Call with rows already restricted to the authorised location/region. A
// selected opening day affects historical request analysis, not live status.
// An optional end date makes the selection an inclusive opening-date range.
export function splitDashboardRequests(scopedRows = [], selectedOpeningDate = "", selectedEndDate = selectedOpeningDate) {
  if (!Array.isArray(scopedRows)) throw new TypeError("Dashboard requests must be an array.");
  const selection = String(selectedOpeningDate ?? "").trim();
  const endSelection = String(selectedEndDate ?? "").trim() || selection;
  const dayKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? requestDateKey(value) : "";
  const startDay = dayKey(selection);
  const endDay = dayKey(endSelection);
  return {
    liveRequests: [...scopedRows],
    historicalRequests: !selection ? [...scopedRows] : startDay && endDay && startDay <= endDay
      ? scopedRows.filter((record) => { const opened = requestEventDate(record, "opened"); return opened >= startDay && opened <= endDay; })
      : [],
  };
}

const initialState = (token = "") => ({token, records: [], loaded: false, loading: false, error: "", updatedAt: 0});

// Framework-independent controller. Create per mounted/session-owning hook,
// call load(token) to refresh, and cancel() before disposal. Only a successful
// array response establishes an empty dataset; failure never masquerades as it.
export function createDashboardRequestLoader({
  fetchImpl = globalThis.fetch,
  onState = () => {},
  timeoutMs = 15_000,
  now = () => Date.now(),
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("A positive timeout is required.");
  let state = initialState();
  let sequence = 0;
  let currentToken = "";
  let activeController = null;
  const getState = () => ({...state, records: [...state.records]});
  const publish = (next) => {
    state = next;
    onState(getState());
  };
  const cancel = () => {
    sequence += 1;
    activeController?.abort();
    activeController = null;
    state = {...state, loading: false};
    return getState();
  };

  async function load(token) {
    const attempt = ++sequence;
    activeController?.abort();
    const authToken = String(token ?? "").trim();
    if (authToken !== currentToken) state = initialState(authToken);
    currentToken = authToken;
    if (!authToken) {
      activeController = null;
      publish({...initialState(), error: "Sign in to load dashboard requests."});
      return getState();
    }

    const controller = new AbortController();
    activeController = controller;
    publish({...state, loading: true});
    let timedOut = false;
    let rejectAbort;
    const aborted = new Promise((_, reject) => {
      rejectAbort = () => reject(Object.assign(new Error("Dashboard request loading was cancelled."), {name: "AbortError"}));
      controller.signal.addEventListener("abort", rejectAbort, {once: true});
    });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const request = async () => {
        const response = await fetchImpl(`/api/requests?scope=dashboard&t=${now()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: {Authorization: `Bearer ${authToken}`},
        });
        let body;
        try { body = await response.json(); }
        catch { throw Object.assign(new Error("Dashboard request data could not be read. Please retry."), {status: response.status}); }
        if (!response.ok) throw Object.assign(new Error(
          typeof body?.error === "string" && body.error.trim() ? body.error : "Could not load dashboard requests. Please retry.",
        ), {status: response.status});
        if (!Array.isArray(body)) throw new Error("Dashboard request data is invalid. Please retry.");
        return body;
      };
      const records = await Promise.race([request(), aborted]);
      if (attempt !== sequence || controller.signal.aborted) return getState();
      publish({token: authToken, records, loaded: true, loading: false, error: "", updatedAt: now()});
    } catch (error) {
      if (attempt !== sequence || (controller.signal.aborted && !timedOut)) return getState();
      // Do not retain another account's or newly unauthorised request data.
      const previous = [401, 403].includes(error?.status) ? initialState(authToken) : state;
      publish({...previous, loading: false, error: timedOut
        ? "Dashboard request loading timed out. Please retry."
        : error?.message || "Could not load dashboard requests. Please retry."});
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", rejectAbort);
      if (attempt === sequence) activeController = null;
    }
    return getState();
  }

  return {load, cancel, getState};
}
