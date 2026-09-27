import React, { useEffect, useState } from "react";
import { Archive, CalendarClock, Database, Eraser, HardDrive, Image, RefreshCw, XCircle } from "lucide-react";
import "./data-housekeeping-page.css";

const showDateTime = (value) => (value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }) : "Never");
const DISK_LABELS = { ok: "Plenty of space", warn: "Getting full", fail: "Nearly full", off: "Size not available" };
const TABLE_LIMIT = 12;

// Admin > Database > Storage management: where the database and backup space
// goes, with links to Purge data and Retention rules to free it. Read-only.
export default function StorageManagementPage({ token, onNavigate }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/storage-overview", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Storage details could not be loaded.");
      setOverview(result);
    } catch (loadError) {
      setError(loadError.message || "Storage details could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const open = (page) => onNavigate?.(page);
  const tables = overview ? (showAll ? overview.tables : overview.tables.slice(0, TABLE_LIMIT)) : [];
  return <section className="panel pagepanel generic housekeeping-page storage-page">
    <header>
      <div><h1><HardDrive aria-hidden="true" /> Storage management</h1><p>Where the database and backup space goes, and what can be freed</p></div>
      <div className="housekeeping-actions">
        <button type="button" onClick={() => open("Retention rules")}><CalendarClock aria-hidden="true" />Retention rules</button>
        <button type="button" onClick={() => open("Purge data")}><Eraser aria-hidden="true" />Purge data</button>
        <button type="button" className="primary" onClick={load} disabled={loading}><RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />{loading ? "Checking…" : "Refresh"}</button>
      </div>
    </header>
    {error && <div className="housekeeping-notice fail" role="alert"><XCircle aria-hidden="true" />{error}</div>}
    {overview ? <>
      <div className="storage-cards">
        <article className="storage-card">
          <span className="storage-card-icon" aria-hidden="true"><Database /></span>
          <div><h2>Database</h2><strong>{overview.database.size}</strong><small>{overview.database.tableCount} tables</small></div>
        </article>
        <article className="storage-card">
          <span className="storage-card-icon" aria-hidden="true"><Image /></span>
          <div>
            <h2>Photos and audio</h2><strong>{overview.media.size}</strong>
            <small>On {overview.media.requests.toLocaleString("en-IN")} requests · {overview.media.verifiedSize} on {overview.media.verifiedRequests.toLocaleString("en-IN")} MIS-verified requests can be cleared</small>
            <small>{overview.media.mediaDays ? `Cleared automatically ${overview.media.mediaDays} days after MIS verification` : "Never cleared automatically"} · Announcement images {overview.media.announcementSize}</small>
          </div>
        </article>
        <article className="storage-card">
          <span className="storage-card-icon" aria-hidden="true"><Archive /></span>
          <div>
            <h2>Backups kept</h2><strong>{overview.backups.size}</strong>
            <small>{overview.backups.count} backup file(s) · latest {showDateTime(overview.backups.latestAt)}</small>
            <small>Keeps up to {overview.backups.maxBackups} backups for {overview.backups.retentionDays} days</small>
          </div>
        </article>
        <article className={`storage-card ${overview.disk.status}`}>
          <span className="storage-card-icon" aria-hidden="true"><HardDrive /></span>
          <div>
            <h2>Backup disk</h2>
            <strong>{overview.disk.usedPercent == null ? "—" : `${overview.disk.usedPercent}% used`}</strong>
            <small>{overview.disk.total ? `${overview.disk.free} free of ${overview.disk.total} · ` : ""}{DISK_LABELS[overview.disk.status]}</small>
            {overview.disk.usedPercent != null && <span className="storage-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, overview.disk.usedPercent)}%` }} /></span>}
          </div>
        </article>
      </div>
      <h2 className="storage-heading">Largest tables</h2>
      <div className="housekeeping-table storage-table" role="table" aria-label="Largest tables">
        <div role="row" className="head"><span role="columnheader">Data</span><span role="columnheader">Rows</span><span role="columnheader">Size</span><span role="columnheader">Share</span></div>
        {tables.map((table) => <div role="row" key={table.name}>
          <span role="cell">
            <strong>{table.label}{table.purgeable && <em className="storage-tag">Can be purged</em>}</strong>
            <small>{table.name} · data {table.dataSize} · indexes {table.indexSize}{table.deadPercent >= 20 ? ` · ${table.deadPercent}% freed space waiting to be reused` : ""}</small>
          </span>
          <span role="cell" className="size">{table.rows.toLocaleString("en-IN")}</span>
          <span role="cell" className="size">{table.size}</span>
          <span role="cell" className="storage-share"><span className="storage-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, table.share)}%` }} /></span>{table.share}%</span>
        </div>)}
      </div>
      {overview.tables.length > TABLE_LIMIT && <button type="button" className="storage-more" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show the largest only" : `Show all ${overview.tables.length} tables`}</button>}
      <p className="housekeeping-hint">Row counts are Postgres estimates. Space freed by a purge is reused by new data rather than shrinking the database. Checked {showDateTime(overview.checkedAt)}.</p>
    </> : !error && <p className="housekeeping-loading"><RefreshCw className="spin" aria-hidden="true" /> Loading…</p>}
  </section>;
}
