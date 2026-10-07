import React, { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Eraser, Play, RefreshCw, Save, Trash2, XCircle } from "lucide-react";
import "./data-housekeeping-page.css";

const showDateTime = (value) => (value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }) : "Never");

async function request(token, url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}

function Notice({ error, message }) {
  if (error) return <div className="housekeeping-notice fail" role="alert"><XCircle aria-hidden="true" />{error}</div>;
  if (message) return <div className="housekeeping-notice ok" role="status"><CheckCircle2 aria-hidden="true" />{message}</div>;
  return null;
}

// Admin > Database > Retention rules: how many days each kind of log is kept
// before the daily automatic clean-up removes it. 0 keeps everything.
export function RetentionRulesPage({ token }) {
  const [overview, setOverview] = useState(null);
  const [days, setDays] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const apply = (result) => {
    setOverview(result);
    setDays(Object.fromEntries(result.categories.map((category) => [category.retentionKey, String(category.keepDays)])));
  };
  const load = async () => {
    setError("");
    try { apply(await request(token, "/api/data-housekeeping")); } catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { load(); }, []);
  const changed = overview?.categories.some((category) => String(category.keepDays) !== days[category.retentionKey]);
  const save = async () => {
    setBusy("save"); setError(""); setMessage("");
    try {
      await request(token, "/api/log-retention", { method: "PUT", body: JSON.stringify(Object.fromEntries(Object.entries(days).map(([key, value]) => [key, Number(value || 0)]))) });
      await load();
      setMessage("Retention rules saved. They apply at the next clean-up check, within five minutes.");
    } catch (saveError) { setError(saveError.message); } finally { setBusy(""); }
  };
  const runNow = async () => {
    setBusy("run"); setError(""); setMessage("");
    try {
      const { result } = await request(token, "/api/log-retention/run", { method: "POST" });
      await load();
      if (result?.skipped) setMessage(`Nothing was cleaned: ${result.reason}.`);
      else {
        const removed = ["auditDeleted", "loginHistoryDeleted", "sessionActivityDeleted", "whatsappHistoryDeleted", "notificationsDeleted", "sessionMessagesDeleted"].reduce((sum, key) => sum + Number(result?.[key] || 0), 0);
        setMessage(`Clean-up finished: ${removed} record(s) removed${result?.requestMediaCleared ? `, photos and audio cleared on ${result.requestMediaCleared} request(s)` : ""}.`);
      }
    } catch (runError) { setError(runError.message); } finally { setBusy(""); }
  };
  const retention = overview?.retention;
  return <section className="panel pagepanel generic housekeeping-page">
    <header>
      <div><h1><CalendarClock aria-hidden="true" /> Retention rules</h1><p>How long Caliber Pulse keeps logs and old media before the daily automatic clean-up removes them</p></div>
      <div className="housekeeping-actions">
        <button type="button" onClick={runNow} disabled={!overview || Boolean(busy) || changed} title={changed ? "Save the changes first" : "Apply the saved rules now"}>
          <Play aria-hidden="true" />{busy === "run" ? "Cleaning…" : "Run clean-up now"}
        </button>
        <button type="button" className="primary" onClick={save} disabled={!changed || Boolean(busy)}><Save aria-hidden="true" />{busy === "save" ? "Saving…" : "Save rules"}</button>
      </div>
    </header>
    <Notice error={error} message={message} />
    {retention && <p className="housekeeping-meta">
      Database size <strong>{overview.databaseSize}</strong> · Last clean-up <strong>{retention.lastRunAt ? showDateTime(retention.lastRunAt) : "Not yet"}</strong> · Rules last changed <strong>{showDateTime(retention.updatedAt)}</strong>{retention.updatedBy ? ` by ${retention.updatedBy}` : ""}
    </p>}
    {overview ? <div className="housekeeping-table" role="table" aria-label="Retention rules">
      <div role="row" className="head"><span role="columnheader">Data</span><span role="columnheader">Storage now</span><span role="columnheader">Keep for</span></div>
      {overview.categories.map((category) => {
        const value = days[category.retentionKey] ?? "";
        const off = Number(value || 0) === 0;
        return <div role="row" key={category.key}>
          <span role="cell"><strong>{category.label}</strong><small>{category.description}</small></span>
          <span role="cell" className="size">{category.size}</span>
          <span role="cell" className="keep">
            <input type="number" min="0" max={retention?.maxDays || 3650} step="1" inputMode="numeric" aria-label={`Days to keep ${category.label}`}
              value={value} onChange={(event) => setDays((current) => ({ ...current, [category.retentionKey]: event.target.value.replace(/\D/g, "") }))} />
            <em className={off ? "off" : ""}>{off ? "Kept forever" : "days"}</em>
          </span>
        </div>;
      })}
    </div> : !error && <p className="housekeeping-loading"><RefreshCw className="spin" aria-hidden="true" /> Loading…</p>}
    <p className="housekeeping-hint">Set 0 to keep everything. Today's data is never removed. Backups taken earlier still hold removed data.</p>
  </section>;
}

// Admin > Database > Purge data: remove old logs or media once, now. The page
// first shows how much a window would remove, then needs a reason and a typed
// DELETE. Business records (requests, equipment, tickets, masters) are never listed.
export function PurgeDataPage({ token }) {
  const [overview, setOverview] = useState(null);
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState("days");
  const [olderThanDays, setOlderThanDays] = useState("30");
  const [upToDate, setUpToDate] = useState("");
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const windowQuery = () => (mode === "days" ? { olderThanDays: Number(olderThanDays) } : { upToDate });
  const load = async () => {
    setError("");
    try { setOverview(await request(token, "/api/data-housekeeping")); } catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPreview(null); setConfirmation(""); }, [category, mode, olderThanDays, upToDate]);
  const check = async () => {
    setBusy("preview"); setError(""); setMessage("");
    try {
      const result = await request(token, `/api/data-housekeeping?${new URLSearchParams(windowQuery())}`);
      setOverview(result);
      setPreview({ window: result.window, cutoff: result.cutoff, matching: result.categories.find((item) => item.key === category)?.matching ?? 0 });
    } catch (checkError) { setError(checkError.message); } finally { setBusy(""); }
  };
  const purge = async () => {
    setBusy("purge"); setError(""); setMessage("");
    try {
      const result = await request(token, "/api/data-housekeeping/purge", { method: "POST", body: JSON.stringify({ category, ...windowQuery(), reason, confirmation }) });
      setOverview(result);
      const label = result.categories.find((item) => item.key === category)?.label || "data";
      setMessage(`${label}: ${category === "media" ? `photos and audio cleared on ${result.removed} request(s)` : `${result.removed} record(s) removed`}. Recorded in the Audit Trail.`);
      setPreview(null); setReason(""); setConfirmation("");
    } catch (purgeError) { setError(purgeError.message); } finally { setBusy(""); }
  };
  const selected = overview?.categories.find((item) => item.key === category);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const windowReady = mode === "days" ? Number(olderThanDays) >= 1 : Boolean(upToDate) && upToDate < today;
  const canPurge = preview && preview.matching > 0 && reason.trim().length >= 5 && confirmation.trim().toUpperCase() === "DELETE";
  return <section className="panel pagepanel generic housekeeping-page">
    <header>
      <div><h1><Eraser aria-hidden="true" /> Purge data</h1><p>Remove old logs, delivery history, notifications or media once, now</p></div>
      {overview && <p className="housekeeping-meta">Database size <strong>{overview.databaseSize}</strong></p>}
    </header>
    <Notice error={error} message={message} />
    <div className="housekeeping-warning"><AlertTriangle aria-hidden="true" /><span>A purge is permanent. Only a database backup taken before it can bring the data back. Requests, equipment, tickets and masters can never be purged here.</span></div>
    {overview ? <>
      <fieldset className="housekeeping-choices">
        <legend>1. What to purge</legend>
        {overview.categories.map((item) => <label key={item.key} className={category === item.key ? "selected" : ""}>
          <input type="radio" name="purge-category" value={item.key} aria-label={item.label} checked={category === item.key} onChange={() => setCategory(item.key)} />
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
          <em>{item.size}</em>
        </label>)}
      </fieldset>
      <fieldset className="housekeeping-window" disabled={!category}>
        <legend>2. How old</legend>
        <label><input type="radio" name="purge-mode" value="days" aria-label="Older than a number of days" checked={mode === "days"} onChange={() => setMode("days")} /> Older than
          <input type="number" min="1" max="3650" value={olderThanDays} aria-label="Older than days" onChange={(event) => setOlderThanDays(event.target.value.replace(/\D/g, ""))} onFocus={() => setMode("days")} /> days</label>
        <label><input type="radio" name="purge-mode" value="date" aria-label="Up to a date" checked={mode === "date"} onChange={() => setMode("date")} /> Everything up to and including
          <input type="date" max={today} value={upToDate} aria-label="Up to date" onChange={(event) => setUpToDate(event.target.value)} onFocus={() => setMode("date")} /></label>
        <button type="button" onClick={check} disabled={!category || !windowReady || Boolean(busy)}><RefreshCw className={busy === "preview" ? "spin" : ""} aria-hidden="true" />Check how much</button>
      </fieldset>
      {preview && selected && <fieldset className="housekeeping-confirm">
        <legend>3. Confirm</legend>
        {preview.matching === 0 ? <p><CheckCircle2 aria-hidden="true" /> Nothing in <strong>{selected.label}</strong> is {preview.window.toLowerCase()}. There is nothing to purge.</p> : <>
          <p><strong>{preview.matching.toLocaleString("en-IN")}</strong> {category === "media" ? "request(s) will lose their photos and audio" : "record(s) will be permanently removed"} from <strong>{selected.label}</strong> ({preview.window.toLowerCase()}, before {showDateTime(preview.cutoff)}).</p>
          <label>Reason (kept in the Audit Trail)<textarea rows="2" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: database storage is nearly full" /></label>
          <label><span>Type <strong>DELETE</strong> to confirm</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
          <button type="button" className="danger" onClick={purge} disabled={!canPurge || Boolean(busy)}><Trash2 aria-hidden="true" />{busy === "purge" ? "Purging…" : "Purge permanently"}</button>
        </>}
      </fieldset>}
    </> : !error && <p className="housekeeping-loading"><RefreshCw className="spin" aria-hidden="true" /> Loading…</p>}
  </section>;
}
