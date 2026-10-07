import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleOff, Database, HardDrive, Mail, MessageCircle, RefreshCw, Send, Server, Stethoscope, XCircle, Cable } from "lucide-react";
import "./diagnostics-page.css";

const CHECK_ICONS = { app: Server, database: Database, backups: HardDrive, oracle: Cable, telegram: Send, whatsapp: MessageCircle, email: Mail };
const STATE_LABELS = { ok: "Working", warn: "Needs attention", fail: "Not working", off: "Not set up" };
const STATE_ICONS = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle, off: CircleOff };
const OVERALL = {
  ok: "Everything Caliber Pulse depends on is working.",
  warn: "Caliber Pulse is working, but some items need attention.",
  fail: "Some services Caliber Pulse depends on are not working.",
};

// Admin > Database > Diagnostics: one health check of the app server, database,
// backups, Oracle, Telegram, WhatsApp and email, run on demand.
export default function DiagnosticsPage({ token }) {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/diagnostics", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Diagnostics could not run.");
      setReport(result);
    } catch (runError) {
      setError(runError.message || "Diagnostics could not run.");
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => { run(); }, []);
  return <section className="panel pagepanel generic diagnostics-page">
    <header>
      <div><h1><Stethoscope aria-hidden="true" /> Diagnostics</h1><p>Health check of every service Caliber Pulse depends on</p></div>
      <button type="button" className="primary" onClick={run} disabled={running}>
        <RefreshCw className={running ? "spin" : ""} aria-hidden="true" />{running ? "Checking…" : "Run checks again"}
      </button>
    </header>
    {error && <div className="diagnostics-error" role="alert"><XCircle aria-hidden="true" />{error}</div>}
    {report && <>
      <div className={`diagnostics-overall ${report.overall}`} role="status">
        <strong>{OVERALL[report.overall]}</strong>
        <span>{report.summary.ok} working · {report.summary.warn} need attention · {report.summary.fail} not working · {report.summary.off} not set up</span>
        <small>Checked {new Date(report.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })}</small>
      </div>
      <div className="diagnostics-grid">
        {report.checks.map((check) => {
          const Icon = CHECK_ICONS[check.key] || Server;
          const StateIcon = STATE_ICONS[check.status] || AlertTriangle;
          return <article key={check.key} className={`diagnostics-card ${check.status}`}>
            <header>
              <span className="diagnostics-card-icon" aria-hidden="true"><Icon /></span>
              <h2>{check.label}</h2>
              <span className={`diagnostics-state ${check.status}`}><StateIcon aria-hidden="true" />{STATE_LABELS[check.status]}</span>
            </header>
            <p>{check.detail}</p>
            {check.facts.length > 0 && <dl>{check.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
            <small>Checked in {check.ms < 1000 ? `${check.ms} ms` : `${(check.ms / 1000).toFixed(1)} s`}</small>
          </article>;
        })}
      </div>
    </>}
    {!report && !error && <p className="diagnostics-loading"><RefreshCw className="spin" aria-hidden="true" /> Running checks…</p>}
  </section>;
}
