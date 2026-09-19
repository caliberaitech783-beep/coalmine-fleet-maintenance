import React from "react";
import {AlertTriangle, CalendarClock, CheckCircle2, Cloud, Code2, Database, HardDrive, KeyRound, Laptop, LifeBuoy, Server, ShieldCheck, Upload} from "lucide-react";
import "./recovery-guide.css";

// Administration > Recovery guide: what a full recovery needs, the three
// layers of backup, a trial to prove it works, and what to do per disaster.
const PARTS = [
  {Icon: Database, title: "The database", text: "Every master, request, ticket, user and password hash, permission, audit record, daily update, attachment and audio clip, and app settings such as WhatsApp templates and print-helper signing.", tag: "In every backup file", tone: "yes"},
  {Icon: Code2, title: "The application code", text: "Every version is kept on GitHub, and deploying the azure-hosting-1.0 branch rebuilds the app. Nothing to copy by hand.", tag: "Kept by GitHub", tone: "info"},
  {Icon: KeyRound, title: "The Azure settings", text: "Secret settings on the App Service: the database address and password, WhatsApp and Meta tokens, Oracle login and the public app address. They are not inside any backup.", tag: "Keep a secure record", tone: "keep"},
  {Icon: Cloud, title: "The Azure resources", text: "The App Service, the PostgreSQL server, the domain bdms.cmll.in and its certificate. They can be recreated from the Azure portal.", tag: "Keep a written note", tone: "keep"},
];

const LAYERS = [
  {Icon: Server, title: "Server backup every night", text: "At 02:00 IST (days and time can be changed) the app writes a compressed, checksum-verified file of the whole database and keeps 30. It survives restarts and redeployments, but it lives on the same App Service, so losing the App Service loses these too."},
  {Icon: Laptop, title: "Copy to your PC every day", text: "Your PC downloads the newest backup, checks its SHA-256 checksum and keeps the number you choose. If the PC was off, it copies as soon as it is back on. A folder inside the company OneDrive gives an off-site copy as well."},
  {Icon: Cloud, title: "Azure PostgreSQL automatic backups", text: "Azure also keeps point-in-time backups of the database server. Check the retention period in the Azure portal on the PostgreSQL server's Backup and restore page."},
];

export default function RecoveryGuide({onNavigate}) {
  const go = (page) => () => onNavigate?.(page);
  const open = (page, label) => <button type="button" className="recovery-link" onClick={go(page)}>{label}</button>;
  return <section className="recovery-guide">
    <header className="recovery-hero">
      <span className="recovery-hero-icon" aria-hidden="true"><LifeBuoy /></span>
      <div><span className="recovery-eyebrow">Backup and recovery</span><h1>Recovery guide</h1><p>What to back up, where the copies live, and a trial you can follow to prove a restore works.</p></div>
    </header>

    <h2>What the whole app is made of</h2>
    <p className="recovery-lede">To bring Nerve Center back after any disaster you need four things. Only the first changes every day, so that is what the scheduled backup protects.</p>
    <div className="recovery-grid">{PARTS.map(({Icon, title, text, tag, tone}) => <article key={title} className="recovery-card"><span className="recovery-card-icon" aria-hidden="true"><Icon /></span><h3>{title}</h3><p>{text}</p><span className={`recovery-tag ${tone}`}>{tag}</span></article>)}</div>
    <div className="recovery-note warn"><AlertTriangle aria-hidden="true" /><p><b>Do this once:</b> record the Azure setting names and values in the company password manager or an Azure Key Vault, never in a plain file on a PC. Without them a rebuilt app cannot reach the database or WhatsApp.</p></div>

    <h2>Three layers of protection</h2>
    <ol className="recovery-layers">{LAYERS.map(({Icon, title, text}) => <li key={title}><span className="recovery-layer-icon" aria-hidden="true"><Icon /></span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>

    <h2>Trial: set it up and prove it works</h2>
    <ol className="recovery-trail">
      <li><h3>Check the nightly server backup</h3><p>Open {open("Backup Schedule", "Backup Schedule")}. The switch should show <b>Active</b>, every weekday ticked, 02:00 and retention 30. Click <b>Save schedule</b> if you changed anything.</p></li>
      <li><h3>Make a backup now</h3><p>On the same page click <b>Run backup now</b>. Then open {open("Backup", "Backup")}: the newest row should say <b>Completed</b> with a size and a checksum.</p></li>
      <li><h3>Create a key for your PC</h3><p>On {open("Backup Schedule", "Backup Schedule")}, scroll to <b>Copy backups to a PC</b>. Type a name such as "Head office desktop", click <b>Create PC key</b>, then <b>Copy key</b>. The key is shown only once.</p></li>
      <li><h3>Download and run the setup script on that PC</h3><p>Click <b>Download PC setup script</b>. In Downloads, right-click <code>Nerve-Center-Backup-Setup.ps1</code> and choose <b>Run with PowerShell</b>. Answer four questions: the folder, the time (03:00), how many copies to keep (30), and paste the key.</p></li>
      <li><h3>Watch the first copy</h3><p>The script runs the first copy straight away and prints a line such as <code>Copied BDMS-Backup-….ndjson.gz (12.4 MB, SHA-256 verified)</code>. The key's <b>Last copy</b> time updates and the {open("Audit Trail", "Audit Trail")} shows <b>Copy backup to PC</b>.</p></li>
      <li><h3>Confirm the daily schedule</h3><p>In Windows <b>Task Scheduler</b> find <b>Nerve Center backup copy</b>. A log of every copy is kept in <code>%LOCALAPPDATA%\NerveCenterBackup\backup-copy.log</code>.</p></li>
      <li><h3>Practise a restore without changing anything</h3><p>Open {open("Import Backup", "Import Backup")} as a Super Admin and choose a file from your PC folder. The app reads the whole file, checks it is complete and shows the rows per table. <b>Stop there</b>: nothing has changed. Repeat this drill once a month.</p></li>
    </ol>

    <h2>When something goes wrong</h2>
    <div className="recovery-table-wrap"><table className="recovery-table">
      <thead><tr><th>What happened</th><th>What to do</th></tr></thead>
      <tbody>
        <tr><td>Data was deleted or changed by mistake, and the app still works</td><td>{open("Import Backup", "Import Backup")}: choose the last good copy, inspect it, type <b>RESTORE BDMS</b> and restore. The app first takes an automatic <b>Pre-restore</b> backup, so the restore itself can be undone.</td></tr>
        <tr><td>A bad update broke the app, and the data is fine</td><td>No restore needed. Redeploy the previous working version from GitHub.</td></tr>
        <tr><td>The database is damaged or lost, and Azure still has the server</td><td>First try Azure's point-in-time restore of the PostgreSQL server. Otherwise restore your newest PC copy as in the next row.</td></tr>
        <tr><td>Everything is gone: App Service and database</td><td><ol><li>Recreate the PostgreSQL server and the App Service in Azure.</li><li>Enter the Azure settings from your secure record.</li><li>Redeploy the <code>azure-hosting-1.0</code> branch from GitHub. The first start creates empty tables.</li><li>On a PC with the project, restore the newest backup into the new database:<br /><code>node scripts/restore-database.mjs --input &lt;backup file&gt; --database-url &lt;new database&gt; --yes</code></li><li>Everyone signs in again with their usual login and password.</li></ol></td></tr>
      </tbody>
    </table></div>
    <div className="recovery-note stop"><ShieldCheck aria-hidden="true" /><p><b>Why the script in the last case:</b> a brand-new database has no users yet, so nobody can sign in to use Import Backup. The restore script writes every table back first, and then the usual logins work again.</p></div>

    <h2>Keep it safe</h2>
    <div className="recovery-grid">
      <article className="recovery-card"><span className="recovery-card-icon" aria-hidden="true"><HardDrive /></span><h3>Backup files are confidential</h3><p>They contain all operational data and password hashes. Keep the folder on an encrypted, company-managed drive or OneDrive.</p></article>
      <article className="recovery-card"><span className="recovery-card-icon" aria-hidden="true"><Laptop /></span><h3>One key per PC</h3><p>If a PC is lost or replaced, click <b>Revoke</b> next to its key on {open("Backup Schedule", "Backup Schedule")}. It stops receiving copies at once.</p></article>
      <article className="recovery-card"><span className="recovery-card-icon" aria-hidden="true"><CalendarClock /></span><h3>Test monthly</h3><p>Check the newest file date in the log, then run the inspect drill in step 7 of the trial.</p></article>
      <article className="recovery-card"><span className="recovery-card-icon" aria-hidden="true"><Upload /></span><h3>Restores are Super Admin only</h3><p>Import and restore need a Super Admin and the typed confirmation <b>RESTORE BDMS</b>; every restore is recorded in the Audit Trail.</p></article>
    </div>
    <p className="recovery-foot"><CheckCircle2 aria-hidden="true" />Backups, copies, key changes and restores all appear in the Audit Trail.</p>
  </section>;
}
