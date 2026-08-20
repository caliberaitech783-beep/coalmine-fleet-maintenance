import React, { useState, useRef, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { TIME_24H_PATTERN } from "../request-time.mjs";
import { calculateBreakdownDaysFromStart } from "../breakdown-duration.mjs";
import { elapsedLabel, latestTimestamp } from "../report-metrics.mjs";
import { batchMasterRecords } from "../record-batches.mjs";
import { equipmentMetrics, equipmentRoadStatus, fleetAssetCounts } from "../dashboard-equipment-metrics.mjs";
import { activeOpenCases, openCasesBySite } from "../dashboard-open-cases.mjs";
import { recordBelongsToSite, recordsForSite } from "../site-location.mjs";
import {
  findRequestEquipment,
  requestEquipmentDetails,
  requestEquipmentOptionLabel,
  requestEquipmentGroupOptions,
  requestEquipmentRecordsForGroup,
} from "../request-equipment.mjs";
import { submitMaintenanceRequest } from "../request-submit.mjs";
import {ADMIN_MASTER_OPTIONS, ADMIN_TAB_OPTIONS, accessAllows} from "../admin-access.mjs";
import {
  LayoutDashboard,
  Truck,
  Wrench,
  ArrowRightLeft,
  ArrowLeft,
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Save,
  Trash2,
  MessageCircle,
  Send,
  Eye,
  EyeOff,
  LockKeyhole,
  User,
  Activity,
  Sun,
  Moon,
} from "lucide-react";
import "./style.css";
import "./topbar.css";
import "./site-counts.css";
import "./dashboard-charts.css";
import "./master-loader.css";
import "./import-dropzone.css";
import "./privilege.css";
import "./sortable-table.css";
import "./theme.css";
import "./mobile-workflow.css";
import "./dashboard-concept-a.css";
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
    sites: [
      "Sasti OB",
      "Majri OB",
      "Dhoptala OB (2nd)",
      "Gauri Pauni OB (2nd)",
      "Lalpeth OB",
    ],
  },
  {
    name: "Northern Coalfields Limited",
    code: "NCL",
    state: "MP / UP",
    sites: [
      "Jayant OB",
      "Jayant OB 2nd",
      "Dudhichua OB",
      "Dudhichua East OB",
    ],
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
  ["Repair type master", Wrench],
  ["Region master", Building2],
  ["Vehicle transfers", ArrowRightLeft],
  ["Hierarchy master", Network],
  ["OEM master", ShieldCheck],
  ["Privilege", LockKeyhole],
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
function ThemeToggle({ theme, onToggle, className = "" }) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={onToggle}
      aria-label={`Switch to ${isDark ? "day" : "night"} theme`}
      title={`Switch to ${isDark ? "day" : "night"} theme`}
      aria-pressed={isDark}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">{isDark ? <Moon /> : <Sun />}</span>
      </span>
      <span className="theme-toggle-label">{isDark ? "Night" : "Day"}</span>
    </button>
  );
}
function Login({ onLogin, theme, toggleTheme }) {
  const [role, setRole] = useState("super");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [passwordChange, setPasswordChange] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const saveSession = (data) => {
    authToken = data.token;
    currentEmployeeName = data.name;
    const session = JSON.stringify({
      token: data.token,
      role: data.role,
      name: data.name,
      login: data.login || "",
      userType: data.userType || "",
      assignedRole: data.assignedRole || "",
      permissions: data.permissions || {},
    });
    if (rememberMe) {
      localStorage.setItem("nerveCenterSession", session);
      sessionStorage.removeItem("nerveCenterSession");
    } else {
      sessionStorage.setItem("nerveCenterSession", session);
      localStorage.removeItem("nerveCenterSession");
    }
    onLogin(JSON.parse(session));
  };
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
      if (data.requiresPasswordChange) {
        setPasswordChange({ changeToken: data.changeToken, name: data.name });
        return;
      }
      saveSession(data);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setWorking(false);
    }
  };
  const changeInitialPassword = async () => {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/change-initial-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeToken: passwordChange.changeToken, password: newPassword, confirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change password.");
      saveSession(data);
    } catch (changeError) {
      setError(changeError.message);
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
        <ThemeToggle theme={theme} onToggle={toggleTheme} className="login-theme-toggle" />
        {passwordChange ? <form
          className="loginbox password-change-box"
          onSubmit={(event) => { event.preventDefault(); changeInitialPassword(); }}
        >
          <div className="login-mobile-brand"><div className="brandmark">CM</div><strong>Nerve Center</strong></div>
          <small className="login-kicker"><LockKeyhole /> FIRST LOGIN SECURITY</small>
          <h2>Create your password</h2>
          <p>Welcome, {passwordChange.name}. You must replace your temporary phone-number password before continuing.</p>
          <label className="login-label" htmlFor="new-password">New password</label>
          <div className="login-input"><LockKeyhole /><input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength="8" required placeholder="Minimum 8 characters" /></div>
          <label className="login-label" htmlFor="confirm-password">Confirm new password</label>
          <div className="login-input"><LockKeyhole /><input id="confirm-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength="8" required placeholder="Re-enter new password" /></div>
          <div className="login-feedback" aria-live="polite">{error && <p className="login-error" role="alert">{error}</p>}</div>
          <button type="submit" className="primary" disabled={working || newPassword.length < 8 || confirmation.length < 8}>{working ? "Updating password…" : "Change password and continue"}<ChevronRight /></button>
          <p className="login-help">This required step cannot be skipped.</p>
        </form> : <form
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
        </form>}
      </main>
    </div>
  );
}
function Side({ active, setActive, logout, open, permissions = {} }) {
  const [mastersOpen, setMastersOpen] = useState(false);
  const [mastersSelectionClosed, setMastersSelectionClosed] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const closeMenus = () => {
    setMastersOpen(false);
    setWhatsappOpen(false);
  };
  const selectPage = (page) => {
    closeMenus();
    setActive(page);
  };
  const selectMaster = (page, event) => {
    setMastersOpen(false);
    setMastersSelectionClosed(true);
    event.currentTarget.blur();
    setActive(page);
  };
  useEffect(() => {
    closeMenus();
  }, [active]);
  const visibleMasterNav = masterNav.filter(([name]) => accessAllows(permissions.masterAccess, name));
  const visibleNav = nav.filter(([name]) => accessAllows(permissions.tabAccess, name));
  const canViewWhatsApp = accessAllows(permissions.tabAccess, "WhatsApp Integration");
  return (
    <aside className={open ? "open" : ""}>
      <div className="logo">
        <b>CM</b>
        <span>
          Nerve Center<small>BREAKDOWN MANAGEMENT SYSTEM</small>
        </span>
      </div>
      <nav>
        {visibleNav.filter(([name]) => name === "Dashboard").map(([n, I]) => (
          <button
            key={n}
            className={active === n ? "active" : ""}
            onClick={() => selectPage(n)}
          >
            <I />
            {n}
          </button>
        ))}
        {visibleMasterNav.length > 0 && <div
          className={`masters-menu${mastersOpen ? " open" : ""}${mastersSelectionClosed ? " selection-closed" : ""}`}
          onPointerLeave={() => setMastersSelectionClosed(false)}
        >
          <button
            className={visibleMasterNav.some(([name]) => name === active) ? "active" : ""}
            aria-haspopup="menu"
            aria-expanded={mastersOpen}
            onClick={() => {
              setMastersSelectionClosed(false);
              setMastersOpen((value) => !value);
            }}
          >
            <Menu />
            Masters
            <ChevronDown className="masters-chevron" />
          </button>
          <div className="masters-dropdown" role="menu">
            {visibleMasterNav.map(([name, Icon]) => (
              <button
                key={name}
                role="menuitem"
                className={active === name ? "active" : ""}
                onClick={(event) => selectMaster(name, event)}
              >
                <Icon />
                {name}
              </button>
            ))}
          </div>
        </div>}
        {canViewWhatsApp && <div className={whatsappOpen ? "masters-menu open" : "masters-menu"}>
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
              <button key={name} role="menuitem" className={active === name ? "active" : ""} onPointerDown={closeMenus} onClick={() => selectPage(name)}>
                <Icon />{name}
              </button>
            ))}
          </div>
        </div>}
        {visibleNav.filter(([name]) => name !== "Dashboard").map(([n, I]) => (
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
function Dashboard({ goto, gotoEquipment, requests = [], theme = "light" }) {
  const [equipmentRecords] = useMasterRecords("Equipment master");
  const [usersAndEmployees] = useMasterRecords("Users & employees");
  const [repairTypeRecords] = useMasterRecords("Repair type master");
  const [showUserBreakdown, setShowUserBreakdown] = useState(false);
  const [showOpenCases, setShowOpenCases] = useState(false);
  const [openCaseSite, setOpenCaseSite] = useState("all");
  const [dashboardRegion, setDashboardRegion] = useState("all");
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(now);
  const selectedRegion = subsidiaryData.find((region) => region.code === dashboardRegion);
  const selectedSites = selectedRegion?.sites || [];
  const visibleEquipment = selectedRegion ? equipmentRecords.filter((record) => selectedSites.some((site) => recordBelongsToSite(record, site))) : equipmentRecords;
  const visibleBreakdowns = selectedRegion ? requests.filter((record) => selectedSites.some((site) => recordBelongsToSite(record, site))) : requests;
  const kpis = equipmentMetrics(visibleEquipment);
  const statusCounts = [
    ["Operational", visibleEquipment.filter((record) => record.status === "Operational").length, "operational"],
    ["In maintenance", visibleEquipment.filter((record) => String(record.status || "").toLowerCase().includes("maintenance")).length, "maintenance"],
    ["Breakdown", visibleBreakdowns.filter((record) => record.status !== "Closed").length, "breakdown"],
  ];
  const userCounts = usersAndEmployees.reduce((counts, record) => {
    const type = String(record.userType || record.role || "").toLowerCase();
    if (type.includes("mobile") || type.includes("normal")) counts.mobile += 1;
    else if (type.includes("super")) counts.super += 1;
    else if (type.includes("admin")) counts.admin += 1;
    return counts;
  }, { mobile: 0, super: 0, admin: 0 });
  const typeCounts = visibleEquipment.reduce((counts, record) => {
    const label = String(record.group || record.category || record.itemName || "Unclassified").trim() || "Unclassified";
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
  const vehicleTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const repairTypeCards = [...new Map(
    repairTypeRecords
      .map((record) => String(record.repairType || "").trim())
      .filter(Boolean)
      .map((label) => [label.toLowerCase(), label]),
  ).values()].map((label) => [
    label,
    visibleBreakdowns.filter((record) => String(record.category || "").trim().toLowerCase() === label.toLowerCase()).length,
    "Breakdown requests",
  ]);
  const regionBars = subsidiaryData.filter((region) => !selectedRegion || region.code === selectedRegion.code).map((region) => ({ ...region, total: equipmentRecords.filter((record) => region.sites.some((site) => recordBelongsToSite(record, site))).length }));
  const maxRegionTotal = Math.max(1, ...regionBars.map((region) => region.total));
  const openCaseRequests = activeOpenCases(visibleBreakdowns);
  const openCaseSites = openCasesBySite(visibleBreakdowns);
  const activeBreakdowns = openCaseRequests.length;
  const selectedOpenCases = openCaseSite === "all"
    ? openCaseRequests
    : openCaseSites.find((site) => site.key === openCaseSite)?.requests || [];
  const assetCounts = fleetAssetCounts(visibleEquipment);
  const equipmentShare = assetCounts.total ? (assetCounts.equipment / assetCounts.total) * 100 : 0;
  const onRoadShare = kpis.total ? (kpis.onRoad / kpis.total) * 100 : 0;
  const offRoadShare = kpis.total ? (kpis.offRoad / kpis.total) * 100 : 0;
  return (
    <div className={`mine-dashboard ${theme === "dark" ? "mine-dashboard-night" : "mine-dashboard-day"}`}>
      <header className="mine-dashboard-head">
        <div><span className="mine-brandmark">CM</span><div><span className="mine-eyebrow">Mining operations</span><h1>Fleet control dashboard</h1><p>Maintenance, availability and site performance command center.</p></div></div>
        <div className="mine-head-actions"><label><span>Region</span><select value={dashboardRegion} onChange={(event) => setDashboardRegion(event.target.value)}><option value="all">All regions</option>{subsidiaryData.map((region) => <option key={region.code} value={region.code}>{region.code}</option>)}</select></label><span className="mine-updated"><Activity /> Live · {dateLabel}</span></div>
      </header>
      <section className="mine-overview-charts" aria-label="Fleet overview charts">
        <article className="mine-overview-chart">
          <header><div><span className="mine-eyebrow">Fleet registry</span><h2>Equipment and vehicles</h2><p>Separate asset counts from Equipment Master</p></div></header>
          <div className="mine-overview-chart-body">
            <button type="button" className="mine-overview-donut" aria-label={`${assetCounts.total} total assets`} onClick={() => gotoEquipment("all", "")} style={{ background: `conic-gradient(#4f86c6 0 ${equipmentShare}%, #72c99e ${equipmentShare}% 100%)` }}><span><strong>{assetCounts.total.toLocaleString()}</strong><small>All total</small></span></button>
            <div className="mine-overview-legend">
              <button type="button" onClick={() => gotoEquipment("all", "")}><i className="mine-chart-blue" /><span>Total equipment<small>Non-vehicle equipment</small></span><strong>{assetCounts.equipment.toLocaleString()}</strong></button>
              <button type="button" onClick={() => gotoEquipment("all", "")}><i className="mine-chart-green" /><span>Total vehicles<small>Vehicles only</small></span><strong>{assetCounts.vehicles.toLocaleString()}</strong></button>
            </div>
          </div>
        </article>
        <article className="mine-overview-chart">
          <header><div><span className="mine-eyebrow">Road availability</span><h2>On-road and off-road</h2><p>Only explicit fleet statuses are counted</p></div></header>
          <div className="mine-overview-chart-body">
            <button type="button" className="mine-overview-donut" aria-label={`${kpis.availability}% on road`} onClick={() => gotoEquipment("onroad", "")} style={{ background: `conic-gradient(#72c99e 0 ${onRoadShare}%, #df776e ${onRoadShare}% ${onRoadShare + offRoadShare}%, #d9e3e7 ${onRoadShare + offRoadShare}% 100%)` }}><span><strong>{kpis.availability}%</strong><small>On road</small></span></button>
            <div className="mine-overview-legend">
              <button type="button" onClick={() => gotoEquipment("onroad", "")}><i className="mine-chart-green" /><span>On road<small>Available for operation</small></span><strong>{kpis.onRoad.toLocaleString()}</strong></button>
              <button type="button" onClick={() => gotoEquipment("offroad", "")}><i className="mine-chart-red" /><span>Off road<small>Maintenance or breakdown</small></span><strong>{kpis.offRoad.toLocaleString()}</strong></button>
              {kpis.unknown > 0 && <div><i className="mine-chart-grey" /><span>Status not set<small>Not counted as off road</small></span><strong>{kpis.unknown.toLocaleString()}</strong></div>}
            </div>
          </div>
        </article>
      </section>
      <section className="mine-counter-grid" aria-label="Mining fleet summary">
        {repairTypeCards.length ? repairTypeCards.map(([label, value, hint]) => <button type="button" key={label} onClick={() => goto("Breakdown master")}><Wrench /><span><strong>{value.toLocaleString()}</strong><b>{label}</b><small>{hint}</small></span></button>) : <div className="mine-empty">No repair types configured</div>}
      </section>
      <section className="mine-dashboard-grid">
        <article className="mine-panel mine-span-2"><header><div><span className="mine-eyebrow">Fleet status · all</span><h2>Vehicle status</h2><p>Availability across the selected operating region</p></div><button type="button" onClick={() => gotoEquipment("all", "")}>View fleet <ChevronRight /></button></header><div className="mine-status-body"><button type="button" className="mine-status-donut" onClick={() => gotoEquipment("all", "")} style={{ background: `conic-gradient(#7ed6a3 0 ${kpis.availability}%, #26383c ${kpis.availability}% 100%)` }}><span><strong>{kpis.availability}%</strong><small>On road</small></span></button><div className="mine-status-list">{statusCounts.map(([label, value, tone]) => <button type="button" key={label} onClick={() => gotoEquipment(tone === "operational" ? "onroad" : "all", "")}><i className={`mine-dot ${tone}`} /><span>{label}</span><b>{value.toLocaleString()}</b></button>)}</div></div></article>
        <article className="mine-panel mine-open-cases"><header><div><span className="mine-eyebrow">Maintenance workload</span><h2>Open cases</h2><p>Current action queue</p></div><button type="button" aria-label="Open site-wise case drilldown" onClick={() => setShowOpenCases(true)}><ChevronRight /></button></header><button type="button" className="mine-open-cases-trigger" onClick={() => setShowOpenCases(true)}><div className="mine-big-number"><strong>{activeBreakdowns.toLocaleString()}</strong><span>Active breakdowns</span><small>{visibleBreakdowns.filter((record) => record.status?.startsWith("Awaiting")).length.toLocaleString()} awaiting action</small></div><div className="mine-mini-bars"><span><i style={{ width: `${activeBreakdowns ? 100 : 0}%` }} />Active</span><span><i className="mine-bar-orange" style={{ width: `${activeBreakdowns ? Math.min(100, visibleBreakdowns.filter((record) => record.status?.startsWith("Awaiting")).length / activeBreakdowns * 100) : 0}%` }} />Awaiting</span></div></button></article>
        <article className="mine-panel"><header><div><span className="mine-eyebrow">Equipment by region</span><h2>Operating regions</h2><p>Registered assets across sites</p></div><button type="button" onClick={() => goto("Region master")}><ChevronRight /></button></header><div className="mine-region-bars">{regionBars.map((region) => <button type="button" key={region.code} onClick={() => gotoEquipment("all", region.sites[0] || "")}><span>{region.code}</span><div><i style={{ width: `${(region.total / maxRegionTotal) * 100}%` }} /></div><b>{region.total.toLocaleString()}</b></button>)}</div></article>
        <article className="mine-panel"><header><div><span className="mine-eyebrow">Vehicle status</span><h2>Availability mix</h2><p>Live maintenance signals</p></div></header><div className="mine-vertical-metrics"><div><span>On road</span><strong>{kpis.onRoad.toLocaleString()}</strong><i className="mine-bar-green" style={{ width: `${kpis.total ? (kpis.onRoad / kpis.total) * 100 : 0}%` }} /></div><div><span>Off road</span><strong>{kpis.offRoad.toLocaleString()}</strong><i className="mine-bar-grey" style={{ width: `${kpis.total ? (kpis.offRoad / kpis.total) * 100 : 0}%` }} /></div><div><span>Breakdowns</span><strong>{activeBreakdowns.toLocaleString()}</strong><i className="mine-bar-red" style={{ width: `${activeBreakdowns ? 100 : 0}%` }} /></div></div></article>
        <article className="mine-panel"><header><div><span className="mine-eyebrow">Fleet composition</span><h2>Vehicle by group</h2><p>Most represented equipment categories</p></div></header><div className="mine-type-bars">{vehicleTypes.length ? vehicleTypes.map(([label, value]) => <button type="button" key={label} onClick={() => gotoEquipment("all", "")}><span>{label}</span><div><i style={{ width: `${(value / Math.max(1, vehicleTypes[0][1])) * 100}%` }} /></div><b>{value.toLocaleString()}</b></button>) : <p className="mine-empty">No equipment records yet</p>}</div></article>
        <article className="mine-panel mine-span-2"><header><div><span className="mine-eyebrow">Requests</span><h2>Maintenance workload by status</h2><p>Open, in-progress and completed requests</p></div><button type="button" onClick={() => goto("Breakdown master")}>View requests <ChevronRight /></button></header><div className="mine-workload-grid">{["Open", "In progress", "Awaiting parts", "Awaiting approval", "Closed"].map((status) => { const count = visibleBreakdowns.filter((record) => record.status === status).length; const max = Math.max(1, visibleBreakdowns.length); return <button type="button" key={status} onClick={() => goto("Breakdown master")}><span>{status}</span><div><i style={{ width: `${(count / max) * 100}%` }} /></div><b>{count.toLocaleString()}</b></button>; })}</div></article>
        <article className="mine-panel"><header><div><span className="mine-eyebrow">People</span><h2>Operations users</h2><p>Registered access profiles</p></div><button type="button" onClick={() => setShowUserBreakdown(true)}><ChevronRight /></button></header><div className="mine-people"><strong>{usersAndEmployees.length.toLocaleString()}</strong><span>Users &amp; employees</span><div><b>Mobile {userCounts.mobile}</b><b>Super {userCounts.super}</b><b>Admin {userCounts.admin}</b></div></div></article>
      </section>
      {showUserBreakdown && <Modal title="Users & employees breakdown" close={() => setShowUserBreakdown(false)}><div className="user-count-drilldown"><button onClick={() => goto("Users & employees")}><Users /><span>Mobile Users</span><strong>{userCounts.mobile}</strong></button><button onClick={() => goto("Users & employees")}><ShieldCheck /><span>Super Users</span><strong>{userCounts.super}</strong></button><button onClick={() => goto("Users & employees")}><UserRound /><span>Admins</span><strong>{userCounts.admin}</strong></button></div><div className="user-count-total"><span>Total users &amp; employees</span><strong>{usersAndEmployees.length}</strong></div></Modal>}
      {showOpenCases && <Modal title="Open cases by site" close={() => { setShowOpenCases(false); setOpenCaseSite("all"); }}><div className="open-case-drilldown"><div className="open-case-site-filter"><button type="button" className={openCaseSite === "all" ? "active" : ""} onClick={() => setOpenCaseSite("all")}><span>All sites</span><strong>{openCaseRequests.length}</strong></button>{openCaseSites.map((site) => <button type="button" key={site.key} className={openCaseSite === site.key ? "active" : ""} onClick={() => setOpenCaseSite(site.key)}><span>{site.label}</span><strong>{site.requests.length}</strong></button>)}</div><div className="open-case-results"><div><h3>{openCaseSite === "all" ? "All open cases" : openCaseSites.find((site) => site.key === openCaseSite)?.label}</h3><span>{selectedOpenCases.length} active breakdown{selectedOpenCases.length === 1 ? "" : "s"}</span></div><BreakdownTable rows={selectedOpenCases} /></div></div></Modal>}
      <section className="mine-panel mine-recent"><header><div><span className="mine-eyebrow">Activity</span><h2>Recent breakdown cases</h2><p>{visibleBreakdowns.length ? "Latest maintenance activity" : "No breakdown records available"}</p></div><button type="button" onClick={() => goto("Breakdown master")}>View all <ChevronRight /></button></header><BreakdownTable rows={visibleBreakdowns.slice(0, 5)} /></section>
    </div>
  );
}
function BreakdownTable({ rows = breakdowns, showBreakdownDays = false, stickyHeader = false, showAudio = false }) {
  const [breakdownNow, setBreakdownNow] = useState(() => Date.now());
  useEffect(() => {
    if (!showBreakdownDays) return undefined;
    const timer = window.setInterval(() => setBreakdownNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [showBreakdownDays]);
  const columns = [
      ["ref", "Job reference"], ["equipment", "Equipment"], ["door", "Door no."], ["site", "Site location"],
      ...(showAudio ? [["chassis", "Chassis no."]] : []),
      ...(showBreakdownDays ? [["breakdownDays", "Days of breakdown"]] : []),
      ["category", "Repair category"], ["start", "Started"], ["hours", "Downtime"],
      ["status", "Status"], ...(showAudio ? [["audio", "Audio clips"]] : []), ["owner", "Responsibility"],
    ],
    displayRows = showBreakdownDays
      ? rows.map((row) => ({
          ...row,
          breakdownDays: calculateBreakdownDaysFromStart(row.start, breakdownNow),
        }))
      : rows,
    [sortedRows, sort, changeSort] = useSortableRows(displayRows);
  return (
    <div className={`${showBreakdownDays ? "scroll mobile-breakdown-table" : "scroll"}${stickyHeader ? " master-table-scroll" : ""}`}>
      <table>
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <SortableHeader key={key} label={label} sortKey={key} sort={sort} onSort={changeSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length ? (
            sortedRows.map((r) => (
              <tr key={r.ref}>
                <td>
                  <b>{r.ref}</b>
                </td>
                <td>{r.equipment || "—"}</td>
                <td>{r.door}</td>
                <td>
                  <MapPin /> {r.site}
                </td>
                {showAudio && <td>{r.chassis || "—"}</td>}
                {showBreakdownDays && (
                  <td>
                    <b>{r.breakdownDays} {r.breakdownDays === 1 ? "day" : "days"}</b>
                  </td>
                )}
                <td>{r.category}</td>
                <td>{r.start}</td>
                <td>{r.hours}</td>
                <td>
                  <Status>{r.status}</Status>
                </td>
                {showAudio && <td><div className="request-audio-list">
                  {r.complaintAudio && <label><span>Complaint</span><audio controls preload="none" src={r.complaintAudio}>Complaint audio</audio></label>}
                  {r.maintenanceAudio && <label><span>Maintenance</span><audio controls preload="none" src={r.maintenanceAudio}>Maintenance audio</audio></label>}
                  {!r.complaintAudio && !r.maintenanceAudio && "—"}
                </div></td>}
                <td>{r.owner}</td>
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
  );
}
const masterFields = {
  "Equipment master": [
    ["door", "Door / registration"],
    ["reg", "Registration no."],
    ["currentLocation", "Current location"],
    ["equipmentName", "Equipment name"],
    ["category", "Equipment category"],
    ["group", "Equipment group"],
    ["itemName", "Item name"],
    ["itemSpecification", "Item specification name"],
    ["acquisitionDate", "Acquisition date"],
    ["make", "Make"],
    ["model", "Model"],
    ["manufacturerSerialNo", "Manufacturer serial no."],
    ["engineNo", "Engine no."],
    ["chassisNo", "Chassis no."],
    ["documentStatus", "Document status"],
    ["asset", "Asset no."],
    ["status", "Equipment status"],
  ],
  "Vehicle transfers": [
    ["transferNo", "Equipment Transfer No."],
    ["transferDate", "Equipment Transfer Date"],
    ["source", "From Location"],
    ["destination", "To Location"],
    ["equipment", "Equipment"],
    ["modelNo", "Model No."],
    ["manufacturerSerialNo", "Manufacturing Serial No."],
    ["lastMaintenanceDate", "Last Maintenance Date"],
    ["driver", "Driver"],
    ["chassisNo", "Chasis No"],
    ["dieselQty", "Diesel QTY"],
    ["kmr", "KMR"],
    ["hmr", "HMR"],
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
  "Repair type master": [
    ["repairType", "Repair type"],
  ],
  "Users & employees": [
    ["login", "Login name"],
    ["employee", "Employee name"],
    ["site", "Location"],
    ["email", "Mail ID"],
    ["phone", "Phone no."],
    ["userType", "User type (Mobile User / Super Admin)"],
    ["masterAccess", "Visible masters", "multi-checkbox"],
    ["tabAccess", "Visible tabs", "multi-checkbox"],
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
  Privilege: [
    ["username", "Username", "user-select"],
    ["userGroup", "User Group", "mobile-role-select"],
    ["accessType", "Super User / Mobile User", "role-radio"],
    ["location", "Location", "site-select"],
    ["read", "Read", "checkbox"],
    ["edit", "Edit", "checkbox"],
    ["delete", "Delete", "checkbox"],
    ["verify", "Verify", "checkbox"],
    ["print", "Print", "checkbox"],
  ],
};
const isCheckedValue = (value) =>
  value === true || ["true", "yes", "1", "enabled", "checked"].includes(String(value || "").trim().toLowerCase());
const privilegeAccessOptions = ["Super User", "Mobile User"];
const mobileUserRoleOptions = ["Production User", "Maintenance User", "MIS User"];
const userTypeOptions = ["Mobile User", "Super Admin"];
const userAccessOptions = {
  masterAccess: ADMIN_MASTER_OPTIONS,
  tabAccess: ADMIN_TAB_OPTIONS,
};
const selectedAccessValues = (record, key) => {
  if (!Object.prototype.hasOwnProperty.call(record || {}, key)) return userAccessOptions[key] || [];
  return String(record[key] || "").split(/\s*[|,]\s*/).filter(Boolean);
};
const privilegeSiteOptions = [...new Set(subsidiaryData.flatMap((region) => region.sites))];
const legacyPrivilegeFlagValues = new Set(["true", "false", "yes", "no", "1", "0", "enabled", "checked"]);
function privilegeSelectionValue(value) {
  if (typeof value !== "string") return "";
  const selected = value.trim();
  return legacyPrivilegeFlagValues.has(selected.toLowerCase()) ? "" : selected;
}
function privilegeAccessValue(value) {
  const normalized = privilegeSelectionValue(value).toLowerCase();
  if (normalized.includes("mobile") || normalized.includes("normal")) return "Mobile User";
  if (normalized.includes("super") || normalized === "admin") return "Super User";
  return "";
}
function normalizeEquipmentRecord(record = {}) {
  const currentLocation = record.currentLocation || record.location || "";
  const acquisitionDate = record.acquisitionDate || record.acquired || "";
  return {
    ...record,
    location: currentLocation,
    currentLocation,
    acquired: acquisitionDate,
    acquisitionDate,
  };
}
const sortCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
function comparableValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  const indianDate = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(.*))?$/);
  if (indianDate) {
    const [, day, month, year, time = "00:00:00"] = indianDate;
    const timestamp = Date.parse(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${time}`);
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return text;
}
function useSortableRows(rows, defaultKey = "", valueForKey = (row, key) => row[key]) {
  const [sort, setSort] = useState({ key: defaultKey, direction: "asc" });
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    return rows.map((row, index) => ({ row, index })).sort((left, right) => {
      const a = comparableValue(valueForKey(left.row, sort.key));
      const b = comparableValue(valueForKey(right.row, sort.key));
      let result;
      if (typeof a === "number" && typeof b === "number") result = a - b;
      else result = sortCollator.compare(String(a), String(b));
      if (!result) result = left.index - right.index;
      return sort.direction === "asc" ? result : -result;
    }).map(({ row }) => row);
  }, [rows, sort, valueForKey]);
  const changeSort = (key, direction) => setSort((current) => ({
    key,
    direction: direction || (current.key === key && current.direction === "asc" ? "desc" : "asc"),
  }));
  return [sortedRows, sort, changeSort];
}
function SortableHeader({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey,
    Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button className={`sort-header ${active ? "active" : ""}`} onClick={() => onSort(sortKey)} type="button">
        <span>{label}</span><Icon aria-hidden="true" />
      </button>
    </th>
  );
}
function FilterableHeader({
  label,
  sortKey,
  sort,
  onSort,
  open = false,
  onToggle,
  values = [],
  filterValue = "",
  onFilterChange,
}) {
  const [valueSearch, setValueSearch] = useState("");
  const triggerRef = useRef(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const active = sort.key === sortKey,
    Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown,
    normalizedSearch = valueSearch.trim().toLowerCase(),
    visibleValues = values.filter((value) => !normalizedSearch || String(value || "").toLowerCase().includes(normalizedSearch));
  useEffect(() => {
    if (!open) setValueSearch("");
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const positionPopover = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(240, window.innerWidth - 24);
      setPopoverPosition({
        top: bounds.bottom + 5,
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
      });
    };
    positionPopover();
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    return () => {
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
    };
  }, [open]);
  return (
    <th className={`column-filter-header ${open ? "open" : ""}`} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        ref={triggerRef}
        className={`sort-header ${active ? "active" : ""} ${filterValue ? "filtered" : ""}`}
        onClick={(event) => { event.stopPropagation(); onToggle(sortKey); }}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span>{label}</span><Icon aria-hidden="true" />
        {filterValue && <i className="column-filter-dot" aria-label="Filtered" />}
      </button>
      {open && createPortal(
        <div className="column-filter-popover column-filter-popover-portal" style={popoverPosition} role="dialog" aria-label={`${label} filter`} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          <div className="column-filter-popover-head">
            <strong>{label}</strong>
            <button type="button" className="column-filter-close" onClick={() => onToggle(sortKey)} aria-label={`Close ${label} filter`} title="Close">
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="column-filter-sort" aria-label={`Sort ${label}`}>
            <button type="button" className={active && sort.direction === "asc" ? "active" : ""} onClick={() => onSort(sortKey, "asc")} title="Sort ascending"><ArrowUp /></button>
            <button type="button" className={active && sort.direction === "desc" ? "active" : ""} onClick={() => onSort(sortKey, "desc")} title="Sort descending"><ArrowDown /></button>
            <button type="button" onClick={() => onFilterChange("")} title="Clear this filter"><X /></button>
          </div>
          <label className="column-filter-search">
            <Search aria-hidden="true" />
            <input autoFocus value={valueSearch} onChange={(event) => setValueSearch(event.target.value)} placeholder="Filter..." />
          </label>
          <button type="button" className={`column-filter-all ${!filterValue ? "selected" : ""}`} onClick={() => onFilterChange("")}>All values</button>
          <div className="column-filter-values">
            {visibleValues.length ? visibleValues.map((value) => (
              <button type="button" key={value || "__blank__"} className={filterValue === value ? "selected" : ""} onClick={() => onFilterChange(filterValue === value ? "" : value)}>
                {value || "(Blank)"}
              </button>
            )) : <span className="column-filter-empty">No matching values</span>}
          </div>
        </div>,
        document.body,
      )}
    </th>
  );
}
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
  if (fields === masterFields["Equipment master"]) {
    aliases.set("location", "currentLocation");
    aliases.set("site location", "currentLocation");
    aliases.set("acquired", "acquisitionDate");
    aliases.set("acquired date", "acquisitionDate");
    aliases.set("item name / equipment category", "category");
    aliases.set("manufacteror sr no.", "manufacturerSerialNo");
    aliases.set("chasis no", "chassisNo");
  }
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
function MasterActions({ name, records = [], onAdd, onDeleteAll, onSaveAll, saveAllDisabled = false, userOptions = [], siteOptions = [] }) {
  const [mode, setMode] = useState(null),
    [selectedFile, setSelectedFile] = useState(null),
    [importing, setImporting] = useState(false),
    [dragActive, setDragActive] = useState(false),
    fileInput = useRef(null),
    fields = masterFields[name];
  if (!fields) return null;
  const saveManual = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      record = Object.fromEntries(
        fields.map(([key, , type]) => [
          key,
          type === "checkbox"
            ? fd.has(key)
            : type === "multi-checkbox"
              ? fd.getAll(key).map(String).join(" | ")
              : String(fd.get(key) || "").trim(),
        ]),
      );
    if (name === "Equipment master" && !record.status)
      record.status = "Operational";
    if (name === "Users & employees" && record.userType === "Super Admin" && !record.masterAccess && !record.tabAccess) {
      alert("Select at least one visible master or tab for this Super Admin.");
      return;
    }
    onAdd([record]);
    setMode(null);
  };
  const chooseFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please select a CSV file.");
      return;
    }
    setSelectedFile(file);
  };
  const importFile = async () => {
    const file = selectedFile;
    if (!file || importing) return;
    setImporting(true);
    try {
      const records = parseCsv(await file.text(), fields);
      if (!records.length) throw new Error("No usable rows were found.");
      await onAdd(records);
      setSelectedFile(null);
      setMode(null);
    } catch (error) {
      alert(error.message);
    } finally {
      setImporting(false);
    }
  };
  const closeImport = () => {
    if (importing) return;
    setSelectedFile(null);
    setDragActive(false);
    setMode(null);
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
  const exportRecords = () => {
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      fields.map(([, label]) => quote(label)).join(","),
      ...records.map((record) => fields.map(([key, , type]) => quote(type === "checkbox" ? isCheckedValue(record[key]) : record[key])).join(",")),
    ].join("\n") + "\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = name.toLowerCase().replaceAll(" ", "-") + "-export.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <>
      <div className="master-actions">
        {onDeleteAll && (
          <button className="secondary danger" onClick={onDeleteAll}>
            <Trash2 /> Delete all
          </button>
        )}
        {name === "Privilege" && onSaveAll && (
          <button className="primary" type="button" onClick={onSaveAll} disabled={saveAllDisabled}>
            <Save /> Save all
          </button>
        )}
        <button className="secondary" onClick={() => setMode("import")}>
          <Upload />
          Import
        </button>
        <button className="secondary" type="button" onClick={exportRecords}>
          <Download />
          Export
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
              {fields.map(([key, label, type]) =>
                type === "multi-checkbox" ? (
                  <fieldset key={key} className="user-access-field full">
                    <legend>{label}</legend>
                    <p>Select exactly which {key === "masterAccess" ? "masters" : "navigation tabs"} this user can open.</p>
                    <div>
                      {userAccessOptions[key].map((option) => (
                        <label key={option}>
                          <input type="checkbox" name={key} value={option} />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : type === "role-radio" ? (
                  <fieldset key={key} className="privilege-role-field">
                    <legend>{label} *</legend>
                    <div>
                      {privilegeAccessOptions.map((option) => (
                        <label key={option}>
                          <input type="radio" name={key} value={option} required />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : type === "mobile-role-select" ? (
                  <label key={key}>
                    {label}
                    <select name={key} defaultValue="">
                      <option value="">Not assigned</option>
                      {mobileUserRoleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                ) : name === "Users & employees" && key === "site" ? (
                  <label key={key}>
                    {label} *
                    <select name={key} required defaultValue="">
                      <option value="" disabled>Select location</option>
                      {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
                    </select>
                  </label>
                ) : name === "Users & employees" && key === "userType" ? (
                  <label key={key}>
                    {label} *
                    <select name={key} required defaultValue="">
                      <option value="" disabled>Select user type</option>
                      {userTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                ) : (
                <label key={key}>
                  {type === "checkbox" ? (
                    <span className="privilege-checkbox-field">
                      <input type="checkbox" name={key} />
                      <span>
                        <b>{label}</b>
                        <small>Enable this privilege</small>
                      </span>
                    </span>
                  ) : type === "site-select" ? (
                    <>{label} *
                    <select name={key} required defaultValue="">
                      <option value="" disabled>Select a site</option>
                      {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
                    </select></>
                  ) : type === "user-select" ? (
                    <>{label} *
                    <select name={key} required defaultValue="">
                      <option value="" disabled>Select a user</option>
                      {userOptions.map((user) => (
                        <option key={user.id || `${user.login}-${user.employee}`} value={user.login || user.employee}>
                          {user.employee || user.login}{user.login && user.employee ? ` (${user.login})` : ""}
                        </option>
                      ))}
                    </select></>
                  ) : key === "level" ? (
                    <>{label} *
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
                    </>
                  ) : (
                    <>{label} *
                    <input
                      name={key}
                      required={key === fields[0][0]}
                      placeholder={"Enter " + label.toLowerCase()}
                    />
                    </>
                  )}
                </label>
                ),
              )}
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
        <Modal title={"Import " + name} close={closeImport}>
          <div className="import-dropbox">
            <div
              className={`import-dropzone${dragActive ? " drag-active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                chooseFile(event.dataTransfer.files?.[0]);
              }}
            >
              <div className="import-file-icons" aria-hidden="true">
                <FileBarChart />
                <Upload />
                <Download />
              </div>
              <h3>Drop your CSV file here</h3>
              <p>
                or{" "}
                <button type="button" onClick={() => fileInput.current?.click()}>
                  Browse file
                </button>
              </p>
              <div className="import-file-notes">
                <span>CSV files only</span>
                <span>Uses the master template</span>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />
            </div>

            {selectedFile && (
              <div className={`import-selected-file${importing ? " uploading" : ""}`}>
                <div className="import-file-type"><FileBarChart /></div>
                <div>
                  <strong>{selectedFile.name}</strong>
                  <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                </div>
                {importing ? (
                  <div className="import-progress" aria-label="Importing CSV records">
                    <span />
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label="Remove selected file"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X />
                  </button>
                )}
              </div>
            )}

            {importing && (
              <div className="import-loading" role="status" aria-live="polite">
                <div className="import-loading-spinner" aria-hidden="true" />
                <div>
                  <strong>Importing records...</strong>
                  <span>Please keep this window open while data is saved.</span>
                </div>
              </div>
            )}

            <div className="import-actions">
              <button type="button" className="secondary" onClick={template} disabled={importing}>
                <Download /> Download CSV template
              </button>
              <button
                type="button"
                className="primary"
                onClick={importFile}
                disabled={!selectedFile || importing}
              >
                {importing ? "Importing..." : "Import records"}
                {!importing && <Upload />}
              </button>
            </div>
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
  onEdit,
  onDelete,
  onDeleteAll,
}) {
  const [q, setQ] = useState(""),
    [road, setRoad] = useState(initialFilter),
    [location, setLocation] = useState(initialLocation),
    [columnFilters, setColumnFilters] = useState({}),
    [openFilter, setOpenFilter] = useState(null),
    [detail, setDetail] = useState(null),
    [editing, setEditing] = useState(null),
    [savingEdit, setSavingEdit] = useState(false);
  const equipmentColumns = [
      ["currentLocation", "Current location"], ["equipmentName", "Equipment name"],
      ["category", "Equipment category"], ["group", "Equipment group"],
      ["itemName", "Item name"], ["itemSpecification", "Item specification name"],
      ["acquisitionDate", "Acquisition date"], ["make", "Make"], ["model", "Model"],
      ["manufacturerSerialNo", "Manufacturer serial no."], ["engineNo", "Engine no."],
      ["chassisNo", "Chassis no."], ["documentStatus", "Document status"],
    ],
    equipmentValue = (record, key) => {
      if (key === "currentLocation") return record.currentLocation || record.location;
      if (key === "equipmentName") return record.equipmentName || record.door;
      if (key === "acquisitionDate") return record.acquisitionDate || record.acquired;
      return record[key];
    },
    filterText = (value) => String(value ?? "").trim(),
    equipmentColumnValues = Object.fromEntries(
      equipmentColumns.map(([key]) => [
        key,
        [...new Set(records.map((record) => filterText(equipmentValue(record, key))))].sort((a, b) => sortCollator.compare(a, b)),
      ]),
    );
  const updateColumnFilter = (key, value) => {
    setColumnFilters((current) => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };
  useEffect(() => {
    if (!openFilter) return undefined;
    const closeFilter = (event) => {
      if (!event.target.closest?.(".column-filter-header, .column-filter-popover")) setOpenFilter(null);
    };
    document.addEventListener("mousedown", closeFilter);
    return () => document.removeEventListener("mousedown", closeFilter);
  }, [openFilter]);
  const locations = [
      ...new Set([
        ...subsidiaryData.flatMap((s) => s.sites),
        ...records
          .map((v) => v.currentLocation || v.location)
          .filter(Boolean),
      ]),
    ];
  let rows = records.filter(
    (v) =>
      (road === "all" ||
        equipmentRoadStatus(v) === road) &&
      (!location || (v.currentLocation || v.location) === location) &&
      Object.values(v).join(" ").toLowerCase().includes(q.toLowerCase()) &&
      equipmentColumns.every(([key]) => !columnFilters[key] || filterText(equipmentValue(v, key)) === columnFilters[key]),
  );
  const [sortedRows, sort, changeSort] = useSortableRows(rows, "", equipmentValue);
  const equipmentEditFields = masterFields["Equipment master"].filter(([key]) => key !== "status");
  const saveEquipmentEdit = async (event) => {
    event.preventDefault();
    if (!editing?.id || savingEdit) return;
    const form = new FormData(event.currentTarget),
      values = Object.fromEntries(
        equipmentEditFields.map(([key]) => [key, String(form.get(key) || "").trim()]),
      ),
      { id, ...existing } = editing;
    setSavingEdit(true);
    try {
      await onEdit(id, normalizeEquipmentRecord({ ...existing, ...values }));
      setEditing(null);
    } catch (error) {
      alert(error.message || "Could not update this equipment record.");
    } finally {
      setSavingEdit(false);
    }
  };
  const deleteEquipment = async (record) => {
    if (!record.id) return;
    const recordName = record.equipmentName || record.door || record.manufacturerSerialNo || "this equipment record";
    if (!confirm(`Delete ${recordName}? This cannot be undone.`)) return;
    try {
      await onDelete(record.id);
      if (detail?.id === record.id) setDetail(null);
    } catch (error) {
      alert(error.message || "Could not delete this equipment record.");
    }
  };
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
        <MasterActions name="Equipment master" records={records} onAdd={onAdd} onDeleteAll={onDeleteAll} />
      </header>
      <div className="toolbar">
        <div>
          <Search />
          <input
            placeholder="Search equipment, category, serial no...."
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
          <option value="">All locations</option>
          {locations.map((site) => (
            <option key={site}>{site}</option>
          ))}
        </select>
        <select>
          <option>All categories</option>
        </select>
      </div>
      <div className="scroll master-table-scroll" onClick={() => setOpenFilter(null)}>
        <table>
          <thead>
            <tr>
              {equipmentColumns.map(([key, label]) => (
                <FilterableHeader
                  key={key}
                  label={label}
                  sortKey={key}
                  sort={sort}
                  onSort={changeSort}
                  open={openFilter === key}
                  onToggle={(column) => setOpenFilter((current) => current === column ? null : column)}
                  values={equipmentColumnValues[key]}
                  filterValue={columnFilters[key] || ""}
                  onFilterChange={(value) => updateColumnFilter(key, value)}
                />
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? (
              sortedRows.map((v, i) => (
                <tr
                  key={v.id || v.door || i}
                  onClick={() => setDetail(v)}
                  className="click"
                >
                  <td>
                    <MapPin /> {v.currentLocation || v.location}
                  </td>
                  <td>
                    <b>{v.equipmentName || v.door}</b>
                    <small>{v.reg}</small>
                  </td>
                  <td>
                    {v.category}
                  </td>
                  <td>{v.group}</td>
                  <td>{v.itemName}</td>
                  <td>{v.itemSpecification}</td>
                  <td>{v.acquisitionDate || v.acquired}</td>
                  <td>{v.make}</td>
                  <td>{v.model}</td>
                  <td>{v.manufacturerSerialNo}</td>
                  <td>{v.engineNo}</td>
                  <td>{v.chassisNo}</td>
                  <td>{v.documentStatus}</td>
                  <td className="row-actions" onClick={(event) => event.stopPropagation()}>
                    {v.id ? (
                      <>
                        <button type="button" aria-label={`Edit ${v.equipmentName || v.door || "equipment"}`} onClick={() => setEditing(normalizeEquipmentRecord(v))}>
                          <Pencil /> Edit
                        </button>
                        <button type="button" className="delete" aria-label={`Delete ${v.equipmentName || v.door || "equipment"}`} onClick={() => deleteEquipment(v)}>
                          <Trash2 /> Delete
                        </button>
                      </>
                    ) : "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="14" className="empty-state">
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
              <h2>{detail.equipmentName || detail.door}</h2>
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
      {editing && (
        <Modal title="Edit equipment record" close={() => !savingEdit && setEditing(null)}>
          <form className="form master-form" onSubmit={saveEquipmentEdit}>
            <div className="formgrid">
              {equipmentEditFields.map(([key, label]) => (
                <label key={key}>{label}
                  <input name={key} defaultValue={editing[key] || ""} />
                </label>
              ))}
            </div>
            <footer>
              <button type="button" disabled={savingEdit} onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary" disabled={savingEdit}>{savingEdit ? "Saving..." : "Save changes"}</button>
            </footer>
          </form>
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
      <BreakdownTable rows={requests} showAudio />
    </section>
  );
}
const speechLanguages = [
  ["hi-IN", "Hindi"],
  ["en-IN", "English"],
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
function EnhancedSpeechComplaint({
  label = "Reason / complaint *",
  name = "complaint",
  audioName = "complaintAudio",
  buttonLabel = "Speak complaint",
  placeholder = "Type here, or select your language and speak. Clear English text will appear here.",
}) {
  const [text, setText] = useState(""),
    [lang, setLang] = useState("hi-IN"),
    [listening, setListening] = useState(false),
    [working, setWorking] = useState(false),
    [note, setNote] = useState(""),
    [audioData, setAudioData] = useState("");
  const recognition = useRef(null),
    silenceTimer = useRef(null),
    maxTimer = useRef(null),
    recorder = useRef(null),
    mediaStream = useRef(null),
    audioChunks = useRef([]);
  const clearTimers = () => {
    clearTimeout(silenceTimer.current);
    clearTimeout(maxTimer.current);
  };
  const stopAudio = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    else mediaStream.current?.getTracks().forEach((track) => track.stop());
  };
  const stop = () => recognition.current?.stop();
  useEffect(() => () => {
    clearTimers();
    recognition.current?.abort?.();
    mediaStream.current?.getTracks().forEach((track) => track.stop());
  }, []);
  const start = async () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      setNote("Speech recognition requires Chrome or Edge.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setNote("Audio recording is not supported here. Please use current Chrome or Edge.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      audioChunks.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size) audioChunks.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunks.current, { type: mediaRecorder.mimeType.split(";")[0] || "audio/webm" });
        if (blob.size > 3 * 1024 * 1024) {
          setAudioData("");
          setNote("Recording is too large. Please record a shorter message.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => setAudioData(String(reader.result || ""));
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
    } catch {
      setNote("Microphone permission is required to save the audio clip.");
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
      stopAudio();
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
      stopAudio();
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
      stopAudio();
      setNote("Could not start the microphone. Please try again.");
    }
  };
  return (
    <label className="full speechfield">
      <span>{label}</span>
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
              : buttonLabel}
        </button>
      </div>
      <textarea
        name={name}
        required
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />
      <input type="hidden" name={audioName} value={audioData} />
      {audioData && <audio className="request-audio-preview" controls src={audioData}>Recorded complaint</audio>}
      <small className={listening ? "voice-note live" : "voice-note"}>
        {note ||
          "Choose Hindi or English. Your recording and transcript will be saved with this request."}
      </small>
    </label>
  );
}
SpeechComplaint = EnhancedSpeechComplaint;
function MaintenanceForm({ close, normal = false, onSubmit, equipmentRecords = [], equipmentLoaded = false, repairTypeRecords = [], repairTypesLoaded = false, assignedLocation = "" }) {
  const [equipmentGroup, setEquipmentGroup] = useState(""),
    [equipmentId, setEquipmentId] = useState(""),
    [door, setDoor] = useState(""),
    [equipmentSearch, setEquipmentSearch] = useState("");
  const [openedAt] = useState(() => new Date());
  const pad = (n) => String(n).padStart(2, "0");
  const systemDate = `${openedAt.getFullYear()}-${pad(openedAt.getMonth() + 1)}-${pad(openedAt.getDate())}`,
    systemTime = `${pad(openedAt.getHours())}:${pad(openedAt.getMinutes())}:${pad(openedAt.getSeconds())}`,
    locationEquipmentRecords = recordsForSite(equipmentRecords, assignedLocation),
    v = findRequestEquipment(locationEquipmentRecords, equipmentId),
    equipmentGroups = requestEquipmentGroupOptions(locationEquipmentRecords),
    groupRecords = requestEquipmentRecordsForGroup(locationEquipmentRecords, equipmentGroup),
    equipmentVehicleRecords = groupRecords.reduce((unique, record) => {
      const label = requestEquipmentOptionLabel(record);
      if (record.id != null && label && !unique.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
        unique.push({ record, label });
      }
      return unique;
    }, []),
    visibleEquipmentVehicleRecords = equipmentVehicleRecords.filter(({ record, label }) => String(record.id) === equipmentId || label.toLowerCase().includes(equipmentSearch.trim().toLowerCase())),
    equipmentDetails = requestEquipmentDetails(v || {}),
    currentLocation = equipmentDetails.site || String(assignedLocation || "").trim();
  const [requestTime, setRequestTime] = useState(systemTime);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const fd = new FormData(e.currentTarget),
      request = {
        ref: "REQ-" + Date.now(),
        equipment: equipmentDetails.equipment,
        door: fd.get("door"),
        site: currentLocation || "Not assigned",
        category: String(fd.get("category") || "").trim(),
        complaint: fd.get("complaint"),
        complaintAudio: fd.get("complaintAudio"),
        start: fd.get("date") + " · " + fd.get("time"),
        hours: "—",
        status: "Open",
        owner: "Mobile User",
        reg: equipmentDetails.reg,
        chassis: equipmentDetails.chassis,
      };
    if (!request.chassis) {
      alert("Chassis number is not available. Contact the admin team to update the chassis number in Equipment Master before creating this request.");
      return;
    }
    setSubmitting(true);
    try {
      await submitMaintenanceRequest(onSubmit, request);
      close();
      alert(
        "Maintenance request submitted successfully. It is now visible to the Super User.",
      );
    } catch (error) {
      if (error?.duplicate && window.confirm(`${error.message}\n\nDo you still want to add this request?`)) {
        try {
          await submitMaintenanceRequest(onSubmit, {...request, forceDuplicate: true});
          close();
          alert("Maintenance request submitted successfully.");
          return;
        } catch (retryError) {
          alert(retryError?.message || "Could not save request. Please retry.");
        }
      } else if (!error?.duplicate) {
        alert(error?.message || "Could not save request. Please retry.");
      }
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal
      title={<span className="request-modal-title">{normal ? "Push vehicle for maintenance" : "Create breakdown case"}<small><MapPin /> {currentLocation || "Location not assigned"}</small></span>}
      close={close}
    >
      <form className="form" onSubmit={submit}>
        <div className="formgrid">
          <label>
            Equipment group *
            <select
              name="equipmentGroup"
              required
              value={equipmentGroup}
              disabled={!equipmentLoaded || !equipmentGroups.length}
              aria-busy={!equipmentLoaded}
              onChange={(event) => {
                const selectedGroup = event.target.value,
                  matches = requestEquipmentRecordsForGroup(locationEquipmentRecords, selectedGroup),
                  onlyRecord = matches.length === 1 ? matches[0] : null,
                  details = requestEquipmentDetails(onlyRecord || {});
                setEquipmentGroup(selectedGroup);
                setEquipmentSearch("");
                setEquipmentId(onlyRecord?.id != null ? String(onlyRecord.id) : "");
                setDoor(details.door);
              }}
            >
              <option value="" disabled>
                {!equipmentLoaded
                  ? "Loading equipment..."
                  : equipmentGroups.length
                    ? "Select equipment group"
                    : "No equipment available"}
              </option>
              {equipmentGroups.map((group) => (
                <option key={group.key} value={group.label}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type of breakdown *
            <select
              name="category"
              required
              defaultValue=""
              disabled={!repairTypesLoaded || !repairTypeRecords.length}
              aria-busy={!repairTypesLoaded}
            >
              <option value="" disabled>
                {!repairTypesLoaded
                  ? "Loading repair types..."
                  : repairTypeRecords.length
                    ? "Select repair type"
                    : "No repair types available"}
              </option>
              {repairTypeRecords
                .filter((record) => record.id != null && String(record.repairType || "").trim())
                .map((record) => (
                  <option key={record.id} value={String(record.repairType).trim()}>
                    {String(record.repairType).trim()}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Equipment / vehicle *
            {equipmentGroup && equipmentVehicleRecords.length ? (
              <>
                <input
                  className="equipment-request-search"
                  type="search"
                  value={equipmentSearch}
                  onChange={(event) => setEquipmentSearch(event.target.value)}
                  placeholder="Search equipment / vehicle"
                  aria-label="Search equipment or vehicle"
                />
                <select
                  aria-label="Equipment or vehicle"
                  value={equipmentId}
                  required
                  onChange={(event) => {
                    const selectedId = event.target.value,
                      selected = findRequestEquipment(locationEquipmentRecords, selectedId),
                      details = requestEquipmentDetails(selected || {});
                    setEquipmentId(selectedId);
                    setDoor(details.door);
                  }}
                >
                  <option value="" disabled>Select equipment or vehicle</option>
                  {visibleEquipmentVehicleRecords.map(({ record, label }) => (
                    <option key={String(record.id)} value={String(record.id)}>
                      {label}
                    </option>
                  ))}
                </select>
                <input type="hidden" name="door" value={door} />
              </>
            ) : (
              <input
                name="door"
                required
                value={door}
                onChange={(e) => setDoor(e.target.value)}
                readOnly={Boolean(v?.door)}
                placeholder={v?.door ? "Auto-filled from equipment" : "Select equipment group first"}
              />
            )}
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
          <label className={v && !equipmentDetails.chassis ? "chassis-missing" : ""}>
            Chassis number *
            <input value={equipmentDetails.chassis || "Not available — contact admin team"} readOnly required aria-invalid={Boolean(v && !equipmentDetails.chassis)} />
            {v && !equipmentDetails.chassis && <small>Contact the admin team to update the chassis number before creating a request.</small>}
          </label>
          <SpeechComplaint />
        </div>
        {v && (
          <div className="autofetch">
            <CheckCircle2 />
            <span>
              <b>Equipment details fetched</b>
              {[v.make, v.model, v.category, currentLocation].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit request"} <ChevronRight />
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
      "Equipment Transfer No.",
      "Equipment Transfer Date",
      "From Location",
      "To Location",
      "Equipment",
      "Model No.",
      "Manufacturing Serial No.",
      "Last Maintenance Date",
      "Driver",
      "Chasis No",
      "Diesel QTY",
      "KMR",
      "HMR",
    ],
    "Users & employees": [
      "Login name",
      "Employee name",
      "Location",
      "Mail ID",
      "Phone no.",
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

function ReportsPage({ requests = [], goto }) {
  const [equipmentRecords, , equipmentLoaded] = useMasterRecords("Equipment master");
  const [userRecords, , usersLoaded] = useMasterRecords("Users & employees");
  const [transferRecords, , transfersLoaded] = useMasterRecords("Vehicle transfers");
  const [privilegeRecords, , privilegesLoaded] = useMasterRecords("Privilege");
  const [selectedReport, setSelectedReport] = useState("offroad");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const eventReports = useMemo(() => [
    {
      id: "offroad",
      title: "Production User · Offroad",
      description: "Vehicle requests created when production marks equipment offroad.",
      timestampKey: "start",
      actorKey: "owner",
      rows: requests.filter((request) => String(request.start || "").trim()),
    },
    {
      id: "onroad",
      title: "Maintenance User · Onroad",
      description: "Maintenance closure events that return a vehicle to service.",
      timestampKey: "closedAt",
      actorKey: "closedBy",
      rows: requests.filter((request) => String(request.closedAt || "").trim()),
    },
    {
      id: "verified",
      title: "MIS User · Verified",
      description: "Verification events recorded after the maintenance request is closed.",
      timestampKey: "verifiedAt",
      actorKey: "verifiedBy",
      rows: requests.filter((request) => String(request.verifiedAt || "").trim()),
    },
  ], [requests]);
  const selectedEvent = eventReports.find((report) => report.id === selectedReport) || eventReports[0];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleEventRows = (selectedEvent?.rows || []).filter((request) =>
    !normalizedQuery || Object.values(request).join(" ").toLowerCase().includes(normalizedQuery),
  );
  const elapsedRows = requests.filter((request) => request.start || request.closedAt || request.verifiedAt);
  const loading = !(equipmentLoaded && usersLoaded && transfersLoaded && privilegesLoaded);
  const count = (records, loaded) => loaded ? records.length.toLocaleString("en-IN") : "—";
  const masterTotals = [
    {label: "Total equipment", value: count(equipmentRecords, equipmentLoaded), source: "Equipment master", target: "Equipment master"},
    {label: "Total users", value: count(userRecords, usersLoaded), source: "Users & employees master", target: "Users & employees"},
    {label: "Total breakdown", value: requests.length.toLocaleString("en-IN"), source: "All maintenance requests", target: "Breakdown master"},
    {label: "Vehicle transfer", value: count(transferRecords, transfersLoaded), source: "Vehicle transfers master", target: "Vehicle transfers"},
    {label: "Privilege transfer", value: count(privilegeRecords, privilegesLoaded), source: "Privilege master", target: "Privilege"},
    {label: "Audit trail", value: "View", source: "Recorded user activity", target: "Audit Trail", unavailable: true},
  ];
  const reportCatalog = [
    ["Production User marks vehicle Offroad", eventReports[0]?.rows.length || 0, "Workflow event"],
    ["Maintenance User marks vehicle Onroad", eventReports[1]?.rows.length || 0, "Workflow event"],
    ["MIS User verifies request / vehicle", eventReports[2]?.rows.length || 0, "Workflow event"],
    ["Offroad → Onroad time difference", elapsedRows.filter((row) => row.start && row.closedAt).length, "Elapsed time"],
    ["Onroad → MIS verification time difference", elapsedRows.filter((row) => row.closedAt && row.verifiedAt).length, "Elapsed time"],
    ["Offroad → MIS verification total time", elapsedRows.filter((row) => row.start && row.verifiedAt).length, "Elapsed time"],
    ["Total equipment", equipmentLoaded ? equipmentRecords.length : "—", "Equipment master"],
    ["Total users", usersLoaded ? userRecords.length : "—", "Users & employees master"],
    ["Total breakdown", requests.length, "Requests"],
    ["Vehicle transfer", transfersLoaded ? transferRecords.length : "—", "Vehicle transfers master"],
    ["Privilege transfer", privilegesLoaded ? privilegeRecords.length : "—", "Privilege master"],
    ["Audit trail", "View", "Audit Trail"],
  ];
  const formatTimestamp = (value) => String(value || "—").trim() || "—";
  const exportReports = () => {
    const lines = [
      ["Report", "Reference", "Equipment", "Site", "Production offroad", "Maintenance onroad", "MIS verified", "Offroad to onroad", "Onroad to verified", "Total elapsed"],
      ...elapsedRows.map((row) => [
        "Workflow timing",
        row.ref || "",
        row.equipment || row.door || "",
        row.site || "",
        row.start || "",
        row.closedAt || "",
        row.verifiedAt || "",
        elapsedLabel(row.start, row.closedAt),
        elapsedLabel(row.closedAt, row.verifiedAt),
        elapsedLabel(row.start, row.verifiedAt),
      ]),
    ];
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `nerve-center-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="reports-page panel pagepanel">
      <header>
        <div>
          <h1>Reports</h1>
          <p>Workflow events, elapsed time, and live master totals.</p>
        </div>
        <button className="primary" type="button" onClick={exportReports}>
          <Download /> Export reports
        </button>
      </header>
      <div className="toolbar reports-toolbar">
        <div><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports, references, sites..." /></div>
        {loading && <span className="reports-loading" role="status">Updating live totals…</span>}
      </div>
      <div className="reports-section reports-kpis">
        <div className="reports-section-heading"><div><h2>Control totals</h2><p>Live values are read from the current masters and request register.</p></div></div>
        <div className="reports-kpi-grid">
          {masterTotals.map((card) => (
            <button key={card.label} type="button" className={`reports-kpi ${card.unavailable ? "unavailable" : ""}`} onClick={() => card.target && goto?.(card.target)}>
              <span>{card.label}</span><strong>{card.value}</strong><small>{card.source}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="reports-section">
        <div className="reports-section-heading"><div><h2>Workflow event reports</h2><p>Each report is driven by the timestamp recorded by the responsible role.</p></div></div>
        <div className="reports-event-grid">
          {eventReports.map((report) => (
            <button key={report.id} type="button" className={`reports-event-card ${selectedReport === report.id ? "selected" : ""}`} onClick={() => setSelectedReport(report.id)}>
              <span>{report.title}</span><strong>{report.rows.length.toLocaleString("en-IN")}</strong><small>{report.description}</small><em>Latest: {latestTimestamp(report.rows.map((row) => row[report.timestampKey]))}</em>
            </button>
          ))}
        </div>
        <div className="reports-detail-table emptytable">
          <div className="reports-detail-heading"><h3>{selectedEvent?.title || "Workflow events"}</h3><span>{selectedEvent?.rows.length || 0} events</span></div>
          <table>
            <thead><tr><th>Job reference</th><th>Equipment / vehicle</th><th>Site</th><th>User</th><th>Recorded at</th><th>Status</th></tr></thead>
            <tbody>
              {visibleEventRows.length ? visibleEventRows.map((request) => (
                <tr key={`${selectedEvent.id}-${request.ref}`}><td><b>{request.ref}</b></td><td>{request.equipment || request.door || "—"}</td><td>{request.site || "—"}</td><td>{request[selectedEvent.actorKey] || "—"}</td><td>{formatTimestamp(request[selectedEvent.timestampKey])}</td><td><Status>{request.status}</Status></td></tr>
              )) : <tr><td colSpan="6" className="empty-state">No events recorded for this report</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="reports-section">
        <div className="reports-section-heading"><div><h2>Workflow timing</h2><p>Durations are calculated from Production offroad, Maintenance onroad, and MIS verification timestamps.</p></div></div>
        <div className="reports-detail-table emptytable">
          <table>
            <thead><tr><th>Job reference</th><th>Production offroad</th><th>Maintenance onroad</th><th>MIS verified</th><th>Offroad → Onroad</th><th>Onroad → Verified</th><th>Total elapsed</th></tr></thead>
            <tbody>
              {elapsedRows.length ? elapsedRows.map((request) => (
                <tr key={`elapsed-${request.ref}`}><td><b>{request.ref}</b></td><td>{formatTimestamp(request.start)}</td><td>{formatTimestamp(request.closedAt)}</td><td>{formatTimestamp(request.verifiedAt)}</td><td><strong>{elapsedLabel(request.start, request.closedAt)}</strong></td><td><strong>{elapsedLabel(request.closedAt, request.verifiedAt)}</strong></td><td><strong>{elapsedLabel(request.start, request.verifiedAt)}</strong></td></tr>
              )) : <tr><td colSpan="7" className="empty-state">No workflow timings available</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="reports-section">
        <div className="reports-section-heading"><div><h2>Report catalogue</h2><p>All requested report outputs are available from this section.</p></div></div>
        <div className="reports-catalogue emptytable">
          <table><thead><tr><th>Report</th><th>Records / value</th><th>Source</th></tr></thead><tbody>{reportCatalog.map(([label, value, source]) => <tr key={label}><td><b>{label}</b></td><td>{value}</td><td>{source}</td></tr>)}</tbody></table>
        </div>
      </div>
      <div className="reports-section request-age-report">
        <div className="request-age-heading"><div><h2>Service and maintenance request ageing</h2><p>Requests are highlighted automatically according to their age.</p></div><div className="request-age-legend"><span className="yellow">1 day</span><span className="orange">2–4 days</span><span className="red">More than 5 days</span></div></div>
        <div className="emptytable"><table><thead><tr><th>Job reference</th><th>Door no.</th><th>Site</th><th>Complaint</th><th>Created</th><th>Age</th><th>Status</th></tr></thead><tbody>
          {requests.length ? requests.map((request) => { const age = Math.max(0, Math.floor((now - (new Date(String(request.start || "").replace(" ", "T")).getTime() || now)) / 86400000)); const ageClass = age > 5 ? "request-age-red" : age >= 2 && age <= 4 ? "request-age-orange" : age === 1 ? "request-age-yellow" : ""; return <tr key={`age-${request.ref}`} className={ageClass}><td><b>{request.ref}</b></td><td>{request.door}</td><td>{request.site}</td><td>{request.complaint}</td><td>{request.start}</td><td><b>{age} {age === 1 ? "day" : "days"}</b></td><td><Status>{request.status}</Status></td></tr>; }) : <tr><td colSpan="7" className="empty-state">No service or maintenance requests available</td></tr>}
        </tbody></table></div>
      </div>
    </section>
  );
}

function MasterPage({ name, records = [], onAdd, onEdit, onDelete, onDeleteAll, userOptions = [], siteOptions = [] }) {
  const [q, setQ] = useState(""),
    [editing, setEditing] = useState(null),
    [pendingPrivilegeRows, setPendingPrivilegeRows] = useState({}),
    [savingAllPrivileges, setSavingAllPrivileges] = useState(false),
    [columnFilters, setColumnFilters] = useState({}),
    [openFilter, setOpenFilter] = useState(null);
  const fields = masterFields[name],
    canManageRows = name === "OEM master" || name === "Users & employees" || name === "Privilege" || name === "Repair type master",
    masterValue = (record, key) => {
      const type = fields.find(([field]) => field === key)?.[2];
      return type === "checkbox" ? (isCheckedValue(record[key]) ? "Yes" : "No") : String(record[key] ?? "").trim();
    },
    columnValues = Object.fromEntries(
      fields.map(([key]) => [
        key,
        [...new Set(records.map((record) => masterValue(record, key)))].sort((a, b) => sortCollator.compare(a, b)),
      ]),
    ),
    filteredRows = records.filter((record) =>
      Object.values(record).join(" ").toLowerCase().includes(q.toLowerCase()) &&
      fields.every(([key]) => !columnFilters[key] || masterValue(record, key) === columnFilters[key]),
    ),
    [rows, sort, changeSort] = useSortableRows(filteredRows, "", (record, key) => {
      const type = fields.find(([field]) => field === key)?.[2];
      return type === "checkbox" ? isCheckedValue(record[key]) : record[key];
    });
  const updateColumnFilter = (key, value) => {
    setColumnFilters((current) => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };
  useEffect(() => {
    if (!openFilter) return undefined;
    const closeFilter = (event) => {
      if (!event.target.closest?.(".column-filter-header, .column-filter-popover")) setOpenFilter(null);
    };
    document.addEventListener("mousedown", closeFilter);
    return () => document.removeEventListener("mousedown", closeFilter);
  }, [openFilter]);
  const saveEdit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const updated = Object.fromEntries(fields.map(([key, , type]) => [
      key,
      name === "Privilege" && key === "username"
        ? String(editing.username || "").trim()
      : name === "Privilege" && type === "checkbox"
        ? isCheckedValue(editing[key])
        : name === "Privilege" && type === "role-radio"
          ? privilegeAccessValue(editing[key])
        : name === "Privilege" && type === "mobile-role-select"
          ? privilegeSelectionValue(editing[key])
        : name === "Privilege" && type === "site-select"
          ? privilegeSelectionValue(editing[key])
        : type === "checkbox"
          ? form.has(key)
          : type === "multi-checkbox"
            ? form.getAll(key).map(String).join(" | ")
            : String(form.get(key) || "").trim(),
    ]));
    if (name === "Users & employees" && updated.userType === "Super Admin" && !updated.masterAccess && !updated.tabAccess) {
      alert("Select at least one visible master or tab for this Super Admin.");
      return;
    }
    try {
      await onEdit(editing.id, updated);
      setEditing(null);
    } catch (error) { alert(error.message); }
  };
  const deleteRow = async (record) => {
    const recordName = record.oem || record.employee || record.login || record.username || "this record";
    if (!confirm(`Delete ${recordName}? This cannot be undone.`)) return;
    try { await onDelete(record.id); }
    catch (error) { alert(error.message); }
  };
  const privilegeValue = (record, key) => pendingPrivilegeRows[record.id]?.[key] ?? record[key];
  const stagePrivilegeField = (record, key, value) => {
    setPendingPrivilegeRows((pending) => ({
      ...pending,
      [record.id]: { ...(pending[record.id] || record), [key]: value },
    }));
  };
  const savePrivilegeRows = async () => {
    const drafts = Object.values(pendingPrivilegeRows);
    if (!drafts.length || savingAllPrivileges) return;
    setSavingAllPrivileges(true);
    const results = await Promise.allSettled(
      drafts.map((draft) => onEdit(draft.id, Object.fromEntries(fields.map(([field]) => [field, draft[field]])))),
    );
    const savedIds = drafts
      .filter((_, index) => results[index].status === "fulfilled")
      .map((draft) => String(draft.id));
    if (savedIds.length) {
      setPendingPrivilegeRows((pending) => {
        const next = { ...pending };
        savedIds.forEach((id) => delete next[id]);
        return next;
      });
    }
    const failed = results.find((result) => result.status === "rejected");
    if (failed) alert(failed.reason?.message || "Could not save all privileges.");
    setSavingAllPrivileges(false);
  };
  return (
    <>
    <section className="panel pagepanel generic">
      <header>
        <div>
          <h1>{name}</h1>
          <p>{rows.length} records shown · import CSV or add one manually</p>
        </div>
        <MasterActions
          name={name}
          records={records}
          onAdd={onAdd}
          onDeleteAll={onDeleteAll}
          onSaveAll={name === "Privilege" ? savePrivilegeRows : undefined}
          saveAllDisabled={savingAllPrivileges || !Object.keys(pendingPrivilegeRows).length}
          userOptions={userOptions}
          siteOptions={siteOptions}
        />
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
      <div className="emptytable master-table-scroll" onClick={() => setOpenFilter(null)}>
        <table>
          <thead>
            <tr>
              {fields.map(([key, label]) => (
                <FilterableHeader
                  key={key}
                  label={label}
                  sortKey={key}
                  sort={sort}
                  onSort={changeSort}
                  open={openFilter === key}
                  onToggle={(column) => setOpenFilter((current) => current === column ? null : column)}
                  values={columnValues[key]}
                  filterValue={columnFilters[key] || ""}
                  onFilterChange={(value) => updateColumnFilter(key, value)}
                />
              ))}
              {canManageRows && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
                rows.map((row, ri) => {
                  const rowSaving = savingAllPrivileges;
                  return (
                <tr key={row.id || ri}>
                  {fields.map(([key, , type], ci) => {
                    const value = name === "Privilege" ? privilegeValue(row, key) : row[key];
                    return (
                    <td key={key}>
                      {name === "Privilege" && type === "role-radio" ? (
                        <div className="privilege-inline-role" role="radiogroup" aria-label={`Access type for ${row.username}`}>
                          {privilegeAccessOptions.map((option) => (
                            <label key={option} title={option}>
                              <input
                                type="radio"
                                name={`access-type-${row.id}`}
                                checked={privilegeAccessValue(value) === option}
                                disabled={rowSaving}
                                onChange={() => stagePrivilegeField(row, key, option)}
                              />
                              <span>{option === "Super User" ? "Super" : "Mobile"}</span>
                            </label>
                          ))}
                        </div>
                      ) : name === "Privilege" && type === "mobile-role-select" ? (
                        <select
                          className="privilege-site-select"
                          value={privilegeSelectionValue(value)}
                          disabled={rowSaving}
                          aria-label={`User Group for ${row.username}`}
                          onChange={(event) => stagePrivilegeField(row, key, event.target.value)}
                        >
                          <option value="">Not assigned</option>
                          {privilegeSelectionValue(value) && !mobileUserRoleOptions.includes(privilegeSelectionValue(value)) && (
                            <option value={privilegeSelectionValue(value)}>{privilegeSelectionValue(value)}</option>
                          )}
                          {mobileUserRoleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : name === "Privilege" && type === "site-select" ? (
                        <select
                          className="privilege-site-select"
                          value={privilegeSelectionValue(value)}
                          disabled={rowSaving}
                          aria-label={`Location for ${row.username}`}
                          onChange={(event) => stagePrivilegeField(row, key, event.target.value)}
                        >
                          <option value="">Select site</option>
                          {privilegeSelectionValue(value) && !siteOptions.includes(privilegeSelectionValue(value)) && (
                            <option value={privilegeSelectionValue(value)}>{privilegeSelectionValue(value)}</option>
                          )}
                          {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
                        </select>
                      ) : name === "Privilege" && type === "checkbox" ? (
                        <input
                          className="privilege-inline-checkbox"
                          type="checkbox"
                          checked={isCheckedValue(value)}
                          disabled={rowSaving}
                          aria-label={`${fields[ci][1]} for ${row.username}`}
                          onChange={(event) => stagePrivilegeField(row, key, event.target.checked)}
                        />
                      ) : type === "checkbox" ? (
                        <span className={`privilege-value ${isCheckedValue(row[key]) ? "enabled" : "disabled"}`}>
                          {isCheckedValue(row[key]) ? <CheckCircle2 /> : <X />}
                          {isCheckedValue(row[key]) ? "Yes" : "No"}
                        </span>
                      ) : ci === 0 ? <b>{value}</b> : value}
                    </td>
                    );
                  })}
                  {canManageRows && (
                    <td className="row-actions">
                      {name !== "Privilege" && (
                        <button aria-label={`Edit ${row.oem || row.employee || row.login || row.username || "record"}`} onClick={() => setEditing(row)}><Pencil /> Edit</button>
                      )}
                      <button className="delete" aria-label={`Delete ${row.oem || row.employee || row.login || row.username || "record"}`} onClick={() => deleteRow(row)}><Trash2 /> Delete</button>
                    </td>
                  )}
                </tr>
                  );
                })
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
    <Modal title={`Edit ${name === "Users & employees" ? "user or employee" : name === "Privilege" ? "privilege user" : name} record`} close={() => setEditing(null)}>
        <form className="form master-form" onSubmit={saveEdit}>
          <div className="formgrid">
            {fields.filter(([key, , type]) => name !== "Privilege" || (key !== "username" && !["checkbox", "role-radio", "mobile-role-select", "site-select"].includes(type))).map(([key, label, type]) =>
              type === "multi-checkbox" ? (
                  <fieldset key={key} className="user-access-field full">
                    <legend>{label}</legend>
                    <div>
                      {userAccessOptions[key].map((option) => (
                        <label key={option}>
                          <input type="checkbox" name={key} value={option} defaultChecked={selectedAccessValues(editing, key).includes(option)} />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
              ) : (
              <label key={key}>{label} *
                {type === "checkbox" ? (
                  <span className="privilege-checkbox-field">
                    <input type="checkbox" name={key} defaultChecked={isCheckedValue(editing[key])} />
                    <span><b>{label}</b><small>Enable this privilege</small></span>
                  </span>
                ) : type === "user-select" ? (
                  <select name={key} required defaultValue={editing[key] || ""}>
                    <option value="" disabled>Select a user</option>
                    {editing[key] && !userOptions.some((user) => (user.login || user.employee) === editing[key]) && (
                      <option value={editing[key]}>{editing[key]}</option>
                    )}
                    {userOptions.map((user) => (
                      <option key={user.id || `${user.login}-${user.employee}`} value={user.login || user.employee}>
                        {user.employee || user.login}{user.login && user.employee ? ` (${user.login})` : ""}
                      </option>
                    ))}
                  </select>
                ) : key === "level" ? (
                  <select name={key} required defaultValue={editing[key] || ""}>
                    <option value="" disabled>Select level</option>
                    {["L1", "L2", "L3", "L4"].map((level) => <option key={level}>{level}</option>)}
                  </select>
                ) : name === "Users & employees" && key === "site" ? (
                  <select name={key} required defaultValue={editing[key] || ""}>
                    <option value="" disabled>Select location</option>
                    {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
                    {editing[key] && !siteOptions.includes(editing[key]) && <option value={editing[key]}>{editing[key]}</option>}
                  </select>
                ) : name === "Users & employees" && key === "userType" ? (
                  <select name={key} required defaultValue={editing[key] || ""}>
                    <option value="" disabled>Select user type</option>
                    {userTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    {editing[key] && !userTypeOptions.includes(editing[key]) && <option value={editing[key]}>{editing[key]}</option>}
                  </select>
                ) : <input name={key} defaultValue={editing[key] || ""} required={key === fields[0][0]} />}
              </label>)
            )}
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

function MasterLoader({ name }) {
  return (
    <section className="panel pagepanel master-loading" aria-live="polite" aria-busy="true">
      <header>
        <div>
          <h1>{name}</h1>
          <p>Loading the latest records...</p>
        </div>
      </header>
      <div className="master-loader-content" role="status">
        <div className="master-loader-spinner" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <strong>Loading {name.toLowerCase()}</strong>
        <p>Please wait while the live data is retrieved.</p>
        <div className="master-loader-lines" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    </section>
  );
}
function useMasterRecords(name, seed = []) {
  const [records, setRecords] = useState(seed),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const loadStartedAt = performance.now();
    fetch("/api/masters", {headers: {Authorization: `Bearer ${authToken}`}})
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
  const add = async (incoming, { silent = false } = {}) => {
    const batches = batchMasterRecords(incoming);
    const saved = [];
    for (let index = 0; index < batches.length; index += 1) {
      const response = await fetch("/api/masters/" + encodeURIComponent(name), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(batches[index]),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(
          details.error ||
            `Could not save import batch ${index + 1} of ${batches.length}. Please retry.`,
        );
      }
      saved.push(...(await response.json()));
    }
    setRecords((current) => {
      const next = [...current];
      saved.forEach((record) => {
        const existingIndex = next.findIndex((item) => item.id === record.id);
        if (existingIndex >= 0) next[existingIndex] = record;
        else next.push(record);
      });
      return next;
    });
    if (!silent) {
      alert(
        saved.length +
          " record" +
          (saved.length === 1 ? "" : "s") +
          (name === "Equipment master"
            ? " saved successfully. Matching rows were overwritten."
            : " added successfully."),
      );
    }
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
  const removeAll = async () => {
    if (!confirm(`Delete all records from ${name}? This cannot be undone.`)) return;
    const response = await fetch(`/api/masters/${encodeURIComponent(name)}/all`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const details = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(details.error || "Could not delete all records.");
    setRecords([]);
    alert(`${details.deleted ?? records.length} records deleted successfully.`);
  };
  return [records, add, loaded, edit, remove, removeAll];
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
  const [manualRecords, onAdd, loaded, , , onDeleteAll] = useMasterRecords("Breakdown master");
  if (!loaded) return <MasterLoader name="Breakdown master" />;
  const rows = [...requests, ...manualRecords];
  const count = (status) => rows.filter((record) => record.status === status).length;
  return (
    <section className="panel table pagepanel">
      <header>
        <div>
          <h1>Breakdown master</h1>
          <p>Mobile User requests and Super Admin-created breakdown records</p>
        </div>
        <MasterActions name="Breakdown master" records={rows} onAdd={onAdd} onDeleteAll={onDeleteAll} />
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
      <BreakdownTable rows={rows} stickyHeader />
    </section>
  );
};
const OriginalEquipment = Equipment;
Equipment = function EquipmentWithData(props) {
  const [records, onAdd, loaded, onEdit, onDelete, onDeleteAll] = useMasterRecords("Equipment master", vehicles);
  if (!loaded) return <MasterLoader name="Equipment master" />;
  const addEquipment = (incoming) =>
    onAdd(
      incoming.map(normalizeEquipmentRecord),
    );
  return (
    <OriginalEquipment
      {...props}
      records={records}
      onAdd={addEquipment}
      onEdit={(id, record) => onEdit(id, normalizeEquipmentRecord(record))}
      onDelete={onDelete}
      onDeleteAll={onDeleteAll}
    />
  );
};
const OriginalGeneric = Generic;
function PrivilegeMasterPage(props) {
  const [users, , usersLoaded] = useMasterRecords("Users & employees");
  const syncing = useRef(""),
    [failedSync, setFailedSync] = useState("");
  const userOptions = Array.from(
    new Map(
      users
        .filter((user) => String(user.login || "").trim())
        .map((user) => [String(user.login).trim().toLowerCase(), user]),
    ).values(),
  ),
    existingUsernames = new Set(
      props.records.map((record) => String(record.username || "").trim().toLowerCase()).filter(Boolean),
    ),
    missingUsers = userOptions.filter(
      (user) => !existingUsernames.has(String(user.login).trim().toLowerCase()),
    ),
    syncKey = missingUsers.map((user) => String(user.login).trim().toLowerCase()).sort().join("|");
  useEffect(() => {
    if (!usersLoaded || !syncKey || syncing.current === syncKey || failedSync === syncKey) return;
    syncing.current = syncKey;
    props.onAdd(
      missingUsers.map((user) => ({
        username: String(user.login).trim(),
        userGroup: "",
        accessType: "",
        location: "",
        read: false,
        edit: false,
        delete: false,
        verify: false,
        print: false,
      })),
      { silent: true },
    ).catch((error) => {
      setFailedSync(syncKey);
      alert(error.message || "Could not load users into Privilege.");
    });
  }, [syncKey, failedSync]);
  if (!usersLoaded) return <MasterLoader name="Privilege" />;
  if (missingUsers.length && failedSync !== syncKey) return <MasterLoader name="Privilege" />;
  return <MasterPage {...props} userOptions={userOptions} siteOptions={privilegeSiteOptions} />;
}
Generic = function GenericWithMasters(props) {
  const name = props.name,
    seed =
      name === "Region master"
        ? subsidiaryData.map((s) => ({ ...s, sites: s.sites.join(" | ") }))
        : [],
    [records, onAdd, loaded, onEdit, onDelete, onDeleteAll] = useMasterRecords(name, seed);
  const masterSiteOptions = name === "Users & employees"
    ? [...new Set([
        ...privilegeSiteOptions,
        ...records.map((record) => String(record.site || "").trim()).filter(Boolean),
      ])]
    : [];
  if (masterFields[name] && !loaded) return <MasterLoader name={name} />;
  return masterFields[name] ? (
    name === "Privilege" ? (
      <PrivilegeMasterPage name={name} records={records} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onDeleteAll={onDeleteAll} />
    ) : (
      <MasterPage name={name} records={records} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onDeleteAll={onDeleteAll} siteOptions={masterSiteOptions} />
    )
  ) : (
    <OriginalGeneric {...props} />
  );
};
const OriginalSubsidiaries = Subsidiaries;
Subsidiaries = function SubsidiariesWithImport() {
  const [records, onAdd, loaded, onEdit, onDelete, onDeleteAll] = useMasterRecords(
    "Region master",
    subsidiaryData.map((s) => ({ ...s, sites: s.sites.join(" | ") })),
  );
  if (!loaded) return <MasterLoader name="Region master" />;
  return <MasterPage name="Region master" records={records} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onDeleteAll={onDeleteAll} />;
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
function requestStartParts(start) {
  const match = String(start || "").match(/^(\d{4}-\d{2}-\d{2})\s*(?:·|Â·|\s)\s*((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)/);
  if (match) return {date: match[1], time: match[2].length === 5 ? `${match[2]}:00` : match[2]};
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  };
}

function MobileWorkflowTable({ rows = [], showActions = false, onEdit, onDelete, onClose, onVerify }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="scroll mobile-workflow-table">
      <table className="workflow-table">
        <thead><tr>
          <th>Job reference</th><th>Equipment group</th><th>Door no.</th><th>Site location</th>
          <th>Status</th><th>Started</th><th>Days of breakdown</th>{showActions && <th>Actions</th>}
        </tr></thead>
        <tbody>
          {rows.length ? rows.map((row) => {
            const days = calculateBreakdownDaysFromStart(row.start, now);
            return <tr key={row.ref}>
              <td><b>{row.ref}</b></td>
              <td>{row.equipment || "—"}</td>
              <td>{row.door || "—"}</td>
              <td><MapPin /> {row.site || "Not assigned"}</td>
              <td><Status>{row.status || "Open"}</Status></td>
              <td>{row.start || "—"}</td>
              <td><b>{days} {days === 1 ? "day" : "days"}</b></td>
              {showActions && <td className="row-actions">
                {onEdit && <button type="button" onClick={() => onEdit(row)}><Pencil /> Edit</button>}
                {onDelete && <button type="button" className="danger" onClick={() => onDelete(row)}><Trash2 /> Delete</button>}
                {onClose && <button type="button" className="primary" onClick={() => onClose(row)}><CheckCircle2 /> Close</button>}
                {onVerify && <button type="button" className="primary" onClick={() => onVerify(row)}><ShieldCheck /> Verify</button>}
              </td>}
            </tr>;
          }) : <tr><td colSpan={showActions ? 8 : 7} className="empty-state">No records available</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function RequestEditForm({ request, close, onSave, repairTypeRecords = [], repairTypesLoaded = false }) {
  const parts = requestStartParts(request.start);
  const [time, setTime] = useState(parts.time);
  return <Modal title={`Edit request ${request.ref}`} close={close}>
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSave({...request, equipment: form.get("equipment"), door: form.get("door"), chassis: form.get("chassis"), site: form.get("site"), category: form.get("category"), complaint: form.get("complaint"), start: `${form.get("date")} · ${form.get("time")}`});
    }}>
      <div className="formgrid">
        <label>Equipment group<input name="equipment" defaultValue={request.equipment || ""} /></label>
        <label>
          Type of breakdown *
          <select name="category" required defaultValue={request.category || ""} disabled={!repairTypesLoaded || !repairTypeRecords.length} aria-busy={!repairTypesLoaded}>
            <option value="" disabled>
              {!repairTypesLoaded ? "Loading repair types..." : repairTypeRecords.length ? "Select repair type" : "No repair types available"}
            </option>
            {request.category && !repairTypeRecords.some((record) => String(record.repairType || "").trim() === String(request.category).trim()) && (
              <option value={request.category}>{request.category}</option>
            )}
            {repairTypeRecords
              .filter((record) => record.id != null && String(record.repairType || "").trim())
              .map((record) => (
                <option key={record.id} value={String(record.repairType).trim()}>
                  {String(record.repairType).trim()}
                </option>
              ))}
          </select>
        </label>
        <label>Door number *<input name="door" required defaultValue={request.door || ""} /></label>
        <label>Chassis number *<input name="chassis" required defaultValue={request.chassis || ""} /></label>
        <label>Site location<input name="site" defaultValue={request.site || "Not assigned"} /></label>
        <label>Date *<input name="date" type="date" required defaultValue={parts.date} /></label>
        <label>Timing (HH:MM:SS)<input name="time" required pattern={TIME_24H_PATTERN} value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label className="full">Reason / complaint *<textarea name="complaint" required defaultValue={request.complaint || ""} /></label>
      </div>
      <footer><button type="button" onClick={close}>Cancel</button><button className="primary">Save changes <ChevronRight /></button></footer>
    </form>
  </Modal>;
}

function CloseRequestForm({ request, close, onSave }) {
  const opened = requestStartParts(request.start);
  const now = requestStartParts("");
  const [time, setTime] = useState(now.time);
  return <Modal title={`Close request ${request.ref}`} close={close}>
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSave({closingDate: form.get("closingDate"), closingTime: form.get("closingTime"), maintenanceWork: form.get("maintenanceWork"), maintenanceAudio: form.get("maintenanceAudio"), status: form.get("status")});
    }}>
      <div className="details request-linked-details">
        <div><span>Equipment group</span><b>{request.equipment || "—"}</b></div>
        <div><span>Door number</span><b>{request.door || "—"}</b></div>
        <div><span>Chassis number</span><b>{request.chassis || "—"}</b></div>
        <div><span>Site location</span><b>{request.site || "Not assigned"}</b></div>
        <div><span>Category</span><b>{request.category || "Maintenance request"}</b></div>
        <div><span>Started</span><b>{request.start || "—"}</b></div>
        <div><span>Reason / complaint</span><b>{request.complaint || "—"}</b></div>
      </div>
      <div className="formgrid">
        <label>Closing date *<input name="closingDate" type="date" required defaultValue={now.date} /></label>
        <label>Closing time (HH:MM:SS) *<input name="closingTime" required pattern={TIME_24H_PATTERN} value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label>Status *<select name="status" defaultValue={request.status === "Closed" ? "Closed" : "In progress"}><option>In progress</option><option>Awaiting parts</option><option>Closed</option></select></label>
        <EnhancedSpeechComplaint
          label="Things done in maintenance *"
          name="maintenanceWork"
          audioName="maintenanceAudio"
          buttonLabel="Speak maintenance update"
          placeholder="Describe the work completed, or choose Hindi/English and speak."
        />
      </div>
      <footer><button type="button" onClick={close}>Cancel</button><button className="primary">Save maintenance update <ChevronRight /></button></footer>
    </form>
  </Modal>;
}

function VerifyRequestForm({ request, close, onSave }) {
  const today = requestStartParts("");
  const [firstTripDone, setFirstTripDone] = useState(false);
  const [time, setTime] = useState(today.time);
  const [tripCardFile, setTripCardFile] = useState(null);
  const [tripCardPreview, setTripCardPreview] = useState("");
  useEffect(() => () => { if (tripCardPreview) URL.revokeObjectURL(tripCardPreview); }, [tripCardPreview]);
  const fileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the trip-card image."));
    reader.readAsDataURL(file);
  });
  return <Modal title={`Verify closed request ${request.ref}`} close={close}>
    <form className="form" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (firstTripDone && !tripCardFile) return alert("Upload the first-trip card image.");
      if (tripCardFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(tripCardFile.type) || tripCardFile.size > 5 * 1024 * 1024)) {
        return alert("Upload a JPEG, PNG, or WebP trip-card image up to 5 MB.");
      }
      const firstTripCardImage = tripCardFile ? await fileAsDataUrl(tripCardFile) : "";
      onSave({firstTripDone, firstTripDate: form.get("firstTripDate"), firstTripTime: form.get("firstTripTime"), firstTripCardImage});
    }}>
      <div className="details request-linked-details">
        <div><span>Equipment group</span><b>{request.equipment || "—"}</b></div>
        <div><span>Door number</span><b>{request.door || "—"}</b></div>
        <div><span>Chassis number</span><b>{request.chassis || "—"}</b></div>
        <div><span>Site location</span><b>{request.site || "Not assigned"}</b></div>
        <div><span>Closed at</span><b>{request.closedAt || "—"}</b></div>
        <div><span>Maintenance work</span><b>{request.maintenanceWork || "—"}</b></div>
      </div>
      <label className="first-trip-check"><input type="checkbox" checked={firstTripDone} onChange={(event) => setFirstTripDone(event.target.checked)} /> First trip done</label>
      {firstTripDone && <div className="formgrid">
        <label>First trip date *<input name="firstTripDate" type="date" required defaultValue={today.date} /></label>
        <label>First trip time (HH:MM:SS) *<input name="firstTripTime" required pattern={TIME_24H_PATTERN} value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label className="full">First trip card image *
          <input name="firstTripCardImage" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => {
            const file = event.target.files?.[0] || null;
            if (tripCardPreview) URL.revokeObjectURL(tripCardPreview);
            setTripCardFile(file);
            setTripCardPreview(file ? URL.createObjectURL(file) : "");
          }} />
          <small>JPEG, PNG or WebP · maximum 5 MB</small>
          {tripCardPreview && <img className="trip-card-preview" src={tripCardPreview} alt="First trip card preview" />}
        </label>
      </div>}
      <footer><button type="button" onClick={close}>Cancel</button><button className="primary">Verify request <ChevronRight /></button></footer>
    </form>
  </Modal>;
}

function Normal({ logout, requests, session, onCreate, onUpdateRequest, onDeleteRequest, theme, toggleTheme }) {
  const mobileRole = session?.assignedRole || "Mobile User";
  const [show, setShow] = useState(false), [tab, setTab] = useState(mobileRole === "MIS User" ? "verify" : "requests"), [editing, setEditing] = useState(null), [closing, setClosing] = useState(null), [verifying, setVerifying] = useState(null);
  const permissions = session?.permissions || {};
  const isProduction = mobileRole === "Production User";
  const isMaintenance = mobileRole === "Maintenance User";
  const isMis = mobileRole === "MIS User";
  const canCreate = isProduction || isMaintenance;
  const [equipmentRecords, , equipmentLoaded] = useMasterRecords("Equipment master", canCreate ? vehicles : []);
  const [repairTypeRecords, , repairTypesLoaded] = useMasterRecords("Repair type master");
  const [assignedLocation, setAssignedLocation] = useState(String(session?.location || "").trim());
  useEffect(() => {
    let active = true;
    fetch("/api/me/profile", {headers: {Authorization: `Bearer ${session?.token || authToken}`}})
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((profile) => {
        if (active) setAssignedLocation(String(profile.location || "").trim());
      })
      .catch(() => {});
    return () => { active = false; };
  }, [session?.token, session?.login, session?.name, show]);
  const dateLabel = new Intl.DateTimeFormat(undefined, {weekday: "long", day: "numeric", month: "long", year: "numeric"}).format(new Date());
  const saveEdit = async (payload) => { try { await onUpdateRequest(payload.ref, payload); setEditing(null); } catch (error) { alert(error.message); } };
  const closeRequest = async (payload) => { try { await onUpdateRequest(closing.ref, payload, "close"); setClosing(null); } catch (error) { alert(error.message); } };
  const verifyRequest = async (payload) => { try { await onUpdateRequest(verifying.ref, payload, "verify"); setVerifying(null); } catch (error) { alert(error.message); } };
  const deleteRequest = async (row) => { if (!window.confirm(`Delete request ${row.ref}?`)) return; try { await onDeleteRequest(row.ref); } catch (error) { alert(error.message); } };
  const visibleRows = isMis ? requests.filter((row) => String(row.status).toLowerCase() === "closed" && !row.verifiedAt) : requests;
  return <div className="normal">
    <header><div className="logo"><b>CM</b><span>Nerve Center<small>MOBILE USER PORTAL</small></span></div><div><Bell /><span><b>{mobileRole}</b><small>{session?.name || "Mobile User"}</small></span><ThemeToggle theme={theme} onToggle={toggleTheme} /><button onClick={logout}><LogOut /></button></div></header>
    <main>
      <div className="welcome"><div><small>{dateLabel}</small><h1>{isProduction ? "Maintenance requests" : isMaintenance ? "Maintenance workspace" : "MIS verification"}</h1><p>{isProduction ? "Create and view your requests." : isMaintenance ? "Edit, close and manage maintenance requests." : "Verify closed requests and record first-trip completion."}</p></div><Wrench /></div>
      <div className="mobile-tabs" role="tablist">
        <button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Requests</button>
        {canCreate && <button className="primary" onClick={() => setShow(true)}><Plus /> Create request</button>}
        {isMaintenance && <button className={tab === "close" ? "active" : ""} onClick={() => setTab("close")}>Close request form</button>}
        {isMis && <button className={tab === "verify" ? "active" : ""} onClick={() => setTab("verify")}>Verify closed requests</button>}
      </div>
      {isProduction && tab === "requests" && <><h3 className="sectiontitle">Your submitted requests · Read only</h3><section className="panel table"><BreakdownTable rows={requests} showBreakdownDays /></section></>}
      {isMaintenance && tab === "requests" && <><h3 className="sectiontitle">Maintenance requests</h3><section className="panel"><MobileWorkflowTable rows={requests} showActions={Boolean(permissions.editRequests || permissions.deleteRequests)} onEdit={permissions.editRequests ? setEditing : null} onDelete={permissions.deleteRequests ? deleteRequest : null} /></section></>}
      {isMaintenance && tab === "close" && <><h3 className="sectiontitle">Close request form</h3><section className="panel"><MobileWorkflowTable rows={requests.filter((row) => String(row.status).toLowerCase() !== "closed" && !row.verifiedAt)} showActions onClose={setClosing} /></section></>}
      {isMis && tab === "requests" && <><h3 className="sectiontitle">Closed requests awaiting verification</h3><section className="panel"><MobileWorkflowTable rows={visibleRows} showActions onVerify={setVerifying} /></section></>}
      {isMis && tab === "verify" && <><h3 className="sectiontitle">Verify closed requests</h3><section className="panel"><MobileWorkflowTable rows={visibleRows} showActions onVerify={setVerifying} /></section></>}
    </main>
    {canCreate && show && <MaintenanceForm normal onSubmit={onCreate} equipmentRecords={equipmentRecords} equipmentLoaded={equipmentLoaded} repairTypeRecords={repairTypeRecords} repairTypesLoaded={repairTypesLoaded} assignedLocation={assignedLocation} close={() => setShow(false)} />}
    {editing && <RequestEditForm request={editing} repairTypeRecords={repairTypeRecords} repairTypesLoaded={repairTypesLoaded} close={() => setEditing(null)} onSave={saveEdit} />}
    {closing && <CloseRequestForm request={closing} close={() => setClosing(null)} onSave={closeRequest} />}
    {verifying && <VerifyRequestForm request={verifying} close={() => setVerifying(null)} onSave={verifyRequest} />}
  </div>;
}
function App() {
  const [session, setSession] = useState(storedSession?.token ? storedSession : null),
    [active, setActive] = useState("Dashboard"),
    [equipmentFilter, setEquipmentFilter] = useState("all"),
    [equipmentLocation, setEquipmentLocation] = useState(""),
    [requests, setRequests] = useState([]),
    [menu, setMenu] = useState(false),
    [loadTime, setLoadTime] = useState(null),
    [canGoBack, setCanGoBack] = useState(false),
    [theme, setTheme] = useState(() => {
      const saved = localStorage.getItem("nerveCenterTheme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    });
  const menuLoadStartedAt = useRef(performance.now());
  const pageHistory = useRef(["Dashboard"]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("nerveCenterTheme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme((current) => current === "dark" ? "light" : "dark");
  const adminPermissions = session?.permissions || {};
  const canOpenAdminPage = (name) => {
    if (masterNav.some(([master]) => master === name)) return accessAllows(adminPermissions.masterAccess, name);
    if (whatsappNav.some(([page]) => page === name)) return accessAllows(adminPermissions.tabAccess, "WhatsApp Integration");
    return accessAllows(adminPermissions.tabAccess, name);
  };
  const firstAccessibleAdminPage = () => {
    if (canOpenAdminPage("Dashboard")) return "Dashboard";
    const firstMaster = masterNav.find(([name]) => canOpenAdminPage(name))?.[0];
    if (firstMaster) return firstMaster;
    if (accessAllows(adminPermissions.tabAccess, "WhatsApp Integration")) return whatsappNav[0][0];
    return nav.find(([name]) => canOpenAdminPage(name))?.[0] || "Dashboard";
  };
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
    if (session?.role === "super" && !canOpenAdminPage(name)) return;
    if (name === active) return;
    pageHistory.current.push(name);
    setCanGoBack(pageHistory.current.length > 1);
    menuLoadStartedAt.current = performance.now();
    setLoadTime(null);
    setActive(name);
  };
  useEffect(() => {
    if (session?.role !== "super" || canOpenAdminPage(active)) return;
    const landingPage = firstAccessibleAdminPage();
    pageHistory.current = [landingPage];
    setCanGoBack(false);
    setActive(landingPage);
  }, [session?.token]);
  const goBack = () => {
    if (pageHistory.current.length <= 1) return;
    pageHistory.current.pop();
    const previousPage = pageHistory.current.at(-1) || "Dashboard";
    setCanGoBack(pageHistory.current.length > 1);
    menuLoadStartedAt.current = performance.now();
    setLoadTime(null);
    setMenu(false);
    setActive(previousPage);
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
  const loadRequests = async () => {
    if (!session?.token) {
      setRequests([]);
      return [];
    }
    const response = await fetch(`/api/requests?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!response.ok) throw new Error("Could not load requests");
    const data = await response.json();
    setRequests(data);
    return data;
  };
  useEffect(() => {
    let stopped = false;
    if (!session?.token) {
      setRequests([]);
      return undefined;
    }
    const refresh = async () => {
      try {
        if (!stopped) await loadRequests();
      } catch (error) {
        if (!stopped) console.error(error);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [session?.token]);
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
      setSession(null);
    },
    addRequest = async (request) => {
      setRequests((current) => [request, ...current.filter((row) => row.ref !== request.ref)]);
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.token || authToken}` },
        body: JSON.stringify(request),
      });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRequests((current) => current.filter((row) => row.ref !== request.ref));
        const error = new Error(saved.error || "Could not save request");
        error.duplicate = saved.duplicate === true;
        error.existingReference = saved.existingReference || "";
        throw error;
      }
      setRequests((current) => [saved, ...current.filter((row) => row.ref !== request.ref)]);
      try {
        await loadRequests();
      } catch (error) {
        // The POST succeeded; keep the saved row visible if a refresh is transiently unavailable.
        console.warn("Request saved, but the list refresh failed.", error);
      }
    },
    updateRequest = async (reference, payload, action = "edit") => {
      const endpoint = action === "close" ? `/api/requests/${encodeURIComponent(reference)}/close` : action === "verify" ? `/api/requests/${encodeURIComponent(reference)}/verify` : `/api/requests/${encodeURIComponent(reference)}`;
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(payload),
      });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saved.error || "Could not update request");
      setRequests((current) => current.map((row) => row.ref === reference ? saved : row));
      return saved;
    },
    deleteRequest = async (reference) => {
      const response = await fetch(`/api/requests/${encodeURIComponent(reference)}`, {method: "DELETE", headers: {Authorization: `Bearer ${authToken}`}});
      const details = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(details.error || "Could not delete request");
      setRequests((current) => current.filter((row) => row.ref !== reference));
    };
  if (!session) return <Login onLogin={setSession} theme={theme} toggleTheme={toggleTheme} />;
  if (session.role === "normal")
    return (
      <Normal
        requests={requests}
        onCreate={addRequest}
        onUpdateRequest={updateRequest}
        onDeleteRequest={deleteRequest}
        session={session}
        logout={logout}
        theme={theme}
        toggleTheme={toggleTheme}
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
        permissions={adminPermissions}
      />
      <main className="content">
        <div className="top">
          <button className="menubtn" onClick={() => setMenu(!menu)}>
            <Menu />
          </button>
          <div className="crumb">
            <button
              type="button"
              className="page-back"
              onClick={goBack}
              disabled={!canGoBack}
              aria-label="Go back to previous page"
              title={canGoBack ? "Back to previous page" : "No previous page"}
            >
              <ArrowLeft />
            </button>
            Operations <ChevronRight /> <b>{active}</b>
          </div>
          <div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
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
            <Dashboard goto={selectMenu} gotoEquipment={gotoEquipment} requests={requests} theme={theme} />
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
          ) : active === "Reports" ? (
            <ReportsPage requests={requests} goto={selectMenu} />
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
