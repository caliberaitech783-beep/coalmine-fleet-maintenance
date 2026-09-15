import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Save, Trash2, X } from "lucide-react";
import { normalizeSavedReportName, savedReportKey, savedReportValidationError, sanitizeTableView, serializeTableView, storedSessionToken, defaultSavedReportName } from "./saved-reports.mjs";
import "./saved-reports.css";

async function apiJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}

/** Loads, saves and deletes the signed-in user's saved views for one table. Loading is lazy: call `load()` when a dialog opens. */
export function useSavedReports(reportKey) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const headers = () => ({ Authorization: `Bearer ${storedSessionToken()}` });
  const load = async () => {
    if (!reportKey) return [];
    setLoading(true); setError("");
    try {
      const data = await apiJson(await fetch(`/api/saved-reports?key=${encodeURIComponent(reportKey)}`, { cache: "no-store", headers: headers() }), "Could not load saved reports.");
      const list = Array.isArray(data.reports) ? data.reports : [];
      setReports(list);
      return list;
    } catch (loadError) { setError(loadError.message); return []; }
    finally { setLoading(false); }
  };
  const save = async (name, state) => {
    const data = await apiJson(await fetch("/api/saved-reports", { method: "POST", headers: { "Content-Type": "application/json", ...headers() }, body: JSON.stringify({ key: reportKey, name, state }) }), "Could not save the report.");
    await load();
    return data;
  };
  const remove = async (id) => {
    const response = await fetch(`/api/saved-reports/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() });
    if (!response.ok) await apiJson(response, "Could not delete the saved report.");
    await load();
  };
  return { reports, loading, error, load, save, remove };
}

function Dialog({ title, onClose, children, className = "", labelledBy }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(<div className="saved-report-backdrop" onPointerDown={onClose}>
    <section className={`saved-report-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={labelledBy} onPointerDown={(event) => event.stopPropagation()}>
      <header><h2 id={labelledBy}>{title}</h2><button type="button" className="saved-report-close" onClick={onClose} aria-label="Close"><X /></button></header>
      {children}
    </section>
  </div>, document.body);
}

/** Ask for a name and save the current view. */
export function SaveReportDialog({ title = "", defaultName = "", existingNames = [], onSave, onClose }) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.select?.(); }, []);
  const clean = normalizeSavedReportName(name);
  const replaces = existingNames.some((existing) => normalizeSavedReportName(existing).toLowerCase() === clean.toLowerCase());
  const submit = async (event) => {
    event.preventDefault();
    const problem = savedReportValidationError({ name: clean, key: "x" });
    if (problem) { setError(problem); return; }
    setSaving(true); setError("");
    try { await onSave(clean); }
    catch (saveError) { setError(saveError.message || "Could not save the report."); setSaving(false); }
  };
  return <Dialog title="Save report" onClose={onClose} labelledBy="save-report-title">
    <form className="saved-report-form" onSubmit={submit}>
      <p className="saved-report-context">{title ? <>Saves the current view of <b>{title}</b>: visible columns, filters, sort order and date range.</> : "Saves the current view: visible columns, filters, sort order and date range."}</p>
      <label><span>Report name</span><input ref={inputRef} autoFocus type="text" maxLength="80" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="e.g. Sasti OB open breakdowns" /></label>
      {replaces && !error && <p className="saved-report-hint">A report with this name exists and will be replaced.</p>}
      {error && <p className="saved-report-error" role="alert">{error}</p>}
      <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="primary" disabled={saving || !clean}><Save />{saving ? "Saving…" : replaces ? "Replace report" : "Save report"}</button></footer>
    </form>
  </Dialog>;
}

/** After a save: offer to print the report right away. */
export function PrintReportPrompt({ name = "", canPrint = true, onPrint, onClose }) {
  return <Dialog title="Report saved" onClose={onClose} className="saved-report-prompt" labelledBy="print-report-title">
    <div className="saved-report-form">
      <p className="saved-report-context"><b>{name}</b> has been saved. You can reopen it any time from Actions, Report, Saved reports.</p>
      <p>{canPrint ? "Print this report now?" : "Printing is not available for this table."}</p>
      <footer><button type="button" onClick={onClose}>{canPrint ? "Not now" : "Close"}</button>{canPrint && <button type="button" className="primary" autoFocus onClick={onPrint}><Printer />Print now</button>}</footer>
    </div>
  </Dialog>;
}

/** The user's saved views for this table. */
export function SavedReportsDialog({ title = "", reports = [], loading = false, error = "", canPrint = true, onApply, onPrint, onDelete, onClose }) {
  const [busyId, setBusyId] = useState("");
  const [problem, setProblem] = useState("");
  const remove = async (report) => {
    if (!window.confirm(`Delete the saved report "${report.name}"?`)) return;
    setBusyId(String(report.id)); setProblem("");
    try { await onDelete(report); }
    catch (deleteError) { setProblem(deleteError.message || "Could not delete the saved report."); }
    finally { setBusyId(""); }
  };
  return <Dialog title="Saved reports" onClose={onClose} className="saved-reports-list" labelledBy="saved-reports-title">
    <div className="saved-report-form">
      {title && <p className="saved-report-context">Views you saved for <b>{title}</b>. Opening one restores its columns, filters, sort order and date range.</p>}
      {(error || problem) && <p className="saved-report-error" role="alert">{problem || error}</p>}
      {loading && !reports.length ? <p className="saved-report-hint">Loading saved reports…</p>
        : !reports.length ? <p className="saved-report-hint">No saved reports yet. Use Actions, Report, Save report to keep the current view.</p>
        : <ul>{reports.map((report) => <li key={report.id}>
          <div><b>{report.name}</b><small>Saved {formatSavedAt(report.updatedAt || report.createdAt)}{report.state?.dateRange ? ` · ${report.state.dateRange}` : ""}{Object.keys(report.state?.filters || {}).length ? ` · ${Object.keys(report.state.filters).length} filter${Object.keys(report.state.filters).length === 1 ? "" : "s"}` : ""}</small></div>
          <div className="saved-report-actions">
            <button type="button" className="primary" onClick={() => onApply(report)}>Open</button>
            {canPrint && <button type="button" onClick={() => onPrint(report)} aria-label={`Print ${report.name}`}><Printer />Print</button>}
            <button type="button" className="danger" onClick={() => remove(report)} disabled={busyId === String(report.id)} aria-label={`Delete ${report.name}`}><Trash2 /></button>
          </div>
        </li>)}</ul>}
      <footer><button type="button" onClick={onClose}>Close</button></footer>
    </div>
  </Dialog>;
}

function formatSavedAt(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "recently";
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()} ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Everything a table needs for saved reports in one component: the per-table store,
 * the Save dialog, the print prompt after saving, and the Saved reports list.
 * `open` is "save" | "saved" | "" and is owned by the table so its Actions menu can
 * open the dialogs without knowing anything else.
 */
export function SavedReportsPanel({ title = "", tableKey = "", columns = [], open = "", onOpenChange, currentView, onApply, canPrint = false, onPrint }) {
  const reportKey = savedReportKey(title || tableKey || "table", columns);
  const store = useSavedReports(reportKey);
  const [saved, setSaved] = useState(null);
  useEffect(() => { if (open) void store.load(); }, [open, reportKey]);
  const close = () => onOpenChange("");
  const apply = (report) => onApply(sanitizeTableView(report.state, columns));
  return <>
    {open === "save" && <SaveReportDialog title={title} defaultName={defaultSavedReportName(title)} existingNames={store.reports.map((report) => report.name)}
      onSave={async (name) => { const result = await store.save(name, serializeTableView(currentView())); close(); setSaved({ name: result?.name || name }); }} onClose={close} />}
    {saved && <PrintReportPrompt name={saved.name} canPrint={canPrint} onPrint={() => { setSaved(null); onPrint(); }} onClose={() => setSaved(null)} />}
    {open === "saved" && <SavedReportsDialog title={title} reports={store.reports} loading={store.loading} error={store.error} canPrint={canPrint}
      onApply={(report) => { apply(report); close(); }}
      onPrint={(report) => { apply(report); close(); window.setTimeout(onPrint, 60); }}
      onDelete={(report) => store.remove(report.id)} onClose={close} />}
  </>;
}
