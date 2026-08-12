import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { TIME_24H_PATTERN } from "../request-time.mjs";
import {
  LayoutDashboard,
  Truck,
  Wrench,
  ArrowRightLeft,
  Users,
  Building2,
  Network,
  LogOut,
  Search,
  Plus,
  ChevronRight,
  Bell,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  Menu,
  ShieldCheck,
  UserRound,
  CalendarDays,
  Gauge,
  Mic,
  Square,
  FileBarChart,
  History,
  Download,
  Upload,
  ChevronDown,
  Pencil,
  Trash2,
  MessageCircle,
  Send,
  Eye,
  EyeOff,
  LockKeyhole,
  User,
  Activity,
} from "lucide-react";
import "./style.css";
import "./topbar.css";
import { APP_VERSION } from "./app-version.js";

const vehicles = [];
const breakdowns = [];
const storedSession = (() => {
  try {
    return JSON.parse(
      localStorage.getItem("nerveCenterSession") ||
        sessionStorage.getItem("nerveCenterSession") ||
        "null",
    );
  } catch {
    return null;
  }
})();
let authToken = storedSession?.token || "";
let currentEmployeeName = storedSession?.name || "";
const subsidiaryData = [
  {
    name: "Western Coalfields Limited",
    code: "WCL",
    state: "MH / MP",
    sites: ["Sasti II", "Majri II", "Dhoptala II", "Gouri Pouni", "Lalpeth II"],
  },
  {
    name: "Northern Coalfields Limited",
    code: "NCL",
    state: "MP / UP",
    sites: ["Jayant", "Dudhichua West", "Dudhichua East"],
  },
];
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Reports", FileBarChart],
  ["Audit Trail", History],
];
const masterNav = [
  ["Users & employees", Users],
  ["Equipment master", Truck],
  ["Breakdown master", Wrench],
  ["Region master", Building2],
  ["Vehicle transfers", ArrowRightLeft],
  ["Hierarchy master", Network],
  ["OEM master", ShieldCheck],
];
const whatsappNav = [
  ["Daily site-wise report", Building2],
  ["Daily OEM report", ShieldCheck],
  ["WhatsApp alert history", History],
];
function Status({ children }) {
  let c = children.toLowerCase().replaceAll(" ", "-");
  return (
    <span className={"status " + c}>
      <i />
      {children}
    </span>
  );
}
function Login({ onLogin }) {
  const [role, setRole] = useState("super");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const signIn = async () => {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not sign in.");
      authToken = data.token;
      currentEmployeeName = data.name;
      const session = JSON.stringify({
        token: data.token,
        role: data.role,
        name: data.name,
      });
      if (rememberMe) {
        localStorage.setItem("nerveCenterSession", session);
        sessionStorage.removeItem("nerveCenterSession");
      } else {
        sessionStorage.setItem("nerveCenterSession", session);
        localStorage.removeItem("nerveCenterSession");
      }
      onLogin(data.role);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="login">
      <section className="login-visual" aria-label="Nerve Center fleet operations">
        <div className="login-grid" aria-hidden="true" />
        <div className="login-schematic" aria-hidden="true">
          <i /><i /><i /><i />
        </div>
        <div className="login-brand">
          <div className="brandmark">CM</div>
          <div><strong>Nerve Center</strong><span>Fleet operations platform</span></div>
        </div>
        <div className="login-message">
          <div className="eyebrow"><span /> Mission-critical maintenance</div>
          <h1>Keep every machine<br />moving.</h1>
        <p>
          Maintenance operations, equipment records and field accountability —
          in one place.
        </p>
          <div className="login-proof">
            <div><Activity /><span><strong>Live oversight</strong>Across every site</span></div>
            <div><ShieldCheck /><span><strong>Secure access</strong>Role-based control</span></div>
          </div>
        </div>
        <div className="mine-art">
          <Truck size={64} />
          <span className="route-line" />
        </div>
        <div className="login-environment" aria-hidden="true">
          <span>OPS / CENTRAL INDIA</span><span>SECURE NODE 01</span>
        </div>
      </section>
      <main>
        <form
          className="loginbox"
          onSubmit={(event) => {
            event.preventDefault();
            signIn();
          }}
        >
          <div className="login-mobile-brand"><div className="brandmark">CM</div><strong>Nerve Center</strong></div>
          <small className="login-kicker"><LockKeyhole /> SECURE OPERATIONS PORTAL</small>
          <h2>Welcome back</h2>
          <p>Sign in to access your fleet operations workspace.</p>
          <fieldset className="role-fieldset">
            <legend>Choose your access role</legend>
            <div className="rolepick">
            <button
              type="button"
              className={role === "super" ? "sel" : ""}
              aria-pressed={role === "super"}
              onClick={() => setRole("super")}
            >
              <ShieldCheck />
              <b>Super User</b>
              <span>Full administration access</span>
            </button>
            <button
              type="button"
              className={role === "normal" ? "sel" : ""}
              aria-pressed={role === "normal"}
              onClick={() => setRole("normal")}
            >
              <UserRound />
              <b>Mobile User</b>
              <span>Raise maintenance request</span>
            </button>
            </div>
          </fieldset>
          <label className="login-label" htmlFor="login-username">User name</label>
          <div className="login-input">
            <User aria-hidden="true" />
            <input id="login-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your user name"
              autoComplete="username"
              spellCheck="false"
              aria-invalid={Boolean(error)}
              required
              autoFocus
            />
          </div>
          <label className="login-label" htmlFor="login-password">Password</label>
          <div className="login-input">
            <LockKeyhole aria-hidden="true" />
            <input id="login-password"
              type={showPassword ? "text" : "password"}
              inputMode="tel"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              required
            />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
          <label className="remember-me">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            Remember me
          </label>
          <div className="login-feedback" aria-live="polite">
            {error && <p className="login-error" role="alert">{error}</p>}
          </div>
          <button
            type="submit"
            className="primary"
            disabled={working || !username.trim() || !password.trim()}
          >
            {working ? "Signing in…" : "Sign in"} <ChevronRight />
          </button>
          <p className="login-help">Having trouble signing in? Contact your site administrator.</p>
        </form>
      </main>
    </div>
  );
}
function Side({ active, setActive, logout, open }) {
  const [mastersOpen, setMastersOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const selectPage = (page) => {
    setMastersOpen(false);
    setWhatsappOpen(false);
    setActive(page);
  };
  return (
    <aside className={open ? "open" : ""}>
      <div className="logo">
        <b>CM</b>
        <span>
          Nerve Center<small>BREAKDOWN MANAGEMENT SYSTEM</small>
        </span>
      </div>
      <nav>
        {nav.slice(0, 1).map(([n, I]) => (
          <button
            key={n}
            className={active === n ? "active" : ""}
            onClick={() => selectPage(n)}
          >
            <I />
            {n}
          </button>
        ))}
        <div className={mastersOpen ? "masters-menu open" : "masters-menu"}>
          <button
            className={masterNav.some(([name]) => name === active) ? "active" : ""}
            aria-haspopup="menu"
            aria-expanded={mastersOpen}
            onClick={() => setMastersOpen((value) => !value)}
          >
            <Menu />
            Masters
            <ChevronDown className="masters-chevron" />
          </button>
          <div className="masters-dropdown" role="menu">
            {masterNav.map(([name, Icon]) => (
              <button
                key={name}
                role="menuitem"
                className={active === name ? "active" : ""}
                onClick={() => selectPage(name)}
              >
                <Icon />
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className={whatsappOpen ? "masters-menu open" : "masters-menu"}>
          <button
            className={whatsappNav.some(([name]) => name === active) ? "active" : ""}
            aria-haspopup="menu"
            aria-expanded={whatsappOpen}
            onClick={() => setWhatsappOpen((value) => !value)}
          >
            <MessageCircle />
            WhatsApp Integration
            <ChevronDown className="masters-chevron" />
          </button>
          <div className="masters-dropdown whatsapp-dropdown" role="menu">
            {whatsappNav.map(([name, Icon]) => (
              <button key={name} role="menuitem" className={active === name ? "active" : ""} onClick={() => selectPage(name)}>
                <Icon />{name}
              </button>
            ))}
          </div>
        </div>
        {nav.slice(1).map(([n, I]) => (
          <button
            key={n}
            className={active === n ? "active" : ""}
            onClick={() => selectPage(n)}
          >
            <I />
            {n}
          </button>
        ))}
      </nav>
      <div className="user">
        <div>
          <UserRound />
        </div>
        <span>
          <b>Super User</b>
          <small>Administrator</small>
        </span>
        <button onClick={logout}>
          <LogOut />
        </button>
      </div>
    </aside>
  );
}
function Dashboard({ goto, gotoEquipment }) {
  const now = new Date(),
    dateLabel = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now);
  const cards = [
    [
      Truck,
      "Total equipment",
      vehicles.length,
      "Registered assets",
      "blue",
      "all",
    ],
    [
      CheckCircle2,
      "On Road",
      vehicles.filter((v) => v.status === "Operational").length,
      "Available for operation",
      "green",
      "onroad",
    ],
    [
      AlertTriangle,
      "Off Road",
      vehicles.filter((v) => v.status !== "Operational").length,
      "In maintenance or breakdown",
      "red",
      "offroad",
    ],
    [
      AlertTriangle,
      "Active breakdowns",
      breakdowns.filter((v) => v.status !== "Closed").length,
      "Open cases",
      "orange",
      "breakdown",
    ],
    [
      Clock,
      "Awaiting action",
      breakdowns.filter((v) => v.status?.startsWith("Awaiting")).length,
      "Parts or approval",
      "purple",
      "breakdown",
    ],
    [
      CheckCircle2,
      "Closed this month",
      breakdowns.filter((v) => v.status === "Closed").length,
      "Completed cases",
      "green",
      "breakdown",
    ],
  ];
  return (
    <>
      <div className="hero">
        <div>
          <span>{dateLabel}</span>
          <h1>Fleet operations dashboard</h1>
          <p>Live data will appear as records are added.</p>
        </div>
      </div>
      <div className="stats">
        {cards.map(([I, l, n, s, c, target]) => (
          <button
            key={l}
            onClick={() =>
              target === "breakdown"
                ? goto("Breakdown master")
                : gotoEquipment(target, "")
            }
          >
            <div className={c}>
              <I />
            </div>
            <span>{l}</span>
            <strong>{n}</strong>
            <small>{s}</small>
            <ChevronRight />
          </button>
        ))}
      </div>
      <section className="subsidiary-section">
        <header>
          <div>
            <h3>Regions and sites</h3>
            <p>Site-wise equipment and vehicle road status</p>
          </div>
          <button className="link" onClick={() => goto("Region master")}>
            View regions <ChevronRight />
          </button>
        </header>
        <div className="site-fleet-grid">
          {subsidiaryData.map((s) => (
            <article key={s.code} className="site-fleet-card">
              <header>
                <div className="sub-code">{s.code}</div>
                <div>
                  <b>{s.name}</b>
                  <small>{s.sites.length} sites</small>
                </div>
              </header>
              <div>
                {s.sites.map((site) => {
                  const list = vehicles.filter((v) => v.location === site),
                    on = list.filter((v) => v.status === "Operational").length,
                    off = list.length - on;
                  return (
                    <div className="site-fleet-row" key={site}>
                      <button
                        className="site-title"
                        onClick={() => gotoEquipment("all", site)}
                      >
                        <MapPin />
                        {site}
                      </button>
                      <button onClick={() => gotoEquipment("all", site)}>
                        <strong>{list.length}</strong>
                        <span>Total</span>
                      </button>
                      <button
                        className="on"
                        onClick={() => gotoEquipment("onroad", site)}
                      >
                        <strong>{on}</strong>
                        <span>On Road</span>
                      </button>
                      <button
                        className="off"
                        onClick={() => gotoEquipment("offroad", site)}
                      >
                        <strong>{off}</strong>
                        <span>Off Road</span>
                      </button>
                      <ChevronRight />
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="grid">
        <section className="panel wide">
          <header>
            <div>
              <h3>Breakdown overview</h3>
              <p>
                {breakdowns.length
                  ? "Cases by current status"
                  : "No breakdown records available"}
              </p>
            </div>
          </header>
          <div className="bars">
            {[
              "Open",
              "In progress",
              "Awaiting parts",
              "Awaiting approval",
              "Closed",
            ].map((a, i) => {
              const n = breakdowns.filter((b) => b.status === a).length;
              return (
                <button key={a}>
                  <span>{a}</span>
                  <div>
                    <i
                      style={{
                        width:
                          (breakdowns.length
                            ? (n / breakdowns.length) * 100
                            : 0) + "%",
                      }}
                      className={"bar b" + i}
                    />
                  </div>
                  <b>{n}</b>
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <header>
            <div>
              <h3>Fleet availability</h3>
              <p>
                {vehicles.length
                  ? "Live equipment road status"
                  : "No equipment records available"}
              </p>
            </div>
          </header>
          <div className="donut">
            <div>
              <strong>
                {vehicles.length
                  ? Math.round(
                      (vehicles.filter((v) => v.status === "Operational")
                        .length /
                        vehicles.length) *
                        100,
                    )
                  : 0}
                %
              </strong>
              <span>On Road</span>
            </div>
          </div>
          <div className="legend">
            <span>
              <i className="lg1" />
              On Road{" "}
              <b>{vehicles.filter((v) => v.status === "Operational").length}</b>
            </span>
            <span>
              <i className="lg3" />
              Off Road{" "}
              <b>{vehicles.filter((v) => v.status !== "Operational").length}</b>
            </span>
          </div>
        </section>
      </div>
      <section className="panel table">
        <header>
          <div>
            <h3>Recent breakdown cases</h3>
            <p>
              {breakdowns.length
                ? "Latest activity"
                : "No breakdown records available"}
            </p>
          </div>
          <button className="link" onClick={() => goto("Breakdown master")}>
            View all cases <ChevronRight />
          </button>
        </header>
        <BreakdownTable rows={breakdowns.slice(0, 5)} />
      </section>
    </>
  );
}
function BreakdownTable({ rows = breakdowns }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Job reference</th>
            <th>Door no.</th>
            <th>Site location</th>
            <th>Repair category</th>
            <th>Started</th>
            <th>Downtime</th>
            <th>Status</th>
            <th>Responsibility</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r) => (
              <tr key={r.ref}>
                <td>
                  <b>{r.ref}</b>
                </td>
                <td>{r.door}</td>
                <td>
                  <MapPin /> {r.site}
                </td>
                <td>{r.category}</td>
                <td>{r.start}</td>
                <td>{r.hours}</td>
                <td>
                  <Status>{r.status}</Status>
                </td>
                <td>{r.owner}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8" className="empty-state">
                No records available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
const masterFields = {
  "Equipment master": [
    ["door", "Door / registration"],
    ["reg", "Registration no."],
    ["location", "Site location"],
    ["category", "Equipment category"],
    ["group", "Equipment group"],
    ["make", "Make"],
    ["model", "Model"],
    ["asset", "Asset no."],
    ["acquired", "Acquired date"],
    ["status", "Equipment status"],
  ],
  "Vehicle transfers": [
    ["door", "Door no."],
    ["registration", "Registration no."],
    ["transferDate", "Transfer date"],
    ["source", "Source location"],
    ["destination", "Destination"],
    ["openingMeter", "Opening KMR/HMR"],
    ["closingMeter", "Closing KMR/HMR"],
    ["creator", "Creator"],
    ["status", "Status"],
  ],
  "Breakdown master": [
    ["ref", "Job reference"],
    ["door", "Door no."],
    ["site", "Site location"],
    ["category", "Repair category"],
    ["start", "Started"],
    ["hours", "Downtime"],
    ["status", "Status"],
    ["owner", "Responsibility"],
  ],
  "Users & employees": [
    ["login", "Login name"],
    ["employee", "Employee name"],
    ["site", "Site name"],
    ["department", "Department"],
    ["designation", "Designation"],
    ["email", "Mail ID"],
    ["phone", "Phone no."],
    ["role", "Role"],
    ["userType", "User type (Mobile User / Super Admin)"],
  ],
  "Region master": [
    ["name", "Region name"],
    ["code", "Short name"],
    ["state", "State code"],
    ["sites", "Sites (separate with |)"],
  ],
  "Hierarchy master": [
    ["subsidiary", "Region"],
    ["area", "Area"],
    ["site", "Site / Mine"],
    ["department", "Department"],
    ["head", "Reporting head"],
    ["level", "User level (L1 / L2 / L3 / L4)"],
  ],
  "OEM master": [
    ["oem", "OEM name"],
    ["contact", "Contact name"],
    ["designation", "Designation"],
    ["phone", "Phone no."],
    ["email", "Email ID"],
    ["location", "Location"],
    ["level", "Level (L1 / L2 / L3 / L4)"],
  ],
};
function parseCsv(text, fields) {
  const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(Boolean),
    split = (line) =>
      line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((v) =>
        v
          .trim()
          .replace(/^\"|\"$/g, "")
          .replace(/\"\"/g, '\"'),
      );
  if (lines.length < 2)
    throw new Error(
      "The CSV must contain a header row and at least one data row.",
    );
  const headers = split(lines[0]).map((h) => h.toLowerCase()),
    aliases = new Map(
      fields.flatMap(([key, label]) => [
        [key.toLowerCase(), key],
        [label.toLowerCase(), key],
      ]),
    );
  return lines
    .slice(1)
    .map((line) => {
      const values = split(line),
        record = {};
      headers.forEach((header, index) => {
        const key = aliases.get(header);
        if (key) record[key] = values[index] || "";
      });
      return record;
    })
    .filter((record) => Object.values(record).some(Boolean));
}
function MasterActions({ name, onAdd }) {
  const [mode, setMode] = useState(null),
    fields = masterFields[name];
  if (!fields) return null;
  const saveManual = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      record = Object.fromEntries(
        fields.map(([key]) => [key, String(fd.get(key) || "").trim()]),
      );
    if (name === "Equipment master" && !record.status)
      record.status = "Operational";
    onAdd([record]);
    setMode(null);
  };
  const importFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const records = parseCsv(await file.text(), fields);
      if (!records.length) throw new Error("No usable rows were found.");
      if (name === "Users & employees") {
        const allowedDepartments = ["Maintenance User", "Production User", "MIS User"];
        const invalid = records.find((record) =>
          record.department && !allowedDepartments.includes(record.department),
        );
        if (invalid)
          throw new Error(
            "Department must be Maintenance User, Production User, or MIS User.",
          );
      }
      await onAdd(records);
      setMode(null);
    } catch (error) {
      alert(error.message);
    }
  };
  const template = () => {
    const csv =
      fields
        .map(([, label]) => '"' + label.replaceAll('"', '""') + '"')
        .join(",") + "\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = name.toLowerCase().replaceAll(" ", "-") + "-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <>
      <div className="master-actions">
        <button className="secondary" onClick={() => setMode("import")}>
          <Upload />
          Import
        </button>
        <button className="primary" onClick={() => setMode("manual")}>
          <Plus />
          Add record
        </button>
      </div>
      {mode === "manual" && (
        <Modal title={"Add to " + name} close={() => setMode(null)}>
          <form className="form master-form" onSubmit={saveManual}>
            <div className="formgrid">
              {fields.map(([key, label]) => (
                <label key={key}>
                  {label} *
                  {key === "level" ? (
                    <select name={key} required defaultValue="">
                      <option value="" disabled>
                        Select level
                      </option>
                      {["L1", "L2", "L3", "L4"].map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  ) : key === "department" && name === "Users & employees" ? (
                    <select name={key} required defaultValue="">
                      <option value="" disabled>Select department</option>
                      {["Maintenance User", "Production User", "MIS User"].map((department) => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={key}
                      required={key === fields[0][0]}
                      placeholder={"Enter " + label.toLowerCase()}
                    />
                  )}
                </label>
              ))}
            </div>
            <footer>
              <button type="button" onClick={() => setMode(null)}>
                Cancel
              </button>
              <button className="primary">Save record</button>
            </footer>
          </form>
        </Modal>
      )}
      {mode === "import" && (
        <Modal title={"Import " + name} close={() => setMode(null)}>
          <div className="import-box">
            <Upload />
            <h3>Upload a CSV file</h3>
            <p>
              The first row must contain the field headings. Download the
              template for the correct format.
            </p>
            <input type="file" accept=".csv,text/csv" onChange={importFile} />
            <button type="button" className="secondary" onClick={template}>
              <Download />
              Download CSV template
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Equipment({
  initialFilter = "all",
  initialLocation = "",
  records = [],
  onAdd,
}) {
  const [q, setQ] = useState(""),
    [road, setRoad] = useState(initialFilter),
    [location, setLocation] = useState(initialLocation),
    [detail, setDetail] = useState(null);
  const roadStatus = (v) =>
      v.status === "Operational" ? "On Road" : "Off Road",
    locations = [
      ...new Set([
        ...subsidiaryData.flatMap((s) => s.sites),
        ...records.map((v) => v.location).filter(Boolean),
      ]),
    ];
  let rows = records.filter(
    (v) =>
      (road === "all" ||
        roadStatus(v).toLowerCase().replace(" ", "") === road) &&
      (!location || v.location === location) &&
      Object.values(v).join(" ").toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <section className="panel table pagepanel">
      <header>
        <div>
          <h1>Equipment master</h1>
          <p>
            {location ? location + " · " : ""}
            {road === "all"
              ? "All equipment"
              : road === "onroad"
                ? "On Road equipment"
                : "Off Road equipment"}{" "}
            · {rows.length} records shown
          </p>
        </div>
        <MasterActions name="Equipment master" onAdd={onAdd} />
      </header>
      <div className="toolbar">
        <div>
          <Search />
          <input
            placeholder="Search door no., registration, asset..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select value={road} onChange={(e) => setRoad(e.target.value)}>
          <option value="all">All road statuses</option>
          <option value="onroad">On Road</option>
          <option value="offroad">Off Road</option>
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">All sites</option>
          {locations.map((site) => (
            <option key={site}>{site}</option>
          ))}
        </select>
        <select>
          <option>All categories</option>
        </select>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Door / Registration</th>
              <th>Location</th>
              <th>Equipment</th>
              <th>Make & model</th>
              <th>Asset no.</th>
              <th>Acquired</th>
              <th>Road status</th>
              <th>Equipment status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((v, i) => (
                <tr
                  key={v.id || v.door || i}
                  onClick={() => setDetail(v)}
                  className="click"
                >
                  <td>
                    <b>{v.door}</b>
                    <small>{v.reg}</small>
                  </td>
                  <td>
                    <MapPin /> {v.location}
                  </td>
                  <td>
                    {v.category}
                    <small>{v.group}</small>
                  </td>
                  <td>
                    {v.make}
                    <small>{v.model}</small>
                  </td>
                  <td>{v.asset}</td>
                  <td>{v.acquired}</td>
                  <td>
                    <Status>{roadStatus(v)}</Status>
                  </td>
                  <td>
                    <Status>{v.status || "Operational"}</Status>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="empty-state">
                  No equipment or vehicle records for this selection
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {detail && (
        <Modal title="Equipment details" close={() => setDetail(null)}>
          <div className="detailhead">
            <div className="truckicon">
              <Truck />
            </div>
            <div>
              <h2>{detail.door}</h2>
              <p>
                {detail.make} {detail.model} · {detail.reg}
              </p>
            </div>
            <Status>{roadStatus(detail)}</Status>
          </div>
          <div className="details">
            {Object.entries(detail)
              .filter(([k]) => k !== "id")
              .map(([k, v]) => (
                <div key={k}>
                  <span>{k.replace(/([A-Z])/g, " $1")}</span>
                  <b>{v}</b>
                </div>
              ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
function Breakdown({ requests = [] }) {
  const open = requests.filter((r) => r.status === "Open").length,
    inProgress = requests.filter((r) => r.status === "In progress").length,
    awaiting = requests.filter((r) => r.status === "Awaiting parts").length,
    closed = requests.filter((r) => r.status === "Closed").length;
  return (
    <section className="panel table pagepanel">
      <header>
        <div>
          <h1>Mobile User requests</h1>
          <p>
            Read-only view · Super Users cannot edit or delete submitted
            requests
          </p>
        </div>
        <span className="readonly-badge">
          <ShieldCheck />
          Read only
        </span>
      </header>
      <div className="tabs">
        {[
          `All requests ${requests.length}`,
          `Open ${open}`,
          `In progress ${inProgress}`,
          `Awaiting parts ${awaiting}`,
          `Closed ${closed}`,
        ].map((x, i) => (
          <button key={x} className={i === 0 ? "active" : ""}>
            {x}
          </button>
        ))}
      </div>
      <BreakdownTable rows={requests} />
    </section>
  );
}
const speechLanguages = [
  ["hi-IN", "Hindi"],
  ["en-IN", "English"],
  ["mr-IN", "Marathi"],
  ["bn-IN", "Bengali"],
  ["te-IN", "Telugu"],
  ["ta-IN", "Tamil"],
  ["gu-IN", "Gujarati"],
  ["kn-IN", "Kannada"],
  ["ml-IN", "Malayalam"],
  ["pa-IN", "Punjabi"],
  ["ur-IN", "Urdu"],
  ["or-IN", "Odia"],
  ["ne-NP", "Nepali"],
  ["ar-SA", "Arabic"],
  ["es-ES", "Spanish"],
  ["fr-FR", "French"],
];
function SpeechComplaint() {
  const [text, setText] = useState(""),
    [lang, setLang] = useState("hi-IN"),
    [listening, setListening] = useState(false),
    [working, setWorking] = useState(false),
    [note, setNote] = useState("");
  const recognition = useRef(null);
  const start = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      setNote("Voice input is not supported here. Please use Chrome or Edge.");
      return;
    }
    const r = new Speech();
    recognition.current = r;
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    let final = "";
    r.onstart = () => {
      setListening(true);
      setNote("Listening… speak naturally in your selected language.");
    };
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setNote(interim || "Converting speech…");
    };
    r.onerror = (e) => {
      setListening(false);
      setNote(
        e.error === "not-allowed"
          ? "Microphone permission is required."
          : "Could not hear clearly. Please try again.",
      );
    };
    r.onend = async () => {
      setListening(false);
      if (!final) return;
      setWorking(true);
      setNote("Converting to simple English…");
      try {
        const source = lang.split("-")[0];
        if (source === "en") {
          setText(final.trim());
          setNote("Voice converted to text.");
        } else {
          const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(final)}&langpair=${source}|en`,
          );
          const data = await res.json();
          const english = data?.responseData?.translatedText;
          if (!english) throw new Error();
          setText(english.replace(/&#39;/g, "'").trim());
          setNote("Translated into simple English.");
        }
      } catch {
        setText(final.trim());
        setNote(
          "Speech was transcribed, but English translation is unavailable. You can edit the text.",
        );
      } finally {
        setWorking(false);
      }
    };
    r.start();
  };
  const stop = () => recognition.current?.stop();
  return (
    <label className="full speechfield">
      <span>Reason / complaint *</span>
      <div className="speechtools">
        <select
          aria-label="Spoken language"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          {speechLanguages.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={listening ? "recording" : ""}
          onClick={listening ? stop : start}
          disabled={working}
        >
          {listening ? <Square /> : <Mic />}
          {listening
            ? "Stop recording"
            : working
              ? "Translating…"
              : "Speak complaint"}
        </button>
      </div>
      <textarea
        name="complaint"
        required
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type here, or select your language and speak. Simple English text will appear here."
      />
      <small className={listening ? "voice-note live" : "voice-note"}>
        {note ||
          "Your microphone is used only while recording. You can edit the result before submitting."}
      </small>
    </label>
  );
}
const speechCorrections = {
  tamani: "kamani",
  kamni: "kamani",
  tutt: "toot",
  bake: "brake",
  brek: "brake",
  hydrolic: "hydraulic",
  hydralic: "hydraulic",
  haidrolik: "hydraulic",
  stering: "steering",
  radiater: "radiator",
  alternetor: "alternator",
  transmision: "transmission",
  diferential: "differential",
  coolent: "coolant",
  puncure: "puncture",
};
const speechComponents = {
  "leaf spring": ["leaf spring", "kamani"],
  brake: ["brake"],
  engine: ["engine"],
  "hydraulic pipe": ["hydraulic pipe"],
  "hydraulic hose": ["hydraulic hose"],
  "hydraulic pump": ["hydraulic pump"],
  steering: ["steering"],
  tyre: ["tyre", "tire"],
  battery: ["battery"],
  gearbox: ["gearbox", "gear box"],
  clutch: ["clutch"],
  radiator: ["radiator"],
  alternator: ["alternator"],
  "starter motor": ["starter motor"],
  differential: ["differential"],
  "propeller shaft": ["propeller shaft"],
  axle: ["axle"],
};
const speechFaults = {
  broken: ["broken", "toot", "tut"],
  notWorking: ["not working"],
  leaking: ["leaking", "leak", "leakage"],
  overheating: ["overheating", "overheat"],
  punctured: ["punctured", "puncture"],
  notStarting: ["not starting", "won't start"],
  discharged: ["battery down", "down battery", "discharged"],
  lowPressure: ["low pressure", "pressure low"],
};
function normalizeComplaint(value) {
  let text = String(value || "")
    .trim()
    .replace(/\b([a-z]{1,3})-(?:\1-)+([a-z]+)\b/gi, "$2")
    .replace(/\b(uh+|um+|erm+|hmm+)\b[\s,]*/gi, "")
    .replace(/\b([a-z]+)(?:[\s,]+\1\b)+/gi, "$1");
  for (const [wrong, right] of Object.entries(speechCorrections))
    text = text.replace(new RegExp("\\b" + wrong + "\\b", "gi"), right);
  const lower = text.toLowerCase(),
    component = Object.entries(speechComponents).find(([, aliases]) =>
      aliases.some((a) => lower.includes(a)),
    )?.[0],
    fault = Object.entries(speechFaults).find(([, aliases]) =>
      aliases.some((a) => lower.includes(a)),
    )?.[0];
  if (component && fault) {
    if (fault === "broken") text = `The ${component} is broken.`;
    if (fault === "notWorking") text = `The ${component} is not working.`;
    if (fault === "leaking") text = `The ${component} is leaking.`;
    if (fault === "overheating") text = `The ${component} is overheating.`;
    if (fault === "punctured") text = `The ${component} is punctured.`;
    if (fault === "notStarting") text = `The ${component} is not starting.`;
    if (fault === "discharged") text = `The ${component} is discharged.`;
    if (fault === "lowPressure") text = `The ${component} pressure is low.`;
  }
  text = text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (text && !/[.!?]$/.test(text)) text += ".";
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}
function EnhancedSpeechComplaint() {
  const [text, setText] = useState(""),
    [lang, setLang] = useState("hi-IN"),
    [listening, setListening] = useState(false),
    [working, setWorking] = useState(false),
    [note, setNote] = useState("");
  const recognition = useRef(null),
    silenceTimer = useRef(null),
    maxTimer = useRef(null);
  const clearTimers = () => {
    clearTimeout(silenceTimer.current);
    clearTimeout(maxTimer.current);
  };
  const stop = () => recognition.current?.stop();
  const start = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      setNote("Speech recognition requires Chrome or Edge.");
      return;
    }
    const r = new Speech();
    recognition.current = r;
    r.lang = lang;
    r.interimResults = true;
    r.continuous = true;
    let final = "";
    const resetSilence = () => {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(stop, 5000);
    };
    r.onstart = () => {
      setListening(true);
      setNote("Listening… pause up to 5 seconds while speaking.");
      resetSilence();
      maxTimer.current = setTimeout(stop, 45000);
    };
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += " " + e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setNote(interim || "Processing speech…");
      resetSilence();
    };
    r.onerror = (e) => {
      clearTimers();
      setListening(false);
      setNote(
        e.error === "not-allowed"
          ? "Microphone permission was denied."
          : e.error === "no-speech"
            ? "No clear speech was detected."
            : "Speech recognition failed. Please try again.",
      );
    };
    r.onend = async () => {
      clearTimers();
      setListening(false);
      if (!final.trim()) return;
      setWorking(true);
      try {
        const source = lang.split("-")[0];
        let result = final.trim();
        if (source !== "en") {
          setNote("Translating into clear English…");
          const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(result)}&langpair=${source}|en`,
          );
          const data = await res.json();
          result = data?.responseData?.translatedText || result;
        }
        setText(normalizeComplaint(result.replace(/&#39;/g, "'")));
        setNote(
          "Complaint converted to clear English. You can edit it before submitting.",
        );
      } catch {
        setText(normalizeComplaint(final));
        setNote("Speech transcribed. You can edit it before submitting.");
      } finally {
        setWorking(false);
      }
    };
    try {
      r.start();
    } catch {
      setNote("Could not start the microphone. Please try again.");
    }
  };
  return (
    <label className="full speechfield">
      <span>Reason / complaint *</span>
      <div className="speechtools">
        <select
          aria-label="Spoken language"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          {speechLanguages.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={listening ? "recording" : ""}
          onClick={listening ? stop : start}
          disabled={working}
        >
          {listening ? <Square /> : <Mic />}
          {listening
            ? "Stop recording"
            : working
              ? "Processing…"
              : "Speak complaint"}
        </button>
      </div>
      <textarea
        name="complaint"
        required
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type here, or select your language and speak. Clear English text will appear here."
      />
      <small className={listening ? "voice-note live" : "voice-note"}>
        {note ||
          "Your microphone is used only while recording. Audio is not stored."}
      </small>
    </label>
  );
}
SpeechComplaint = EnhancedSpeechComplaint;
function MaintenanceForm({ close, normal = false, onSubmit }) {
  const [door, setDoor] = useState("");
  const [openedAt] = useState(() => new Date());
  const pad = (n) => String(n).padStart(2, "0");
  const systemDate = `${openedAt.getFullYear()}-${pad(openedAt.getMonth() + 1)}-${pad(openedAt.getDate())}`,
    systemTime = `${pad(openedAt.getHours())}:${pad(openedAt.getMinutes())}:${pad(openedAt.getSeconds())}`,
    v = vehicles.find((x) => x.door === door);
  const [requestTime, setRequestTime] = useState(systemTime);
  const submit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      request = {
        ref: "REQ-" + Date.now(),
        door: fd.get("door"),
        site: v?.location || "Not assigned",
        category: "Maintenance request",
        complaint: fd.get("complaint"),
        start: fd.get("date") + " · " + fd.get("time"),
        hours: "—",
        status: "Open",
        owner: "Mobile User",
        reg: v?.reg || "",
      };
    onSubmit?.(request);
    close();
    alert(
      "Maintenance request submitted successfully. It is now visible to the Super User.",
    );
  };
  return (
    <Modal
      title={normal ? "Push vehicle for maintenance" : "Create breakdown case"}
      close={close}
    >
      <form className="form" onSubmit={submit}>
        <div className="formgrid">
          <label>
            Door number *
            <input
              name="door"
              required
              value={door}
              onChange={(e) => setDoor(e.target.value)}
              list="door-numbers"
              placeholder="Enter door number"
            />
            <datalist id="door-numbers">
              {vehicles.map((v) => (
                <option key={v.door} value={v.door} />
              ))}
            </datalist>
          </label>
          <label>
            Date *<input name="date" type="date" defaultValue={systemDate} />
          </label>
          {!normal && (
            <label>
              User name
              <input placeholder="Signed-in user" readOnly />
            </label>
          )}
          <label>
            Timing (HH:MM:SS)
            <input
              name="time"
              type="text"
              inputMode="numeric"
              value={requestTime}
              onChange={(event) => setRequestTime(event.target.value)}
              placeholder="HH:MM:SS"
              pattern={TIME_24H_PATTERN}
              title="Enter time in 24-hour HH:MM:SS format"
              autoComplete="off"
              required
            />
          </label>
          <label>
            Registration number
            <input value={v?.reg || "Auto-fetched when available"} readOnly />
          </label>
          <label>
            Site location
            <input
              value={v?.location || "Auto-fetched when available"}
              readOnly
            />
          </label>
          <SpeechComplaint />
        </div>
        {v && (
          <div className="autofetch">
            <CheckCircle2 />
            <span>
              <b>Vehicle details fetched</b>
              {v.make} {v.model} · KMR {v.kmr} · HMR {v.hmr}
            </span>
          </div>
        )}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary">
            Submit request <ChevronRight />
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function Subsidiaries({ gotoEquipment }) {
  const [open, setOpen] = useState(null),
    [q, setQ] = useState("");
  const data = subsidiaryData.filter((x) =>
    (x.name + " " + x.code + " " + x.sites.join(" "))
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <section className="panel pagepanel generic">
      <header>
        <div>
          <h1>Region master</h1>
          <p>
            Click a region, then select Total, On Road or Off Road for any
            site
          </p>
        </div>
        <button className="primary">
          <Plus />
          Add record
        </button>
      </header>
      <div className="toolbar">
        <div>
          <Search />
          <input
            placeholder="Search regions or sites"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="emptytable">
        <table>
          <thead>
            <tr>
              <th>Region name</th>
              <th>Short name</th>
              <th>State code</th>
              <th>Sites</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <React.Fragment key={s.code}>
                <tr
                  className="click drill-parent"
                  onClick={() => setOpen(open === s.code ? null : s.code)}
                >
                  <td>
                    <b>{s.name}</b>
                  </td>
                  <td>{s.code}</td>
                  <td>{s.state}</td>
                  <td>{s.sites.length} sites</td>
                  <td>
                    <ChevronRight
                      className={open === s.code ? "drill-open" : ""}
                    />
                  </td>
                </tr>
                {open === s.code && (
                  <tr className="drill-row">
                    <td colSpan="5">
                      <div className="site-drill">
                        <div>
                          <Building2 />
                          <span>
                            <b>{s.code} sites</b>
                            <small>
                              Equipment and vehicle road status by site
                            </small>
                          </span>
                        </div>
                        <div className="site-linked-list">
                          {s.sites.map((site) => {
                            const list = vehicles.filter(
                                (v) => v.location === site,
                              ),
                              on = list.filter(
                                (v) => v.status === "Operational",
                              ).length,
                              off = list.length - on;
                            return (
                              <div className="site-linked" key={site}>
                                <button
                                  className="site-title"
                                  onClick={() => gotoEquipment("all", site)}
                                >
                                  <MapPin />
                                  {site}
                                </button>
                                <button
                                  onClick={() => gotoEquipment("all", site)}
                                >
                                  <strong>{list.length}</strong>
                                  <span>Total</span>
                                </button>
                                <button
                                  className="on"
                                  onClick={() => gotoEquipment("onroad", site)}
                                >
                                  <strong>{on}</strong>
                                  <span>On Road</span>
                                </button>
                                <button
                                  className="off"
                                  onClick={() => gotoEquipment("offroad", site)}
                                >
                                  <strong>{off}</strong>
                                  <span>Off Road</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Generic({ name, requests = [] }) {
  const isReport = name === "Reports",
    isAudit = name === "Audit Trail";
  const columns = {
    "Vehicle transfers": [
      "Door no.",
      "Registration no.",
      "Transfer date",
      "Source location",
      "Destination",
      "Opening KMR/HMR",
      "Closing KMR/HMR",
      "Creator",
      "Status",
    ],
    "Users & employees": [
      "Login name",
      "Employee name",
      "Site name",
      "Department",
      "Designation",
      "Mail ID",
      "Phone no.",
      "Role",
      "User type (Mobile User / Super Admin)",
    ],
    "Hierarchy master": [
      "Region",
      "Area",
      "Site / Mine",
      "Department",
      "Reporting head",
    ],
    "OEM master": [
      "OEM name",
      "Contact name",
      "Designation",
      "Phone no.",
      "Email ID",
      "Location",
    ],
    Reports: [
      "Report name",
      "Category",
      "Region",
      "Period",
      "Generated by",
      "Last generated",
      "Format",
    ],
    "Audit Trail": [
      "Date & time",
      "User",
      "Role",
      "Module",
      "Action",
      "Record reference",
      "IP / Device",
    ],
  }[name];
  const reportNames = [
    ["Executive dashboard summary", "Dashboard"],
    ["Fleet availability: On Road / Off Road", "Dashboard"],
    ["Equipment master register", "Equipment master"],
    ["Equipment category, group & make report", "Equipment master"],
    ["Vehicle transfer history", "Vehicle transfers"],
    ["Breakdown case register", "Breakdown master"],
    ["Breakdown downtime & responsibility analysis", "Breakdown master"],
    ["Preventive maintenance report", "Breakdown master"],
    ["Users & employees directory", "Users & employees"],
    ["Region and site-wise fleet report", "Region master"],
    ["Organisation hierarchy report", "Hierarchy master"],
    ["OEM contact and responsibility report", "OEM master"],
    ["Audit activity report", "Audit Trail"],
  ];
  const generate = () => {
    const started = performance.now();
    alert("Report generation started. Estimated time: 2 seconds.");
    setTimeout(
      () =>
        alert(
          "Report generated in " +
            ((performance.now() - started) / 1000).toFixed(1) +
            " seconds.",
        ),
      1200,
    );
  };
  const rows = isReport
    ? reportNames.map(([report, category]) => [
        report,
        category,
        "All regions",
        "Select period",
        "—",
        "Not generated",
        "PDF / Excel",
      ])
    : [];
  const requestAgeInDays = (request) => {
    const startedAt = new Date(String(request.start || "").replace(" ", "T"));
    if (Number.isNaN(startedAt.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 86400000));
  };
  const requestAgeClass = (age) =>
    age > 5 ? "request-age-red" : age >= 2 && age <= 4 ? "request-age-orange" : age === 1 ? "request-age-yellow" : "";
  return (
    <section className="panel pagepanel generic">
      <header>
        <div>
          <h1>{name}</h1>
          <p>
            {isReport
              ? "Available reports for all application modules"
              : isAudit
                ? "User activity will appear here"
                : "No records added yet"}
          </p>
        </div>
        <button className="primary" onClick={isReport ? generate : undefined}>
          {isReport || isAudit ? (
            <>
              <Download />
              Export
            </>
          ) : (
            <>
              <Plus />
              Add record
            </>
          )}
        </button>
      </header>
      <div className="toolbar">
        <div>
          <Search />
          <input placeholder={"Search " + name.toLowerCase()} />
        </div>
        {isReport && (
          <select>
            <option>All regions</option>
            <option>WCL</option>
            <option>NCL</option>
          </select>
        )}
      </div>
      {isReport && (
        <div className="request-age-report">
          <div className="request-age-heading">
            <div>
              <h2>Service and maintenance request ageing</h2>
              <p>Requests are highlighted automatically according to their age.</p>
            </div>
            <div className="request-age-legend">
              <span className="yellow">1 day</span>
              <span className="orange">2–4 days</span>
              <span className="red">More than 5 days</span>
            </div>
          </div>
          <div className="emptytable">
            <table>
              <thead><tr><th>Job reference</th><th>Door no.</th><th>Site</th><th>Complaint</th><th>Created</th><th>Age</th><th>Status</th></tr></thead>
              <tbody>
                {requests.length ? requests.map((request) => {
                  const age = requestAgeInDays(request);
                  return (
                    <tr key={request.ref} className={requestAgeClass(age)}>
                      <td><b>{request.ref}</b></td><td>{request.door}</td><td>{request.site}</td><td>{request.complaint}</td>
                      <td>{request.start}</td><td><b>{age} {age === 1 ? "day" : "days"}</b></td><td><Status>{request.status}</Status></td>
                    </tr>
                  );
                }) : <tr><td colSpan="7" className="empty-state">No service or maintenance requests available</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="emptytable">
        <table>
          <thead>
            <tr>
              {columns.map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{ci === 0 ? <b>{cell}</b> : cell}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-state">
                  No records available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function MasterPage({ name, records = [], onAdd, onEdit, onDelete }) {
  const [q, setQ] = useState(""),
    [editing, setEditing] = useState(null),
    fields = masterFields[name],
    canManageRows = name === "OEM master" || name === "Users & employees",
    rows = records.filter((record) =>
      Object.values(record).join(" ").toLowerCase().includes(q.toLowerCase()),
    );
  const saveEdit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const updated = Object.fromEntries(fields.map(([key]) => [key, String(form.get(key) || "").trim()]));
    try {
      await onEdit(editing.id, updated);
      setEditing(null);
    } catch (error) { alert(error.message); }
  };
  const deleteRow = async (record) => {
    const recordName = record.oem || record.employee || record.login || "this record";
    if (!confirm(`Delete ${recordName}? This cannot be undone.`)) return;
    try { await onDelete(record.id); }
    catch (error) { alert(error.message); }
  };
  return (
    <>
    <section className="panel pagepanel generic">
      <header>
        <div>
          <h1>{name}</h1>
          <p>{rows.length} records shown · import CSV or add one manually</p>
        </div>
        <MasterActions name={name} onAdd={onAdd} />
      </header>
      <div className="toolbar">
        <div>
          <Search />
          <input
            placeholder={"Search " + name.toLowerCase()}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="emptytable">
        <table>
          <thead>
            <tr>
              {fields.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              {canManageRows && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, ri) => (
                <tr key={row.id || ri}>
                  {fields.map(([key], ci) => (
                    <td key={key}>{ci === 0 ? <b>{row[key]}</b> : row[key]}</td>
                  ))}
                  {canManageRows && (
                    <td className="row-actions">
                      <button aria-label={`Edit ${row.oem || row.employee || row.login || "record"}`} onClick={() => setEditing(row)}><Pencil /> Edit</button>
                      <button className="delete" aria-label={`Delete ${row.oem || row.employee || row.login || "record"}`} onClick={() => deleteRow(row)}><Trash2 /> Delete</button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={fields.length + (canManageRows ? 1 : 0)} className="empty-state">
                  No records available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
    {editing && (
      <Modal title={`Edit ${name === "Users & employees" ? "user or employee" : "OEM"} record`} close={() => setEditing(null)}>
        <form className="form master-form" onSubmit={saveEdit}>
          <div className="formgrid">
            {fields.map(([key, label]) => (
              <label key={key}>{label} *
                {key === "level" ? (
                  <select name={key} required defaultValue={editing[key] || ""}>
                    <option value="" disabled>Select level</option>
                    {["L1", "L2", "L3", "L4"].map((level) => <option key={level}>{level}</option>)}
                  </select>
                ) : key === "department" && name === "Users & employees" ? (
                  <select name={key} required defaultValue={editing[key] || ""}>
                    <option value="" disabled>Select department</option>
                    {["Maintenance User", "Production User", "MIS User"].map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                ) : <input name={key} defaultValue={editing[key] || ""} required={key === fields[0][0]} />}
              </label>
            ))}
          </div>
          <footer>
            <button type="button" onClick={() => setEditing(null)}>Cancel</button>
            <button className="primary">Save changes</button>
          </footer>
        </form>
      </Modal>
    )}
    </>
  );
}
function useMasterRecords(name, seed = []) {
  const [records, setRecords] = useState(seed),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const loadStartedAt = performance.now();
    fetch("/api/masters")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setRecords([...seed, ...(data[name] || [])]))
      .catch(() => {})
      .finally(() => {
        setLoaded(true);
        window.dispatchEvent(new CustomEvent("menu-data-loaded", {
          detail: {name, seconds: (performance.now() - loadStartedAt) / 1000},
        }));
      });
  }, [name]);
  const add = async (incoming) => {
    const response = await fetch("/api/masters/" + encodeURIComponent(name), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(incoming),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || "Could not save records. Please retry.");
    }
    const saved = await response.json();
    setRecords((current) => [...current, ...saved]);
    alert(
      saved.length +
        " record" +
        (saved.length === 1 ? "" : "s") +
        " added successfully.",
    );
  };
  const edit = async (id, record) => {
    const response = await fetch(`/api/masters/${encodeURIComponent(name)}/${id}`, {
      method: "PUT",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${authToken}`},
      body: JSON.stringify(record),
    });
    const details = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(details.error || "Could not update this record.");
    setRecords((current) => current.map((item) => item.id === id ? details : item));
  };
  const remove = async (id) => {
    const response = await fetch(`/api/masters/${encodeURIComponent(name)}/${id}`, {
      method: "DELETE",
      headers: {Authorization: `Bearer ${authToken}`},
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || "Could not delete this record.");
    }
    setRecords((current) => current.filter((item) => item.id !== id));
  };
  return [records, add, loaded, edit, remove];
}
function WhatsAppReport({type, requests = []}) {
  const isSite = type === "Daily site-wise report";
  const [records] = useMasterRecords(isSite ? "Equipment master" : "OEM master", isSite ? vehicles : []);
  const [employees] = useMasterRecords("Users & employees");
  const [selectedSiteReports, setSelectedSiteReports] = useState(new Set());
  const [selectedOemReports, setSelectedOemReports] = useState(new Set());
  const [lastPrepared, setLastPrepared] = useState("");
  const [oemRegion, setOemRegion] = useState("all");
  const today = new Intl.DateTimeFormat("en-IN", {day:"2-digit", month:"short", year:"numeric"}).format(new Date());
  const rows = isSite
    ? subsidiaryData.flatMap((region) => region.sites).map((site) => {
        const siteRecords = records.filter((record) => String(record.location || "").trim().toLowerCase() === site.toLowerCase());
        const offRoad = siteRecords.filter((record) => {
          const status = String(record.status || "").toLowerCase();
          return status.includes("off") || status.includes("break");
        }).length;
        return {
          name: site,
          total: siteRecords.length,
          onRoad: siteRecords.length - offRoad,
          offRoad,
          breakdowns: requests.filter((request) => request.site === site && request.status !== "Closed").length,
        };
      })
    : Object.values(records.reduce((grouped, record) => {
        const oem = record.oem || "Not assigned";
        const item = grouped[oem] ||= {name:oem,contacts:0,locations:new Set(),levels:new Set()};
        item.contacts += 1;
        if (record.location) item.locations.add(record.location);
        if (record.level) item.levels.add(record.level);
        return grouped;
      }, {})).map((item) => ({...item,locations:[...item.locations].join(", "),levels:[...item.levels].join(", ")}));
  const locationMatchesRegion = (locations, region) => {
    const value = String(locations || "").toLowerCase();
    const keywords = region === "NCL"
      ? ["jayant", "dudhichua", "dch"]
      : ["sasti", "majri", "dhoptala", "gouri", "gauri", "lalpeth"];
    return keywords.some((name) => value.includes(name));
  };
  const visibleRows = !isSite && oemRegion !== "all"
    ? rows.filter((row) => locationMatchesRegion(row.locations, oemRegion))
    : rows;
  const reportText = isSite
    ? [`Nerve Center - Daily Site-wise Report`, today, ...visibleRows.map((r) => `${r.name}: Total ${r.total}, On Road ${r.onRoad}, Off Road ${r.offRoad}, Open Breakdowns ${r.breakdowns}`)].join("\n")
    : [`Nerve Center - Daily OEM Report${oemRegion === "all" ? "" : ` - ${oemRegion}`}`, today, ...visibleRows.map((r) => `${r.name}: ${r.contacts} contacts, Levels ${r.levels || "N/A"}, Locations ${r.locations || "N/A"}`)].join("\n");
  const share = () => window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, "_blank", "noopener,noreferrer");
  const dummyReportTypes = ["A/B", "B/C", "C/D"];
  const oemReportLevels = ["Daily", "L1", "L2", "L3", "L4"];
  const normalizeSite = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const logAlert = (entry) => fetch("/api/whatsapp-alert-history", {
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${authToken}`},
    body:JSON.stringify(entry),
  }).catch((error) => console.error("Could not save WhatsApp alert history", error));
  const sendDummySiteReport = (site, reportType, checked) => {
    const key = `${site.name}-${reportType}`;
    setSelectedSiteReports((current) => {
      const next = new Set(current);
      checked ? next.add(key) : next.delete(key);
      return next;
    });
    if (!checked) return;
    const recipient = employees.find((employee) => normalizeSite(employee.site) === normalizeSite(site.name));
    let phone = String(recipient?.phone || "").replace(/\D/g, "");
    if (phone.length === 10) phone = `91${phone}`;
    const message = [
      "Nerve Center - Daily Site-wise Report",
      today,
      `Site: ${site.name}`,
      `Report: ${reportType} (temporary dummy report)`,
      `Total equipment: ${site.total}`,
      `On road: ${site.onRoad}`,
      `Off road: ${site.offRoad}`,
      `Open breakdowns: ${site.breakdowns}`,
    ].join("\n");
    setLastPrepared(`${reportType} report prepared for ${site.name}${recipient ? ` (${recipient.employee || recipient.login})` : ""}`);
    logAlert({reportType:"Daily site-wise report",targetName:site.name,reportLevel:reportType,
      recipientName:recipient?.employee || recipient?.login || "WhatsApp recipient",recipientPhone:phone,status:"Prepared"});
    window.open(`https://wa.me/${phone ? phone : ""}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  const sendOemReport = (oem, reportLevel, checked) => {
    const key = `${oem.name}-${reportLevel}`;
    setSelectedOemReports((current) => {
      const next = new Set(current);
      checked ? next.add(key) : next.delete(key);
      return next;
    });
    if (!checked) return;
    const matchingRecords = records.filter((record) => String(record.oem || "").trim().toLowerCase() === oem.name.toLowerCase());
    const recipient = reportLevel === "Daily"
      ? matchingRecords[0]
      : matchingRecords.find((record) => String(record.level || "").trim().toUpperCase() === reportLevel);
    let phone = String(recipient?.phone || "").replace(/\D/g, "");
    if (phone.length === 10) phone = `91${phone}`;
    const message = [
      "Nerve Center - Daily OEM Report",
      today,
      `OEM: ${oem.name}`,
      `Level: ${reportLevel}`,
      `Contacts: ${oem.contacts}`,
      `Locations: ${oem.locations || "Not assigned"}`,
      "Temporary dummy report - final report format pending.",
    ].join("\n");
    setLastPrepared(`${reportLevel} report prepared for ${oem.name}${recipient ? ` (${recipient.contact || "contact"})` : ""}`);
    logAlert({reportType:"Daily OEM report",targetName:oem.name,reportLevel,
      recipientName:recipient?.contact || "WhatsApp recipient",recipientPhone:phone,status:"Prepared"});
    window.open(`https://wa.me/${phone ? phone : ""}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  return (
    <section className="panel pagepanel generic whatsapp-report">
      <header>
        <div><h1>{type}</h1><p>{today} · {visibleRows.length} {isSite ? "sites" : "OEMs"} included</p></div>
        <div className="whatsapp-report-actions">
          {!isSite && <select aria-label="Filter OEMs by coalfield" value={oemRegion} onChange={(event) => setOemRegion(event.target.value)}>
            <option value="all">All coalfields</option><option value="WCL">WCL</option><option value="NCL">NCL</option>
          </select>}
          <button className="whatsapp-share" onClick={share}><Send /> Share on WhatsApp</button>
        </div>
      </header>
      <div className="report-summary">
        <MessageCircle /><div><b>WhatsApp-ready daily report</b><span>Review the live data below, then share it using WhatsApp.</span></div>
      </div>
      {isSite && (
        <div className="site-report-matrix">
          <div className="site-report-matrix-heading">
            <div><h2>Daily site-wise report dispatch</h2><p>Temporary dummy reports will remain available until the final report formats are provided.</p></div>
            {lastPrepared && <span>{lastPrepared}</span>}
          </div>
          <div className="site-report-matrix-table">
            <table>
              <thead><tr><th>Sites</th>{dummyReportTypes.map((reportType) => <th key={reportType}>Report {reportType}</th>)}</tr></thead>
              <tbody>{visibleRows.map((site) => (
                <tr key={site.name}>
                  <td><b>{site.name}</b><small>{employees.some((employee) => normalizeSite(employee.site) === normalizeSite(site.name)) ? "Recipient assigned" : "Recipient selected in WhatsApp"}</small></td>
                  {dummyReportTypes.map((reportType) => {
                    const key = `${site.name}-${reportType}`;
                    return <td key={reportType}><input aria-label={`${site.name} report ${reportType}`} type="checkbox" checked={selectedSiteReports.has(key)} onChange={(event) => sendDummySiteReport(site, reportType, event.target.checked)} /></td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {!isSite && (
        <div className="site-report-matrix oem-report-matrix">
          <div className="site-report-matrix-heading">
            <div><h2>Daily OEM report dispatch</h2><p>Select Daily or an OEM responsibility level to prepare the WhatsApp report.</p></div>
            {lastPrepared && <span>{lastPrepared}</span>}
          </div>
          <div className="site-report-matrix-table">
            <table>
              <thead><tr><th>OEM</th>{oemReportLevels.map((level) => <th key={level}>{level}</th>)}</tr></thead>
              <tbody>{visibleRows.map((oem) => (
                <tr key={oem.name}>
                  <td><b>{oem.name}</b><small>{oem.contacts} contacts · {oem.locations || "No location"}</small></td>
                  {oemReportLevels.map((level) => {
                    const key = `${oem.name}-${level}`;
                    return <td key={level}><input aria-label={`${oem.name} ${level}`} type="checkbox" checked={selectedOemReports.has(key)} onChange={(event) => sendOemReport(oem, level, event.target.checked)} /></td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      <div className="emptytable"><table>
        <thead><tr>{(isSite ? ["Site","Total equipment","On road","Off road","Open breakdowns"] : ["OEM","Contacts","Levels","Locations"]).map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{visibleRows.length ? visibleRows.map((row) => isSite ? (
          <tr key={row.name}><td><b>{row.name}</b></td><td>{row.total}</td><td>{row.onRoad}</td><td>{row.offRoad}</td><td>{row.breakdowns}</td></tr>
        ) : (
          <tr key={row.name}><td><b>{row.name}</b></td><td>{row.contacts}</td><td>{row.levels || "—"}</td><td>{row.locations || "—"}</td></tr>
        )) : <tr><td colSpan={isSite ? 5 : 4} className="empty-state">No data available for this report</td></tr>}</tbody>
      </table></div>
    </section>
  );
}
function WhatsAppAlertHistory() {
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/whatsapp-alert-history", {headers:{Authorization:`Bearer ${authToken}`}})
      .then(async (response) => {
        const details = await response.json().catch(() => ([]));
        if (!response.ok) throw new Error(details.error || "Could not load WhatsApp alert history.");
        setHistory(details);
      })
      .catch((error) => console.error(error))
      .finally(() => {
        setLoaded(true);
        window.dispatchEvent(new CustomEvent("menu-data-loaded"));
      });
  }, []);
  const formatDate = (value) => new Intl.DateTimeFormat("en-IN", {
    day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit",
  }).format(new Date(value));
  return <section className="panel table pagepanel generic whatsapp-history">
    <header><div><h1>WhatsApp alert history</h1><p>{loaded ? `${history.length} prepared alerts recorded` : "Loading alert history..."}</p></div></header>
    <div className="emptytable"><table>
      <thead><tr>{["Date & time","Report type","Site / OEM","Level","Recipient","Phone","Status"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
      <tbody>{history.length ? history.map((entry) => <tr key={entry.id}>
        <td>{formatDate(entry.createdAt)}</td><td>{entry.reportType}</td><td><b>{entry.targetName}</b></td>
        <td>{entry.reportLevel || "—"}</td><td>{entry.recipientName || "—"}</td><td>{entry.recipientPhone || "—"}</td><td><Status>{entry.status}</Status></td>
      </tr>) : <tr><td colSpan="7" className="empty-state">{loaded ? "No WhatsApp alerts have been prepared yet" : "Loading..."}</td></tr>}</tbody>
    </table></div>
  </section>;
}
const OriginalBreakdown = Breakdown;
Breakdown = function BreakdownWithMasterEntry({ requests = [] }) {
  const [manualRecords, onAdd] = useMasterRecords("Breakdown master");
  const rows = [...requests, ...manualRecords];
  const count = (status) => rows.filter((record) => record.status === status).length;
  return (
    <section className="panel table pagepanel">
      <header>
        <div>
          <h1>Breakdown master</h1>
          <p>Mobile User requests and Super Admin-created breakdown records</p>
        </div>
        <MasterActions name="Breakdown master" onAdd={onAdd} />
      </header>
      <div className="tabs">
        {[
          `All requests ${rows.length}`,
          `Open ${count("Open")}`,
          `In progress ${count("In progress")}`,
          `Awaiting parts ${count("Awaiting parts")}`,
          `Closed ${count("Closed")}`,
        ].map((label, index) => (
          <button key={label} className={index === 0 ? "active" : ""}>
            {label}
          </button>
        ))}
      </div>
      <BreakdownTable rows={rows} />
    </section>
  );
};
const OriginalEquipment = Equipment;
Equipment = function EquipmentWithData(props) {
  const [records, onAdd] = useMasterRecords("Equipment master", vehicles);
  return <OriginalEquipment {...props} records={records} onAdd={onAdd} />;
};
const OriginalGeneric = Generic;
Generic = function GenericWithMasters(props) {
  const name = props.name,
    seed =
      name === "Region master"
        ? subsidiaryData.map((s) => ({ ...s, sites: s.sites.join(" | ") }))
        : [],
    [records, onAdd, , onEdit, onDelete] = useMasterRecords(name, seed);
  return masterFields[name] ? (
    <MasterPage name={name} records={records} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
  ) : (
    <OriginalGeneric {...props} />
  );
};
const OriginalSubsidiaries = Subsidiaries;
Subsidiaries = function SubsidiariesWithImport() {
  const [records, onAdd, , onEdit, onDelete] = useMasterRecords(
    "Region master",
    subsidiaryData.map((s) => ({ ...s, sites: s.sites.join(" | ") })),
  );
  return <MasterPage name="Region master" records={records} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />;
};
function Modal({ title, close, children }) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <header>
          <h3>{title}</h3>
          <button onClick={close}>
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function Normal({ logout, requests, onCreate }) {
  const [show, setShow] = useState(false);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return (
    <div className="normal">
      <header>
        <div className="logo">
          <b>CM</b>
          <span>
            Nerve Center<small>NORMAL USER PORTAL</small>
          </span>
        </div>
        <div>
          <Bell />
          <span>
            <b>Mobile User</b>
            <small>Maintenance requester</small>
          </span>
          <button onClick={logout}>
            <LogOut />
          </button>
        </div>
      </header>
      <main>
        <div className="welcome">
          <div>
            <small>{dateLabel}</small>
            <h1>Maintenance requests</h1>
            <p>
              Create and view your requests. Submitted requests cannot be
              deleted.
            </p>
          </div>
          <Wrench />
        </div>
        <div className="actioncard">
          <div className="bigicon">
            <Truck />
          </div>
          <div>
            <h2>Push vehicle for maintenance</h2>
            <p>Enter the vehicle details and submit the maintenance request.</p>
          </div>
          <button className="primary" onClick={() => setShow(true)}>
            <Plus />
            Create request
          </button>
        </div>
        <h3 className="sectiontitle">Your submitted requests · Read only</h3>
        <section className="panel table">
          <BreakdownTable rows={requests} />
        </section>
      </main>
      {show && (
        <MaintenanceForm
          normal
          onSubmit={onCreate}
          close={() => setShow(false)}
        />
      )}
    </div>
  );
}
function App() {
  const [role, setRole] = useState(storedSession?.role || null),
    [active, setActive] = useState("Dashboard"),
    [equipmentFilter, setEquipmentFilter] = useState("all"),
    [equipmentLocation, setEquipmentLocation] = useState(""),
    [requests, setRequests] = useState([]),
    [menu, setMenu] = useState(false),
    [loadTime, setLoadTime] = useState(null);
  const menuLoadStartedAt = useRef(performance.now());
  useEffect(() => {
    let stopped = false;
    const checkVersion = async () => {
      try {
        const response = await fetch(`/api/app-version?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!stopped && data.version && data.version !== APP_VERSION) {
          authToken = "";
          currentEmployeeName = "";
          localStorage.removeItem("nerveCenterSession");
          sessionStorage.removeItem("nerveCenterSession");
          window.location.replace(`/?updated=${encodeURIComponent(data.version)}`);
        }
      } catch (error) {
        console.warn("Could not check for a UI update.", error);
      }
    };
    checkVersion();
    const timer = window.setInterval(checkVersion, 10000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);
  const selectMenu = (name) => {
    menuLoadStartedAt.current = performance.now();
    setLoadTime(null);
    setActive(name);
  };
  useEffect(() => {
    const handleLoaded = (event) => {
      if (event.detail?.name === active)
        setLoadTime(Math.max(0.1, event.detail.seconds));
    };
    window.addEventListener("menu-data-loaded", handleLoaded);
    return () => window.removeEventListener("menu-data-loaded", handleLoaded);
  }, [active]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadTime((current) => current ?? Math.max(0.1, (performance.now() - menuLoadStartedAt.current) / 1000));
    }, 120);
    return () => clearTimeout(timer);
  }, [active]);
  useEffect(() => {
    if (loadTime === null) return undefined;
    const timer = setTimeout(() => setLoadTime(null), 3000);
    return () => clearTimeout(timer);
  }, [loadTime]);
  useEffect(() => {
    fetch("/api/requests")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load requests");
        return r.json();
      })
      .then(setRequests)
      .catch((error) => console.error(error));
  }, []);
  const gotoEquipment = (filter = "all", location = "") => {
      setEquipmentFilter(filter);
      setEquipmentLocation(location);
      selectMenu("Equipment master");
    },
    logout = () => {
      authToken = "";
      currentEmployeeName = "";
      localStorage.removeItem("nerveCenterSession");
      sessionStorage.removeItem("nerveCenterSession");
      setRole(null);
    },
    addRequest = (request) => {
      setRequests((current) => [request, ...current]);
      fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      })
        .then((r) => {
          if (!r.ok) throw new Error("Could not save request");
        })
        .catch((error) => {
          console.error(error);
          alert(
            "The request is visible now but could not be saved. Please retry.",
          );
        });
    };
  if (!role) return <Login onLogin={setRole} />;
  if (role === "normal")
    return (
      <Normal
        requests={requests}
        onCreate={addRequest}
        logout={logout}
      />
    );
  return (
    <div className="app">
      <Side
        active={active}
        setActive={(x) => {
          selectMenu(x);
          if (x === "Equipment master") {
            setEquipmentFilter("all");
            setEquipmentLocation("");
          }
          setMenu(false);
        }}
        logout={logout}
        open={menu}
      />
      <main className="content">
        <div className="top">
          <button className="menubtn" onClick={() => setMenu(!menu)}>
            <Menu />
          </button>
          <div className="crumb">
            Operations <ChevronRight /> <b>{active}</b>
          </div>
          <div>
            <button>
              <Search />
            </button>
            <button>
              <Bell />
              <i />
            </button>
          </div>
        </div>
        <div className="body">
          {active === "Dashboard" ? (
            <Dashboard goto={selectMenu} gotoEquipment={gotoEquipment} />
          ) : active === "Equipment master" ? (
            <Equipment
              initialFilter={equipmentFilter}
              initialLocation={equipmentLocation}
            />
          ) : active === "Breakdown master" ? (
            <Breakdown requests={requests} />
          ) : active === "Region master" ? (
            <Subsidiaries gotoEquipment={gotoEquipment} />
          ) : active === "WhatsApp alert history" ? (
            <WhatsAppAlertHistory />
          ) : whatsappNav.some(([name]) => name === active) ? (
            <WhatsAppReport type={active} requests={requests} />
          ) : (
            <Generic name={active} requests={requests} />
          )}
        </div>
      </main>
      {loadTime !== null && (
        <div className="load-time-toast" role="status">
          <b>Data loaded. Time taken: {loadTime.toFixed(1)} sec.</b>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
