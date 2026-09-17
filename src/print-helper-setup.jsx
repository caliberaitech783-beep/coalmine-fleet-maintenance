import React, { useEffect, useState } from "react";
import { CheckCircle2, Download, Printer, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { printHelperAvailable } from "./direct-print.mjs";

const formatWhen = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(date).replaceAll("/", "-").toUpperCase();
};

/**
 * Administration > Print helper. One-time setup that lets Smart Print send reports straight to the printer
 * on the chosen A3 / A4 paper without the helper asking "Allow" each time. The signing key is created and kept
 * on the server; only the public certificate can be downloaded.
 */
export default function PrintHelperSetupPage({ session }) {
  const token = session?.token || "";
  const headers = { Authorization: `Bearer ${token}` };
  const [state, setState] = useState({ loading: true, error: "", setup: null });
  const [working, setWorking] = useState(false);
  const [helper, setHelper] = useState("checking");
  const load = async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/print-helper/setup", { cache: "no-store", headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load the print helper setup.");
      setState({ loading: false, error: "", setup: body });
    } catch (error) { setState((current) => ({ ...current, loading: false, error: error.message })); }
  };
  const checkHelper = () => { setHelper("checking"); printHelperAvailable({ token: () => token, launchWaitMs: 6000 }).then((found) => setHelper(found ? "running" : "missing")).catch(() => setHelper("missing")); };
  useEffect(() => { void load(); checkHelper(); }, [token]);
  const createCertificate = async () => {
    setWorking(true);
    try {
      const response = await fetch("/api/print-helper/setup", { method: "POST", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not create the certificate.");
      setState({ loading: false, error: "", setup: body });
    } catch (error) { alert(error.message); }
    finally { setWorking(false); }
  };
  const downloadCertificate = async () => {
    setWorking(true);
    try {
      const response = await fetch("/api/print-helper/setup/override.crt", { cache: "no-store", headers });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not download the certificate.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "override.crt";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) { alert(error.message); }
    finally { setWorking(false); }
  };
  const setup = state.setup;
  return <section className="panel pagepanel generic print-helper-page">
    <header><div><span className="page-eyebrow">Administration · Smart Print</span><h1>Print helper</h1><p>Smart Print sends reports straight to the printer on the A3 or A4 paper you choose, through the QZ Tray helper installed on the PC. This page removes the helper’s “Allow” question: do it once here, then once on each PC that prints.</p></div>
      <button type="button" className="secondary" onClick={() => { void load(); checkHelper(); }} disabled={state.loading}><RefreshCw /> Refresh</button></header>
    {state.error && <div className="org-error" role="alert"><AlertTriangle /><span>{state.error}</span></div>}
    <div className="print-helper-steps">
      <article>
        <h2><span>1</span> Certificate for this application</h2>
        {state.loading && !setup ? <p>Loading…</p> : setup?.configured
          ? <p className="print-helper-ok"><CheckCircle2 /> Ready. {setup.subject}{setup.validTo ? ` · valid until ${formatWhen(setup.validTo)}` : ""}{setup.createdBy ? ` · created by ${setup.createdBy}` : ""}{setup.source === "environment" ? " · from the server settings" : ""}</p>
          : <><p>The application needs its own certificate so the helper can recognise it. The private key is created and kept on the server; nobody sees it.</p>
            <button type="button" className="primary" onClick={createCertificate} disabled={working}><ShieldCheck /> {working ? "Creating…" : "Create certificate"}</button></>}
      </article>
      <article>
        <h2><span>2</span> On each PC that prints</h2>
        <p className={helper === "running" ? "print-helper-ok" : "print-helper-warn"}>{helper === "running" ? <CheckCircle2 /> : <Printer />} Helper on this PC: {helper === "checking" ? "checking…" : helper === "running" ? "QZ Tray is running" : "QZ Tray was not found. Install and start QZ Tray first."}</p>
        <ol>
          <li>Click <b>Download certificate file</b>. It is saved as <code>override.crt</code> (a public file, safe to copy).</li>
          <li>Move <code>override.crt</code> into the folder <code>C:\Program Files\QZ Tray</code>. Windows asks for administrator permission: click <b>Continue</b>.</li>
          <li>Right-click the QZ Tray icon near the clock and choose <b>Exit</b>, then start <b>QZ Tray</b> again from the Start menu.</li>
          <li>Print once with Smart Print. QZ Tray asks one last time: tick <b>Remember this decision</b> and click <b>Allow</b>. After that it prints without asking.</li>
        </ol>
        <button type="button" className="secondary" onClick={downloadCertificate} disabled={working || !setup?.configured}><Download /> Download certificate file</button>
        {!setup?.configured && <small>Create the certificate in step 1 first.</small>}
      </article>
    </div>
  </section>;
}
