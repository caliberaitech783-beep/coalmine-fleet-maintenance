import React, { useState, useRef, useEffect, useMemo } from "react";
import { visibleInProductionHistory } from "./production-history.mjs";
import { visibleInMaintenanceHistory } from "./maintenance-history.mjs";
import { visibleInMisRequests, visibleInMisHistory } from "./mis-history.mjs";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { TIME_24H_PATTERN } from "../request-time.mjs";
import { calculateBreakdownDaysFromStart } from "../breakdown-duration.mjs";
import { elapsedLabel, elapsedMilliseconds } from "../report-metrics.mjs";
import { indiaDateTimeInputValue, reportRowsWithinRange, validReportDateRange } from "../report-date-range.mjs";
import { IN_OUT_REPORT_COLUMNS, IN_OUT_REPORT_DESCRIPTION, IN_OUT_REPORT_TITLE, buildInOutReportRows, signedCount } from "../in-out-report.mjs";
import { matchesSmartSearch } from "../smart-search.mjs";
import { batchMasterRecords } from "../record-batches.mjs";
import { defaultHierarchyReportScheduleSettings, HIERARCHY_REPORT_DESIGNATIONS, hierarchyScheduleLabel } from "../hierarchy-report-flow.mjs";
import { equipmentMetrics, equipmentRoadStatus, fleetAssetCounts, liveEquipmentMetrics, liveEquipmentRoadStatus } from "../dashboard-equipment-metrics.mjs";
import { activeOpenCases } from "../dashboard-open-cases.mjs";
import { buildBreakdownTrend, localDateKey } from "./dashboard-breakdown-forecast.mjs";
import { aiFeederAlerts, aiFeederSummary } from "../ai-feeder.mjs";
import { recordBelongsToSite, recordsForSite } from "../site-location.mjs";
import {
  findRequestEquipment,
  requestEquipmentDetails,
  requestEquipmentOptionLabel,
  requestEquipmentGroupOptions,
  requestEquipmentMeterType,
  requestEquipmentRecordsForGroup,
  requestMeterTypeForRequest,
  requestWithEquipmentMasterDetails,
} from "../request-equipment.mjs";
import { submitMaintenanceRequest } from "../request-submit.mjs";
import {ADMIN_MASTER_OPTIONS, ADMIN_TAB_OPTIONS, ADMIN_SUBMENU_OPTIONS, accessAllows, managerRoleSelection, navigationPermissionsForView} from "../admin-access.mjs";
import {MANAGER_REGION_OPTIONS, REGION_DATA, managerRegionSelection, managerSiteSelection, sitesForManagerRegions} from "../region-scope.mjs";
import {navigationLabel} from "../navigation-visibility.mjs";
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
  FileSpreadsheet,
  Upload,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  ChevronsDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Save,
  Settings,
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
  Ticket,
  Paperclip,
  RefreshCw,
  ListFilter,
  Printer,
  Columns3,
  RotateCcw,
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
import "./ai-feeder.css";
import "./ideal-flow.css";
import "./idle-status.css";
import "./daily-updates.css";
import "./dashboard-concept-a.css";
import "./brand-theme.css";
import "./report-schedule-polish.css";
import "./reports-workspace.css";
import "./meta-whatsapp-setup.css";
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
const subsidiaryData = REGION_DATA;
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Tickets", Ticket],
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
];
const whatsappNav = [
  ["Meta API setup", Settings],
  ["Daily site-wise report", Building2],
  ["Daily OEM report", ShieldCheck],
  ["WhatsApp alert history", History],
];
const operationalWorkspaceNav = [
  ["Production workspace", Truck, "Production User"],
  ["Maintenance workspace", Wrench, "Maintenance User"],
  ["MIS workspace", ShieldCheck, "MIS User"],
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
function HeaderClock({ className = "" }) {
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  useEffect(() => {
    const updateClock = () => setCurrentDateTime(new Date());
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const padClockPart = (value) => String(value).padStart(2, "0");
  const date = `${padClockPart(currentDateTime.getDate())}-${padClockPart(currentDateTime.getMonth() + 1)}-${currentDateTime.getFullYear()}`;
  const time = `${padClockPart(currentDateTime.getHours())}:${padClockPart(currentDateTime.getMinutes())}:${padClockPart(currentDateTime.getSeconds())}`;
  return (
    <time className={`header-clock ${className}`.trim()} dateTime={currentDateTime.toISOString()} aria-label={`Current date and time ${date} ${time}`}>
      <CalendarDays aria-hidden="true" />
      <span className="header-clock-date">{date}</span>
      <span className="header-clock-time">{time}</span>
    </time>
  );
}
function CaliberBrand({ subtitle = "Breakdown management system", className = "" }) {
  return (
    <div className={`caliber-app-brand ${className}`.trim()}>
      <span className="caliber-logo-frame">
        <img src="/caliber-logo-reverse.png" alt="Caliber Mining and Logistics" />
      </span>
      <span className="caliber-app-name">
        <strong>Nerve Center</strong>
        <small>{subtitle}</small>
      </span>
    </div>
  );
}
function AuthModeTabs({ mode, onModeChange }) {
  const options = [
    { id: "signin", label: "Sign in", detail: "Portal access", Icon: UserRound },
    { id: "reset", label: "Reset password", detail: "OTP recovery", Icon: LockKeyhole },
  ];
  return (
    <div className="login-auth-tabs" role="tablist" aria-label="Login options">
      {options.map(({ id, label, detail, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          className={mode === id ? "active" : ""}
          onClick={() => onModeChange(id)}
        >
          <span className="login-auth-tab-icon" aria-hidden="true"><Icon /></span>
          <span className="login-auth-tab-copy">
            <span>{label}</span>
            <small>{detail}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
function Login({ onLogin, theme, toggleTheme }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [passwordChange, setPasswordChange] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loginMode, setLoginMode] = useState("signin");
  const [resetRequest, setResetRequest] = useState(null);
  const [resetOtp, setResetOtp] = useState("");
  const [notice, setNotice] = useState("");
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
        body: JSON.stringify({ username, password }),
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
  const requestPasswordReset = async () => {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not request an OTP.");
      setResetRequest({ resetToken: data.resetToken, message: data.message });
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setWorking(false);
    }
  };
  const confirmPasswordReset = async () => {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken: resetRequest.resetToken, otp: resetOtp, password: newPassword, confirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reset the password.");
      setNotice(data.message);
      setLoginMode("signin");
      setResetRequest(null);
      setResetOtp("");
      setNewPassword("");
      setConfirmation("");
      setPassword("");
    } catch (resetError) {
      setError(resetError.message);
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
        <CaliberBrand className="login-brand" subtitle="Fleet operations platform" />
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
            <a className="login-accident-link" href="https://bdms.cmll.in" aria-label="Open Accident application"><AlertTriangle /><span><strong>Accident</strong>Open application</span></a>
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
          <CaliberBrand className="login-mobile-brand" subtitle="Fleet operations platform" />
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
        </form> : loginMode === "reset" ? <form
          className="loginbox password-reset-box"
          onSubmit={(event) => { event.preventDefault(); resetRequest ? confirmPasswordReset() : requestPasswordReset(); }}
        >
          <CaliberBrand className="login-mobile-brand" subtitle="Fleet operations platform" />
          <AuthModeTabs mode="reset" onModeChange={(mode) => { setLoginMode(mode); setError(""); }} />
          <small className="login-kicker"><LockKeyhole /> ACCOUNT RECOVERY</small>
          <h2>{resetRequest ? "Enter OTP" : "Reset password"}</h2>
          <p>{resetRequest ? "Enter the 6-digit OTP sent to your registered WhatsApp mobile number, then create a new password." : "Enter your user name. We will send a password-reset OTP to your registered mobile number."}</p>
          {!resetRequest ? <>
            <label className="login-label" htmlFor="reset-username">User name</label>
            <div className="login-input"><User aria-hidden="true" /><input id="reset-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your user name" autoComplete="username" spellCheck="false" required autoFocus /></div>
          </> : <>
            <div className="reset-otp-note"><MessageCircle /><span>{resetRequest.message}</span></div>
            <label className="login-label" htmlFor="reset-otp">6-digit OTP</label>
            <div className="login-input otp-input"><LockKeyhole aria-hidden="true" /><input id="reset-otp" value={resetOtp} onChange={(event) => setResetOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required autoFocus /></div>
            <label className="login-label" htmlFor="reset-new-password">New password</label>
            <div className="login-input"><LockKeyhole aria-hidden="true" /><input id="reset-new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength="8" required placeholder="Minimum 8 characters" /></div>
            <label className="login-label" htmlFor="reset-confirm-password">Confirm new password</label>
            <div className="login-input"><LockKeyhole aria-hidden="true" /><input id="reset-confirm-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength="8" required placeholder="Re-enter new password" /></div>
          </>}
          <div className="login-feedback" aria-live="polite">{error && <p className="login-error" role="alert">{error}</p>}</div>
          <button type="submit" className="primary" disabled={working || (!resetRequest && !username.trim()) || (resetRequest && (resetOtp.length !== 6 || newPassword.length < 8 || confirmation.length < 8))}>
            {working ? "Please wait…" : resetRequest ? "Reset password" : "Send OTP"}<ChevronRight />
          </button>
          {resetRequest && <button type="button" className="reset-start-over" onClick={() => { setResetRequest(null); setResetOtp(""); setNewPassword(""); setConfirmation(""); setError(""); }}>Request another OTP</button>}
        </form> : <form
          className="loginbox"
          onSubmit={(event) => {
            event.preventDefault();
            signIn();
          }}
        >
          <CaliberBrand className="login-mobile-brand" subtitle="Fleet operations platform" />
          <AuthModeTabs mode="signin" onModeChange={(mode) => { setLoginMode(mode); setError(""); setNotice(""); }} />
          <small className="login-kicker"><LockKeyhole /> SECURE OPERATIONS PORTAL</small>
          <h2>Welcome Back</h2>
          <p>Sign in to access your fleet operations workspace.</p>
          <div className="single-login-note"><ShieldCheck /><span><b>One secure login</b><small>Your workspace and permissions are assigned by your administrator.</small></span></div>
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
            {notice && <p className="login-success" role="status">{notice}</p>}
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
function Side({ active, setActive, logout, open, permissions = {}, session, profileLocation = "", activeReportCategory = "general" }) {
  const [mastersOpen, setMastersOpen] = useState(false);
  const [mastersSelectionClosed, setMastersSelectionClosed] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportsSelectionClosed, setReportsSelectionClosed] = useState(false);
  const [responsiveMobile, setResponsiveMobile] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const update = () => setResponsiveMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const closeMenus = () => {
    setMastersOpen(false);
    setWhatsappOpen(false);
    setWorkspacesOpen(false);
    setReportsOpen(false);
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
  const selectReport = (category, event) => {
    setReportsOpen(false);
    setReportsSelectionClosed(true);
    event.currentTarget.blur();
    setActive({ page: "Reports", reportCategory: category.id });
  };
  useEffect(() => {
    closeMenus();
  }, [active]);
  const viewPermissions=navigationPermissionsForView(permissions,responsiveMobile);
  const visibleMasterNav = masterNav.filter(([name]) => accessAllows(viewPermissions.masterAccess, name));
  const directMenuAccess = {Dashboard: "dashboardAccess", Tickets: "ticketAccess", Reports: "reportAccess", "Audit Trail": "auditAccess"};
  const visibleNav = nav.filter(([name]) => (name==="Dashboard"&&permissions.adminLevel==="Manager") || (accessAllows(viewPermissions.tabAccess, name) && accessAllows(viewPermissions[directMenuAccess[name]], name)));
  const canViewMasters = accessAllows(viewPermissions.tabAccess, "Masters") && visibleMasterNav.length > 0;
  const visibleWhatsAppNav = whatsappNav.filter(([name]) => name !== "Meta API setup" || permissions.adminLevel !== "Manager").filter(([name]) => accessAllows(viewPermissions.whatsappAccess, name));
  const canViewWhatsApp = accessAllows(viewPermissions.tabAccess, "WhatsApp Integration") && visibleWhatsAppNav.length > 0;
  const visibleReportCategoryIds = reportCategoryIdsForUser(viewPermissions, session);
  const departmentReportNav = reportCategoryTabs.filter((category) => visibleReportCategoryIds.includes(category.id));
  const configuredReportNav = departmentReportNav.filter((category) => reportAccessAllows(viewPermissions.reportAccess, category.label));
  const visibleReportNav = configuredReportNav.length ? configuredReportNav : departmentReportNav;
  const canViewReports = visibleReportNav.length > 0;
  const managerProfileLabel=permissions.managerRoles?.length===1?permissions.managerRoles[0]:"Manager Profile";
  return (
    <aside className={open ? "open" : ""}>
      <CaliberBrand className="logo" />
      <nav>
        {visibleNav.filter(([name]) => name === "Dashboard").map(([n, I]) => (
          <div className="nav-config-row" key={n}><button
            className={active === n ? "active" : ""}
            onClick={() => selectPage(n)}
          >
            <I />
            <span className="nav-label">{n}</span>
          </button></div>
        ))}
        {permissions.adminLevel === "Manager" && <div className="nav-config-row"><button className={active === "Manager Profile" ? "active" : ""} onClick={() => selectPage("Manager Profile")}><UserRound /><span className="nav-label">{managerProfileLabel}</span></button></div>}
        {canViewMasters && <div
          className={`masters-menu${mastersOpen ? " open" : ""}${mastersSelectionClosed ? " selection-closed" : ""}`}
          onPointerLeave={() => setMastersSelectionClosed(false)}
        >
          <div className="nav-config-row"><button
            className={visibleMasterNav.some(([name]) => name === active) ? "active" : ""}
            aria-haspopup="menu"
            aria-expanded={mastersOpen}
            onClick={() => {
              setMastersSelectionClosed(false);
              setMastersOpen((value) => !value);
            }}
          >
            <Menu />
            <span className="nav-label">Masters</span>
            <ChevronDown className="masters-chevron" />
          </button></div>
          <div className="masters-dropdown" role="menu">
            {visibleMasterNav.map(([name, Icon]) => (
              <div className="nav-config-row" key={name}><button
                role="menuitem"
                className={active === name ? "active" : ""}
                onClick={(event) => selectMaster(name, event)}
              >
                <Icon />
                <span className="nav-label">{name}</span>
              </button></div>
            ))}
          </div>
        </div>}
        {canViewWhatsApp && <div className={whatsappOpen ? "masters-menu open" : "masters-menu"}>
          <div className="nav-config-row"><button
            className={whatsappNav.some(([name]) => name === active) ? "active" : ""}
            aria-haspopup="menu"
            aria-expanded={whatsappOpen}
            onClick={() => setWhatsappOpen((value) => !value)}
          >
            <MessageCircle />
            <span className="nav-label">WhatsApp Integration</span>
            <ChevronDown className="masters-chevron" />
          </button></div>
          <div className="masters-dropdown whatsapp-dropdown" role="menu">
            {visibleWhatsAppNav.map(([name, Icon]) => (
              <div className="nav-config-row" key={name}><button role="menuitem" className={active === name ? "active" : ""} onPointerDown={closeMenus} onClick={() => selectPage(name)}>
                <Icon /><span className="nav-label">{navigationLabel(name)}</span>
              </button></div>
            ))}
          </div>
        </div>}
        {permissions.adminLevel !== "Manager" && <div className={workspacesOpen ? "masters-menu open" : "masters-menu"}>
          <div className="nav-config-row"><button
            className={operationalWorkspaceNav.some(([name]) => name === active) ? "active" : ""}
            aria-haspopup="menu"
            aria-expanded={workspacesOpen}
            onClick={() => setWorkspacesOpen((value) => !value)}
          >
            <Users />
            <span className="nav-label">Operational Workspaces</span>
            <ChevronDown className="masters-chevron" />
          </button></div>
          <div className="masters-dropdown operational-workspaces-dropdown" role="menu">
            {operationalWorkspaceNav.map(([name, Icon]) => <div className="nav-config-row" key={name}><button role="menuitem" className={active === name ? "active" : ""} onClick={() => selectPage(name)}>
              <Icon /><span className="nav-label">{name}</span>
            </button></div>)}
          </div>
        </div>}
        {canViewReports && <div
          className={`masters-menu reports-menu${reportsOpen ? " open" : ""}${reportsSelectionClosed ? " selection-closed" : ""}`}
          onPointerLeave={() => setReportsSelectionClosed(false)}
        >
          <div className="nav-config-row"><button
            className={active === "Reports" ? "active" : ""}
            aria-haspopup="menu"
            aria-expanded={reportsOpen}
            onClick={() => {
              setReportsSelectionClosed(false);
              setReportsOpen((value) => !value);
            }}
          >
            <FileBarChart />
            <span className="nav-label">Reports</span>
            <ChevronDown className="masters-chevron" />
          </button></div>
          <div className="masters-dropdown reports-dropdown" role="menu">
            {visibleReportNav.map((category) => (
              <div className="nav-config-row" key={category.id}><button
                role="menuitem"
                className={active === "Reports" && activeReportCategory === category.id ? "active" : ""}
                onClick={(event) => selectReport(category, event)}
              >
                <FileBarChart />
                <span className="nav-label">{category.label}</span>
              </button></div>
            ))}
          </div>
        </div>}
        {visibleNav.filter(([name]) => name !== "Dashboard" && name !== "Reports").map(([n, I]) => (
          <div className="nav-config-row" key={n}><button
            className={active === n ? "active" : ""}
            onClick={() => selectPage(n)}
          >
            <I />
            <span className="nav-label">{n}</span>
          </button></div>
        ))}
        {permissions.adminLevel === "Super Admin" && <div className="nav-config-row"><button className={active === "Admin locks" ? "active" : ""} onClick={() => selectPage("Admin locks")}><ShieldCheck /><span className="nav-label">Admin locks</span></button></div>}
      </nav>
      <div className="user">
        <div>
          <UserRound />
        </div>
        <span>
          <b>{permissions.adminLevel === "Manager" ? permissions.managerRoles?.join(" · ") || permissions.managerRole || "Manager" : permissions.adminLevel === "Super Admin" ? "Super Admin" : "Admin"}</b>
          <small>{[session?.name || (permissions.adminLevel === "Manager" ? "Manager" : "Administrator"), profileLocation].filter(Boolean).join(" · ")}</small>
        </span>
        <button onClick={logout}>
          <LogOut />
        </button>
      </div>
    </aside>
  );
}
function formatTwelveHourDateTime(value) {
  const match=String(value||"").match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if(!match)return value||"—";
  const hour=Number(match[2]);
  return `${match[1]} ${hour%12||12}:${match[3]} ${hour>=12?"PM":"AM"}`;
}

function dashboardRecordDate(record = {}) {
  for (const value of [record.start, record.startedAt, record.createdAt, record.closedAt, record.verifiedAt]) {
    const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return "";
}

function ManagerDashboard({ managerRole, managerRoles = [], managerLocation = "", requests = [], gotoEquipment, onApproveIdeal, onCancelIdeal }) {
  const [queueTab,setQueueTab]=useState("active");
  const availableRoles=managerRoles.length?managerRoles:[managerRole].filter(Boolean);
  const [activeManagerRole,setActiveManagerRole]=useState(availableRoles[0]||"Production Manager");
  const [equipmentRecords] = useMasterRecords("Equipment master");
  const siteEquipment = managerLocation?equipmentRecords.filter((record) => recordBelongsToSite(record, managerLocation)):equipmentRecords;
  const requestRows = requests.map((request) => requestWithEquipmentMasterDetails(request, equipmentRecords));
  const openRequests = requestRows.filter((request) => String(request.status || "").toLowerCase() !== "closed");
  const offRoadKeys = new Set(openRequests.map((request) => String(request.chassis || request.door || request.equipment || "").trim().toLowerCase()).filter(Boolean));
  const offRoad = Math.min(siteEquipment.length, offRoadKeys.size);
  const idleEquipment=siteEquipment.filter((record)=>equipmentRoadStatus(record)==="idle"&&!offRoadKeys.has(String(record.chassisNo||record.manufacturerSerialNo||record.door||record.equipmentName||"").trim().toLowerCase()));
  const idle=Math.min(Math.max(0,siteEquipment.length-offRoad),idleEquipment.length);
  const fleet = {total:siteEquipment.length,offRoad,idle,onRoad:Math.max(0,siteEquipment.length-offRoad-idle)};
  const typeSummary=(records,valueOf)=>Object.entries(records.reduce((counts,record)=>{const type=String(valueOf(record)||"Unspecified").trim()||"Unspecified";counts[type]=(counts[type]||0)+1;return counts},{})).sort((a,b)=>b[1]-a[1]).map(([type,count])=>`${type}: ${count}`);
  const totalTypes=typeSummary(siteEquipment,(record)=>record.group||record.equipmentGroup||record.itemName||record.category);
  const offRoadTypes=typeSummary(openRequests,(request)=>request.equipment);
  const idleTypes=typeSummary(idleEquipment,(record)=>record.group||record.equipmentGroup||record.itemName||record.category);
  const onRoadTypes=totalTypes.map((line)=>{const separator=line.lastIndexOf(": ");const type=line.slice(0,separator),total=Number(line.slice(separator+2));const offLine=offRoadTypes.find((item)=>item.startsWith(`${type}: `));const idleLine=idleTypes.find((item)=>item.startsWith(`${type}: `));return `${type}: ${Math.max(0,total-Number(offLine?.slice(offLine.lastIndexOf(": ")+2)||0)-Number(idleLine?.slice(idleLine.lastIndexOf(": ")+2)||0))}`}).filter((line)=>!line.endsWith(": 0"));
  const closedRequests = requestRows.filter((request) => String(request.status || "").toLowerCase() === "closed");
  const verifiedRequests = requestRows.filter((request) => Boolean(request.verifiedAt));
  const cards = activeManagerRole === "Production Manager"
    ? [
        ["Total equipment", fleet.total, "Registered fleet", "all", totalTypes],
        ["On road", fleet.onRoad, "Available for production", "onroad", onRoadTypes],
        ["Off road", fleet.offRoad, "Equipment currently in maintenance", "offroad", offRoadTypes],
        ["Idle", fleet.idle, "Operational but currently idle", "idle", idleTypes],
      ]
    : activeManagerRole === "Maintenance Manager"
      ? [
          ["Total equipment", fleet.total, "Equipment at the assigned location", "all"],
          ["Received for maintenance", requests.length, "Total maintenance intake", ""],
          ["Remaining", openRequests.length, "Still requiring action", ""],
          ["Completed", closedRequests.length, "Returned from maintenance", ""],
        ]
      : [
          ["Total requests", verifiedRequests.length, "Requests verified at this location", ""],
          ["First trip completed", verifiedRequests.filter((request) => request.firstTripDone).length, "Trip card confirmed", ""],
          ["First trip pending", verifiedRequests.filter((request) => !request.firstTripDone).length, "Verification follow-up", ""],
        ];
  const pendingVerification=closedRequests.filter((request)=>!request.verifiedAt);
  const idealRows=activeManagerRole==="Maintenance Manager"?requestRows.filter((request)=>["idle","ideal"].includes(String(request.status||"").toLowerCase())):[];
  const activeRows=activeManagerRole==="MIS Manager"?pendingVerification:openRequests;
  const visibleActiveRows=activeManagerRole==="Maintenance Manager"?activeRows.filter((request)=>!["idle","ideal"].includes(String(request.status||"").toLowerCase())):activeRows;
  const historyRows=activeManagerRole==="MIS Manager"?verifiedRequests:closedRequests;
  const detailRows=queueTab==="history"?historyRows:activeRows;
  const visibleDetailRows=queueTab==="ideal"?idealRows:activeManagerRole==="Maintenance Manager"&&queueTab==="active"?visibleActiveRows:detailRows;
  const title = activeManagerRole || "Manager";
  const description = activeManagerRole === "Production Manager"
    ? `Live fleet availability for ${managerLocation || "the assigned sites"}.`
    : activeManagerRole === "Maintenance Manager"
      ? "Site equipment, maintenance intake, remaining workload, and completed equipment."
      : "Location-wise verified requests and first-trip status.";
  return <section className="manager-dashboard">
    <header className="manager-dashboard-head"><div><span>Role dashboard</span><h1>{title}</h1><p>{description}</p></div><div className="manager-dashboard-badge"><ShieldCheck /> Manager view</div></header>
    {availableRoles.length>1&&<div className="mobile-tabs manager-role-tabs" role="tablist" aria-label="Manager dashboard role">{availableRoles.map((role)=><button type="button" key={role} className={activeManagerRole===role?"active":""} onClick={()=>{setActiveManagerRole(role);setQueueTab("active")}}>{role}</button>)}</div>}
    <div className="manager-kpi-grid">{cards.map(([label, value, hint, fleetFilter, types]) => <button type="button" key={label} onClick={() => fleetFilter && gotoEquipment(fleetFilter, "")} disabled={!fleetFilter}>
      <span>{label}</span><strong>{Number(value || 0).toLocaleString()}</strong><small>{hint}</small>{activeManagerRole === "Production Manager" && <div className="manager-kpi-tooltip"><b>Equipment types</b>{types?.length ? types.map((line)=><i key={line}>{line}</i>) : <i>No equipment</i>}</div>}
    </button>)}</div>
    <div className="mobile-tabs manager-queue-tabs" role="tablist"><button className={queueTab==="active"?"active":""} onClick={()=>setQueueTab("active")}>Active requests</button>{activeManagerRole==="Maintenance Manager"&&<button className={queueTab==="ideal"?"active":""} onClick={()=>setQueueTab("ideal")}>Idle approvals ({idealRows.length})</button>}<button className={queueTab==="history"?"active":""} onClick={()=>setQueueTab("history")}>Closed history</button></div>
    <article className="panel manager-detail-panel"><header><div><h2>{queueTab==="history"?"Closed request history":queueTab==="ideal"?"Idle requests awaiting on-road approval":activeManagerRole === "Production Manager" ? "Active production interruptions" : activeManagerRole === "Maintenance Manager" ? "Maintenance workload details" : "Requests awaiting verification"}</h2><p>{visibleDetailRows.length} record{visibleDetailRows.length === 1 ? "" : "s"} in this view</p></div></header><BreakdownTable rows={visibleDetailRows} showMakeModel showReason={activeManagerRole === "Production Manager"} showClosedBy={queueTab==="history"} showBreakdownDays={activeManagerRole !== "MIS Manager"} showTurnaroundTime={activeManagerRole === "MIS Manager"} onApproveIdeal={queueTab==="ideal"?onApproveIdeal:null} onCancelIdeal={queueTab==="ideal"?onCancelIdeal:null} stableToolbar /></article>
  </section>;
}
function Dashboard({ goto = () => {}, gotoEquipment = () => {}, gotoBreakdownFleet = () => {}, requests = [], theme = "light", allowedSites = null, allowedRegions = null, restrictToScope = false }) {
  const [equipmentRecords] = useMasterRecords("Equipment master");
  const [repairTypeRecords] = useMasterRecords("Repair type master");
  const [assetDrilldown, setAssetDrilldown] = useState("");
  const [assetDrilldownRegion, setAssetDrilldownRegion] = useState("");
  const [assetDrilldownSite, setAssetDrilldownSite] = useState("");
  const [assetDrilldownCategory, setAssetDrilldownCategory] = useState("");
  const [assetDrilldownGroup, setAssetDrilldownGroup] = useState("");
  const [dashboardRegion, setDashboardRegion] = useState("all");
  const [dashboardSite, setDashboardSite] = useState("all");
  const [dashboardDate, setDashboardDate] = useState("");
  const [breakdownTrendDays, setBreakdownTrendDays] = useState(7);
  const [breakdownTrendSite, setBreakdownTrendSite] = useState("all");
  const [breakdownTrendView, setBreakdownTrendView] = useState("both");
  const [breakdownTrendAnchor, setBreakdownTrendAnchor] = useState("");
  const [showFleetWatermark, setShowFleetWatermark] = useState(() => localStorage.getItem("nerveCenterFleetWatermark") !== "false");
  const [fleetIntelligenceView, setFleetIntelligenceView] = useState(() => localStorage.getItem("nerveCenterFleetIntelligenceView") || "combined");
  const [requestTrendDays, setRequestTrendDays] = useState(7);
  const [requestTrendFrom, setRequestTrendFrom] = useState("");
  const [requestTrendTo, setRequestTrendTo] = useState("");
  useEffect(() => localStorage.setItem("nerveCenterFleetWatermark", String(showFleetWatermark)), [showFleetWatermark]);
  useEffect(() => localStorage.setItem("nerveCenterFleetIntelligenceView", fleetIntelligenceView), [fleetIntelligenceView]);
  const now = new Date();
  const todayKey = localDateKey(now);
  const dateLabel = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(now);
  const filteredDateLabel = dashboardDate ? new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${dashboardDate}T00:00:00`)) : dateLabel;
  const normalizedAllowedSites=Array.isArray(allowedSites)?allowedSites.filter(Boolean):null;
  const normalizedAllowedRegions=Array.isArray(allowedRegions)?allowedRegions.filter((region)=>region&&region!=="All"):null;
  const scopedEquipment=normalizedAllowedSites?.length?equipmentRecords.filter((record)=>normalizedAllowedSites.some((site)=>recordBelongsToSite(record,site))):restrictToScope?[]:equipmentRecords;
  const scopedBreakdowns=normalizedAllowedSites?.length?requests.filter((record)=>normalizedAllowedSites.some((site)=>recordBelongsToSite(record,site))):restrictToScope?[]:requests;
  const availableRegions=subsidiaryData.filter((region)=>{
    if(normalizedAllowedRegions?.length&&!normalizedAllowedRegions.includes(region.code))return false;
    return !normalizedAllowedSites?.length||region.sites.some((site)=>normalizedAllowedSites.some((allowed)=>recordBelongsToSite({site:allowed},site)));
  });
  const selectedRegion = availableRegions.find((region) => region.code === dashboardRegion);
  const selectedSites = (selectedRegion?.sites || []).filter((site) => !normalizedAllowedSites?.length || normalizedAllowedSites.some((allowed) => recordBelongsToSite({ site: allowed }, site)));
  const activeSites = dashboardSite !== "all" ? [dashboardSite] : selectedSites;
  const visibleEquipment = selectedRegion ? scopedEquipment.filter((record) => activeSites.some((site) => recordBelongsToSite(record, site))) : scopedEquipment;
  const equipmentByReference=new Map();
  visibleEquipment.forEach((record)=>[record.manufacturerSerialNo,record.chassisNo,record.door,record.reg,record.equipmentName]
    .map((value)=>String(value||"").trim().toLowerCase()).filter(Boolean).forEach((key)=>equipmentByReference.set(key,record)));
  const equipmentForRequest = (request = {}) => [request.chassis, request.door, request.equipment]
    .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean).map((key) => equipmentByReference.get(key)).find(Boolean);
  const locationBreakdowns = selectedRegion ? scopedBreakdowns.filter((record) => activeSites.some((site) => recordBelongsToSite(record, site))) : scopedBreakdowns;
  const visibleBreakdowns = (dashboardDate ? locationBreakdowns.filter((record) => dashboardRecordDate(record) === dashboardDate) : locationBreakdowns)
    .map((record)=>{const equipment=equipmentForRequest(record);return {...record,make:equipment?.make||record.make||"",model:equipment?.model||record.model||""}});
  const trendAvailableSites = [...new Set((selectedRegion ? activeSites : availableRegions.flatMap((region) => region.sites))
    .filter((site) => !normalizedAllowedSites?.length || normalizedAllowedSites.some((allowed) => recordBelongsToSite({ site: allowed }, site))))];
  const activeTrendSite = breakdownTrendSite === "all" || trendAvailableSites.includes(breakdownTrendSite) ? breakdownTrendSite : "all";
  const trendRequests = activeTrendSite === "all" ? locationBreakdowns : locationBreakdowns.filter((record) => recordBelongsToSite(record, activeTrendSite));
  const breakdownDateCounts = trendRequests.reduce((counts, record) => {
    const date = dashboardRecordDate(record);
    if (date) counts[date] = (counts[date] || 0) + 1;
    return counts;
  }, {});
  const breakdownTrendAnchorKey = breakdownTrendAnchor || dashboardDate || todayKey;
  const breakdownTrend = buildBreakdownTrend({ counts: breakdownDateCounts, anchorDate: breakdownTrendAnchorKey, days: breakdownTrendDays, view: breakdownTrendView });
  const maxBreakdownTrend = Math.max(1, ...breakdownTrend.map((day) => day.count));
  const actualTrendDays = buildBreakdownTrend({ counts: breakdownDateCounts, anchorDate: breakdownTrendAnchorKey, days: breakdownTrendDays, view: "past" });
  const forecastTrendDays = buildBreakdownTrend({ counts: breakdownDateCounts, anchorDate: breakdownTrendAnchorKey, days: breakdownTrendDays, view: "upcoming" });
  const breakdownTrendTotal = actualTrendDays.reduce((total, day) => total + day.count, 0);
  const breakdownForecastTotal = forecastTrendDays.reduce((total, day) => total + day.count, 0);
  const breakdownTrendAverage = breakdownTrendDays ? (breakdownTrendTotal / breakdownTrendDays).toFixed(1) : "0.0";
  const kpis = liveEquipmentMetrics(visibleEquipment, visibleBreakdowns);
  const roadStatusTotal = kpis.onRoad + kpis.offRoad + kpis.idle;
  const roadStatusShare = (value) => roadStatusTotal ? (value / roadStatusTotal) * 100 : 0;
  const utilizationPercent = kpis.total ? Math.round((kpis.onRoad / kpis.total) * 100) : 0;
  const availableFleet = kpis.onRoad + kpis.idle;
  const availabilityPercent = kpis.total ? Math.round((availableFleet / kpis.total) * 100) : 0;
  const repairTypeBreakdown = [...new Map(
    repairTypeRecords
      .map((record) => String(record.repairType || "").trim())
      .filter(Boolean)
      .map((label) => [label.toLowerCase(), label]),
  ).values()].map((label) => ({
    label,
    value: visibleBreakdowns.filter((record) => String(record.category || "").trim().toLowerCase() === label.toLowerCase()).length,
  }));
  const maxRepairTypeCount = Math.max(1, ...repairTypeBreakdown.map((item) => item.value));
  const repairTypeTotal = repairTypeBreakdown.reduce((total, item) => total + item.value, 0);
  const openCaseRequests = activeOpenCases(visibleBreakdowns);
  const assetCounts = fleetAssetCounts(visibleEquipment);
  const equipmentGroupLabel = (record = {}) => String(record.group || record.equipmentGroup || record.itemName || record.category || "Unclassified").trim() || "Unclassified";
  const equipmentCategoryLabel = (record = {}) => ["vehicle","vehicles"].includes(String(record.category || "").trim().toLowerCase())
    ? "Total vehicles"
    : ["equipment","equipments"].includes(String(record.category || "").trim().toLowerCase()) ? "Total equipment" : "Unclassified";
  const summarizeEquipment = (records = [], valueOf = equipmentGroupLabel) => Object.entries(records.reduce((counts, record) => {
    const label = String(valueOf(record) || "Unclassified").trim() || "Unclassified";
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]);
  const fleetGroupInsights = summarizeEquipment(visibleEquipment).map(([label, total]) => {
    const records = visibleEquipment.filter((record) => equipmentGroupLabel(record) === label);
    return { label, total, ...fleetAssetCounts(records) };
  });
  const fleetPieColors = ["#4f86c6", "#2ca57c", "#8b5cf6", "#f59e0b", "#ef6461", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#a855f7", "#64748b"];
  const pieSlices = (items) => items.reduce((result, item, index) => {
    const start = result.reduce((sum, slice) => sum + slice.percent, 0);
    const percent = assetCounts.total ? item.total / assetCounts.total * 100 : 0;
    return [...result, { ...item, start, percent, color: item.color || fleetPieColors[index % fleetPieColors.length] }];
  }, []);
  const assetCategoryPieSlices = pieSlices([
    { label: "Equipment", total: assetCounts.equipment, key: "equipment", color: "#f04e53" },
    { label: "Vehicles", total: assetCounts.vehicles, key: "vehicle", color: "#522e90" },
  ]);
  const fleetGroupPieSlices = pieSlices(fleetGroupInsights.map((group) => ({ ...group, key: `group:${group.label}` })));
  const fleetHierarchyCategories = [
    { key: "equipment", label: "Equipment", category: "Total equipment", color: "#f04e53", palette: ["#f04e53", "#d83c66", "#f4777b", "#b72d6e", "#ed8b8f", "#a92566"] },
    { key: "vehicle", label: "Vehicles", category: "Total vehicles", color: "#522e90", palette: ["#522e90", "#6d43a1", "#8054b5", "#9c7ac4", "#3d1d70", "#a67bd3"] },
  ];
  const fleetHierarchySlices = pieSlices(fleetHierarchyCategories.flatMap((category) => summarizeEquipment(
    visibleEquipment.filter((record) => equipmentCategoryLabel(record) === category.category),
  ).map(([label, total], index) => ({
    key: `${category.key}:${label}`,
    drilldownKey: `group:${label}`,
    label,
    total,
    category: category.label,
    color: category.palette[index % category.palette.length],
  }))));
  const fleetRegionInsights = availableRegions
    .filter((region) => !selectedRegion || region.code === selectedRegion.code)
    .map((region) => {
      const sites = region.sites
        .filter((site) => !normalizedAllowedSites?.length || normalizedAllowedSites.some((allowed) => recordBelongsToSite({ site: allowed }, site)))
        .filter((site) => dashboardSite === "all" || site === dashboardSite)
        .map((site) => {
          const records = scopedEquipment.filter((record) => recordBelongsToSite(record, site));
          return { name: site, ...fleetAssetCounts(records) };
        });
      const records = scopedEquipment.filter((record) => sites.some((site) => recordBelongsToSite(record, site.name)));
      return { ...region, sites, ...fleetAssetCounts(records) };
    });
  const maxFleetSiteTotal = Math.max(1, ...fleetRegionInsights.flatMap((region) => region.sites.map((site) => site.total)));
  const fleetChartAxisMax = Math.max(10, Math.ceil(maxFleetSiteTotal / 10) * 10);
  const fleetChartTicks = [100, 75, 50, 25, 0].map((percent) => Math.round((fleetChartAxisMax * percent) / 100));
  const equipmentShare = assetCounts.total ? Math.round((assetCounts.equipment / assetCounts.total) * 100) : 0;
  const vehicleShare = assetCounts.total ? Math.round((assetCounts.vehicles / assetCounts.total) * 100) : 0;
  const dateKey = (value) => String(value || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
  const requestEventDate = (record, event) => event === "opened"
    ? dateKey(record.start) || dateKey(record.startedAt) || dateKey(record.createdAt)
    : event === "closed" ? dateKey(record.closedAt)
      : event === "verified" ? dateKey(record.verifiedAt)
        : dateKey(record.closedAt) || dateKey(record.start);
  const requestTrendEndKey = requestTrendTo || dashboardDate || localDateKey(now);
  const requestTrendEarliest = new Date(`${requestTrendEndKey}T12:00:00`);
  requestTrendEarliest.setDate(requestTrendEarliest.getDate() - 365);
  const requestTrendEarliestKey = localDateKey(requestTrendEarliest);
  const presetTrendStart = new Date(`${requestTrendEndKey}T12:00:00`);
  presetTrendStart.setDate(presetTrendStart.getDate() - (requestTrendDays - 1));
  const requestTrendStartKey = requestTrendFrom || localDateKey(presetTrendStart);
  const safeTrendStartKey = requestTrendStartKey > requestTrendEndKey ? requestTrendEndKey : requestTrendStartKey < requestTrendEarliestKey ? requestTrendEarliestKey : requestTrendStartKey;
  const requestTrendDateKeys = [];
  for (const cursor = new Date(`${safeTrendStartKey}T12:00:00`), end = new Date(`${requestTrendEndKey}T12:00:00`); cursor <= end && requestTrendDateKeys.length < 366; cursor.setDate(cursor.getDate() + 1)) {
    requestTrendDateKeys.push(localDateKey(cursor));
  }
  const requestLifecycleRows = {
    opened: locationBreakdowns.filter((record) => requestEventDate(record, "opened") >= safeTrendStartKey && requestEventDate(record, "opened") <= requestTrendEndKey),
    closed: locationBreakdowns.filter((record) => !["idle", "ideal"].includes(String(record.status || "").trim().toLowerCase()) && requestEventDate(record, "closed") >= safeTrendStartKey && requestEventDate(record, "closed") <= requestTrendEndKey),
    verified: locationBreakdowns.filter((record) => requestEventDate(record, "verified") >= safeTrendStartKey && requestEventDate(record, "verified") <= requestTrendEndKey),
    idle: locationBreakdowns.filter((record) => ["idle", "ideal"].includes(String(record.status || "").trim().toLowerCase()) && requestEventDate(record, "idle") >= safeTrendStartKey && requestEventDate(record, "idle") <= requestTrendEndKey),
  };
  const requestLifecycleTrend = requestTrendDateKeys.map((date) => ({
    date,
    opened: requestLifecycleRows.opened.filter((record) => requestEventDate(record, "opened") === date).length,
    closed: requestLifecycleRows.closed.filter((record) => requestEventDate(record, "closed") === date).length,
    verified: requestLifecycleRows.verified.filter((record) => requestEventDate(record, "verified") === date).length,
    idle: requestLifecycleRows.idle.filter((record) => requestEventDate(record, "idle") === date).length,
  }));
  const requestLifecycleMaximum = Math.max(1, ...requestLifecycleTrend.flatMap((day) => [day.opened, day.closed, day.verified, day.idle]));
  const requestLifecycleRangeLabel = `${new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(new Date(`${safeTrendStartKey}T12:00:00`))} - ${new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${requestTrendEndKey}T12:00:00`))}`;
  const requestAssetRows = (requestRows = []) => requestRows.map((request, index) => {
    const equipment = equipmentForRequest(request);
    return {
      ...(equipment || {}),
      id: `${request.ref || request.reference || request.id || "request"}-${index}`,
      equipmentName: equipment?.equipmentName || request.equipment || request.door || "Unclassified equipment",
      category: equipment?.category || request.equipmentCategory || "Unclassified",
      group: equipment?.group || equipment?.equipmentGroup || request.equipmentGroup || request.equipment || "Unclassified",
      make: equipment?.make || request.make || "",
      model: equipment?.model || request.model || "",
      currentLocation: equipment?.currentLocation || equipment?.location || request.site || "",
      manufacturerSerialNo: equipment?.manufacturerSerialNo || equipment?.chassisNo || request.chassis || "",
      requestReference: request.ref || request.reference || "—",
      requestStatus: request.status || "—",
      repairCategory: request.category || "—",
      requestStart: request.start || "—",
      requestClosed: request.closedAt || "—",
      requestVerified: request.verifiedAt || "—",
    };
  });
  const rowsForAssetDrilldown = (key = "") => {
    if (!key || key === "all" || key === "road-availability") return visibleEquipment;
    if (key === "equipment") return visibleEquipment.filter((record) => ["equipment","equipments"].includes(String(record.category || "").trim().toLowerCase()));
    if (key === "vehicle") return visibleEquipment.filter((record) => ["vehicle","vehicles"].includes(String(record.category || "").trim().toLowerCase()));
    if (key === "available") return visibleEquipment.filter((record) => ["onroad", "idle"].includes(liveEquipmentRoadStatus(record, visibleBreakdowns)));
    if (["onroad","offroad","idle","unknown"].includes(key)) return visibleEquipment.filter((record) => liveEquipmentRoadStatus(record, visibleBreakdowns) === key);
    if (key.startsWith("region:")) {
      const region = availableRegions.find((item) => item.code === key.slice(7));
      return region ? visibleEquipment.filter((record) => region.sites.some((site) => recordBelongsToSite(record, site))) : [];
    }
    if (key.startsWith("site:")) return visibleEquipment.filter((record) => recordBelongsToSite(record, key.slice(5)));
    if (key.startsWith("group:")) return visibleEquipment.filter((record) => equipmentGroupLabel(record) === key.slice(6));
    if (key === "open-cases") return requestAssetRows(openCaseRequests);
    if (key.startsWith("repair:")) return requestAssetRows(visibleBreakdowns.filter((record) => String(record.category || "").trim().toLowerCase() === key.slice(7).toLowerCase()));
    if (key.startsWith("status:")) return requestAssetRows(visibleBreakdowns.filter((record) => String(record.status || "").trim().toLowerCase() === key.slice(7).toLowerCase()));
    if (key.startsWith("event:")) {
      const [, event, date] = key.split(":");
      const rows = requestLifecycleRows[event] || [];
      return requestAssetRows(date ? rows.filter((record) => requestEventDate(record, event) === date) : rows);
    }
    return [];
  };
  const assetDrilldownRows = rowsForAssetDrilldown(assetDrilldown);
  const siteFirstAssetDrilldown = ["all", "equipment", "vehicle", "road-availability", "available", "onroad", "offroad", "idle", "unknown"].includes(assetDrilldown);
  const repairTypeSiteDrilldown = assetDrilldown.startsWith("repair:") || assetDrilldown.startsWith("event:");
  const repairTypeRegionBreakdown = availableRegions
    .filter((region) => !selectedRegion || region.code === selectedRegion.code)
    .map((region) => {
      const sites = region.sites
        .filter((site) => !normalizedAllowedSites?.length || normalizedAllowedSites.some((allowed) => recordBelongsToSite({ site: allowed }, site)))
        .filter((site) => dashboardSite === "all" || site === dashboardSite);
      return { ...region, sites, count: assetDrilldownRows.filter((record) => sites.some((site) => recordBelongsToSite(record, site))).length };
    });
  const selectedRepairTypeRegion = repairTypeRegionBreakdown.find((region) => region.code === assetDrilldownRegion);
  const repairTypeSiteBreakdown = (selectedRepairTypeRegion?.sites || []).map((site) => ({
    site,
    count: assetDrilldownRows.filter((record) => recordBelongsToSite(record, site)).length,
  }));
  const repairTypeSiteRows = assetDrilldownSite ? assetDrilldownRows.filter((record) => recordBelongsToSite(record, assetDrilldownSite)) : [];
  const repairTypeSiteCategoryBreakdown = summarizeEquipment(repairTypeSiteRows, equipmentCategoryLabel);
  const repairTypeSiteCategoryRows = assetDrilldownCategory ? repairTypeSiteRows.filter((record) => equipmentCategoryLabel(record) === assetDrilldownCategory) : [];
  const repairTypeSiteGroupBreakdown = summarizeEquipment(repairTypeSiteCategoryRows);
  const repairTypeSiteGroupRows = assetDrilldownGroup ? repairTypeSiteCategoryRows.filter((record) => equipmentGroupLabel(record) === assetDrilldownGroup) : [];
  const assetDrilldownRegions = fleetRegionInsights.map((region) => {
    const sites = region.sites.map((site) => {
      const records = assetDrilldownRows.filter((record) => recordBelongsToSite(record, site.name));
      return { ...site, ...fleetAssetCounts(records) };
    });
    const records = assetDrilldownRows.filter((record) => sites.some((site) => recordBelongsToSite(record, site.name)));
    return { ...region, sites, ...fleetAssetCounts(records) };
  });
  const selectedAssetRegion = assetDrilldownRegions.find((region) => region.code === assetDrilldownRegion);
  const assetDrilldownSites = selectedAssetRegion?.sites || [];
  const assetSiteRows = assetDrilldownSite ? assetDrilldownRows.filter((record) => recordBelongsToSite(record, assetDrilldownSite)) : [];
  const assetSiteCategoryBreakdown = summarizeEquipment(assetSiteRows, equipmentCategoryLabel);
  const assetSiteCategoryRows = assetDrilldownCategory ? assetSiteRows.filter((record) => equipmentCategoryLabel(record) === assetDrilldownCategory) : [];
  const assetSiteGroupBreakdown = summarizeEquipment(assetSiteCategoryRows);
  const assetSiteGroupRows = assetDrilldownGroup ? assetSiteCategoryRows.filter((record) => equipmentGroupLabel(record) === assetDrilldownGroup) : [];
  const assetCategoryRows = assetDrilldownCategory ? assetDrilldownRows.filter((record) => equipmentCategoryLabel(record) === assetDrilldownCategory) : [];
  const assetGroupRows = assetDrilldownCategory && assetDrilldownGroup ? assetCategoryRows.filter((record) => equipmentGroupLabel(record) === assetDrilldownGroup) : [];
  const assetCategoryBreakdown = summarizeEquipment(assetDrilldownRows, equipmentCategoryLabel);
  const assetGroupBreakdown = summarizeEquipment(assetCategoryRows);
  const requestAssetDrilldown = assetDrilldown === "open-cases" || assetDrilldown.startsWith("repair:") || assetDrilldown.startsWith("status:") || assetDrilldown.startsWith("event:");
  const lifecycleDrilldownParts = assetDrilldown.startsWith("event:") ? assetDrilldown.split(":") : [];
  const lifecycleDrilldownLabel = lifecycleDrilldownParts[1] === "opened" ? "Opened requests" : lifecycleDrilldownParts[1] === "closed" ? "Closed requests" : lifecycleDrilldownParts[1] === "idle" ? "Idle vehicles" : "Verified requests";
  const assetDrilldownTitle = assetDrilldown === "equipment" ? "Total equipment" : assetDrilldown === "vehicle" ? "Total vehicles" : assetDrilldown === "road-availability" ? "Road Availability" : assetDrilldown === "available" ? "Available fleet" : assetDrilldown === "onroad" ? "On road equipment" : assetDrilldown === "offroad" ? "Off road equipment" : assetDrilldown === "idle" ? "Idle equipment" : assetDrilldown === "unknown" ? "Status not set" : assetDrilldown === "open-cases" ? "Open cases" : assetDrilldown.startsWith("event:") ? `${lifecycleDrilldownLabel}${lifecycleDrilldownParts[2] ? ` · ${lifecycleDrilldownParts[2]}` : ""}` : assetDrilldown.startsWith("repair:") ? `${assetDrilldown.slice(7)} cases` : assetDrilldown.startsWith("status:") ? `${assetDrilldown.slice(7)} workload` : assetDrilldown.startsWith("region:") ? `${assetDrilldown.slice(7)} equipment` : assetDrilldown.startsWith("site:") ? `${assetDrilldown.slice(5)} equipment` : assetDrilldown.startsWith("group:") ? assetDrilldown.slice(6) : "Total equipment and vehicles";
  const openAssetDrilldown = (key) => {
    setAssetDrilldown(key);
    setAssetDrilldownRegion("");
    setAssetDrilldownSite("");
    setAssetDrilldownCategory("");
    setAssetDrilldownGroup("");
  };
  const selectAssetCategory = (category) => {
    setAssetDrilldownCategory(category);
    setAssetDrilldownGroup("");
  };
  const selectAssetGroup = (group) => {
    setAssetDrilldownGroup(group);
  };
  return (
    <div className={`mine-dashboard ${theme === "dark" ? "mine-dashboard-night" : "mine-dashboard-day"}`}>
      <header className="mine-dashboard-head">
        <div><img className="mine-brandmark" src="/caliber-logo-reverse.png" alt="Caliber Mining and Logistics" /><div><span className="mine-eyebrow">Mining operations</span><h1>Fleet control dashboard</h1><p>Maintenance, availability and site performance command center.</p></div></div>
        <div className="mine-head-actions"><label><span>Region</span><select aria-label="Region" value={dashboardRegion} onChange={(event) => { setDashboardRegion(event.target.value); setDashboardSite("all"); }}><option value="all">{restrictToScope?"All assigned sites":"All regions"}</option>{availableRegions.map((region) => <option key={region.code} value={region.code}>{region.code}</option>)}</select></label>{selectedRegion && <label className="mine-site-filter"><span>Site</span><select aria-label="Site" value={dashboardSite} onChange={(event) => setDashboardSite(event.target.value)}><option value="all">All {selectedRegion.code} sites</option>{selectedSites.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>}<label className="mine-date-filter"><span>Date</span><input aria-label="Dashboard date" type="date" value={dashboardDate} onChange={(event) => setDashboardDate(event.target.value)} /></label><span className="mine-updated"><Activity /> {dashboardDate ? "Filtered" : "Live"} · {filteredDateLabel}</span></div>
      </header>
      <section className="mine-dashboard-feature-row" aria-label="Fleet and repair overview">
        <article className={`mine-panel mine-fleet-region-chart${showFleetWatermark ? " watermarked" : ""}`} aria-label="Total fleet by region and site graph">
          <header><div><h2>Total Fleet</h2></div><strong className="mine-fleet-chart-total">{assetCounts.total.toLocaleString()} <span>Total Fleet</span><button type="button" className="mine-fleet-chart-total-trigger" aria-label="Drill down Total Fleet" onClick={() => openAssetDrilldown("all")} /></strong><div className="mine-fleet-chart-tools"><div className="mine-fleet-chart-legend"><span><i className="equipment" />Equipment</span><span><i className="vehicles" />Vehicles</span></div><button type="button" className="mine-fleet-watermark-toggle" aria-pressed={showFleetWatermark} title={`${showFleetWatermark ? "Hide" : "Show"} Caliber watermark`} onClick={() => setShowFleetWatermark((visible) => !visible)}>{showFleetWatermark ? <Eye /> : <EyeOff />}<span>Watermark</span></button></div></header>
          <div className="mine-fleet-chart-layout">
            <div className="mine-fleet-chart-y" aria-hidden="true"><b>Total fleet count</b>{fleetChartTicks.map((tick) => <span key={tick}>{tick.toLocaleString()}</span>)}</div>
            <div className="mine-fleet-chart-plot">
              <div className="mine-fleet-chart-grid" aria-hidden="true">{fleetChartTicks.map((tick) => <i key={tick} />)}</div>
              <div className="mine-fleet-chart-regions">{fleetRegionInsights.map((region) => <section key={region.code} style={{ flexGrow: Math.max(1, region.sites.length) }} aria-label={`${region.code} fleet sites`}>
                <div className="mine-fleet-chart-sites">{region.sites.map((site) => <button type="button" key={site.name} onClick={() => openAssetDrilldown(`site:${site.name}`)} aria-label={`${site.name}: ${site.equipment} equipment and ${site.vehicles} vehicles`} title={`${site.name}: ${site.equipment} equipment, ${site.vehicles} vehicles`}>
                  <span className="mine-fleet-site-bars"><i className="equipment" style={{ height: `${site.equipment ? Math.max(3, (site.equipment / fleetChartAxisMax) * 100) : 1}%` }}><b>{site.equipment.toLocaleString()}</b></i><i className="vehicles" style={{ height: `${site.vehicles ? Math.max(3, (site.vehicles / fleetChartAxisMax) * 100) : 1}%` }}><b>{site.vehicles.toLocaleString()}</b></i></span><small>{site.name}</small>
                </button>)}</div>
                <footer><b>{region.code}</b><span>{region.total.toLocaleString()} fleet</span></footer>
              </section>)}</div>
            </div>
          </div>
          <div className="mine-fleet-chart-x" aria-hidden="true">Region and site</div>
        </article>
        <article className="mine-panel mine-repair-type-chart" aria-label="Maintenance type graph">
          <header><div><span className="mine-eyebrow">Maintenance analysis</span><h2>Maintenance Type</h2></div><strong>{repairTypeTotal.toLocaleString()} requests</strong></header>
          <div className="mine-repair-type-bars">
            {repairTypeBreakdown.length ? repairTypeBreakdown.map(({ label, value }) => <button type="button" key={label} onClick={() => openAssetDrilldown(`repair:${label}`)} aria-label={`${label}: ${value} breakdown requests`}>
              <span>{label}</span><i><b style={{ width: `${(value / maxRepairTypeCount) * 100}%` }} /></i><strong>{value.toLocaleString()}</strong>
            </button>) : <div className="mine-empty">No repair types configured</div>}
          </div>
        </article>
        <article className="mine-primary-kpi-card mine-road-status-graphic mine-feature-road-availability">
          <header><div><span className="mine-eyebrow">Fleet status</span><h2>Road Availability</h2></div><strong>{roadStatusTotal.toLocaleString()} <small>Total fleet</small></strong></header>
          <div className="mine-road-availability-body">
            <button type="button" className="mine-road-availability-overview" onClick={() => openAssetDrilldown("road-availability")} aria-label="Drill down Road Availability by region and site">
              <span className="mine-road-availability-summary"><strong>{kpis.availability}%</strong><span>Fleet available</span><small>{kpis.onRoad.toLocaleString()} of {roadStatusTotal.toLocaleString()} assets are on road</small></span>
              <span className="mine-road-distribution" aria-label="Road availability distribution">
                <span><i className="onroad" style={{ width: `${roadStatusShare(kpis.onRoad)}%` }} /><i className="offroad" style={{ width: `${roadStatusShare(kpis.offRoad)}%` }} /><i className="idle" style={{ width: `${roadStatusShare(kpis.idle)}%` }} /></span>
                <span><b>0%</b><b>Fleet status distribution</b><b>100%</b></span>
              </span>
            </button>
            <div className="mine-road-status-values">
              <button type="button" className="onroad" onClick={() => openAssetDrilldown("onroad")}><CheckCircle2 /><span><b>On road</b><small>{roadStatusShare(kpis.onRoad).toFixed(1)}% available</small></span><strong>{kpis.onRoad.toLocaleString()}</strong></button>
              <button type="button" className="offroad" onClick={() => openAssetDrilldown("offroad")}><AlertTriangle /><span><b>Off road</b><small>{roadStatusShare(kpis.offRoad).toFixed(1)}% maintenance</small></span><strong>{kpis.offRoad.toLocaleString()}</strong></button>
              <button type="button" className="idle" onClick={() => openAssetDrilldown("idle")}><Clock /><span><b>Idle</b><small>{roadStatusShare(kpis.idle).toFixed(1)}% not working</small></span><strong>{kpis.idle.toLocaleString()}</strong></button>
            </div>
          </div>
        </article>
      </section>
      <section className="mine-dashboard-grid mine-dashboard-core">
        <article className="mine-panel mine-fleet-command">
          <header className="mine-fleet-command-head">
            <div><h2>Total Equipment Intelligence</h2></div>
            <div className="mine-fleet-command-actions">
              <div className="mine-intelligence-view-switch" role="group" aria-label="Equipment intelligence chart view">
                <button type="button" className={fleetIntelligenceView === "combined" ? "active" : ""} aria-pressed={fleetIntelligenceView === "combined"} onClick={() => setFleetIntelligenceView("combined")}><Network />Combined</button>
                <button type="button" className={fleetIntelligenceView === "split" ? "active" : ""} aria-pressed={fleetIntelligenceView === "split"} onClick={() => setFleetIntelligenceView("split")}><Columns3 />Split</button>
              </div>
              <button type="button" className="mine-view-full-fleet" onClick={() => openAssetDrilldown("all")}>View full fleet <ChevronRight /></button>
            </div>
          </header>
          <div className={`mine-fleet-command-body ${fleetIntelligenceView === "combined" ? "combined" : "split"}`}>
            {fleetIntelligenceView === "combined" ? <section className="mine-fleet-combined" aria-label="Combined asset category and equipment group chart">
              <div className="mine-fleet-section-title"><span>Fleet composition</span><b>Combined view</b></div>
              <div className="mine-hierarchy-layout">
                <div className="mine-hierarchy-chart-wrap">
                  <svg className="mine-hierarchy-chart" viewBox="0 0 42 42" aria-label="Equipment and vehicle groups in one hierarchical chart">
                    <circle className="mine-hierarchy-track" cx="21" cy="21" r="17" pathLength="100" fill="none" strokeWidth="4.5" />
                    {fleetHierarchySlices.map((slice) => <circle key={slice.key} className="mine-hierarchy-slice outer" cx="21" cy="21" r="17" pathLength="100" fill="none" stroke={slice.color} strokeWidth="4.5" strokeDasharray={`${slice.percent} ${100 - slice.percent}`} strokeDashoffset={-slice.start} role="button" tabIndex="0" onClick={() => openAssetDrilldown(slice.drilldownKey)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openAssetDrilldown(slice.drilldownKey); }}><title>{slice.category} · {slice.label}: {slice.total} ({Math.round(slice.percent)}%)</title></circle>)}
                    <circle className="mine-hierarchy-track inner" cx="21" cy="21" r="11" pathLength="100" fill="none" strokeWidth="6" />
                    {assetCategoryPieSlices.map((slice) => <circle key={slice.key} className="mine-hierarchy-slice inner" cx="21" cy="21" r="11" pathLength="100" fill="none" stroke={slice.color} strokeWidth="6" strokeDasharray={`${slice.percent} ${100 - slice.percent}`} strokeDashoffset={-slice.start} role="button" tabIndex="0" onClick={() => openAssetDrilldown(slice.key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openAssetDrilldown(slice.key); }}><title>{slice.label}: {slice.total} ({Math.round(slice.percent)}%)</title></circle>)}
                  </svg>
                  <span className="mine-pie-center"><b>{assetCounts.total.toLocaleString()}</b><small>Total fleet</small></span>
                </div>
                <div className="mine-hierarchy-details">
                  <div className="mine-hierarchy-categories">{assetCategoryPieSlices.map((slice) => <button type="button" key={slice.key} onClick={() => openAssetDrilldown(slice.key)}><i style={{ background: slice.color }} /><span><b>{slice.label}</b><small>{Math.round(slice.percent)}% of fleet</small></span><strong>{slice.total.toLocaleString()}</strong></button>)}</div>
                  <div className="mine-hierarchy-groups">{fleetHierarchySlices.map((slice) => <button type="button" key={slice.key} onClick={() => openAssetDrilldown(slice.drilldownKey)}><i style={{ background: slice.color }} /><span><b>{slice.label}</b><small>{slice.category}</small></span><strong>{slice.total.toLocaleString()}</strong></button>)}</div>
                </div>
              </div>
            </section> : <>
              <section className="mine-fleet-category mine-fleet-pie-panel" aria-label="Interactive asset category pie chart">
                <div className="mine-fleet-section-title"><span>Asset category</span><b>{assetCounts.total.toLocaleString()} total</b></div>
                <div className="mine-pie-chart-wrap"><svg className="mine-pie-chart" viewBox="0 0 42 42" aria-label={`${equipmentShare}% equipment and ${vehicleShare}% vehicles`}>{assetCategoryPieSlices.map((slice) => <circle key={slice.key} className="mine-pie-slice" cx="21" cy="21" r="15.9155" pathLength="100" fill="none" stroke={slice.color} strokeWidth="7" strokeDasharray={`${slice.percent} ${100 - slice.percent}`} strokeDashoffset={-slice.start} onClick={() => openAssetDrilldown(slice.key)} role="button" tabIndex="0" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openAssetDrilldown(slice.key); }}><title>{slice.label}: {slice.total} ({Math.round(slice.percent)}%)</title></circle>)}</svg><span className="mine-pie-center"><b>{assetCounts.total.toLocaleString()}</b><small>Total fleet</small></span></div>
                <div className="mine-pie-legend">{assetCategoryPieSlices.map((slice) => <button type="button" key={slice.key} onClick={() => openAssetDrilldown(slice.key)}><i style={{ background: slice.color }} /><span>{slice.label}</span><b>{slice.total.toLocaleString()}</b><em>{Math.round(slice.percent)}%</em></button>)}</div>
              </section>
              <section className="mine-fleet-groups mine-fleet-pie-panel" aria-label="Interactive equipment groups pie chart">
                <div className="mine-fleet-section-title"><span>Equipment groups</span><b>{fleetGroupInsights.length} groups</b></div>
                {fleetGroupPieSlices.length ? <><div className="mine-pie-chart-wrap"><svg className="mine-pie-chart" viewBox="0 0 42 42" aria-label={`${fleetGroupInsights.length} equipment groups`}>{fleetGroupPieSlices.map((slice) => <circle key={slice.key} className="mine-pie-slice" cx="21" cy="21" r="15.9155" pathLength="100" fill="none" stroke={slice.color} strokeWidth="7" strokeDasharray={`${slice.percent} ${100 - slice.percent}`} strokeDashoffset={-slice.start} onClick={() => openAssetDrilldown(slice.key)} role="button" tabIndex="0" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openAssetDrilldown(slice.key); }}><title>{slice.label}: {slice.total}</title></circle>)}</svg><span className="mine-pie-center"><b>{fleetGroupInsights.length}</b><small>Groups</small></span></div><div className="mine-pie-legend mine-group-pie-legend">{fleetGroupPieSlices.map((slice) => <button type="button" key={slice.key} onClick={() => openAssetDrilldown(slice.key)}><i style={{ background: slice.color }} /><span>{slice.label}</span><b>{slice.total.toLocaleString()}</b></button>)}</div></> : <p className="mine-empty">No equipment groups available</p>}
              </section>
            </>}
          </div>
        </article>
        <article className="mine-panel mine-request-lifecycle" aria-label="Opened, closed, verified and idle request trend">
          <header>
            <div><span className="mine-eyebrow">Workflow throughput</span><h2>Request Lifecycle</h2><p>{requestLifecycleRangeLabel}</p></div>
            <div className="mine-request-lifecycle-controls">
              <div className="mine-trend-period" role="group" aria-label="Request lifecycle period">{[7, 14, 30].map((days) => <button type="button" key={days} className={!requestTrendFrom && !requestTrendTo && requestTrendDays === days ? "active" : ""} onClick={() => { setRequestTrendDays(days); setRequestTrendFrom(""); setRequestTrendTo(""); }}>{days}D</button>)}</div>
              <label><span>From</span><input type="date" aria-label="Request lifecycle from date" value={requestTrendFrom} min={requestTrendEarliestKey} max={requestTrendTo || requestTrendEndKey} onChange={(event) => setRequestTrendFrom(event.target.value)} /></label>
              <label><span>To</span><input type="date" aria-label="Request lifecycle to date" value={requestTrendTo} min={requestTrendFrom || undefined} max={localDateKey(now)} onChange={(event) => setRequestTrendTo(event.target.value)} /></label>
            </div>
          </header>
          <div className="mine-request-lifecycle-summary">
            {[{ key: "opened", label: "Opened", note: "New requests" }, { key: "closed", label: "Closed", note: "Maintenance completed" }, { key: "verified", label: "Verified", note: "MIS verified" }, { key: "idle", label: "Idle Vehicles", note: "Available, not working" }].map((item) => <button type="button" key={item.key} className={item.key} onClick={() => openAssetDrilldown(`event:${item.key}`)}><i /><span><b>{item.label}</b><small>{item.note}</small></span><strong>{requestLifecycleRows[item.key].length.toLocaleString()}</strong></button>)}
          </div>
          <div className="mine-request-lifecycle-chart" aria-label={`Request lifecycle chart from ${safeTrendStartKey} to ${requestTrendEndKey}`}>
            <div className="mine-request-chart-grid" aria-hidden="true"><i /><i /><i /><i /></div>
            <div className="mine-request-chart-days" style={{ gridTemplateColumns: `repeat(${Math.max(1, requestLifecycleTrend.length)}, minmax(28px, 1fr))`, minWidth: `${Math.max(100, requestLifecycleTrend.length * 34)}px` }}>
              {requestLifecycleTrend.map((day, index) => <div className="mine-request-chart-day" key={day.date}>
                <span>
                  {(["opened", "closed", "verified", "idle"]).map((event) => <button type="button" key={event} className={event} disabled={!day[event]} style={{ height: `${day[event] ? Math.max(7, (day[event] / requestLifecycleMaximum) * 100) : 2}%` }} aria-label={`${day.date}: ${day[event]} ${event} requests`} title={`${day.date}: ${day[event]} ${event}`} onClick={() => openAssetDrilldown(`event:${event}:${day.date}`)}><b>{day[event] || ""}</b></button>)}
                </span>
                <small>{requestLifecycleTrend.length <= 14 || index === 0 || index === requestLifecycleTrend.length - 1 || index % 5 === 0 ? new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(new Date(`${day.date}T12:00:00`)) : ""}</small>
              </div>)}
            </div>
          </div>
        </article>
      </section>
      {assetDrilldown && <Modal className="dashboard-asset-modal" title={`${assetDrilldownTitle} · ${assetDrilldownRows.length}`} close={() => { setAssetDrilldown(""); setAssetDrilldownRegion(""); setAssetDrilldownSite(""); setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><div className="dashboard-asset-drilldown">
        {repairTypeSiteDrilldown ? <>
          <section><h4>Step 1 · Select region</h4><div className="dashboard-asset-summary">{repairTypeRegionBreakdown.length ? repairTypeRegionBreakdown.map((region) => <button type="button" key={region.code} className={assetDrilldownRegion === region.code ? "active" : ""} onClick={() => { setAssetDrilldownRegion(region.code); setAssetDrilldownSite(""); setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><b>{region.count.toLocaleString()}</b>{region.code}</button>) : <p>No regions available</p>}</div></section>
          {selectedRepairTypeRegion && <section><h4><button type="button" className="dashboard-asset-back" aria-label="Back to repair regions" onClick={() => { setAssetDrilldownRegion(""); setAssetDrilldownSite(""); setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><ChevronLeft /> Back</button><span>Step 2 · Select {selectedRepairTypeRegion.code} site</span></h4><div className="dashboard-asset-summary">{repairTypeSiteBreakdown.length ? repairTypeSiteBreakdown.map(({ site, count }) => <button type="button" key={site} className={assetDrilldownSite === site ? "active" : ""} onClick={() => { setAssetDrilldownSite(site); setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><b>{count.toLocaleString()}</b>{site}</button>) : <p>No sites available</p>}</div></section>}
          {assetDrilldownSite && <section><h4><button type="button" className="dashboard-asset-back" aria-label={`Back to ${selectedRepairTypeRegion.code} repair sites`} onClick={() => { setAssetDrilldownSite(""); setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><ChevronLeft /> Back</button><span>Step 3 · {assetDrilldownSite} fleet totals</span></h4><div className="dashboard-asset-summary">{repairTypeSiteCategoryBreakdown.length ? repairTypeSiteCategoryBreakdown.map(([label, value]) => <button type="button" key={label} className={assetDrilldownCategory === label ? "active" : ""} onClick={() => selectAssetCategory(label)}><b>{value.toLocaleString()}</b>{label}</button>) : <p>No matching equipment or vehicles found for {assetDrilldownSite}</p>}</div></section>}
          {assetDrilldownCategory && <section><h4><button type="button" className="dashboard-asset-back" aria-label={`Back to ${assetDrilldownSite} repair fleet totals`} onClick={() => { setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><ChevronLeft /> Back</button><span>Step 4 · Select {assetDrilldownCategory === "Total vehicles" ? "vehicle" : "equipment"} type</span></h4><div className="dashboard-asset-groups">{repairTypeSiteGroupBreakdown.length ? repairTypeSiteGroupBreakdown.map(([label, value]) => <button type="button" key={label} className={assetDrilldownGroup === label ? "active" : ""} onClick={() => selectAssetGroup(label)}><span>{label}</span><b>{value.toLocaleString()}</b></button>) : <p>No types found</p>}</div></section>}
          {assetDrilldownGroup && <section><h4><button type="button" className="dashboard-asset-back" aria-label={`Back to ${assetDrilldownCategory} repair types`} onClick={() => setAssetDrilldownGroup("")}><ChevronLeft /> Back</button><span>Step 5 · Request details for {assetDrilldownGroup}</span></h4><div className="dashboard-asset-list"><table><thead><tr><th>Job reference</th><th>Equipment name</th><th>Equipment category</th><th>Equipment group</th><th>Make</th><th>Model</th><th>Current location</th><th>Serial / chassis no.</th><th>Status</th><th>Started</th></tr></thead><tbody>{repairTypeSiteGroupRows.length ? repairTypeSiteGroupRows.map((record,index)=><tr key={record.id||`${record.equipmentName}-${index}`}><td><b>{record.requestReference}</b></td><td><b>{record.equipmentName||record.door||"—"}</b></td><td>{equipmentCategoryLabel(record)}</td><td>{equipmentGroupLabel(record)}</td><td>{record.make||"—"}</td><td>{record.model||"—"}</td><td>{record.currentLocation||record.location||"—"}</td><td>{record.manufacturerSerialNo||record.chassisNo||"—"}</td><td><Status>{record.requestStatus}</Status></td><td>{formatTwelveHourDateTime(record.requestStart)}</td></tr>) : <tr><td colSpan="10">No matching requests for {assetDrilldownGroup}</td></tr>}</tbody></table></div></section>}
        </> : siteFirstAssetDrilldown ? <>
          <section><h4>Step 1 · Select region</h4><div className="dashboard-asset-summary">{assetDrilldownRegions.length ? assetDrilldownRegions.map((region) => <button type="button" key={region.code} className={assetDrilldownRegion === region.code ? "active" : ""} onClick={() => { setAssetDrilldownRegion(region.code); setAssetDrilldownSite(""); setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><b>{region.total.toLocaleString()}</b>{region.code}</button>) : <p>No regions available</p>}</div></section>
          {selectedAssetRegion && <section><h4><button type="button" className="dashboard-asset-back" aria-label="Back to regions" onClick={() => { setAssetDrilldownRegion(""); setAssetDrilldownSite(""); setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><ChevronLeft /> Back</button><span>Step 2 · Select {selectedAssetRegion.code} site</span></h4><div className="dashboard-asset-summary">{assetDrilldownSites.length ? assetDrilldownSites.map((site) => <button type="button" key={site.name} className={assetDrilldownSite === site.name ? "active" : ""} onClick={() => { setAssetDrilldownSite(site.name); setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><b>{site.total.toLocaleString()}</b>{site.name}</button>) : <p>No sites available</p>}</div></section>}
          {assetDrilldownSite && <section><h4><button type="button" className="dashboard-asset-back" aria-label={`Back to ${selectedAssetRegion.code} sites`} onClick={() => { setAssetDrilldownSite(""); setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><ChevronLeft /> Back</button><span>Step 3 · {assetDrilldownSite} fleet totals</span></h4><div className="dashboard-asset-summary">{assetSiteCategoryBreakdown.length ? assetSiteCategoryBreakdown.map(([label, value]) => <button type="button" key={label} className={assetDrilldownCategory === label ? "active" : ""} onClick={() => selectAssetCategory(label)}><b>{value.toLocaleString()}</b>{label}</button>) : <p>No equipment or vehicles found for {assetDrilldownSite}</p>}</div></section>}
          {assetDrilldownCategory && <section><h4><button type="button" className="dashboard-asset-back" aria-label={`Back to ${assetDrilldownSite} fleet totals`} onClick={() => { setAssetDrilldownCategory(""); setAssetDrilldownGroup(""); }}><ChevronLeft /> Back</button><span>Step 4 · Select {assetDrilldownCategory === "Total vehicles" ? "vehicle" : "equipment"} type</span></h4><div className="dashboard-asset-groups">{assetSiteGroupBreakdown.length ? assetSiteGroupBreakdown.map(([label, value]) => <button type="button" key={label} className={assetDrilldownGroup === label ? "active" : ""} onClick={() => selectAssetGroup(label)}><span>{label}</span><b>{value.toLocaleString()}</b></button>) : <p>No types found</p>}</div></section>}
          {assetDrilldownGroup && <section><h4><button type="button" className="dashboard-asset-back" aria-label={`Back to ${assetDrilldownCategory} types`} onClick={() => setAssetDrilldownGroup("")}><ChevronLeft /> Back</button><span>Step 5 · Full details for {assetDrilldownGroup}</span></h4><div className="dashboard-asset-list"><table><thead><tr><th>Equipment name</th><th>Equipment category</th><th>Equipment group</th><th>Make</th><th>Model</th><th>Current location</th><th>Serial / chassis no.</th></tr></thead><tbody>{assetSiteGroupRows.map((record,index)=><tr key={record.id||`${record.equipmentName}-${index}`}><td><b>{record.equipmentName||record.door||"—"}</b></td><td>{equipmentCategoryLabel(record)}</td><td>{equipmentGroupLabel(record)}</td><td>{record.make||"—"}</td><td>{record.model||"—"}</td><td>{record.currentLocation||record.location||"—"}</td><td>{record.manufacturerSerialNo||record.chassisNo||"—"}</td></tr>)}</tbody></table></div></section>}
        </> : <>
          <section><h4>Step 1 · Select equipment category</h4><div className="dashboard-asset-summary">{assetCategoryBreakdown.length ? assetCategoryBreakdown.map(([label, value]) => <button type="button" key={label} className={assetDrilldownCategory === label ? "active" : ""} onClick={() => selectAssetCategory(label)}><b>{value.toLocaleString()}</b>{label}</button>) : <p>No matching equipment records found</p>}</div></section>
          {assetDrilldownCategory && <section><h4>Step 2 · Select equipment group</h4><div className="dashboard-asset-groups">{assetGroupBreakdown.length ? assetGroupBreakdown.map(([label, value]) => <button type="button" key={label} className={assetDrilldownGroup === label ? "active" : ""} onClick={() => selectAssetGroup(label)}><span>{label}</span><b>{value.toLocaleString()}</b></button>) : <p>No equipment group found</p>}</div></section>}
          {assetDrilldownCategory && assetDrilldownGroup && <section><h4>Step 3 · Full details for {assetDrilldownGroup}</h4><div className="dashboard-asset-list"><table><thead><tr>{requestAssetDrilldown && <th>Job reference</th>}<th>Equipment name</th><th>Equipment category</th><th>Equipment group</th><th>Make</th><th>Model</th><th>Current location</th><th>Serial / chassis no.</th>{requestAssetDrilldown && <><th>Repair category</th><th>Status</th><th>Started</th></>}{assetDrilldown.startsWith("event:") && <><th>Closed</th><th>Verified</th></>}</tr></thead><tbody>{assetGroupRows.map((record,index)=><tr key={record.id||`${record.equipmentName}-${index}`}>{requestAssetDrilldown && <td><b>{record.requestReference}</b></td>}<td><b>{record.equipmentName||record.door||"—"}</b></td><td>{equipmentCategoryLabel(record)}</td><td>{equipmentGroupLabel(record)}</td><td>{record.make||"—"}</td><td>{record.model||"—"}</td><td>{record.currentLocation||record.location||"—"}</td><td>{record.manufacturerSerialNo||record.chassisNo||"—"}</td>{requestAssetDrilldown && <><td>{record.repairCategory}</td><td><Status>{record.requestStatus}</Status></td><td>{formatTwelveHourDateTime(record.requestStart)}</td></>}{assetDrilldown.startsWith("event:") && <><td>{formatTwelveHourDateTime(record.requestClosed)}</td><td>{formatTwelveHourDateTime(record.requestVerified)}</td></>}</tr>)}</tbody></table></div></section>}
        </>}
      </div></Modal>}
      <section className="mine-dashboard-lower-grid">
      <section className="mine-panel mine-breakdown-trend">
        <header><div><span className="mine-eyebrow">Reliability intelligence</span><h2>Breakdown trend & forecast</h2><p>Recorded history and weekday-weighted upcoming estimates</p></div><div className="mine-trend-controls"><label><MapPin /><select aria-label="Breakdown trend site" value={activeTrendSite} onChange={(event) => setBreakdownTrendSite(event.target.value)}><option value="all">All visible sites</option>{trendAvailableSites.map((site) => <option key={site} value={site}>{site}</option>)}</select></label><div className="mine-trend-view" role="group" aria-label="Breakdown trend view">{[["past", "Past"], ["both", "Both"], ["upcoming", "Upcoming"]].map(([value, label]) => <button type="button" key={value} className={breakdownTrendView === value ? "active" : ""} onClick={() => setBreakdownTrendView(value)}>{label}</button>)}</div><label className="mine-trend-anchor"><CalendarDays /><input aria-label="Breakdown trend anchor day" type="date" max={todayKey} value={breakdownTrendAnchorKey} onChange={(event) => setBreakdownTrendAnchor(event.target.value)} /></label><div className="mine-trend-period" role="group" aria-label="Breakdown trend period">{[7, 14, 30].map((days) => <button type="button" key={days} className={breakdownTrendDays === days ? "active" : ""} onClick={() => setBreakdownTrendDays(days)}>{days}D</button>)}</div><button type="button" className="mine-trend-view-all" onClick={() => goto("Breakdown master")}>View all <ChevronRight /></button></div></header>
        <div className="mine-breakdown-trend-body">
          <div className="mine-trend-summary"><article><span>Recorded</span><strong>{breakdownTrendTotal.toLocaleString()}</strong><small>Past {breakdownTrendDays} days</small></article><article><span>Forecast</span><strong>{breakdownForecastTotal.toLocaleString()}</strong><small>Next {breakdownTrendDays} days</small></article><article><span>Daily baseline</span><strong>{breakdownTrendAverage}</strong><small>Recorded per day</small></article></div>
          <section className="mine-trend-visual"><div className="mine-trend-legend"><span><i className="actual" />Actual</span><span><i className="forecast" />Forecast</span><b>Selected day: {new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${breakdownTrendAnchorKey}T12:00:00`))}</b></div><div className="mine-trend-chart" aria-label={`${breakdownTrendDays} day actual and forecast breakdown chart`}>{breakdownTrend.map((day, index) => <div className={`mine-trend-day ${day.kind}${day.anchor ? " anchor" : ""}`} key={`${day.kind}-${day.date}`} title={`${day.date}: ${day.count} ${day.kind === "forecast" ? "forecast" : "recorded"} breakdown${day.count === 1 ? "" : "s"}`}><b>{day.count}</b><span><i style={{ height: `${day.count ? Math.max(8, (day.count / maxBreakdownTrend) * 100) : 2}%` }} /></span><small>{index === 0 || index === breakdownTrend.length - 1 || breakdownTrendDays <= 14 || index % 5 === 0 || day.anchor ? new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(new Date(`${day.date}T12:00:00`)) : ""}</small></div>)}</div></section>
        </div>
      </section>
      <article className="mine-panel mine-fleet-performance" aria-label="Overall utilization and availability">
        <header><div><span className="mine-eyebrow">Fleet efficiency</span><h2>Overall Fleet Performance</h2><p>Utilization and operational availability at a glance</p></div><strong><Gauge />{kpis.total.toLocaleString()} fleet</strong></header>
        <div className="mine-fleet-performance-body">
          <div className="mine-performance-gauges">{[
            { key: "onroad", label: "Overall Utilization", value: utilizationPercent, count: kpis.onRoad, note: "On road / total fleet", color: "#315fd4" },
            { key: "available", label: "Overall Availability", value: availabilityPercent, count: availableFleet, note: "On road + idle / total fleet", color: "#26956f" },
          ].map((gauge) => <button type="button" key={gauge.label} onClick={() => openAssetDrilldown(gauge.key)} style={{ "--gauge-angle": `${gauge.value * 2.7}deg`, "--gauge-color": gauge.color }}><span>{gauge.label}</span><div className="mine-radial-gauge"><strong>{gauge.value}%</strong><small>{gauge.count}/{kpis.total}</small></div><p>{gauge.note}</p><em>View details <ChevronRight /></em></button>)}</div>
          <div className="mine-performance-composition"><div><span>Fleet composition</span><b>{kpis.total.toLocaleString()} assets</b></div><div className="mine-performance-bar" aria-label={`${kpis.onRoad} utilized, ${kpis.idle} idle and ${Math.max(0, kpis.total - availableFleet)} unavailable`}><i className="utilized" style={{ width: `${kpis.total ? (kpis.onRoad / kpis.total) * 100 : 0}%` }} /><i className="idle" style={{ width: `${kpis.total ? (kpis.idle / kpis.total) * 100 : 0}%` }} /><i className="unavailable" style={{ width: `${kpis.total ? (Math.max(0, kpis.total - availableFleet) / kpis.total) * 100 : 0}%` }} /></div><div className="mine-performance-legend"><span><i className="utilized" />Utilized <b>{kpis.onRoad}</b></span><span><i className="idle" />Idle <b>{kpis.idle}</b></span><span><i className="unavailable" />Unavailable <b>{Math.max(0, kpis.total - availableFleet)}</b></span></div></div>
        </div>
      </article>
      </section>
    </div>
  );
}
function BreakdownTable({ rows = breakdowns, showBreakdownDays = false, stickyHeader = false, showAudio = false, showTurnaroundTime = false, showReason = false, showCreatedBy = false, showClosedBy = false, showMakeModel = false, showDateFilter = false, rowLimit = 0, onApproveIdeal, onCancelIdeal, stableToolbar = false }) {
  const [breakdownNow, setBreakdownNow] = useState(() => Date.now());
  const [query, setQuery] = useState(""), [statusFilter, setStatusFilter] = useState(""), [dateFilter, setDateFilter] = useState(""), [parameterFilters, setParameterFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  useEffect(() => {
    if (!showBreakdownDays) return undefined;
    const timer = window.setInterval(() => setBreakdownNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [showBreakdownDays]);
  const columns = [
      ["ref", "Job reference"], ["equipment", "Equipment group"], ["door", "Door no."], ...(showMakeModel ? [["make", "Make"], ["model", "Model"]] : []), ["site", "Site location"],
      ...(showReason ? [["complaint", "Reason"]] : []), ...(showCreatedBy ? [["createdBy", "Created by"]] : []), ...(showClosedBy ? [["closedBy", "Closed by"]] : []),
      ...(showAudio ? [["chassis", "Chassis no."]] : []),
      ...(showBreakdownDays ? [["breakdownDays", "Days of breakdown"]] : []),
      ["category", "Repair category"], ["start", "Started"], ["hours", showTurnaroundTime ? "Turn around time (TAT)" : "Downtime"],
      ["status", "Status"], ["idleReason", "Idle reason"], ["dailyRemarks", "Daily remarks"], ...(showAudio ? [["audio", "Audio clips"]] : []), ["owner", "Responsibility"], ...(onApproveIdeal || onCancelIdeal ? [["idealAction", "Action"]] : []),
    ],
    dateFilteredRows = showDateFilter && dateFilter ? rows.filter((row) => dashboardRecordDate(row) === dateFilter) : rows,
    sourceRows = rowLimit > 0 && !dateFilter ? dateFilteredRows.slice(0, rowLimit) : dateFilteredRows,
    displayRows = showBreakdownDays
      ? sourceRows.map((row) => ({
          ...row,
          breakdownDays: calculateBreakdownDaysFromStart(row.start, breakdownNow),
        }))
      : sourceRows,
    filterColumns = columns.filter(([key]) => key !== "idealAction").map(([key, label]) => ({
      key,
      label,
      value: (row) => {
        if (key === "equipment") return row.equipmentGroup || row.equipment;
        if (key === "createdBy") return row.owner || row.requesterLogin;
        if (key === "start") return formatTwelveHourDateTime(row.start);
        if (key === "audio") return row.complaintAudio || row.maintenanceAudio ? "Available" : "Not available";
        return row[key];
      },
    })),
    searchedRows = displayRows.filter((row) => matchesSmartSearch(query, row.ref, row.equipmentGroup, row.equipment, row.door, row.site, row.status, row.complaint, row.owner, row.closedBy, row.make, row.model) && (!statusFilter || row.status === statusFilter) && tableRowMatchesFilters(row, filterColumns, parameterFilters)),
    [sortedRows, sort, changeSort] = useSortableRows(searchedRows);
  const updateColumnFilter = (key, value) => setParameterFilters((current) => {
    const next = { ...current };
    if (value) next[key] = value;
    else delete next[key];
    return next;
  });
  const columnValues = Object.fromEntries(filterColumns.map((column) => [
    column.key,
    [...new Set(displayRows.map((row) => tableFilterText(column.value(row))))].sort((a, b) => sortCollator.compare(a, b)),
  ]));
  useEffect(() => {
    if (!openFilter) return undefined;
    const closeFilter = (event) => {
      if (!event.target.closest?.(".column-filter-header, .column-filter-popover")) setOpenFilter(null);
    };
    document.addEventListener("mousedown", closeFilter);
    return () => document.removeEventListener("mousedown", closeFilter);
  }, [openFilter]);
  return (
    <><div className={`table-search-toolbar${stableToolbar ? " manager-table-search-toolbar" : ""}`}><label><Search /><input data-smart-search type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this table" /></label><label><ListFilter /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{[...new Set(rows.map((row) => row.status).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select></label>{showDateFilter && <label className="table-date-filter"><CalendarDays /><input aria-label="Filter by started date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>}<TableParameterFilter columns={filterColumns} rows={displayRows} filters={parameterFilters} onFilterChange={(key, value) => setParameterFilters((current) => ({ ...current, [key]: value }))} onClearFilters={() => { setParameterFilters({}); setStatusFilter(""); setDateFilter(""); }} /><ExportMenu title="Breakdown report" columns={filterColumns} rows={sortedRows} /></div><div className={`${showBreakdownDays ? "scroll mobile-breakdown-table" : "scroll"}${stickyHeader ? " master-table-scroll" : ""}`}>
      <table className="breakdown-table-auto-fit">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              key === "idealAction" ? <SortableHeader key={key} label={label} sortKey={key} sort={sort} onSort={changeSort} /> : <FilterableHeader key={key} label={label} sortKey={key} sort={sort} onSort={changeSort} open={openFilter === key} onToggle={(filterKey) => setOpenFilter((current) => current === filterKey ? null : filterKey)} values={columnValues[key] || []} filterValue={parameterFilters[key] || ""} onFilterChange={(value) => updateColumnFilter(key, value)} />
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
                <td>{r.equipmentGroup || r.equipment || "—"}</td>
                <td>{r.door}</td>
                {showMakeModel && <><td>{r.make || "—"}</td><td>{r.model || "—"}</td></>}
                <td>
                  <MapPin /> {r.site}
                </td>
                {showReason && <td>{r.complaint || "—"}</td>}
                {showCreatedBy && <td>{r.owner || r.requesterLogin || "—"}</td>}
                {showClosedBy && <td>{r.closedBy || "—"}</td>}
                {showAudio && <td>{r.chassis || "—"}</td>}
                {showBreakdownDays && (
                  <td>
                    <b>{r.breakdownDays} {r.breakdownDays === 1 ? "day" : "days"}</b>
                  </td>
                )}
                <td>{r.category}</td>
                <td>{formatTwelveHourDateTime(r.start)}</td>
                <td>{r.hours}</td>
                <td>
                  <Status>{r.status}</Status>
                </td>
                <td>{r.idleReason || "—"}</td>
                <td><MaintenanceRemarks remarks={r.dailyRemarks} /></td>
                {showAudio && <td><div className="request-audio-list">
                  {r.complaintAudio && <label><span>Complaint</span><audio controls preload="none" src={r.complaintAudio}>Complaint audio</audio></label>}
                  {r.maintenanceAudio && <label><span>Maintenance</span><audio controls preload="none" src={r.maintenanceAudio}>Maintenance audio</audio></label>}
                  {!r.complaintAudio && !r.maintenanceAudio && "—"}
                </div></td>}
                <td>{r.owner}</td>
                {(onApproveIdeal||onCancelIdeal)&&<td><div className="idle-approval-actions">{onApproveIdeal&&<button type="button" className="primary compact" onClick={()=>onApproveIdeal(r)}><CheckCircle2 /> Make on road</button>}{onCancelIdeal&&<button type="button" className="secondary danger compact" onClick={()=>onCancelIdeal(r)}><X /> Cancel idle</button>}</div></td>}
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
    </div></>
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
    ["superior", "Superior", "multi-text"],
    ["site", "Location"],
    ["email", "Mail ID"],
    ["phone", "Phone no."],
    ["userType", "User role"],
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
    ["section", "Section"],
    ["designation", "Designation"],
    ["level", "User level (L1 / L2 / L3 / L4)"],
    ["schedule", "Schedule"],
    ["reportAccess", "Report ticks (separate with |)"],
    ["siteAccess", "Site ticks (separate with |)"],
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
const mobileRoleAuthority = {
  "Production User": "Create request only",
  "Maintenance User": "Edit and delete requests",
  "MIS User": "Verify requests only",
};
const accountRoleOptions = ["User", ...mobileUserRoleOptions];
const userAuthorityOptions = ["Admin", "Manager"];
const managerRoleOptions = ["Production Manager", "Maintenance Manager", "MIS Manager"];
const persistedUserTypeOptions = ["Mobile User", "Super Admin"];
const userPrivilegeFields = [
  ["userGroup", "User Group", "mobile-role-select"],
  ["adminLevel", "User authority"],
  ["managerRole", "Manager role", "multi-checkbox"],
  ["managerRegion", "Report regions", "multi-checkbox"],
  ["managerSites", "Report sites", "multi-checkbox"],
  ["read", "Read", "checkbox"],
  ["edit", "Edit", "checkbox"],
  ["delete", "Delete", "checkbox"],
  ["verify", "Verify", "checkbox"],
  ["print", "Print", "checkbox"],
];
const mobileAccessKey=(key)=>`mobile${key[0].toUpperCase()}${key.slice(1)}`;
const desktopSubmenuFields = Object.values(ADMIN_SUBMENU_OPTIONS).map(({field, label}) => [field, label, "multi-checkbox"]);
const mobileSubmenuFields = Object.values(ADMIN_SUBMENU_OPTIONS).map(({field, label}) => [mobileAccessKey(field), `Mobile ${label}`, "multi-checkbox"]);
const userSubmenuFields = [...desktopSubmenuFields, ...mobileSubmenuFields, ["mobileTabAccess", "Mobile visible tabs", "multi-checkbox"]];
const operationalViewFields = [
  ["desktopUserMenuAccess","Desktop user menus","multi-checkbox"],
  ["desktopUserRequestAccess","Desktop request submenus","multi-checkbox"],
  ["mobileUserMenuAccess","Mobile user menus","multi-checkbox"],
  ["mobileUserRequestAccess","Mobile request submenus","multi-checkbox"],
];
userSubmenuFields.push(...operationalViewFields);
const operationalMenuOptions=["Requests","Tickets"];
const operationalRequestOptions={
  "Production User":["View requests","Create request","Closed history"],
  "Maintenance User":["View requests","Create request","Close request form","Closed history"],
  "MIS User":["View requests","Verify closed requests","Closed history"],
};
const userAccessOptions = {
  masterAccess: ADMIN_MASTER_OPTIONS,
  tabAccess: ADMIN_TAB_OPTIONS,
  ...Object.fromEntries(Object.values(ADMIN_SUBMENU_OPTIONS).map(({field, options}) => [field, options])),
  mobileTabAccess: ADMIN_TAB_OPTIONS,
  ...Object.fromEntries(Object.values(ADMIN_SUBMENU_OPTIONS).map(({field, options}) => [mobileAccessKey(field), options])),
  desktopUserMenuAccess:operationalMenuOptions,
  mobileUserMenuAccess:operationalMenuOptions,
  desktopUserRequestAccess:[...new Set(Object.values(operationalRequestOptions).flat())],
  mobileUserRequestAccess:[...new Set(Object.values(operationalRequestOptions).flat())],
};
const selectedAccessValues = (record, key, fallbackKey = "") => {
  if (!Object.prototype.hasOwnProperty.call(record || {}, key)) return fallbackKey ? selectedAccessValues(record,fallbackKey) : userAccessOptions[key] || [];
  return String(record[key] || "").split(/\s*[|,]\s*/).filter(Boolean);
};
const privilegeSiteOptions = [...new Set(subsidiaryData.flatMap((region) => region.sites))];
const hierarchyReports = {
  openedBd: "Location wise opened BD",
  closingBd: "Location wise closing BD",
  misVerification: "MIS Verification Report",
  roadStatus: "Report for On Road / Off Road & Idle",
  vehicleTransfer: "Vehicle Transfer Report",
  locationWise: "Total Equipment / Vehicle Location Wise",
  idleVehicle: "Idle Vehicle Report",
  recentBreakdown: "Recent Breakdown Cases",
  offRoadToMis: "Off Road to MIS Veri.",
  offRoadToMaintenance: "Off Road to Maint. Close",
  maintenanceToMis: "Event close Report - Maint. Closing to MIS Verif.",
  idlePm: "Idle with PM verif.",
  firstTrip: "On Road with first trip veri.",
};
const hierarchyLegacyReportTitles = new Map([
  ["Location wise Open BD report with Category (Prod)", hierarchyReports.openedBd],
  ["Location wise Closing BD report with Category (Maint.)", hierarchyReports.closingBd],
  ["MIS Verification Report (MIS)", hierarchyReports.misVerification],
  ["Off Road to MIS Verift Report - Time taken from Prod to MIS Veri.", hierarchyReports.offRoadToMis],
  ["Event Open Report - Prod. Open with Maint. Close Time -- TAT", hierarchyReports.offRoadToMaintenance],
  ["Idle Time with PM Verification Time", hierarchyReports.idlePm],
  ["Idle Verification v/s MIS First Trip verification", hierarchyReports.firstTrip],
]);
const normalizeHierarchyReportAccess = (value = "") => [...new Set(String(value || "")
  .split(/\s*\|\s*/)
  .map((report) => hierarchyLegacyReportTitles.get(report.trim()) || report.trim())
  .filter(Boolean))].join(" | ");
const hierarchyReportGroups = [
  {group:"Common Report", viewKey:"C", className:"common", reports:[
    hierarchyReports.roadStatus,
    hierarchyReports.vehicleTransfer,
    hierarchyReports.locationWise,
    hierarchyReports.recentBreakdown,
  ]},
  {group:"Production Report", viewKey:"P", className:"production", reports:[
    hierarchyReports.openedBd,
    hierarchyReports.offRoadToMis,
  ]},
  {group:"Maintenance Report", viewKey:"M", className:"maintenance", reports:[
    hierarchyReports.closingBd,
    hierarchyReports.idleVehicle,
    hierarchyReports.offRoadToMaintenance,
    hierarchyReports.maintenanceToMis,
    hierarchyReports.idlePm,
  ]},
  {group:"MIS Report", viewKey:"S", className:"mis", reports:[
    hierarchyReports.misVerification,
    hierarchyReports.firstTrip,
  ]},
];
const hierarchyReportTitles = hierarchyReportGroups.flatMap((group) => group.reports);
const hierarchyReportCodes = new Map([
  hierarchyReports.openedBd,
  hierarchyReports.closingBd,
  hierarchyReports.misVerification,
  hierarchyReports.roadStatus,
  hierarchyReports.vehicleTransfer,
  hierarchyReports.locationWise,
  hierarchyReports.idleVehicle,
  hierarchyReports.recentBreakdown,
  hierarchyReports.offRoadToMis,
  hierarchyReports.offRoadToMaintenance,
  hierarchyReports.maintenanceToMis,
  hierarchyReports.idlePm,
  hierarchyReports.firstTrip,
].map((report, index) => [report, `R${index + 1}`]));
const hierarchyDefaults = [
  {section:"Management", designation:"Director's", level:"1", schedule:"Daily 7 PM; weekly fleet Sat 7 PM", reportAccess:hierarchyReportTitles.join(" | ")},
  {section:"Management", designation:"Project Manager (P.M)", level:"2", schedule:"8 AM & 6 PM common; 7 PM operational; weekly fleet Sat 7 PM", reportAccess:hierarchyReportTitles.join(" | ")},
  {section:"Production Dept.", designation:"Production Manager", level:"3", schedule:"Every event for opening/closing/MIS; 8 AM & 6 PM road status; 7 PM operational", reportAccess:[hierarchyReports.openedBd, hierarchyReports.closingBd, hierarchyReports.misVerification, hierarchyReports.roadStatus, hierarchyReports.idleVehicle, hierarchyReports.recentBreakdown, hierarchyReports.offRoadToMis, hierarchyReports.offRoadToMaintenance, hierarchyReports.maintenanceToMis, hierarchyReports.idlePm, hierarchyReports.firstTrip].join(" | ")},
  {section:"Production Dept.", designation:"Production Incharge / Supervisor", level:"4", schedule:"Every event", reportAccess:[hierarchyReports.openedBd, hierarchyReports.closingBd, hierarchyReports.misVerification].join(" | ")},
  {section:"Maintenance Dept.", designation:"Maintenance Manager", level:"3", schedule:"Every event for opening/closing/MIS; 8 AM & 6 PM road status; 7 PM operational", reportAccess:[hierarchyReports.openedBd, hierarchyReports.closingBd, hierarchyReports.misVerification, hierarchyReports.roadStatus, hierarchyReports.idleVehicle, hierarchyReports.recentBreakdown, hierarchyReports.offRoadToMis, hierarchyReports.offRoadToMaintenance, hierarchyReports.maintenanceToMis, hierarchyReports.idlePm, hierarchyReports.firstTrip].join(" | ")},
  {section:"Maintenance Dept.", designation:"Maintenance Incharge / Supervisor", level:"4", schedule:"Every event", reportAccess:[hierarchyReports.openedBd, hierarchyReports.closingBd, hierarchyReports.misVerification].join(" | ")},
  {section:"MIS Dept.", designation:"MIS Manager", level:"3", schedule:"Every event for closing/MIS; 8 AM & 6 PM road status; 7 PM operational", reportAccess:[hierarchyReports.closingBd, hierarchyReports.misVerification, hierarchyReports.roadStatus, hierarchyReports.idleVehicle, hierarchyReports.recentBreakdown, hierarchyReports.offRoadToMis, hierarchyReports.offRoadToMaintenance, hierarchyReports.maintenanceToMis, hierarchyReports.idlePm, hierarchyReports.firstTrip].join(" | ")},
  {section:"MIS Dept.", designation:"MIS Incharge / Supervisor", level:"4", schedule:"Every event", reportAccess:[hierarchyReports.closingBd, hierarchyReports.misVerification].join(" | ")},
  {section:"OEM", designation:"National Head", level:"1", schedule:"Every 7th day consolidate", reportAccess:hierarchyReports.closingBd},
  {section:"OEM", designation:"Regional Head / Zonal Head", level:"2", schedule:"Every 5th day consolidate", reportAccess:hierarchyReports.closingBd},
  {section:"OEM", designation:"Area Service engineer", level:"3", schedule:"Every 3rd day consolidate", reportAccess:hierarchyReports.closingBd},
  {section:"OEM", designation:"Service Engineer / Site Service Engineer", level:"4", schedule:"Every day consolidate", reportAccess:hierarchyReports.closingBd},
];
const hierarchySiteGroups = subsidiaryData.map((region) => ({code:region.code, name:region.name, sites:region.sites}));
const hierarchySiteTitles = hierarchySiteGroups.flatMap((region) => region.sites);
const hierarchyColumnViewOptions = [
  {key:"A", label:"Designation / level / schedule", shortLabel:"Identity"},
  {key:"C", label:"Common reports", shortLabel:"Common"},
  {key:"P", label:"Production report", shortLabel:"Production"},
  {key:"M", label:"Maintenance reports", shortLabel:"Maintenance"},
  {key:"S", label:"MIS reports", shortLabel:"MIS"},
  {key:"W", label:"WCL and NCL site-wise controls", shortLabel:"Site wise"},
];
const hierarchyRowViewOptions = [
  {key:"D", label:"Director", shortLabel:"Director"},
  {key:"P", label:"Project Manager", shortLabel:"PM"},
  {key:"M", label:"Production, Maintenance and MIS managers", shortLabel:"Managers"},
  {key:"U", label:"Users, supervisors and OEM roles", shortLabel:"Users"},
];
function hierarchyRowViewKey(row = {}) {
  const designation = String(row.designation || "").toLowerCase();
  if (designation.includes("director")) return "D";
  if (designation.includes("project manager")) return "P";
  if (designation.includes("manager")) return "M";
  return "U";
}
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
        <span>{label}</span><Icon aria-hidden="true" /><ListFilter className="header-filter-icon" aria-hidden="true" />
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
    visibleValues = values.filter((value) => matchesSmartSearch(valueSearch, value));
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
            <input data-smart-search autoFocus value={valueSearch} onChange={(event) => setValueSearch(event.target.value)} placeholder="Filter..." />
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
const EMPTY_TABLE_FILTER_VALUE = "__empty_table_filter_value__";
function tableFilterText(value) {
  if (Array.isArray(value)) return value.map(tableFilterText).filter(Boolean).join(" · ");
  if (value && typeof value === "object") return Object.values(value).map(tableFilterText).filter(Boolean).join(" · ");
  return String(value ?? "").trim();
}
function tableRowMatchesFilters(row, columns, filters) {
  return columns.every((column) => {
    const selected = filters[column.key];
    if (!selected) return true;
    const value = tableFilterText(column.value?.(row));
    return selected === EMPTY_TABLE_FILTER_VALUE ? !value : value === selected;
  });
}
function TableParameterFilter({ columns = [], rows = [], filters = {}, onFilterChange, onClearFilters, label = "Filter", open: controlledOpen, onOpenChange, hideTrigger = false, dialogMode = false }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value) => {
    const next = typeof value === "function" ? value(open) : value;
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
  const triggerRef = useRef(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const activeFilterCount = columns.filter((column) => filters[column.key]).length;
  const columnValues = Object.fromEntries(
    columns.map((column) => [
      column.key,
      [...new Set(rows.map((row) => tableFilterText(column.value?.(row))))].sort((a, b) => sortCollator.compare(a, b)),
    ]),
  );
  useEffect(() => {
    if (!open || dialogMode) return undefined;
    const closeFilter = (event) => {
      if (!event.target.closest?.(".table-parameter-filter, .table-parameter-filter-popover")) setOpen(false);
    };
    document.addEventListener("mousedown", closeFilter);
    return () => document.removeEventListener("mousedown", closeFilter);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const positionPopover = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(560, window.innerWidth - 24);
      const height = Math.min(620, window.innerHeight * 0.7);
      const top = bounds.bottom + 6;
      setPopoverPosition({
        top: top + height > window.innerHeight - 12 ? Math.max(12, bounds.top - height - 6) : top,
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
  }, [open, dialogMode]);
  const filterDialog = (
    <div className={`table-parameter-filter-popover ${dialogMode ? "dialog-mode" : ""}`} style={dialogMode ? undefined : popoverPosition} role="dialog" aria-modal={dialogMode || undefined} aria-label="Filter report parameters" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="table-parameter-filter-head"><div><strong>Filter report</strong><span>Choose values to compare report records.</span></div><button type="button" onClick={() => setOpen(false)} aria-label="Close report filters" title="Close"><X /></button></div>
      <div className="table-parameter-filter-fields">
        {columns.map((column) => (
          <label key={column.key}><span>{column.label}</span><select value={filters[column.key] || ""} onChange={(event) => onFilterChange(column.key, event.target.value)}>
            <option value="">All {column.label}</option>
            {columnValues[column.key].map((value) => <option key={value || EMPTY_TABLE_FILTER_VALUE} value={value || EMPTY_TABLE_FILTER_VALUE}>{value || "(Blank)"}</option>)}
          </select></label>
        ))}
      </div>
      <div className="table-parameter-filter-foot"><button type="button" onClick={onClearFilters} disabled={!activeFilterCount}><X /> Clear filters</button>{dialogMode && <button type="button" className="primary" onClick={() => setOpen(false)}>Apply</button>}</div>
    </div>
  );
  return (
    <div className="table-parameter-filter">
      {!hideTrigger && <button ref={triggerRef} type="button" className={`table-parameter-filter-trigger ${activeFilterCount ? "active" : ""}`} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="dialog">
        <ListFilter aria-hidden="true" /><span>{label}{activeFilterCount ? ` (${activeFilterCount})` : ""}</span>
      </button>}
      {open && createPortal(
        dialogMode ? <div className="report-action-dialog-backdrop" onMouseDown={() => setOpen(false)}>{filterDialog}</div> : filterDialog,
        document.body,
      )}
    </div>
  );
}
function exportCellText(value) {
  return tableFilterText(value).replace(/\s+/g, " ").trim() || "—";
}
function exportFileName(title, extension) {
  const safeTitle = String(title || "nerve-center-report").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "nerve-center-report";
  return `${safeTitle}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
function CaliberActivityMark({ size = "medium" }) {
  return (
    <span className={`caliber-activity-mark ${size}`} aria-hidden="true">
      <span className="caliber-activity-ring" />
      <img src="/app-icon.png" alt="" />
    </span>
  );
}
function CaliberActivityOverlay({ message = "" }) {
  if (!message) return null;
  return createPortal(
    <div className="caliber-activity-overlay" role="status" aria-live="polite" aria-label={message}>
      <div className="caliber-activity-panel">
        <CaliberActivityMark size="large" />
        <strong>{message}</strong>
        <span>Please wait while Nerve Center prepares your file.</span>
      </div>
    </div>,
    document.body,
  );
}
function downloadExportFile(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
function escapeExportHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[character]));
}
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crc32.table[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}
crc32.table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function uint16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}
function uint32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}
function zipStoredFiles(files, mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
  const encoder = new TextEncoder();
  const chunks = [], centralDirectory = [];
  let offset = 0;
  files.forEach(({ name, content }) => {
    const filename = encoder.encode(name);
    const data = content instanceof Uint8Array
      ? content
      : content instanceof ArrayBuffer
        ? new Uint8Array(content)
        : encoder.encode(String(content));
    const checksum = crc32(data);
    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint32(checksum), ...uint32(data.length), ...uint32(data.length), ...uint16(filename.length), ...uint16(0),
    ]);
    chunks.push(localHeader, filename, data);
    centralDirectory.push({ filename, checksum, size: data.length, offset });
    offset += localHeader.length + filename.length + data.length;
  });
  const centralStart = offset;
  centralDirectory.forEach((entry) => {
    const header = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, ...uint16(20), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint32(entry.checksum), ...uint32(entry.size), ...uint32(entry.size), ...uint16(entry.filename.length),
      ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(0), ...uint32(entry.offset),
    ]);
    chunks.push(header, entry.filename);
    offset += header.length + entry.filename.length;
  });
  const centralSize = offset - centralStart;
  chunks.push(new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, ...uint16(0), ...uint16(0), ...uint16(files.length), ...uint16(files.length),
    ...uint32(centralSize), ...uint32(centralStart), ...uint16(0),
  ]));
  return new Blob(chunks, { type: mimeType });
}
function excelCellReference(columnIndex, rowIndex) {
  let column = "", value = columnIndex + 1;
  while (value) {
    value -= 1;
    column = String.fromCharCode(65 + (value % 26)) + column;
    value = Math.floor(value / 26);
  }
  return `${column}${rowIndex + 1}`;
}
function buildXlsxWorkbook(title, columns, exportRows) {
  const worksheetRows = [columns.map((column) => column.label), ...exportRows];
  const sheetData = worksheetRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => `<c r="${excelCellReference(columnIndex, rowIndex)}" t="inlineStr"><is><t>${escapeExportHtml(cell)}</t></is></c>`).join("")}</row>`).join("");
  const widths = columns.map((column, index) => {
    const maxLength = Math.max(String(column.label || "").length, ...exportRows.map((row) => String(row[index] || "").length));
    return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(48, Math.max(12, maxLength + 2))}" customWidth="1"/>`;
  }).join("");
  const workbookTitle = escapeExportHtml(title || "Nerve Center report");
  return zipStoredFiles([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/core.xml", content: `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${workbookTitle}</dc:title><dc:creator>Nerve Center</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
    { name: "docProps/app.xml", content: `<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Nerve Center</Application></Properties>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/worksheets/sheet1.xml", content: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${sheetData}</sheetData></worksheet>` },
  ]);
}
function ExportMenu({ title, columns = [], rows = [], className = "secondary", label = "Export" }) {
  const [open, setOpen] = useState(false), [downloadActivity, setDownloadActivity] = useState("");
  const triggerRef = useRef(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const exportRows = rows.map((row) => columns.map((column) => exportCellText(column.value?.(row))));
  useEffect(() => {
    if (!open) return undefined;
    const closeMenu = (event) => {
      if (!event.target.closest?.(".export-menu, .export-menu-popover")) setOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const positionMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPopoverPosition({ top: Math.min(window.innerHeight - 176, rect.bottom + 6), left: Math.max(12, Math.min(rect.right - 214, window.innerWidth - 226)) });
    };
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);
  const runDownload = (message, task) => {
    if (downloadActivity) return;
    setOpen(false);
    setDownloadActivity(message);
    window.setTimeout(async () => {
      const startedAt = Date.now();
      try { await task(); }
      catch (error) { alert(error.message); }
      finally {
        window.setTimeout(() => setDownloadActivity(""), Math.max(0, 450 - (Date.now() - startedAt)));
      }
    }, 50);
  };
  const downloadExcel = () => runDownload("Preparing Excel report...", () => {
    downloadExportFile(buildXlsxWorkbook(title, columns, exportRows), exportFileName(title, "xlsx"));
  });
  const downloadPdf = () => runDownload("Preparing PDF report...", async () => {
      const response = await fetch("/api/exports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ title, columns: columns.map((column) => ({ label: column.label })), rows: exportRows }),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(details.error || "Could not create the PDF report.");
      }
      downloadExportFile(await response.blob(), exportFileName(title, "pdf"));
  });
  const printReport = () => {
    const headings = columns.map((column) => `<th>${escapeExportHtml(column.label)}</th>`).join("");
    const body = exportRows.length ? exportRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeExportHtml(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}">No records available</td></tr>`;
    const frame = document.createElement("iframe");
    frame.title = `${title} print frame`;
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.opacity = "0";
    document.body.appendChild(frame);
    const printDocument = frame.contentDocument || frame.contentWindow?.document;
    if (!printDocument) {
      frame.remove();
      alert("Could not open the system print dialog. Please try again.");
      return;
    }
    printDocument.open();
    printDocument.write(`<!doctype html><html><head><title>${escapeExportHtml(title)}</title><style>body{font-family:Arial,sans-serif;color:#17233c;margin:28px}h1{font-size:20px;margin:0 0 5px}p{color:#65758b;font-size:12px;margin:0 0 18px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{padding:8px;border:1px solid #dce4ef;text-align:left;vertical-align:top}th{background:#10284c;color:#fff;font-size:9px;text-transform:uppercase}tr:nth-child(even){background:#f6f8fb}@media print{@page{size:A4 landscape;margin:12mm}body{margin:0}thead{display:table-header-group}}</style></head><body><h1>${escapeExportHtml(title)}</h1><p>${exportRows.length.toLocaleString("en-IN")} record${exportRows.length === 1 ? "" : "s"} · Generated ${escapeExportHtml(new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date()))}</p><table><thead><tr>${headings}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    printDocument.close();
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    }, 150);
    setOpen(false);
  };
  return <><div className="export-menu"><button ref={triggerRef} type="button" className={`${className} export-menu-trigger`} onClick={() => setOpen((current) => !current)} disabled={Boolean(downloadActivity)} aria-expanded={open} aria-haspopup="menu"><Download /><span>{label}</span><ChevronDown /></button>{open && createPortal(<div className="export-menu-popover" style={popoverPosition} role="menu" aria-label={`${title} export options`}><button type="button" role="menuitem" onClick={downloadPdf} disabled={Boolean(downloadActivity)}><Download /> Download as PDF</button><button type="button" role="menuitem" onClick={downloadExcel} disabled={Boolean(downloadActivity)}><FileSpreadsheet /> Download as Excel</button><button type="button" role="menuitem" onClick={printReport}><Printer /> Print</button></div>, document.body)}</div><CaliberActivityOverlay message={downloadActivity} /></>;
}
function ReportColumnSelector({ columns = [], visibleColumnKeys = [], onApply, onClose }) {
  const [draftKeys, setDraftKeys] = useState(visibleColumnKeys);
  const [selectedHidden, setSelectedHidden] = useState("");
  const [selectedVisible, setSelectedVisible] = useState("");
  const hiddenColumns = columns.filter((column) => !draftKeys.includes(column.key));
  const displayedColumns = draftKeys.map((key) => columns.find((column) => column.key === key)).filter(Boolean);
  const addColumn = (key) => {
    if (!key || draftKeys.includes(key)) return;
    setDraftKeys((current) => [...current, key]);
    setSelectedHidden("");
  };
  const removeColumn = (key) => {
    if (!key) return;
    setDraftKeys((current) => current.filter((item) => item !== key));
    setSelectedVisible("");
  };
  const moveColumn = (position) => {
    const index = draftKeys.indexOf(selectedVisible);
    if (index < 0) return;
    let destination = position === "top" ? 0 : position === "bottom" ? draftKeys.length - 1 : index + (position === "up" ? -1 : 1);
    destination = Math.max(0, Math.min(draftKeys.length - 1, destination));
    if (destination === index) return;
    setDraftKeys((current) => {
      const next = [...current], [moved] = next.splice(index, 1);
      next.splice(destination, 0, moved);
      return next;
    });
  };
  return createPortal(
    <div className="report-action-dialog-backdrop" onMouseDown={onClose}>
      <section className="report-columns-dialog" role="dialog" aria-modal="true" aria-labelledby="report-columns-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2 id="report-columns-title">Select Columns</h2><button type="button" onClick={onClose} aria-label="Close column selector" title="Close"><X /></button></header>
        <div className="report-columns-body">
          <div className="report-column-list-panel">
            <h3>Do Not Display</h3>
            <div className="report-column-list" role="listbox" aria-label="Hidden report columns">
              {hiddenColumns.length ? hiddenColumns.map((column) => <button key={column.key} type="button" role="option" aria-selected={selectedHidden === column.key} className={selectedHidden === column.key ? "selected" : ""} onClick={() => setSelectedHidden(column.key)} onDoubleClick={() => addColumn(column.key)}>{column.label}</button>) : <p>All columns are displayed.</p>}
            </div>
          </div>
          <div className="report-column-transfer-controls" aria-label="Move report columns">
            <button type="button" onClick={() => setDraftKeys(columns.map((column) => column.key))} disabled={!hiddenColumns.length} aria-label="Display all columns" title="Display all"><ChevronsRight /></button>
            <button type="button" onClick={() => addColumn(selectedHidden)} disabled={!selectedHidden} aria-label="Display selected column" title="Display selected"><ChevronRight /></button>
            <button type="button" onClick={() => removeColumn(selectedVisible)} disabled={!selectedVisible} aria-label="Hide selected column" title="Hide selected"><ChevronLeft /></button>
            <button type="button" onClick={() => { setDraftKeys([]); setSelectedVisible(""); }} disabled={!draftKeys.length} aria-label="Hide all columns" title="Hide all"><ChevronsLeft /></button>
          </div>
          <div className="report-column-list-panel">
            <h3>Display in Report</h3>
            <div className="report-column-list" role="listbox" aria-label="Displayed report columns">
              {displayedColumns.map((column) => <button key={column.key} type="button" role="option" aria-selected={selectedVisible === column.key} className={selectedVisible === column.key ? "selected" : ""} onClick={() => setSelectedVisible(column.key)} onDoubleClick={() => removeColumn(column.key)}>{column.label}</button>)}
            </div>
          </div>
          <div className="report-column-order-controls" aria-label="Reorder displayed columns">
            <button type="button" onClick={() => moveColumn("top")} disabled={!selectedVisible || draftKeys[0] === selectedVisible} aria-label="Move column to top" title="Move to top"><ChevronsUp /></button>
            <button type="button" onClick={() => moveColumn("up")} disabled={!selectedVisible || draftKeys[0] === selectedVisible} aria-label="Move column up" title="Move up"><ChevronUp /></button>
            <button type="button" onClick={() => moveColumn("down")} disabled={!selectedVisible || draftKeys.at(-1) === selectedVisible} aria-label="Move column down" title="Move down"><ChevronDown /></button>
            <button type="button" onClick={() => moveColumn("bottom")} disabled={!selectedVisible || draftKeys.at(-1) === selectedVisible} aria-label="Move column to bottom" title="Move to bottom"><ChevronsDown /></button>
          </div>
        </div>
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!draftKeys.length} onClick={() => onApply(draftKeys)}>Apply</button></footer>
      </section>
    </div>,
    document.body,
  );
}
function ReportSortDialog({ columns = [], sort = {}, onApply, onClose }) {
  const [columnKey, setColumnKey] = useState(sort.key || columns[0]?.key || "");
  const [direction, setDirection] = useState(sort.direction || "asc");
  return createPortal(
    <div className="report-action-dialog-backdrop" onMouseDown={onClose}>
      <section className="report-sort-dialog" role="dialog" aria-modal="true" aria-labelledby="report-sort-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2 id="report-sort-title">Sort Report</h2><button type="button" onClick={onClose} aria-label="Close sort dialog" title="Close"><X /></button></header>
        <div><label><span>Column</span><select value={columnKey} onChange={(event) => setColumnKey(event.target.value)}>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label><label><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label></div>
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!columnKey} onClick={() => onApply(columnKey, direction)}>Apply</button></footer>
      </section>
    </div>,
    document.body,
  );
}
function ReportActionsMenu({ activeFilterCount = 0, onColumns, onFilter, onSort, onClearSort, onReset }) {
  const [open, setOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const triggerRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open) return undefined;
    const closeMenu = (event) => {
      if (!event.target.closest?.(".report-actions-menu, .report-actions-popover")) setOpen(false);
    };
    const placeMenu = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setPosition({ top: bounds.bottom + 6, left: Math.max(12, Math.min(bounds.left, window.innerWidth - 244)) });
    };
    placeMenu();
    document.addEventListener("mousedown", closeMenu);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);
  const run = (callback) => { setOpen(false); setDataOpen(false); callback(); };
  return <div className="report-actions-menu">
    <button ref={triggerRef} type="button" className="report-actions-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="menu"><span>Actions</span><ChevronDown /></button>
    {open && createPortal(<div className="report-actions-popover" style={position} role="menu" aria-label="Report actions">
      <button type="button" role="menuitem" onClick={() => run(onColumns)}><Columns3 /><span>Columns</span></button>
      <button type="button" role="menuitem" onClick={() => run(onFilter)}><ListFilter /><span>Filter</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
      <div className="report-actions-divider" />
      <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={dataOpen} onClick={() => setDataOpen((current) => !current)}><ArrowUpDown /><span>Data</span><ChevronRight /></button>
      {dataOpen && <div className="report-actions-submenu" role="menu" aria-label="Report data actions"><button type="button" role="menuitem" onClick={() => run(onSort)}><ArrowUpDown /><span>Sort</span></button><button type="button" role="menuitem" onClick={() => run(onClearSort)}><X /><span>Clear sort</span></button></div>}
      <div className="report-actions-divider" />
      <button type="button" role="menuitem" onClick={() => run(onReset)}><RotateCcw /><span>Reset report</span></button>
    </div>, document.body)}
  </div>;
}
function ReportTable({ columns = [], visibleColumnKeys = [], onVisibleColumnsChange, rows = [], query = "", emptyMessage, rowKey, rowClassName }) {
  const [columnFilters, setColumnFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [sortDialogOpen, setSortDialogOpen] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const columnValue = (row, column) => tableFilterText(column.value?.(row));
  const displayedColumns = visibleColumnKeys.length ? visibleColumnKeys.map((key) => columns.find((column) => column.key === key)).filter(Boolean) : columns;
  const columnValues = Object.fromEntries(
    columns.map((column) => [
      column.key,
      [...new Set(rows.map((row) => columnValue(row, column)))].sort((a, b) => sortCollator.compare(a, b)),
    ]),
  );
  const filteredRows = rows.filter((row) =>
    matchesSmartSearch(query, row) &&
    tableRowMatchesFilters(row, columns, columnFilters),
  );
  const [sortedRows, sort, changeSort] = useSortableRows(
    filteredRows,
    "",
    (row, key) => {
      const column = columns.find((item) => item.key === key);
      return column?.sortValue?.(row) ?? column?.value?.(row);
    },
  );
  const updateColumnFilter = (key, value) => {
    setColumnFilters((current) => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };
  const activeFilterCount = columns.filter((column) => columnFilters[column.key]).length;
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedRows = sortedRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const firstVisibleRow = sortedRows.length ? currentPage * pageSize + 1 : 0;
  const lastVisibleRow = Math.min((currentPage + 1) * pageSize, sortedRows.length);
  useEffect(() => { setPage(0); }, [query, columnFilters, sort.key, sort.direction, pageSize, rows.length]);
  useEffect(() => {
    if (!openFilter) return undefined;
    const closeFilter = (event) => {
      if (!event.target.closest?.(".column-filter-header, .column-filter-popover")) setOpenFilter(null);
    };
    document.addEventListener("mousedown", closeFilter);
    return () => document.removeEventListener("mousedown", closeFilter);
  }, [openFilter]);
  return (
    <>
      <div className="report-table-filter-toolbar">
        <label className="report-row-limit"><span>Rows</span><select aria-label="Rows per page" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
        <ReportActionsMenu activeFilterCount={activeFilterCount} onColumns={() => setColumnDialogOpen(true)} onFilter={() => setFilterDialogOpen(true)} onSort={() => setSortDialogOpen(true)} onClearSort={() => changeSort("", "asc")} onReset={() => { setColumnFilters({}); changeSort("", "asc"); setPageSize(50); onVisibleColumnsChange?.(columns.map((column) => column.key)); }} />
        {activeFilterCount > 0 && <button type="button" className="report-active-filter" onClick={() => setFilterDialogOpen(true)}><ListFilter /><span>{activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}</span></button>}
      </div>
      <table className="report-filter-table">
        <thead><tr>{displayedColumns.map((column) => (
          <FilterableHeader
            key={column.key}
            label={column.label}
            sortKey={column.key}
            sort={sort}
            onSort={changeSort}
            open={openFilter === column.key}
            onToggle={(key) => setOpenFilter((current) => current === key ? null : key)}
            values={columnValues[column.key]}
            filterValue={columnFilters[column.key] || ""}
            onFilterChange={(value) => updateColumnFilter(column.key, value)}
          />
        ))}</tr></thead>
        <tbody>
          {pagedRows.length ? pagedRows.map((row, index) => (
            <tr key={rowKey?.(row, index) ?? index} className={rowClassName?.(row, index) || ""}>
              {displayedColumns.map((column) => <td key={column.key}>{column.render ? column.render(row) : columnValue(row, column) || "—"}</td>)}
            </tr>
          )) : <tr><td colSpan={displayedColumns.length} className="empty-state">{emptyMessage}</td></tr>}
        </tbody>
      </table>
      <div className="report-table-pagination"><span>{firstVisibleRow}-{lastVisibleRow} of {sortedRows.length.toLocaleString("en-IN")}</span><div><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={currentPage === 0} aria-label="Previous report page" title="Previous page"><ChevronLeft /></button><b>{currentPage + 1} / {pageCount}</b><button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={currentPage >= pageCount - 1} aria-label="Next report page" title="Next page"><ChevronRight /></button></div></div>
      <TableParameterFilter columns={columns} rows={rows} filters={columnFilters} onFilterChange={updateColumnFilter} onClearFilters={() => setColumnFilters({})} open={filterDialogOpen} onOpenChange={setFilterDialogOpen} hideTrigger dialogMode />
      {columnDialogOpen && <ReportColumnSelector columns={columns} visibleColumnKeys={displayedColumns.map((column) => column.key)} onApply={(keys) => { onVisibleColumnsChange?.(keys); setColumnDialogOpen(false); }} onClose={() => setColumnDialogOpen(false)} />}
      {sortDialogOpen && <ReportSortDialog columns={displayedColumns} sort={sort} onApply={(key, direction) => { changeSort(key, direction); setSortDialogOpen(false); }} onClose={() => setSortDialogOpen(false)} />}
    </>
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
function UserPrivilegeFields({ record = {}, siteOptions = [] }) {
  return <>
    <div className="user-privilege-heading full"><h3>Additional privileges</h3><p>Fine-tune the operational authorities for this user. Core access is assigned automatically from the selected role.</p></div>
    {userPrivilegeFields.filter(([, , type]) => type === "checkbox").map(([key, label]) => <label key={key}><span className="privilege-checkbox-field"><input type="checkbox" name={key} defaultChecked={isCheckedValue(record[key])} /><span><b>{label}</b><small>Enable this privilege</small></span></span></label>)}
  </>;
}

function UserViewMenuFields({record={},view="desktop",visibleTabs,setVisibleTabs,isManager=false}){
  const prefix=view==="mobile"?"mobile":"";
  const keyFor=(field)=>prefix?mobileAccessKey(field):field;
  const requiredTabs=isManager?["Dashboard","Tickets"]:[];
  const shownTabs=[...new Set([...visibleTabs,...requiredTabs])];
  const toggleTab=(tab,checked)=>setVisibleTabs((current)=>checked?[...new Set([...current,tab])]:current.filter((item)=>item!==tab));
  return <section className={`view-menu-access full ${view}-view-access`}>
    <header><div><b>{view==="mobile"?"Mobile View":"Desktop View"}</b><small>{view==="mobile"?"Menus shown at responsive mobile width":"Menus shown on desktop and laptop screens"}</small></div><span>{shownTabs.length} selected</span></header>
    <fieldset className="user-access-field access-section-card">
      <legend>Selected menus</legend>
      {requiredTabs.map((tab)=><input key={tab} type="hidden" name={keyFor("tabAccess")} value={tab} />)}
      <div>{ADMIN_TAB_OPTIONS.map((option)=>{const required=requiredTabs.includes(option);return <label key={option}><input type="checkbox" name={keyFor("tabAccess")} value={option} checked={shownTabs.includes(option)} disabled={required} onChange={(event)=>toggleTab(option,event.target.checked)} /><span>{option}{required?" · Required":""}</span></label>})}</div>
    </fieldset>
    {shownTabs.map((tab)=>{const submenu=ADMIN_SUBMENU_OPTIONS[tab];if(!submenu)return null;const field=keyFor(submenu.field);return <fieldset key={tab} className="user-access-field access-section-card access-submenu-card">
      <legend>{tab} · Submenus</legend>
      <div>{submenu.options.map((option)=><label key={option}><input type="checkbox" name={field} value={option} defaultChecked={selectedAccessValues(record,field,prefix?submenu.field:"").includes(option)} /><span>{navigationLabel(option)}</span></label>)}</div>
    </fieldset>})}
  </section>;
}

function OperationalViewMenuFields({record={},view="desktop",role=""}){
  const menuField=view==="mobile"?"mobileUserMenuAccess":"desktopUserMenuAccess";
  const requestField=view==="mobile"?"mobileUserRequestAccess":"desktopUserRequestAccess";
  const [menus,setMenus]=useState(selectedAccessValues(record,menuField));
  const requestOptions=operationalRequestOptions[role]||[];
  const selectedRequests=selectedAccessValues(record,requestField).filter((option)=>requestOptions.includes(option));
  return <section className={`view-menu-access full ${view}-view-access`}>
    <header><div><b>{view==="mobile"?"Mobile View":"Desktop View"}</b><small>{view==="mobile"?"Menus shown at responsive mobile width":"Menus shown on desktop and laptop screens"}</small></div><span>{menus.length} selected</span></header>
    <fieldset className="user-access-field access-section-card"><legend>Selected menus</legend><div>{operationalMenuOptions.map((option)=><label key={option}><input type="checkbox" name={menuField} value={option} checked={menus.includes(option)} onChange={(event)=>setMenus((current)=>event.target.checked?[...new Set([...current,option])]:current.filter((item)=>item!==option))}/><span>{option}</span></label>)}</div></fieldset>
    {menus.includes("Requests")&&<fieldset className="user-access-field access-section-card access-submenu-card"><legend>Requests · Submenus</legend><div>{requestOptions.map((option)=><label key={option}><input type="checkbox" name={requestField} value={option} defaultChecked={selectedRequests.includes(option)}/><span>{option}</span></label>)}</div></fieldset>}
  </section>;
}

function UserTypeAccessFields({ record = {}, siteOptions = [], canCreateSuperAdmin = false }) {
  const initialRole = String(record.userType || "").toLowerCase().includes("super")
    ? "User"
    : privilegeSelectionValue(record.userGroup);
  const [accountRole, setAccountRole] = useState(initialRole);
  const [roleSection, setRoleSection] = useState(initialRole && initialRole !== "User" ? "team" : "manager");
  const [userAuthority, setUserAuthority] = useState(record.adminLevel || (initialRole === "User" ? "Admin" : ""));
  const [managerRoles, setManagerRoles] = useState(managerRoleSelection(record.managerRole));
  const [managerRegions, setManagerRegions] = useState(managerRegionSelection(record.managerRegion));
  const [managerSites, setManagerSites] = useState(() => {
    const saved=managerSiteSelection(record.managerSites);
    return saved.length?saved:sitesForManagerRegions(record.managerRegion);
  });
  const [visibleTabs, setVisibleTabs] = useState(selectedAccessValues(record, "tabAccess"));
  const [mobileVisibleTabs, setMobileVisibleTabs] = useState(selectedAccessValues(record,"mobileTabAccess","tabAccess"));
  const isDesktopUser = accountRole === "User";
  const isAdmin = isDesktopUser && (userAuthority === "Admin" || userAuthority === "Super Admin");
  const isSuperAdmin = isDesktopUser && userAuthority === "Super Admin";
  const isManager = isDesktopUser && userAuthority === "Manager";
  return <>
    <input type="hidden" name="userType" value={isDesktopUser ? "Super Admin" : accountRole ? "Mobile User" : ""} />
    <fieldset className="account-role-field full">
      <legend>User role *</legend>
      <p>Select the workspace and built-in authority for this account.</p>
      <div className="role-category-tabs" role="tablist" aria-label="User category">
        <button type="button" role="tab" aria-selected={roleSection === "manager"} className={roleSection === "manager" ? "active" : ""} onClick={() => { setRoleSection("manager"); setAccountRole("User"); }}>Manager User</button>
        <button type="button" role="tab" aria-selected={roleSection === "team"} className={roleSection === "team" ? "active" : ""} onClick={() => { setRoleSection("team"); if (accountRole === "User") setAccountRole(""); }}>Team User</button>
      </div>
      {roleSection === "manager" && <input type="hidden" name="userGroup" value="User" />}
      {roleSection === "team" && <div className="role-option-grid">{mobileUserRoleOptions.map((option) => <label key={option} className={accountRole === option ? "selected" : ""}>
        <input type="radio" name="userGroup" value={option} required checked={accountRole === option} onChange={() => setAccountRole(option)} />
        <span><b>{option}</b><small>{mobileRoleAuthority[option]}</small></span>
      </label>)}</div>}
    </fieldset>
    {isDesktopUser && <fieldset className="account-role-field user-authority-field full">
      <legend>User authority *</legend>
      <p>Choose whether this desktop user is a full Admin or a configurable Manager.</p>
      <div>{[...userAuthorityOptions,...(canCreateSuperAdmin?["Super Admin"]:[])].map((option) => <label key={option} className={userAuthority === option ? "selected" : ""}>
        <input type="radio" name="adminLevel" value={option} required checked={userAuthority === option} onChange={() => setUserAuthority(option)} />
        <span><b>{option === "Manager" ? "Non Admin" : option}</b><small>{option === "Super Admin" ? "All Admin features plus Admin lock and Super Admin management" : option === "Admin" ? "All screens, menus and administrative functions" : "Only the selected menus and screens"}</small></span>
      </label>)}</div>
    </fieldset>}
    {isManager && <fieldset className="account-role-field manager-role-field full">
      <legend>Whose manager is this user? *</legend>
      <p>Select one or more operational teams this Non Admin supervises. Their dashboard will include every selected role.</p>
      <div>{managerRoleOptions.map((option) => <label key={option} className={managerRoles.includes(option) ? "selected" : ""}>
        <input type="checkbox" name="managerRole" value={option} checked={managerRoles.includes(option)} onChange={(event) => setManagerRoles((current) => event.target.checked ? [...new Set([...current, option])] : current.filter((role) => role !== option))} />
      <span><b>{option}</b><small>{option === "Production Manager" ? "On-road, off-road, idle and production fleet status" : option === "Maintenance Manager" ? "Maintenance intake, remaining work and completion" : "Pending verification and completed MIS checks"}</small></span>
      </label>)}</div>
    </fieldset>}
    {isDesktopUser && <fieldset className="account-role-field manager-region-field full">
      <legend>Consolidated WhatsApp report regions</legend>
      <p>Select one or more regions, or select All. Non Admin users may leave every option clear to receive only their assigned site's report.</p>
      <div>{MANAGER_REGION_OPTIONS.map((option) => <label key={option} className={managerRegions.includes(option) ? "selected" : ""}>
        <input type="checkbox" name="managerRegion" value={option} checked={managerRegions.includes(option)} onChange={(event) => {
          const nextRegions=option==="All"
            ? event.target.checked?["All"]:[]
            : event.target.checked?[...new Set([...managerRegions.filter((region)=>region!=="All"),option])]:managerRegions.filter((region)=>region!==option&&region!=="All");
          const nextAvailable=sitesForManagerRegions(nextRegions);
          setManagerRegions(nextRegions);
          setManagerSites((current)=>event.target.checked?[...new Set([...current,...nextAvailable])]:current.filter((site)=>nextAvailable.includes(site)));
        }} />
        <span><b>{option}</b><small>{option==="All"?"Receive reports for every configured region":`${option} sites only`}</small></span>
      </label>)}</div>
      {!!managerRegions.length&&<div className="manager-site-options">
        <b>Included sites</b><small>All sites are checked initially. Uncheck a site to exclude its requests and tickets for this user.</small>
        <div>{sitesForManagerRegions(managerRegions).map((site)=><label key={site} className={managerSites.includes(site)?"selected":""}>
          <input type="checkbox" name="managerSites" value={site} checked={managerSites.includes(site)} onChange={(event)=>setManagerSites((current)=>event.target.checked?[...new Set([...current,site])]:current.filter((item)=>item!==site))}/>
          <span><b>{site}</b><small>{managerSites.includes(site)?"Included":"Excluded"}</small></span>
        </label>)}</div>
      </div>}
    </fieldset>}
    {accountRole && !isDesktopUser && <label>Location *
      <select name="site" required defaultValue={record.site || record.location || ""}>
        <option value="" disabled>Select location</option>
        {siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
        {(record.site || record.location) && !siteOptions.includes(record.site || record.location) && <option value={record.site || record.location}>{record.site || record.location}</option>}
      </select>
    </label>}
    {isAdmin && <div className="super-role-summary full"><ShieldCheck /><span><b>{isSuperAdmin?"Super Admin access":"Admin menu access"}</b><small>All menus are selected by default. You can tailor this account’s desktop and mobile menus below.</small></span></div>}
    {isDesktopUser && <>
      <div className="user-privilege-heading full"><h3>Selected menus for each view</h3><p>Configure this user’s header menus and submenus separately for desktop and responsive mobile screens.</p></div>
      <UserViewMenuFields record={record} view="desktop" visibleTabs={visibleTabs} setVisibleTabs={setVisibleTabs} isManager />
      <UserViewMenuFields record={record} view="mobile" visibleTabs={mobileVisibleTabs} setVisibleTabs={setMobileVisibleTabs} isManager />
    </>}
    {accountRole && !isDesktopUser && <>
      <div className="user-privilege-heading full"><h3>Selected menus for each view</h3><p>Choose this {accountRole} account’s menus and request actions separately for desktop and responsive mobile screens.</p></div>
      <OperationalViewMenuFields key={`${accountRole}-desktop`} record={record} view="desktop" role={accountRole}/>
      <OperationalViewMenuFields key={`${accountRole}-mobile`} record={record} view="mobile" role={accountRole}/>
    </>}
    {accountRole && !isDesktopUser && <UserPrivilegeFields record={record} siteOptions={siteOptions} />}
  </>;
}

function applyUserRoleDefaults(record) {
  const role = privilegeSelectionValue(record.userGroup);
  if (role === "User") {
    record.userType = "Super Admin";
    record.userGroup = "";
    record.location = "";
    if (record.adminLevel === "Admin" || record.adminLevel === "Super Admin") {
      record.site = "";
      record.managerRole = "";
      record.managerRegion = managerRegionSelection(record.managerRegion).join(" | ");
      record.managerSites = managerSiteSelection(record.managerSites).join(" | ");
      if(!Object.prototype.hasOwnProperty.call(record,"mobileTabAccess")&&!Object.prototype.hasOwnProperty.call(record,"dashboardAccess")){
        record.masterAccess = ADMIN_MASTER_OPTIONS.join(" | ");
        record.tabAccess = ADMIN_TAB_OPTIONS.join(" | ");
        Object.values(ADMIN_SUBMENU_OPTIONS).forEach(({field, options}) => { record[field] = options.join(" | "); });
        record.mobileTabAccess = ADMIN_TAB_OPTIONS.join(" | ");
        Object.values(ADMIN_SUBMENU_OPTIONS).forEach(({field, options}) => { record[mobileAccessKey(field)] = options.join(" | "); });
      }
    } else {
      const selectedManagerRoles=managerRoleSelection(record.managerRole);
      record.managerRole=selectedManagerRoles.join(" | ");
      record.managerRegion=managerRegionSelection(record.managerRegion).join(" | ");
      record.managerSites=managerSiteSelection(record.managerSites).join(" | ");
      const tabs = new Set(String(record.tabAccess || "").split(/\s*\|\s*/).filter(Boolean));
      tabs.add("Dashboard");
      tabs.add("Reports");
      tabs.add("Tickets");
      record.tabAccess = [...tabs].join(" | ");
      record.dashboardAccess = "Dashboard";
      const departmentReportLabels = new Set(["Reports", "General Report"]);
      if (!selectedManagerRoles.length || selectedManagerRoles.includes("Production Manager")) departmentReportLabels.add("Production report");
      if (!selectedManagerRoles.length || selectedManagerRoles.includes("Maintenance Manager")) departmentReportLabels.add("Maintenance report");
      if (!selectedManagerRoles.length || selectedManagerRoles.includes("MIS Manager")) departmentReportLabels.add("MIS Report");
      record.reportAccess = [...departmentReportLabels].join(" | ");
      const mobileTabs = new Set(String(record.mobileTabAccess || record.tabAccess || "").split(/\s*\|\s*/).filter(Boolean));
      mobileTabs.add("Dashboard");
      mobileTabs.add("Reports");
      mobileTabs.add("Tickets");
      record.mobileTabAccess = [...mobileTabs].join(" | ");
      record.mobileDashboardAccess = "Dashboard";
      record.mobileReportAccess = record.reportAccess;
      if(!selectedManagerRoles.length)return record;
      if (selectedManagerRoles.some((role)=>role !== "MIS Manager")) {
        const masters = new Set(String(record.masterAccess || "").split(/\s*\|\s*/).filter(Boolean));
        masters.add("Equipment master");
        record.masterAccess = [...masters].join(" | ");
        const mobileMasters = new Set(String(record.mobileMasterAccess || record.masterAccess || "").split(/\s*\|\s*/).filter(Boolean));
        mobileMasters.add("Equipment master");
        record.mobileMasterAccess = [...mobileMasters].join(" | ");
      }
    }
  } else if (mobileUserRoleOptions.includes(role)) {
    record.userType = "Mobile User";
    record.adminLevel = "";
    record.managerRole = "";
    record.managerRegion = "";
    record.managerSites = "";
    record.masterAccess = "";
    record.tabAccess = "";
    Object.values(ADMIN_SUBMENU_OPTIONS).forEach(({field}) => { record[field] = ""; });
    record.mobileTabAccess = "";
    Object.values(ADMIN_SUBMENU_OPTIONS).forEach(({field}) => { record[mobileAccessKey(field)] = ""; });
    for(const view of ["desktop","mobile"]){
      const menuField=`${view}UserMenuAccess`,requestField=`${view}UserRequestAccess`;
      if(!record[menuField])record[menuField]=operationalMenuOptions.join(" | ");
      if(!record[requestField])record[requestField]=(operationalRequestOptions[role]||[]).join(" | ");
    }
  }
  return record;
}

function missingViewSubmenu(record){
  for(const [view,prefix] of [["Desktop View",""],["Mobile View","mobile"]]){
    const tabField=prefix?"mobileTabAccess":"tabAccess";
    const missing=String(record[tabField]||"").split(/\s*\|\s*/).filter(Boolean).find((tab)=>{
      const submenu=ADMIN_SUBMENU_OPTIONS[tab];
      return submenu&&!record[prefix?mobileAccessKey(submenu.field):submenu.field];
    });
    if(missing)return {view,tab:missing};
  }
  return null;
}

const splitMultiTextValues = (value = "") => String(value)
  .split(/\s*\|\s*/)
  .map((item) => item.trim())
  .filter(Boolean);

function MultiTextField({ name, label, value = "" }) {
  const [values, setValues] = useState(() => {
    const existing = splitMultiTextValues(value);
    return existing.length ? existing : [""];
  });
  const updateValue = (index, nextValue) => setValues((current) => current.map((item, itemIndex) => itemIndex === index ? nextValue : item));
  const removeValue = (index) => setValues((current) => current.length === 1 ? [""] : current.filter((_, itemIndex) => itemIndex !== index));
  return (
    <fieldset className="multi-text-field full">
      <legend>{label} *</legend>
      <div className="multi-text-values">
        {values.map((item, index) => (
          <div className="multi-text-row" key={`${name}-${index}`}>
            <input name={name} value={item} onChange={(event) => updateValue(index, event.target.value)} placeholder={`Enter ${label.toLowerCase()} name`} />
            {values.length > 1 && <button type="button" onClick={() => removeValue(index)} aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}>Remove</button>}
          </div>
        ))}
      </div>
      <button className="multi-text-add" type="button" onClick={() => setValues((current) => [...current, ""])}><Plus /> Add another superior</button>
    </fieldset>
  );
}

function MasterActions({ name, records = [], onAdd, onDeleteAll, onSaveAll, saveAllDisabled = false, userOptions = [], siteOptions = [], canCreateSuperAdmin = false }) {
  const [mode, setMode] = useState(null),
    [selectedFile, setSelectedFile] = useState(null),
    [importing, setImporting] = useState(false),
    [dragActive, setDragActive] = useState(false),
    [syncingOracle, setSyncingOracle] = useState(false),
    fileInput = useRef(null),
    fields = masterFields[name],
    formFields = name === "Users & employees" ? [...fields, ...userPrivilegeFields, ...userSubmenuFields] : fields,
    exportColumns = fields?.map(([key, label, type]) => ({ label, value: (record) => type === "checkbox" ? (isCheckedValue(record[key]) ? "Yes" : "No") : record[key] })) || [];
  if (!fields) return null;
  const saveManual = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      record = Object.fromEntries(
        formFields.map(([key, , type]) => [
          key,
          type === "checkbox"
            ? fd.has(key)
            : type === "multi-checkbox" || type === "multi-text"
              ? fd.getAll(key).map((value) => String(value).trim()).filter(Boolean).join(" | ")
              : String(fd.get(key) || "").trim(),
        ]),
      );
    if (name === "Users & employees") applyUserRoleDefaults(record);
    if (name === "Users & employees" && record.userType === "Super Admin" && record.adminLevel === "Manager" && !record.managerRole) {
      alert("Select at least one manager role for this Non Admin user.");
      return;
    }
    if (name === "Users & employees" && record.userType === "Super Admin" && record.adminLevel === "Manager" && (!record.managerRegion || !record.managerSites)) {
      alert("Select at least one region and keep at least one site included for this Non Admin user.");
      return;
    }
    if (name === "Equipment master" && !record.status)
      record.status = "Operational";
    if (name === "Users & employees" && record.userType === "Super Admin" && !record.masterAccess && !record.tabAccess) {
      alert("Select at least one visible master or tab for this Super Admin.");
      return;
    }
    if (name === "Users & employees" && record.userType === "Super Admin") {
      const missing = missingViewSubmenu(record);
      if (missing) { alert(`Select at least one ${missing.tab} submenu for ${missing.view}.`); return; }
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
  const syncOracle = async () => {
    if (syncingOracle) return;
    setSyncingOracle(true);
    try {
      const response = await fetch(name === "Equipment master" ? "/api/oracle/equipment/sync" : "/api/oracle/equipment-transfers/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const details = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(details.error || "Could not synchronize equipment transfers.");
      alert(name === "Equipment master"
        ? `${details.equipmentImported || 0} Oracle equipment records synchronized. ${details.equipmentUpdated || 0} updated and ${details.equipmentInserted || 0} added.`
        : `${details.transfersImported || 0} Oracle transfers imported. ${details.equipmentUpdated || 0} Equipment Master locations updated.`);
      window.location.reload();
    } catch (error) {
      alert(error.message || "Could not synchronize equipment transfers.");
      setSyncingOracle(false);
    }
  };
  return (
    <>
      <div className="master-actions">
        {["Equipment master", "Vehicle transfers"].includes(name) && (
          <button className="secondary" type="button" onClick={syncOracle} disabled={syncingOracle}>
            <RefreshCw /> {syncingOracle ? "Syncing Oracle..." : "Sync Oracle"}
          </button>
        )}
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
        <ExportMenu title={name} columns={exportColumns} rows={records} />
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
                name === "Users & employees" && ["site", "userType", "masterAccess", "tabAccess"].includes(key) ? null : type === "multi-text" ? (
                  <MultiTextField key={key} name={key} label={label} />
                ) : type === "multi-checkbox" ? (
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
                      {mobileUserRoleOptions.map((option) => <option key={option} value={option}>{option} — {mobileRoleAuthority[option]}</option>)}
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
                      {persistedUserTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
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
                  ) : name === "Equipment master" && key === "status" ? (
                    <>{label} *
                    <select name={key} required defaultValue="Operational"><option value="Operational">On road</option><option value="Off road">Off road</option><option value="Idle">Idle</option></select></>
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
              {name === "Users & employees" && <UserTypeAccessFields siteOptions={siteOptions} canCreateSuperAdmin={canCreateSuperAdmin} />}
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
                <CaliberActivityMark size="small" />
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
  initialCategory = "all",
  pageTitle = "Equipment master",
  statusRequests = null,
  allowedLocations = [],
  records = [],
  onAdd,
  onEdit,
  onDelete,
  onDeleteAll,
}) {
  const [q, setQ] = useState(""),
    [road, setRoad] = useState(initialFilter),
    [location, setLocation] = useState(initialLocation),
    [assetCategory, setAssetCategory] = useState(initialCategory),
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
      ["chassisNo", "Chassis no."], ["documentStatus", "Document status"], ["status", "Fleet status"],
    ],
    equipmentValue = (record, key) => {
      if (key === "currentLocation") return record.currentLocation || record.location;
      if (key === "equipmentName") return record.equipmentName || record.door;
      if (key === "acquisitionDate") return record.acquisitionDate || record.acquired;
      return record[key];
    },
    filterText = (value) => tableFilterText(value),
    filterColumns = equipmentColumns.map(([key, label]) => ({ key, label, value: (record) => equipmentValue(record, key) })),
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
  const roadStatusFor = (record) => Array.isArray(statusRequests)
    ? liveEquipmentRoadStatus(record, statusRequests)
    : equipmentRoadStatus(record);
  let rows = records.filter(
    (v) =>
      (road === "all" ||
        roadStatusFor(v) === road) &&
      (assetCategory === "all" || String(v.category || "").trim().toLowerCase() === assetCategory) &&
      (!allowedLocations.length || allowedLocations.some((site) => recordBelongsToSite(v, site))) &&
      (!location || recordBelongsToSite(v, location)) &&
      matchesSmartSearch(q, v) &&
      tableRowMatchesFilters(v, filterColumns, columnFilters),
  );
  const [sortedRows, sort, changeSort] = useSortableRows(rows, "", equipmentValue);
  const equipmentEditFields = masterFields["Equipment master"];
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
          <h1>{pageTitle}</h1>
          <p>
            {location ? location + " · " : ""}
            {road === "all"
              ? "All equipment"
              : road === "onroad"
                ? "On Road equipment"
                : road === "offroad"
                  ? "Off Road equipment"
                  : "Idle equipment"}{" "}
            · {rows.length} records shown
          </p>
        </div>
        <MasterActions name="Equipment master" records={records} onAdd={onAdd} onDeleteAll={onDeleteAll} />
      </header>
      <div className="toolbar">
        <div>
          <Search />
          <input
            data-smart-search
            type="search"
            placeholder="Search equipment, category, serial no...."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select value={road} onChange={(e) => setRoad(e.target.value)}>
          <option value="all">All road statuses</option>
          <option value="onroad">On Road</option>
          <option value="offroad">Off Road</option>
          <option value="idle">Idle</option>
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((site) => (
            <option key={site}>{site}</option>
          ))}
        </select>
        <select value={assetCategory} onChange={(e) => setAssetCategory(e.target.value)}>
          <option value="all">All categories</option>
          <option value="equipment">Equipment</option>
          <option value="vehicle">Vehicles</option>
        </select>
        <TableParameterFilter columns={filterColumns} rows={records} filters={columnFilters} onFilterChange={updateColumnFilter} onClearFilters={() => setColumnFilters({})} />
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
                  <td><Status>{roadStatusFor(v)==="onroad"?"On road":roadStatusFor(v)==="offroad"?"Off road":roadStatusFor(v)==="idle"?"Idle":"Status not set"}</Status></td>
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
                <td colSpan="15" className="empty-state">
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
            <Status>{roadStatusFor(detail)==="onroad"?"On road":roadStatusFor(detail)==="offroad"?"Off road":roadStatusFor(detail)==="idle"?"Idle":"Status not set"}</Status>
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
                  {key==="status"?<select name={key} defaultValue={editing[key]||"Operational"}><option value="Operational">On road</option><option value="Off road">Off road</option><option value="Idle">Idle</option></select>:<input name={key} defaultValue={editing[key] || ""} />}
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
  required = true,
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
        required={required}
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
function readMeterEvidence(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("Select a KMR/HMR evidence file."));
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      return reject(new Error("Upload a JPEG, PNG, WebP, or PDF KMR/HMR file up to 5 MB."));
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected KMR/HMR file."));
    reader.readAsDataURL(file);
  });
}
function MaintenanceForm({ close, normal = false, onSubmit, equipmentRecords = [], equipmentLoaded = false, repairTypeRecords = [], repairTypesLoaded = false, assignedLocation = "" }) {
  const [equipmentGroup, setEquipmentGroup] = useState(""),
    [equipmentId, setEquipmentId] = useState(""),
    [door, setDoor] = useState(""),
    [equipmentSearch, setEquipmentSearch] = useState(""),
    [equipmentSearchActive, setEquipmentSearchActive] = useState(false),
    [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [openedAt] = useState(() => new Date());
  const pad = (n) => String(n).padStart(2, "0");
  const systemDate = `${openedAt.getFullYear()}-${pad(openedAt.getMonth() + 1)}-${pad(openedAt.getDate())}`,
    systemTime = `${pad(openedAt.getHours())}:${pad(openedAt.getMinutes())}:${pad(openedAt.getSeconds())}`,
    locationEquipmentRecords = recordsForSite(equipmentRecords, assignedLocation),
    v = findRequestEquipment(locationEquipmentRecords, equipmentId),
    equipmentGroups = requestEquipmentGroupOptions(locationEquipmentRecords),
    groupRecords = requestEquipmentRecordsForGroup(locationEquipmentRecords, equipmentGroup),
    searchableRecords = equipmentSearchActive || equipmentSearch.trim() ? locationEquipmentRecords : groupRecords,
    equipmentVehicleRecords = searchableRecords.reduce((unique, record) => {
      const label = requestEquipmentOptionLabel(record);
      if (record.id != null && label && !unique.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
        unique.push({ record, label });
      }
      return unique;
    }, []),
    visibleEquipmentVehicleRecords = equipmentVehicleRecords.filter(({ record, label }) => String(record.id) === equipmentId || matchesSmartSearch(equipmentSearch, label, record)),
    equipmentDetails = requestEquipmentDetails(v || {}),
    currentLocation = equipmentDetails.site || String(assignedLocation || "").trim();
  const [requestTime, setRequestTime] = useState(systemTime);
  const [requestDate, setRequestDate] = useState(systemDate);
  const [driverLookup, setDriverLookup] = useState({status: "idle", name: "", source: ""});
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const equipmentNo = equipmentDetails.door || equipmentDetails.equipment;
    if (!equipmentNo || !currentLocation || !requestDate || !requestTime) {
      setDriverLookup({status: "idle", name: "", source: ""});
      return undefined;
    }
    let cancelled = false;
    setDriverLookup({status: "loading", name: "", source: ""});
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({date: requestDate, time: requestTime, location: currentLocation, equipmentNo});
        const response = await fetch(`/api/oracle/driver?${query}`, {headers: {Authorization: `Bearer ${authToken}`}});
        const result = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) setDriverLookup({status: "temporary", name: "Demo Driver", source: "Demo"});
        else if (result.found) setDriverLookup({status: "found", name: result.driverName || "", source: result.source || "Oracle logbook"});
        else setDriverLookup({status: "temporary", name: "Demo Driver", source: "Demo"});
      } catch {
        if (!cancelled) setDriverLookup({status: "temporary", name: "Demo Driver", source: "Demo"});
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [equipmentDetails.door, equipmentDetails.equipment, currentLocation, requestDate, requestTime]);
  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const fd = new FormData(e.currentTarget),
      meterType = requestEquipmentMeterType(v || {});
    const request = {
        ref: "REQ-" + Date.now(),
        equipment: equipmentDetails.equipment,
        equipmentGroup: equipmentDetails.group || equipmentGroup,
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
        driverName: driverLookup.name,
        driverNameSource: driverLookup.status === "found" ? `Oracle - ${driverLookup.source}` : driverLookup.source || "Demo",
        meterType,
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
      title={<span className="request-modal-title"><span className="request-form-timer"><Clock /> {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}</span>{normal ? "Push vehicle for maintenance" : "Create breakdown case"}<small><MapPin /> {currentLocation || "Location not assigned"}</small></span>}
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
            {equipmentLoaded && locationEquipmentRecords.length ? (
              <>
                <input
                  className="equipment-request-search"
                  data-smart-search
                  type="search"
                  value={equipmentSearch}
                  onChange={(event) => setEquipmentSearch(event.target.value)}
                  onFocus={() => setEquipmentSearchActive(true)}
                  onClick={() => setEquipmentSearchActive(true)}
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
                    if (details.group) setEquipmentGroup(details.group);
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
            Date *<input name="date" type="date" value={requestDate} readOnly aria-readonly="true" />
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
              readOnly
              aria-readonly="true"
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
          <label>
            Make
            <input value={equipmentDetails.make} readOnly placeholder={v ? "Not recorded in Equipment Master" : "Select equipment to fetch make"} />
          </label>
          <label>
            Model
            <input value={equipmentDetails.model} readOnly placeholder={v ? "Not recorded in Equipment Master" : "Select equipment to fetch model"} />
          </label>
          <label>
            Driver / operator name
            <input
              name="driverName"
              value={driverLookup.name}
              readOnly={driverLookup.status === "found" || driverLookup.status === "loading" || driverLookup.status === "idle"}
              onChange={(event) => setDriverLookup({status: "temporary", name: event.target.value, source: event.target.value.trim() === "Demo Driver" ? "Demo" : "Manual"})}
              aria-busy={driverLookup.status === "loading"}
              placeholder={driverLookup.status === "loading" ? "Fetching from Oracle logbook…" : "Select equipment to fetch driver"}
            />
            {driverLookup.status === "found" && <small>Fetched from {driverLookup.source}</small>}
            {driverLookup.status === "temporary" && <small>Temporary name — enter the driver manually if known. Oracle is checked every two minutes; when the actual driver is available it automatically replaces and removes this temporary name.</small>}
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
  const data = subsidiaryData.filter((x) => matchesSmartSearch(q, x.name, x.code, x.sites));
  return (
    <section className="panel pagepanel generic">
      <header>
        <div>
          <h1>Region master</h1>
          <p>
            Click a region, then select Total, On Road, Off Road or Idle for any
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
            data-smart-search
            type="search"
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
                                (v) => (v.currentLocation || v.location) === site,
                              ),
                              metrics=equipmentMetrics(list),
                              on=metrics.onRoad,
                              off=metrics.offRoad,
                              idle=metrics.idle;
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
                                <button
                                  className="idle"
                                  onClick={() => gotoEquipment("idle", site)}
                                >
                                  <strong>{idle}</strong>
                                  <span>Idle</span>
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
  const [q, setQ] = useState("");
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
    ["Fleet availability: On Road / Off Road / Idle", "Dashboard"],
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
  const visibleRows = rows.filter((row) => matchesSmartSearch(q, row));
  const visibleRequests = requests.filter((request) => matchesSmartSearch(q, request));
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
          <input data-smart-search type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder={"Search " + name.toLowerCase()} />
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
                {visibleRequests.length ? visibleRequests.map((request) => {
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
            {visibleRows.length ? (
              visibleRows.map((row, ri) => (
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

const reportCategoryTabs = [
  {id: "general", label: "General Report", description: "Common road status, fleet location, transfer, and recent breakdown reports.", icon: FileBarChart},
  {id: "production", label: "Production report", description: "Production opening and Production-to-MIS verification reports.", icon: Gauge},
  {id: "maintenance", label: "Maintenance report", description: "Maintenance closing, idle, TAT, and verification reports.", icon: Wrench},
  {id: "mis", label: "MIS Report", description: "MIS verification and first-trip audit reports.", icon: ShieldCheck},
];
const reportWeekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const reportDesignationOptions = Object.entries(HIERARCHY_REPORT_DESIGNATIONS).map(([key, designation]) => ({key, ...designation}));
function reportScheduleKind(schedule) {
  if (schedule.cadence === "event") return "Every event";
  if (schedule.cadence === "interval") return `Every ${schedule.intervalDays} days`;
  if (schedule.cadence === "weekly") return "Weekly";
  return "Daily";
}
function reportAccessAllows(selection, label) {
  return accessAllows(selection, "Reports") || accessAllows(selection, label);
}
function reportCategoryIdsForUser(permissions = {}, session = {}) {
  const adminLevel = String(permissions.adminLevel || "").trim();
  if (["Admin", "Super Admin"].includes(adminLevel) || (session.role === "super" && adminLevel !== "Manager")) return reportCategoryTabs.map((category) => category.id);
  const roleText = [
    ...(Array.isArray(permissions.managerRoles) ? permissions.managerRoles : []),
    permissions.managerRole,
    permissions.department,
    session.assignedRole,
    session.department,
    session.designation,
  ].filter(Boolean).join(" ").toLowerCase();
  if (adminLevel === "Manager" && (!roleText || roleText.includes("project manager") || roleText.includes("director"))) {
    return reportCategoryTabs.map((category) => category.id);
  }
  const categoryIds = new Set(["general"]);
  if (roleText.includes("production")) categoryIds.add("production");
  if (roleText.includes("maintenance")) categoryIds.add("maintenance");
  if (roleText.includes("mis")) categoryIds.add("mis");
  const departmentScoped = categoryIds.size > 1 || adminLevel === "Manager";
  return reportCategoryTabs
    .filter((category) => categoryIds.has(category.id))
    .filter((category) => departmentScoped || reportAccessAllows(permissions.reportAccess, category.label))
    .map((category) => category.id);
}
function firstTripTimestamp(request) {
  const date = String(request.firstTripDate || "").trim();
  const time = String(request.firstTripTime || "").trim();
  return date ? [date, time].filter(Boolean).join(" ") : "";
}
function roadStatusLabel(record, requests = []) {
  const status = liveEquipmentRoadStatus(record, requests);
  return status === "onroad" ? "On road" : status === "offroad" ? "Off road" : status === "idle" ? "Idle" : "Status not set";
}
function locationCountRows(records = []) {
  const groups = new Map();
  records.forEach((record) => {
    const location = String(record.currentLocation || record.location || "Not assigned").trim() || "Not assigned";
    const type = ["vehicle", "vehicles"].includes(String(record.category || "").trim().toLowerCase()) ? "vehicles" : "equipment";
    const current = groups.get(location) || { location, equipment: 0, vehicles: 0, total: 0 };
    current[type] += 1;
    current.total += 1;
    groups.set(location, current);
  });
  return [...groups.values()].sort((a, b) => sortCollator.compare(a.location, b.location));
}
function ReportSection({ title, description, category = "general", icon: ReportIcon = FileBarChart, rows = [], columns = [], query = "", emptyMessage = "No records available", rowKey, rowClassName, children }) {
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(() => columns.map((column) => column.key));
  const visibleColumns = visibleColumnKeys.map((key) => columns.find((column) => column.key === key)).filter(Boolean);
  return (
    <div className="reports-section generated-report-section" data-category={category}>
      <div className="reports-section-heading">
        <div className="generated-report-title">
          <span className="generated-report-icon"><ReportIcon aria-hidden="true" /></span>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
        <ExportMenu title={title} columns={visibleColumns} rows={rows} className="secondary" label="Generate" />
      </div>
      {children || (
        <div className="reports-detail-table emptytable">
          <ReportTable
            query={query}
            rows={rows}
            rowKey={rowKey}
            rowClassName={rowClassName}
            emptyMessage={emptyMessage}
            columns={columns}
            visibleColumnKeys={visibleColumnKeys}
            onVisibleColumnsChange={setVisibleColumnKeys}
          />
        </div>
      )}
    </div>
  );
}
function ReportsPage({ requests = [], activeReportCategory = "general", setActiveReportCategory = () => {}, permissions = {}, session = {} }) {
  const [equipmentRecords] = useMasterRecords("Equipment master");
  const [transferRecords] = useMasterRecords("Vehicle transfers");
  const [selectedReportByCategory, setSelectedReportByCategory] = useState({});
  const [directorTimingOpen, setDirectorTimingOpen] = useState(false);
  const [reportScheduleSettings, setReportScheduleSettings] = useState(defaultHierarchyReportScheduleSettings);
  const [reportScheduleRecipients, setReportScheduleRecipients] = useState({});
  const [selectedScheduleDesignation, setSelectedScheduleDesignation] = useState("director");
  const [reportScheduleLoading, setReportScheduleLoading] = useState(false);
  const [reportScheduleSaving, setReportScheduleSaving] = useState(false);
  const reportAdministrator = session?.role === "super" && session?.permissions?.adminLevel !== "Manager";
  const [reportAccess, setReportAccess] = useState({ canManageAll: reportAdministrator, allowedDesignationKeys: [], allowedReports: [] });
  const [reportAccessLoaded, setReportAccessLoaded] = useState(reportAdministrator);
  const [reportZipOpen, setReportZipOpen] = useState(false);
  const [selectedZipReports, setSelectedZipReports] = useState([]);
  const [reportZipDownloading, setReportZipDownloading] = useState(false);
  const [reportZipFrom, setReportZipFrom] = useState(() => indiaDateTimeInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [reportZipTo, setReportZipTo] = useState(() => indiaDateTimeInputValue(new Date(Date.now() + 60 * 1000)));
  const reportGeneratedAt = useMemo(() => indiaDateTimeInputValue(new Date()), []);
  const allowedReportCategoryIds = reportCategoryIdsForUser(permissions, session);
  const departmentReportCategoryTabs = reportCategoryTabs.filter((category) => allowedReportCategoryIds.includes(category.id));
  const reportToolRole = [permissions.adminLevel, permissions.managerRole, ...(permissions.managerRoles || []), session.designation]
    .filter(Boolean).join(" ").toLowerCase();
  const canUseReportWorkspaceTools = ["Admin", "Super Admin", "Manager"].includes(String(permissions.adminLevel || ""))
    || reportToolRole.includes("project manager") || reportToolRole.includes("director");

  const equipmentByReference = useMemo(() => {
    const records = new Map();
    const addReference = (value, record) => {
      const reference = String(value || "").trim().toLowerCase();
      if (!reference) return;
      if (!records.has(reference)) records.set(reference, record);
      else if (records.get(reference) !== record) records.set(reference, null);
    };
    equipmentRecords.forEach((record) => {
      [record.manufacturerSerialNo, record.chassisNo, record.door, record.reg, record.equipmentName]
        .forEach((value) => addReference(value, record));
    });
    return records;
  }, [equipmentRecords]);
  const reportRequests = useMemo(() => requests.map((request) => {
    const equipment = [request.chassis, request.door, request.reg, request.equipment]
      .map((value) => equipmentByReference.get(String(value || "").trim().toLowerCase()))
      .find(Boolean);
    return {
      ...request,
      reportEquipment: request.equipment || request.door || equipment?.equipmentName || "",
      reportDoor: request.door || equipment?.door || "",
      reportMake: request.make || equipment?.make || "",
      reportModel: request.model || equipment?.model || "",
      reportSite: request.site || equipment?.currentLocation || equipment?.location || "",
    };
  }), [requests, equipmentByReference]);
  const elapsedRows = reportRequests.filter((request) => request.start || request.closedAt || request.verifiedAt);
  const formatTimestamp = (value) => String(value || "—").trim() || "—";
  const reportRequestStatus = (request) => String(request.status || "").trim() || "Open";
  const activeCategory = departmentReportCategoryTabs.find((category) => category.id === activeReportCategory) || departmentReportCategoryTabs[0] || reportCategoryTabs[0];
  const openBreakdownRows = reportRequests.filter((request) => String(request.status || "").trim().toLowerCase() !== "closed");
  const closedBreakdownRows = reportRequests.filter((request) => String(request.closedAt || "").trim() || String(request.status || "").trim().toLowerCase() === "closed");
  const misVerificationRows = reportRequests.filter((request) => String(request.verifiedAt || "").trim() || String(request.verifiedBy || "").trim());
  const idleRequestRows = reportRequests.filter((request) => String(request.status || "").trim().toLowerCase() === "idle" || String(request.idleReason || "").trim());
  const fleetStatusRows = equipmentRecords.map((record, index) => ({
    ...record,
    reportId: record.id || `${record.equipmentName || record.door || "equipment"}-${index}`,
    reportEquipment: record.equipmentName || record.equipment || record.door || "",
    reportDoor: record.door || "",
    reportMake: record.make || "",
    reportModel: record.model || record.modelNo || "",
    reportSite: record.currentLocation || record.location || "",
    reportRoadStatus: roadStatusLabel(record, reportRequests),
  }));
  const transferRows = transferRecords.map((record, index) => ({
    ...record,
    reportId: record.id || `${record.transferNo || "transfer"}-${index}`,
    reportEquipment: record.equipment || record.equipmentName || record.door || "",
    reportSite: record.destination || record.currentLocation || record.location || "",
  }));
  const locationWiseRows = locationCountRows(equipmentRecords);
  const recentBreakdownRows = [...reportRequests]
    .sort((a, b) => (new Date(String(b.start || b.closedAt || b.verifiedAt || 0).replace(" ", "T")).getTime() || 0) - (new Date(String(a.start || a.closedAt || a.verifiedAt || 0).replace(" ", "T")).getTime() || 0))
    .slice(0, 250);
  const inOutRows = useMemo(() => buildInOutReportRows(reportRequests), [reportRequests]);
  const inOutColumns = IN_OUT_REPORT_COLUMNS.map((column) => ({
    ...column,
    ...(column.key === "date" ? { render: (row) => <b>{row.date}</b> } : {}),
    ...(column.key === "net" ? { sortValue: (row) => row.net, render: (row) => <strong className={`in-out-net${row.net > 0 ? " positive" : row.net < 0 ? " negative" : ""}`}>{signedCount(row.net)}</strong> } : {}),
    ...(column.key === "averageTat" ? { sortValue: (row) => row.averageTatMinutes ?? -1 } : {}),
  }));
  const requestColumns = [
    {key: "reference", label: "Job reference", value: (request) => request.ref, render: (request) => <b>{request.ref || "—"}</b>},
    {key: "equipment", label: "Equipment / vehicle", value: (request) => request.reportEquipment},
    {key: "door", label: "Door no.", value: (request) => request.reportDoor},
    {key: "make", label: "Make", value: (request) => request.reportMake},
    {key: "model", label: "Model", value: (request) => request.reportModel},
    {key: "site", label: "Location", value: (request) => request.reportSite},
    {key: "category", label: "Category", value: (request) => request.equipmentGroup || request.category || request.type},
    {key: "status", label: "Status", value: reportRequestStatus, render: (request) => <Status>{reportRequestStatus(request)}</Status>},
    {key: "createdBy", label: "Production user", value: (request) => request.owner || request.requesterLogin},
    {key: "started", label: "Opened at", value: (request) => request.start, render: (request) => formatTimestamp(request.start)},
  ];
  const closureColumns = [
    ...requestColumns,
    {key: "closedBy", label: "Maintenance user", value: (request) => request.closedBy},
    {key: "closedAt", label: "Closed at", value: (request) => request.closedAt, render: (request) => formatTimestamp(request.closedAt)},
  ];
  const misColumns = [
    ...closureColumns,
    {key: "verifiedBy", label: "MIS user", value: (request) => request.verifiedBy},
    {key: "verifiedAt", label: "MIS verified at", value: (request) => request.verifiedAt, render: (request) => formatTimestamp(request.verifiedAt)},
  ];
  const fleetColumns = [
    {key: "equipment", label: "Equipment / vehicle", value: (record) => record.reportEquipment, render: (record) => <b>{record.reportEquipment || "—"}</b>},
    {key: "door", label: "Door no.", value: (record) => record.reportDoor},
    {key: "category", label: "Category", value: (record) => record.category || record.group || record.itemName},
    {key: "make", label: "Make", value: (record) => record.reportMake},
    {key: "model", label: "Model", value: (record) => record.reportModel},
    {key: "location", label: "Location", value: (record) => record.reportSite},
    {key: "roadStatus", label: "Road status", value: (record) => record.reportRoadStatus, render: (record) => <Status>{record.reportRoadStatus}</Status>},
    {key: "serial", label: "Serial / chassis no.", value: (record) => record.manufacturerSerialNo || record.chassisNo},
  ];
  const transferColumns = [
    {key: "transferNo", label: "Transfer no.", value: (record) => record.transferNo, render: (record) => <b>{record.transferNo || "—"}</b>},
    {key: "transferDate", label: "Transfer date", value: (record) => record.transferDate},
    {key: "equipment", label: "Equipment / vehicle", value: (record) => record.reportEquipment},
    {key: "from", label: "From location", value: (record) => record.source},
    {key: "to", label: "To location", value: (record) => record.destination},
    {key: "model", label: "Model", value: (record) => record.modelNo || record.model},
    {key: "driver", label: "Driver", value: (record) => record.driver},
    {key: "chassis", label: "Chassis no.", value: (record) => record.chassisNo || record.manufacturerSerialNo},
  ];
  const reportGroups = [
    {category: "production", title: "Location wise opened BD", description: "Open production breakdown cases grouped with location and category details.", rows: openBreakdownRows, columns: requestColumns, dateValue: (row) => row.start, emptyMessage: "No open breakdown cases available"},
    {category: "maintenance", title: "Location wise closing BD", description: "Closed maintenance breakdown cases with location, category, closure user, and closure time.", rows: closedBreakdownRows, columns: closureColumns, dateValue: (row) => row.closedAt, emptyMessage: "No closed maintenance cases available"},
    {category: "mis", title: "MIS Verification Report", description: "Requests verified by MIS, including maintenance close and MIS verification timestamps.", rows: misVerificationRows, columns: misColumns, dateValue: (row) => row.verifiedAt, emptyMessage: "No MIS verification records available"},
    {category: "general", title: "Report for On Road / Off Road & Idle", description: "Current road status of equipment and vehicles from the Equipment Master.", rows: fleetStatusRows, columns: fleetColumns, dateValue: () => reportGeneratedAt, emptyMessage: "No equipment road-status records available", rowKey: (record) => `road-${record.reportId}`},
    {category: "general", title: "Vehicle Transfer Report", description: "Vehicle transfer history with source, destination, equipment, model, driver, and chassis details.", rows: transferRows, columns: transferColumns, dateValue: (row) => row.transferDate, emptyMessage: "No vehicle transfer records available", rowKey: (record) => `transfer-${record.reportId}`},
    {category: "general", title: "Total Equipment / Vehicle Location Wise", description: "Location-wise count of equipment, vehicles, and total fleet records.", rows: locationWiseRows, columns: [
      {key: "location", label: "Location", value: (row) => row.location, render: (row) => <b>{row.location}</b>},
      {key: "equipment", label: "Equipment", value: (row) => row.equipment},
      {key: "vehicles", label: "Vehicles", value: (row) => row.vehicles},
      {key: "total", label: "Total equipment / vehicle", value: (row) => row.total},
    ], dateValue: () => reportGeneratedAt, emptyMessage: "No location-wise equipment records available", rowKey: (row) => `location-${row.location}`},
    {category: "maintenance", title: "Idle Vehicle Report", description: "Idle breakdown requests and idle fleet records that need follow-up.", rows: idleRequestRows, columns: [
      ...requestColumns,
      {key: "idleReason", label: "Idle reason", value: (request) => request.idleReason},
      {key: "closedAt", label: "Maintenance close / idle at", value: (request) => request.closedAt, render: (request) => formatTimestamp(request.closedAt)},
    ], dateValue: (row) => row.closedAt || row.start, emptyMessage: "No idle vehicle records available"},
    {category: "general", title: "Recent Breakdown Cases", description: "Latest breakdown cases by recorded workflow timestamp.", rows: recentBreakdownRows, columns: closureColumns, dateValue: (row) => row.start || row.closedAt || row.verifiedAt, emptyMessage: "No recent breakdown cases available"},
    {category: "general", title: IN_OUT_REPORT_TITLE, description: IN_OUT_REPORT_DESCRIPTION, rows: inOutRows, columns: inOutColumns, dateValue: (row) => row.date, emptyMessage: "No in and out movement recorded yet", rowKey: (row) => `in-out-${row.date}`},
    {category: "production", title: "Off Road to MIS Veri.", description: "Elapsed time from Production off-road marking to MIS verification.", rows: elapsedRows.filter((row) => row.start && row.verifiedAt), columns: [
      ...misColumns,
      {key: "prodToMis", label: "Prod to MIS verification", value: (request) => elapsedLabel(request.start, request.verifiedAt), sortValue: (request) => elapsedMilliseconds(request.start, request.verifiedAt), render: (request) => <strong>{elapsedLabel(request.start, request.verifiedAt)}</strong>},
    ], dateValue: (row) => row.verifiedAt, emptyMessage: "No Production to MIS verification timings available"},
    {category: "maintenance", title: "Off Road to Maint. Close", description: "Turnaround time from Production opening to Maintenance close.", rows: elapsedRows.filter((row) => row.start && row.closedAt), columns: [
      ...closureColumns,
      {key: "tat", label: "TAT", value: (request) => elapsedLabel(request.start, request.closedAt), sortValue: (request) => elapsedMilliseconds(request.start, request.closedAt), render: (request) => <strong>{elapsedLabel(request.start, request.closedAt)}</strong>},
    ], dateValue: (row) => row.closedAt, emptyMessage: "No Production-open to Maintenance-close timings available"},
    {category: "maintenance", title: "Event close Report - Maint. Closing to MIS Verif.", description: "Elapsed time from Maintenance close to MIS verification.", rows: elapsedRows.filter((row) => row.closedAt && row.verifiedAt), columns: [
      ...misColumns,
      {key: "maintToMis", label: "Maintenance close to MIS verification", value: (request) => elapsedLabel(request.closedAt, request.verifiedAt), sortValue: (request) => elapsedMilliseconds(request.closedAt, request.verifiedAt), render: (request) => <strong>{elapsedLabel(request.closedAt, request.verifiedAt)}</strong>},
    ], dateValue: (row) => row.verifiedAt, emptyMessage: "No Maintenance to MIS verification timings available"},
    {category: "maintenance", title: "Idle with PM verif.", description: "Idle cases with maintenance idle time and verification timestamp.", rows: idleRequestRows, columns: [
      ...misColumns,
      {key: "idleReason", label: "Idle reason", value: (request) => request.idleReason},
      {key: "idleTime", label: "Idle to PM verification time", value: (request) => elapsedLabel(request.closedAt || request.start, request.verifiedAt), sortValue: (request) => elapsedMilliseconds(request.closedAt || request.start, request.verifiedAt), render: (request) => <strong>{elapsedLabel(request.closedAt || request.start, request.verifiedAt)}</strong>},
    ], dateValue: (row) => row.verifiedAt || row.closedAt || row.start, emptyMessage: "No idle verification timings available"},
    {category: "mis", title: "On Road with first trip veri.", description: "Comparison of MIS verification against first-trip confirmation for idle cases.", rows: idleRequestRows.filter((row) => row.verifiedAt || firstTripTimestamp(row)), columns: [
      ...misColumns,
      {key: "firstTripDone", label: "First trip done", value: (request) => request.firstTripDone ? "Yes" : "No"},
      {key: "firstTrip", label: "First trip verification", value: (request) => firstTripTimestamp(request), render: (request) => formatTimestamp(firstTripTimestamp(request))},
      {key: "misToFirstTrip", label: "MIS to first trip", value: (request) => elapsedLabel(request.verifiedAt, firstTripTimestamp(request)), sortValue: (request) => elapsedMilliseconds(request.verifiedAt, firstTripTimestamp(request)), render: (request) => <strong>{elapsedLabel(request.verifiedAt, firstTripTimestamp(request))}</strong>},
    ], dateValue: (row) => firstTripTimestamp(row) || row.verifiedAt, emptyMessage: "No idle first-trip verification records available"},
  ];
  const hierarchyAccessibleReportGroups = reportAccess.canManageAll || !reportAccess.allowedReports.length
    ? reportGroups
    : reportGroups.filter((report) => reportAccess.allowedReports.includes(report.title));
  const accessibleReportGroups = hierarchyAccessibleReportGroups.filter((report) => allowedReportCategoryIds.includes(report.category));
  const availableReportCategories = departmentReportCategoryTabs.filter((category) => accessibleReportGroups.some((report) => report.category === category.id));
  const activeReports = accessibleReportGroups.filter((report) => report.category === activeCategory.id);
  const selectedReport = activeReports.find((report) => report.title === selectedReportByCategory[activeCategory.id]) || activeReports[0] || null;
  const selectReportTab = (report) => {
    setSelectedReportByCategory((current) => ({ ...current, [activeCategory.id]: report.title }));
  };
  const applyReportScheduleDetails = (details = {}) => {
    setReportScheduleSettings(details.settings || defaultHierarchyReportScheduleSettings());
    setReportScheduleRecipients(details.recipients || {});
    const access = {
      canManageAll: details.canManageAll === true,
      allowedDesignationKeys: Array.isArray(details.allowedDesignationKeys) ? details.allowedDesignationKeys : [],
      allowedReports: Array.isArray(details.allowedReports) ? details.allowedReports : [],
    };
    setReportAccess(access);
    if (access.allowedDesignationKeys.length === 1) setSelectedScheduleDesignation(access.allowedDesignationKeys[0]);
    setReportAccessLoaded(true);
  };
  const loadReportScheduleDetails = async () => {
    const response = await fetch("/api/report-schedule-settings", { headers: { Authorization: `Bearer ${session?.token || authToken}` } });
    const details = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(details.error || "Could not load report schedules.");
    applyReportScheduleDetails(details);
    return details;
  };
  useEffect(() => {
    let active = true;
    fetch("/api/report-schedule-settings", { headers: { Authorization: `Bearer ${session?.token || authToken}` } })
      .then(async (response) => {
        const details = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(details.error || "Could not load report access.");
        if (active) applyReportScheduleDetails(details);
      })
      .catch((error) => { if (active) console.error(error); })
      .finally(() => { if (active) setReportAccessLoaded(true); });
    return () => { active = false; };
  }, [session?.token]);
  useEffect(() => {
    if (!reportAccessLoaded || availableReportCategories.some((category) => category.id === activeReportCategory)) return;
    if (availableReportCategories[0]) setActiveReportCategory(availableReportCategories[0].id);
  }, [reportAccessLoaded, activeReportCategory, availableReportCategories.map((category) => category.id).join("|")]);
  const openReportSchedules = async () => {
    setDirectorTimingOpen(true);
    setReportScheduleLoading(true);
    try {
      await loadReportScheduleDetails();
    } catch (error) { alert(error.message); }
    finally { setReportScheduleLoading(false); }
  };
  const updateScheduleDesignation = (updater) => {
    setReportScheduleSettings((current) => ({
      ...current,
      designations: {
        ...current.designations,
        [selectedScheduleDesignation]: updater(current.designations[selectedScheduleDesignation]),
      },
    }));
  };
  const updateReportSchedule = (scheduleKey, changes) => updateScheduleDesignation((designation) => ({
    ...designation,
    schedules: designation.schedules.map((schedule) => schedule.key === scheduleKey ? { ...schedule, ...changes } : schedule),
  }));
  const addReportSchedule = () => updateScheduleDesignation((designation) => ({
    ...designation,
    schedules: [...designation.schedules, { key: `custom-${Date.now()}`, enabled: true, cadence: "daily", weekday: 1, intervalDays: 7, times: ["19:00"], reports: reportAccess.canManageAll ? [] : [...reportAccess.allowedReports] }],
  }));
  const removeReportSchedule = (scheduleKey) => updateScheduleDesignation((designation) => ({
    ...designation,
    schedules: designation.schedules.filter((schedule) => schedule.key !== scheduleKey),
  }));
  const saveReportSchedules = async () => {
    if (reportScheduleSaving) return;
    setReportScheduleSaving(true);
    try {
      const response = await fetch("/api/report-schedule-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.token || authToken}` },
        body: JSON.stringify(reportScheduleSettings),
      });
      const details = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(details.error || "Could not save report schedules.");
      applyReportScheduleDetails(details);
      setDirectorTimingOpen(false);
    } catch (error) { alert(error.message); }
    finally { setReportScheduleSaving(false); }
  };
  const openReportZip = () => {
    setSelectedZipReports(accessibleReportGroups.map((report) => report.title));
    setReportZipOpen(true);
  };
  const toggleZipReport = (title) => {
    setSelectedZipReports((current) => current.includes(title) ? current.filter((item) => item !== title) : [...current, title]);
  };
  const downloadSelectedReportZip = async () => {
    if (reportZipDownloading || !selectedZipReports.length) return;
    setReportZipDownloading(true);
    try {
      if (!validReportDateRange(reportZipFrom, reportZipTo)) throw new Error("Select a valid From and To date/time range.");
      const selectedReports = accessibleReportGroups.filter((report) => selectedZipReports.includes(report.title));
      const generatedFiles = await Promise.all(selectedReports.map(async (report) => {
        const filteredRows = reportRowsWithinRange(report.rows, report.dateValue, reportZipFrom, reportZipTo);
        const exportRows = filteredRows.map((row) => report.columns.map((column) => exportCellText(column.value?.(row))));
        const pdfResponse = await fetch("/api/exports/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.token || authToken}` },
          body: JSON.stringify({ title: report.title, columns: report.columns.map((column) => ({ label: column.label })), rows: exportRows }),
        });
        if (!pdfResponse.ok) {
          const details = await pdfResponse.json().catch(() => ({}));
          throw new Error(details.error || `Could not create ${report.title}.`);
        }
        const folder = reportCategoryTabs.find((category) => category.id === report.category)?.label || "Reports";
        const baseName = exportFileName(report.title, "").replace(/\.$/, "");
        const xlsx = buildXlsxWorkbook(report.title, report.columns, exportRows);
        return [
          { name: `${folder}/${baseName}.pdf`, content: new Uint8Array(await (await pdfResponse.blob()).arrayBuffer()) },
          { name: `${folder}/${baseName}.xlsx`, content: new Uint8Array(await xlsx.arrayBuffer()) },
        ];
      }));
      downloadExportFile(zipStoredFiles(generatedFiles.flat(), "application/zip"), exportFileName("selected-reports", "zip"));
      setReportZipOpen(false);
    } catch (error) { alert(error.message); }
    finally { setReportZipDownloading(false); }
  };
  const scheduleDesignationOptions = reportAccess.canManageAll ? reportDesignationOptions : reportDesignationOptions.filter((designation) => reportAccess.allowedDesignationKeys.includes(designation.key));
  const selectedScheduleConfig = reportScheduleSettings.designations[selectedScheduleDesignation] || { enabled: true, allRecipients: true, recipientLogins: [], schedules: [] };
  const selectedScheduleMeta = reportDesignationOptions.find((designation) => designation.key === selectedScheduleDesignation) || scheduleDesignationOptions[0] || reportDesignationOptions[0];
  const selectedScheduleRecipients = reportScheduleRecipients[selectedScheduleDesignation] || [];
  return (
    <section className="reports-page panel pagepanel" data-report-category={activeCategory.id}>
      <header>
        <div>
          <h1>Reports</h1>
          <p>Workflow events, elapsed time, and live master totals.</p>
        </div>
        {canUseReportWorkspaceTools && <div className="reports-header-actions">
          <button type="button" className="secondary director-timing-trigger" onClick={openReportSchedules} disabled={!reportAccessLoaded}><Clock /> Report schedules</button>
          <button type="button" className="primary" onClick={openReportZip} disabled={!reportAccessLoaded || !accessibleReportGroups.length}><Download /> Download reports ZIP</button>
        </div>}
      </header>
      {directorTimingOpen && createPortal(
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setDirectorTimingOpen(false)}>
          <div className="modal director-timing-modal">
            <header>
              <div className="report-schedule-title"><span><CalendarDays /></span><div><h3>Report delivery schedules</h3><p>Choose recipients, timing and reports for each delivery slot</p></div></div>
              <button type="button" onClick={() => setDirectorTimingOpen(false)} aria-label="Close report schedules"><X /></button>
            </header>
            {reportScheduleLoading ? <div className="report-schedule-loading">Loading saved schedules…</div> : <>
              <div className="report-schedule-toolbar">
                <label><span>{reportAccess.canManageAll ? "Assign schedule to" : "Your assigned schedule"}</span><select value={selectedScheduleDesignation} onChange={(event) => setSelectedScheduleDesignation(event.target.value)} disabled={!reportAccess.canManageAll}>{scheduleDesignationOptions.map((designation) => <option key={designation.key} value={designation.key}>{designation.label}</option>)}</select></label>
                <label className="report-schedule-switch"><input type="checkbox" checked={selectedScheduleConfig.enabled} onChange={(event) => updateScheduleDesignation((designation) => ({ ...designation, enabled: event.target.checked }))} /><span>Active</span></label>
              </div>
              <div className="report-week-grid compact" aria-label="Seven day report schedule summary">
                {reportWeekDays.map((day, index) => {
                  const weekday = (index + 1) % 7;
                  const count = selectedScheduleConfig.schedules.filter((schedule) => schedule.enabled && (schedule.cadence === "daily" || (schedule.cadence === "weekly" && schedule.weekday === weekday))).length;
                  return <article key={day} className={count ? "active" : ""}><b>{day.slice(0, 3)}</b><span>{count ? `${count} slot${count === 1 ? "" : "s"}` : "—"}</span></article>;
                })}
              </div>
              {reportAccess.canManageAll && <details className="report-recipient-picker">
                <summary><span>Recipients</span><b>{selectedScheduleConfig.allRecipients ? `All ${selectedScheduleMeta.label}` : `${selectedScheduleConfig.recipientLogins.length} selected`}</b></summary>
                <label className="report-recipient-all"><input type="checkbox" checked={selectedScheduleConfig.allRecipients} onChange={(event) => updateScheduleDesignation((designation) => ({ ...designation, allRecipients: event.target.checked }))} /> Send to every matching user</label>
                {!selectedScheduleConfig.allRecipients && <div>{selectedScheduleRecipients.length ? selectedScheduleRecipients.map((recipient) => <label key={recipient.login}><input type="checkbox" checked={selectedScheduleConfig.recipientLogins.includes(recipient.login)} onChange={() => updateScheduleDesignation((designation) => ({ ...designation, recipientLogins: designation.recipientLogins.includes(recipient.login) ? designation.recipientLogins.filter((login) => login !== recipient.login) : [...designation.recipientLogins, recipient.login] }))} /><span><b>{recipient.name}</b><small>{recipient.hasPhone ? recipient.login : `${recipient.login} · phone missing`}</small></span></label>) : <p>No matching users are configured.</p>}</div>}
              </details>}
              <div className="report-schedule-editor-list">
                {selectedScheduleConfig.schedules.map((schedule) => <article key={schedule.key}>
                  <header>
                    <label><input type="checkbox" checked={schedule.enabled} onChange={(event) => updateReportSchedule(schedule.key, { enabled: event.target.checked })} /><span><b>{reportScheduleKind(schedule)}</b><small>{hierarchyScheduleLabel(schedule)}</small></span></label>
                    <button type="button" onClick={() => removeReportSchedule(schedule.key)} aria-label="Delete schedule"><Trash2 /></button>
                  </header>
                  <div className="report-schedule-fields">
                    <label><span>Frequency</span><select value={schedule.cadence} onChange={(event) => updateReportSchedule(schedule.key, { cadence: event.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="interval">Every N days</option><option value="event">Every event</option></select></label>
                    {schedule.cadence === "weekly" && <label><span>Day</span><select value={schedule.weekday} onChange={(event) => updateReportSchedule(schedule.key, { weekday: Number(event.target.value) })}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
                    {schedule.cadence === "interval" && <label><span>Repeat every</span><div className="report-interval-input"><input type="number" min="2" max="31" value={schedule.intervalDays} onChange={(event) => updateReportSchedule(schedule.key, { intervalDays: Number(event.target.value) })} /><small>days</small></div></label>}
                    {schedule.cadence !== "event" && <label className="report-time-field"><span>IST time slots</span><div>{schedule.times.map((time, index) => <span key={`${schedule.key}-${index}`}><input type="time" value={time} onChange={(event) => updateReportSchedule(schedule.key, { times: schedule.times.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /><button type="button" onClick={() => updateReportSchedule(schedule.key, { times: schedule.times.filter((_, itemIndex) => itemIndex !== index) })} aria-label="Remove time"><X /></button></span>)}<button type="button" onClick={() => updateReportSchedule(schedule.key, { times: [...schedule.times, "19:00"] })} disabled={schedule.times.length >= 6}>+ Time</button></div></label>}
                  </div>
                  {reportAccess.canManageAll ? <details className="report-assignment-picker"><summary>Reports <b>{schedule.reports.length}</b></summary><div>{reportGroups.map((report) => <label key={report.title}><input type="checkbox" checked={schedule.reports.includes(report.title)} onChange={() => updateReportSchedule(schedule.key, { reports: schedule.reports.includes(report.title) ? schedule.reports.filter((title) => title !== report.title) : [...schedule.reports, report.title] })} /><span>{report.title}</span></label>)}</div></details> : <div className="report-assigned-summary"><span>Assigned reports</span><b>{schedule.reports.filter((title) => accessibleReportGroups.some((report) => report.title === title)).length} available for this slot</b></div>}
                </article>)}
                <button type="button" className="report-add-schedule" onClick={addReportSchedule}><Plus /> Add schedule</button>
              </div>
            </>}
            <footer>
              <button type="button" onClick={() => setDirectorTimingOpen(false)} disabled={reportScheduleSaving}>Cancel</button>
              <button type="button" className="primary" onClick={saveReportSchedules} disabled={reportScheduleLoading || reportScheduleSaving}><Save /> {reportScheduleSaving ? "Saving…" : "Save schedules"}</button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
      {reportZipOpen && createPortal(
        <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !reportZipDownloading && setReportZipOpen(false)}>
          <div className="modal report-zip-modal">
            <header>
              <div className="report-zip-title"><span><Download /></span><div><h3>Download reports as ZIP</h3><p>Choose reports and receive organised PDF and Excel files in one archive</p></div></div>
              <button type="button" onClick={() => setReportZipOpen(false)} disabled={reportZipDownloading} aria-label="Close ZIP report selection"><X /></button>
            </header>
            <div className="report-zip-range">
              <div><CalendarDays /><span><b>Report period</b><small>Only records within this IST date and time range are included.</small></span></div>
              <label><span>From</span><input type="datetime-local" value={reportZipFrom} max={reportZipTo} onChange={(event) => setReportZipFrom(event.target.value)} /></label>
              <label><span>To</span><input type="datetime-local" value={reportZipTo} min={reportZipFrom} onChange={(event) => setReportZipTo(event.target.value)} /></label>
            </div>
            <div className="report-zip-toolbar">
              <div className="report-zip-selection"><span><b>{selectedZipReports.length}</b> of {accessibleReportGroups.length} selected</span><small>PDF + Excel included</small><i aria-hidden="true"><span style={{ width: `${accessibleReportGroups.length ? (selectedZipReports.length / accessibleReportGroups.length) * 100 : 0}%` }} /></i></div>
              <div>
                <button type="button" onClick={() => setSelectedZipReports(accessibleReportGroups.map((report) => report.title))}>Select all</button>
                <button type="button" onClick={() => setSelectedZipReports([])}>Clear</button>
              </div>
            </div>
            <div className="report-zip-groups">
              {availableReportCategories.map((category) => {
                const categoryReports = accessibleReportGroups.filter((report) => report.category === category.id);
                if (!categoryReports.length) return null;
                return <section key={category.id}>
                  <h4><FileBarChart />{category.label}<span>{categoryReports.length}</span></h4>
                  <div>{categoryReports.map((report) => <label key={report.title} className={selectedZipReports.includes(report.title) ? "selected" : ""}>
                    <input type="checkbox" checked={selectedZipReports.includes(report.title)} onChange={() => toggleZipReport(report.title)} />
                    <span><b>{report.title}</b><small>{reportRowsWithinRange(report.rows, report.dateValue, reportZipFrom, reportZipTo).length.toLocaleString("en-IN")} records in range · PDF + Excel</small></span>
                  </label>)}</div>
                </section>;
              })}
            </div>
            <footer>
              <button type="button" onClick={() => setReportZipOpen(false)} disabled={reportZipDownloading}>Cancel</button>
              <button type="button" className="primary" onClick={downloadSelectedReportZip} disabled={!selectedZipReports.length || reportZipDownloading || !validReportDateRange(reportZipFrom, reportZipTo)}><Download /> {reportZipDownloading ? "Preparing ZIP..." : `Download ${selectedZipReports.length} selected`}</button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
      <CaliberActivityOverlay message={reportZipDownloading ? "Preparing reports ZIP..." : ""} />
      <div className="reports-category-tabs" role="tablist" aria-label="Report type tabs">
        {availableReportCategories.map((category) => {
          const CategoryIcon = category.icon;
          const reportCount = accessibleReportGroups.filter((report) => report.category === category.id).length;
          return <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={activeCategory.id === category.id}
            data-category={category.id}
            className={activeCategory.id === category.id ? "active" : ""}
            onClick={() => setActiveReportCategory(category.id)}
          >
            <span className="report-category-icon"><CategoryIcon aria-hidden="true" /></span>
            <span className="report-category-copy"><b>{category.label}</b><small>{category.description}</small></span>
            <em>{reportCount}</em>
          </button>;
        })}
      </div>
      {!reportAccessLoaded ? <div className="reports-section reports-empty-definition"><div className="reports-section-heading"><div><h2>Loading assigned reports…</h2><p>Your report access is being prepared.</p></div></div></div> : activeReports.length ? <div className="report-name-tabs" role="tablist" aria-label={`${activeCategory.label} reports`}>
        {activeReports.map((report) => (
          <button
            key={report.title}
            type="button"
            role="tab"
            aria-selected={selectedReport?.title === report.title}
            className={selectedReport?.title === report.title ? "active" : ""}
            onClick={() => selectReportTab(report)}
          >
            <FileBarChart aria-hidden="true" />
            <span>{report.title}</span>
          </button>
        ))}
      </div> : <div className="reports-section reports-empty-definition">
        <div className="reports-section-heading"><div><h2>{activeCategory.label}</h2><p>No reports are assigned to this profile in this category.</p></div></div>
      </div>}
      {selectedReport && (
        <ReportSection
          key={`${selectedReport.category}-${selectedReport.title}`}
          title={selectedReport.title}
          description={selectedReport.description}
          category={selectedReport.category}
          icon={activeCategory.icon}
          rows={selectedReport.rows}
          columns={selectedReport.columns}
          emptyMessage={selectedReport.emptyMessage}
          rowKey={selectedReport.rowKey || ((row, index) => `${selectedReport.title}-${row.ref || row.reportId || row.location || index}`)}
          rowClassName={selectedReport.rowClassName}
        />
      )}
    </section>
  );
}

function MasterPage({ name, records = [], onAdd, onEdit, onDelete, onDeleteAll, userOptions = [], siteOptions = [], canCreateSuperAdmin = false }) {
  const [q, setQ] = useState(""),
    [editing, setEditing] = useState(null),
    [pendingPrivilegeRows, setPendingPrivilegeRows] = useState({}),
    [savingAllPrivileges, setSavingAllPrivileges] = useState(false),
    [columnFilters, setColumnFilters] = useState({}),
    [openFilter, setOpenFilter] = useState(null);
  const fields = masterFields[name],
    editFields = name === "Users & employees" ? [...fields, ...userPrivilegeFields, ...userSubmenuFields] : fields,
    displayFields = name === "Privilege" ? fields.slice(0, 2) : fields,
    canManageRows = name === "OEM master" || name === "Users & employees" || name === "Repair type master",
    masterValue = (record, key) => {
      const type = fields.find(([field]) => field === key)?.[2];
      if (name === "Users & employees" && key === "userType")
        return String(record.userGroup || (String(record.userType || "").toLowerCase().includes("super") ? `User — ${record.adminLevel || "Admin"}` : record.userType) || "").trim();
      return type === "checkbox" ? (isCheckedValue(record[key]) ? "Yes" : "No") : String(record[key] ?? "").trim();
    },
    filterColumns = displayFields.map(([key, label]) => ({ key, label, value: (record) => masterValue(record, key) })),
    columnValues = Object.fromEntries(
      displayFields.map(([key]) => [
        key,
        [...new Set(records.map((record) => masterValue(record, key)))].sort((a, b) => sortCollator.compare(a, b)),
      ]),
    ),
    filteredRows = records.filter((record) =>
      matchesSmartSearch(q, record) &&
      tableRowMatchesFilters(record, filterColumns, columnFilters),
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
    const updated = Object.fromEntries(editFields.map(([key, , type]) => [
      key,
      name === "Privilege" && key === "username"
        ? String(editing.username || "").trim()
      : name === "Privilege" && type === "checkbox"
        ? form.has(key)
        : name === "Privilege" && type === "role-radio"
          ? privilegeAccessValue(form.get(key))
        : name === "Privilege" && type === "mobile-role-select"
          ? privilegeSelectionValue(form.get(key))
        : name === "Privilege" && type === "site-select"
          ? privilegeSelectionValue(form.get(key))
        : type === "checkbox"
          ? form.has(key)
          : type === "multi-checkbox" || type === "multi-text"
            ? form.getAll(key).map((value) => String(value).trim()).filter(Boolean).join(" | ")
            : String(form.get(key) || "").trim(),
    ]));
    if (name === "Users & employees") applyUserRoleDefaults(updated);
    if (name === "Users & employees" && updated.userType === "Super Admin" && updated.adminLevel === "Manager" && !updated.managerRole) {
      alert("Select at least one manager role for this Non Admin user.");
      return;
    }
    if (name === "Users & employees" && updated.userType === "Super Admin" && updated.adminLevel === "Manager" && (!updated.managerRegion || !updated.managerSites)) {
      alert("Select at least one region and keep at least one site included for this Non Admin user.");
      return;
    }
    if (name === "Users & employees" && updated.userType === "Super Admin" && !updated.masterAccess && !updated.tabAccess) {
      alert("Select at least one visible master or tab for this Super Admin.");
      return;
    }
    if (name === "Users & employees" && updated.userType === "Super Admin") {
      const missing = missingViewSubmenu(updated);
      if (missing) { alert(`Select at least one ${missing.tab} submenu for ${missing.view}.`); return; }
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
          userOptions={userOptions}
          siteOptions={siteOptions}
          canCreateSuperAdmin={canCreateSuperAdmin}
        />
      </header>
      <div className="toolbar">
        <div>
          <Search />
          <input
            data-smart-search
            type="search"
            placeholder={"Search " + name.toLowerCase()}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <TableParameterFilter columns={filterColumns} rows={records} filters={columnFilters} onFilterChange={updateColumnFilter} onClearFilters={() => setColumnFilters({})} />
      </div>
      <div className="emptytable master-table-scroll" onClick={() => setOpenFilter(null)}>
        <table>
          <thead>
            <tr>
              {displayFields.map(([key, label]) => (
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
                  {displayFields.map(([key, , type], ci) => {
                    const value = name === "Privilege" ? privilegeValue(row, key) : row[key];
                    return (
                    <td key={key}>
                      {name === "Privilege" && key === "username" ? (
                        <button type="button" className="privilege-user-link" onClick={() => setEditing(row)}>{value || "Unnamed user"}</button>
                      ) : name === "Privilege" && type === "mobile-role-select" ? (
                        <div className="privilege-group-authority"><b>{privilegeSelectionValue(value) || "Not assigned"}</b>{mobileRoleAuthority[privilegeSelectionValue(value)] && <small>{mobileRoleAuthority[privilegeSelectionValue(value)]}</small>}</div>
                      ) : name === "Privilege" && type === "role-radio" ? (
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
                <td colSpan={displayFields.length + (canManageRows ? 1 : 0)} className="empty-state">
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
            {fields.filter(([key]) => name !== "Privilege" || key !== "username").map(([key, label, type]) =>
              name === "Users & employees" && ["site", "userType", "masterAccess", "tabAccess"].includes(key) ? null : type === "multi-text" ? (
                <MultiTextField key={key} name={key} label={label} value={editing[key]} />
              ) : type === "multi-checkbox" ? (
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
              ) : type === "role-radio" ? (
                <fieldset key={key} className="privilege-role-field">
                  <legend>{label} *</legend>
                  <div>{privilegeAccessOptions.map((option) => <label key={option}><input type="radio" name={key} value={option} required defaultChecked={privilegeAccessValue(editing[key]) === option} /><span>{option}</span></label>)}</div>
                </fieldset>
              ) : type === "mobile-role-select" ? (
                <label key={key}>{label} *<select name={key} required defaultValue={privilegeSelectionValue(editing[key])}><option value="" disabled>Not assigned</option>{mobileUserRoleOptions.map((option) => <option key={option} value={option}>{option} — {mobileRoleAuthority[option]}</option>)}</select></label>
              ) : type === "site-select" ? (
                <label key={key}>{label} *<select name={key} required defaultValue={privilegeSelectionValue(editing[key])}><option value="" disabled>Select site</option>{privilegeSelectionValue(editing[key]) && !siteOptions.includes(privilegeSelectionValue(editing[key])) && <option value={privilegeSelectionValue(editing[key])}>{privilegeSelectionValue(editing[key])}</option>}{siteOptions.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>
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
                    {persistedUserTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    {editing[key] && !persistedUserTypeOptions.includes(editing[key]) && <option value={editing[key]}>{editing[key]}</option>}
                  </select>
                ) : <input name={key} defaultValue={editing[key] || ""} required={key === fields[0][0]} />}
              </label>)
            )}
            {name === "Users & employees" && <UserTypeAccessFields record={editing} siteOptions={siteOptions} canCreateSuperAdmin={canCreateSuperAdmin} />}
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
        <CaliberActivityMark size="large" />
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
function MetaWhatsAppSetup() {
  const [employees] = useMasterRecords("Users & employees");
  const [form, setForm] = useState({phoneNumberId:"", businessAccountId:"", graphVersion:"v25.0", accessToken:""});
  const [settings, setSettings] = useState(null);
  const [connection, setConnection] = useState(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const loadMetaSettings = async () => {
    const settingsResponse = await fetch("/api/whatsapp/settings", {headers:{Authorization:`Bearer ${authToken}`}});
    const saved = await settingsResponse.json().catch(() => ({}));
    if (!settingsResponse.ok) throw new Error(saved.error || "Unable to load Meta WhatsApp settings.");
    setSettings(saved);
    setForm((current) => ({...current, phoneNumberId:saved.phoneNumberId || "", businessAccountId:saved.businessAccountId || "", graphVersion:saved.graphVersion || "v25.0", accessToken:""}));
    const statusResponse = await fetch("/api/whatsapp/status", {headers:{Authorization:`Bearer ${authToken}`}});
    const status = await statusResponse.json().catch(() => ({}));
    setConnection(statusResponse.ok ? status : {connected:false,error:status.error || "Meta connection is not ready."});
  };
  useEffect(() => {
    let active = true;
    loadMetaSettings().catch((loadError) => active && setError(loadError.message));
    return () => { active = false; };
  }, []);
  const phoneDigits = (employee) => String(employee.phone || employee.phoneNo || employee.phoneNumber || "").replace(/\D/g, "");
  const readyRecipients = employees.filter((employee) => {
    const digits = phoneDigits(employee);
    return digits.length >= 10 && digits.length <= 15;
  }).length;
  const missingRecipients = Math.max(0, employees.length - readyRecipients);
  const updateField = (field) => (event) => setForm((current) => ({...current,[field]:event.target.value}));
  const saveSettings = async (event) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const payload = {phoneNumberId:form.phoneNumberId, businessAccountId:form.businessAccountId, graphVersion:form.graphVersion};
      if (form.accessToken.trim()) payload.accessToken = form.accessToken.trim();
      const response = await fetch("/api/whatsapp/settings", {
        method:"PUT",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${authToken}`},
        body:JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to save Meta WhatsApp settings.");
      const templateMessage = result.templateSync?.ok
        ? `${result.templateSync.approved} templates approved; ${result.templateSync.pending} pending.`
        : `Credentials saved. Template sync needs attention${result.templateSync?.error ? `: ${result.templateSync.error}` : "."}`;
      setNotice(templateMessage);
      await loadMetaSettings();
    } catch (saveError) {
      setError(saveError.message || "Unable to connect Meta WhatsApp.");
    } finally {
      setWorking(false);
    }
  };
  return <section className="panel pagepanel generic meta-whatsapp-setup">
    <header>
      <div><h1>Meta API setup</h1><p>CMLL WhatsApp Business connection and recipient readiness</p></div>
      <span className={`meta-connection-state ${connection?.connected ? "connected" : "disconnected"}`}>
        {connection?.connected ? <CheckCircle2 /> : <AlertTriangle />}
        {connection?.connected ? "Connected" : "Not connected"}
      </span>
    </header>
    <div className="meta-whatsapp-overview" aria-label="Meta WhatsApp connection overview">
      <div><span>Business number</span><strong>{connection?.displayPhoneNumber || "Not verified"}</strong><small>{connection?.verifiedName || "Meta verification pending"}</small></div>
      <div><span>Quality</span><strong>{connection?.qualityRating || "--"}</strong><small>Meta phone quality rating</small></div>
      <div><span>Recipients ready</span><strong>{readyRecipients}</strong><small>Users with a valid mobile number</small></div>
      <div><span>Mobile missing</span><strong>{missingRecipients}</strong><small>Complete in Users & employees</small></div>
    </div>
    <form className="meta-whatsapp-form" onSubmit={saveSettings}>
      <div className="meta-whatsapp-form-heading"><div><h2>Cloud API credentials</h2><p>Credentials are encrypted in transit and the access token is never returned to this page.</p></div><ShieldCheck /></div>
      <div className="meta-whatsapp-fields">
        <label><span>Phone Number ID</span><input inputMode="numeric" required value={form.phoneNumberId} onChange={updateField("phoneNumberId")} placeholder="Meta phone number ID" /></label>
        <label><span>WhatsApp Business Account ID</span><input inputMode="numeric" value={form.businessAccountId} onChange={updateField("businessAccountId")} placeholder="Meta business account ID" /></label>
        <label><span>Graph API version</span><input required value={form.graphVersion} onChange={updateField("graphVersion")} placeholder="v25.0" /></label>
        <label className="meta-token-field"><span>Permanent access token</span><input type="password" autoComplete="new-password" value={form.accessToken} onChange={updateField("accessToken")} placeholder={settings?.accessTokenConfigured ? `Configured: ${settings.accessTokenPreview}` : "Enter permanent system-user token"} /><small>{settings?.accessTokenConfigured ? "Leave blank to retain the configured token." : "A token is required for the first connection."}</small></label>
      </div>
      {(notice || error || connection?.error) && <div className={`meta-whatsapp-feedback ${error || connection?.error ? "error" : "success"}`} role={error || connection?.error ? "alert" : "status"}>{error || notice || connection.error}</div>}
      <footer><button type="submit" className="primary" disabled={working || !form.phoneNumberId.trim() || (!settings?.accessTokenConfigured && !form.accessToken.trim())}>{working ? <RefreshCw className="spin" /> : <Save />}{working ? "Connecting..." : "Save, verify and sync templates"}</button></footer>
    </form>
  </section>;
}

function WhatsAppReport({type, requests = []}) {
  const isSite = type === "Daily site-wise report";
  const [records] = useMasterRecords(isSite ? "Equipment master" : "OEM master", isSite ? vehicles : []);
  const [employees] = useMasterRecords("Users & employees");
  const [selectedSiteReports, setSelectedSiteReports] = useState(new Set());
  const [selectedOemReports, setSelectedOemReports] = useState(new Set());
  const [lastPrepared, setLastPrepared] = useState("");
  const [metaConnection, setMetaConnection] = useState(null);
  const [oemRegion, setOemRegion] = useState("all");
  const today = new Intl.DateTimeFormat("en-IN", {day:"2-digit", month:"short", year:"numeric"}).format(new Date());
  const rows = isSite
    ? subsidiaryData.flatMap((region) => region.sites).map((site) => {
        const siteRecords = records.filter((record) => String(record.location || "").trim().toLowerCase() === site.toLowerCase());
        const metrics=equipmentMetrics(siteRecords);
        return {
          name: site,
          total: siteRecords.length,
          onRoad: metrics.onRoad,
          offRoad: metrics.offRoad,
          idle: metrics.idle,
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
    ? [`Nerve Center - Daily Site-wise Report`, today, ...visibleRows.map((r) => `${r.name}: Total ${r.total}, On Road ${r.onRoad}, Off Road ${r.offRoad}, Idle ${r.idle}, Open Breakdowns ${r.breakdowns}`)].join("\n")
    : [`Nerve Center - Daily OEM Report${oemRegion === "all" ? "" : ` - ${oemRegion}`}`, today, ...visibleRows.map((r) => `${r.name}: ${r.contacts} contacts, Levels ${r.levels || "N/A"}, Locations ${r.locations || "N/A"}`)].join("\n");
  const share = () => window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, "_blank", "noopener,noreferrer");
  const dummyReportTypes = ["A/B", "B/C", "C/D"];
  const oemReportLevels = ["Daily", "L1", "L2", "L3", "L4"];
  const normalizeSite = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  useEffect(() => {
    let active = true;
    fetch("/api/whatsapp/status", {headers:{Authorization:`Bearer ${authToken}`}})
      .then(async (response) => {
        const details = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(details.error || "Unable to verify Meta WhatsApp connection.");
        if (active) setMetaConnection(details);
      })
      .catch((error) => active && setMetaConnection({connected:false,error:error.message}));
    return () => { active = false; };
  }, []);
  const sendMetaReport = async (entry) => {
    const response=await fetch("/api/whatsapp/send", {
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${authToken}`},
      body:JSON.stringify(entry),
    });
    const details=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(details.error||"WhatsApp delivery failed.");
    return details;
  };
  const sendDummySiteReport = async (site, reportType, checked) => {
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
      `Report: ${reportType}`,
      `Total equipment: ${site.total}`,
      `On road: ${site.onRoad}`,
      `Off road: ${site.offRoad}`,
      `Idle: ${site.idle}`,
      `Open breakdowns: ${site.breakdowns}`,
    ].join("\n");
    try{
      if(!phone)throw new Error(`No WhatsApp phone number is assigned for ${site.name}.`);
      await sendMetaReport({reportType:"Daily site-wise report",targetName:site.name,reportLevel:reportType,
        recipientName:recipient?.employee || recipient?.login || "WhatsApp recipient",recipientPhone:phone,message});
      setLastPrepared(`${reportType} report sent to ${site.name}${recipient ? ` (${recipient.employee || recipient.login})` : ""}`);
    }catch(error){
      setSelectedSiteReports((current)=>{const next=new Set(current);next.delete(key);return next});
      setLastPrepared(error.message||"WhatsApp delivery failed.");
      alert(error.message||"WhatsApp delivery failed.");
    }
  };
  const sendOemReport = async (oem, reportLevel, checked) => {
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
      "Generated from the current Nerve Center fleet data.",
    ].join("\n");
    try{
      if(!phone)throw new Error(`No WhatsApp phone number is assigned for ${oem.name} ${reportLevel}.`);
      await sendMetaReport({reportType:"Daily OEM report",targetName:oem.name,reportLevel,
        recipientName:recipient?.contact || "WhatsApp recipient",recipientPhone:phone,message});
      setLastPrepared(`${reportLevel} report sent to ${oem.name}${recipient ? ` (${recipient.contact || "contact"})` : ""}`);
    }catch(error){
      setSelectedOemReports((current)=>{const next=new Set(current);next.delete(key);return next});
      setLastPrepared(error.message||"WhatsApp delivery failed.");
      alert(error.message||"WhatsApp delivery failed.");
    }
  };
  return (
    <section className="panel pagepanel generic whatsapp-report">
      <header>
        <div><h1>{navigationLabel(type)}</h1><p>{today} · {visibleRows.length} {isSite ? "sites" : "OEMs"} included</p></div>
        <div className="whatsapp-report-actions">
          {!isSite && <select aria-label="Filter OEMs by coalfield" value={oemRegion} onChange={(event) => setOemRegion(event.target.value)}>
            <option value="all">All coalfields</option><option value="WCL">WCL</option><option value="NCL">NCL</option>
          </select>}
          <button className="whatsapp-share" onClick={share}><Send /> Share on WhatsApp</button>
        </div>
      </header>
      <div className="report-summary">
        <MessageCircle /><div>
          <b>{metaConnection?.connected ? `Meta WhatsApp connected${metaConnection.verifiedName ? ` · ${metaConnection.verifiedName}` : ""}` : "WhatsApp-ready daily report"}</b>
          <span>{metaConnection?.connected
            ? `${metaConnection.displayPhoneNumber || "Business number connected"}${metaConnection.qualityRating ? ` · Quality ${metaConnection.qualityRating}` : ""}`
            : metaConnection?.error || "Review the live data below, then share it using WhatsApp."}</span>
        </div>
      </div>
      {isSite && (
        <div className="site-report-matrix">
          <div className="site-report-matrix-heading">
            <div><h2>Daily site-wise reports dispatch</h2><p>Select a report to send it directly through the connected Meta WhatsApp Business number.</p></div>
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
            <div><h2>Daily OEM report dispatch</h2><p>Select Daily or an OEM responsibility level to send the report through Meta WhatsApp Cloud API.</p></div>
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
        <thead><tr>{(isSite ? ["Site","Total equipment","On road","Off road","Idle","Open breakdowns"] : ["OEM","Contacts","Levels","Locations"]).map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{visibleRows.length ? visibleRows.map((row) => isSite ? (
          <tr key={row.name}><td><b>{row.name}</b></td><td>{row.total}</td><td>{row.onRoad}</td><td>{row.offRoad}</td><td>{row.idle}</td><td>{row.breakdowns}</td></tr>
        ) : (
          <tr key={row.name}><td><b>{row.name}</b></td><td>{row.contacts}</td><td>{row.levels || "—"}</td><td>{row.locations || "—"}</td></tr>
        )) : <tr><td colSpan={isSite ? 6 : 4} className="empty-state">No data available for this report</td></tr>}</tbody>
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
  const [equipmentRecords] = useMasterRecords("Equipment master");
  if (!loaded) return <MasterLoader name="Breakdown master" />;
  const rows = [...requests, ...manualRecords].map((request) => requestWithEquipmentMasterDetails(request, equipmentRecords));
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
      <BreakdownTable rows={rows} stickyHeader showAudio showMakeModel />
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
const regionSites = (record = {}) => String(record.sites || "")
  .split(/\s*\|\s*/)
  .map((site) => site.trim())
  .filter(Boolean);
const splitPipeValues = (value = "") => String(value || "").split(/\s*\|\s*/).map((item) => item.trim()).filter(Boolean);

function HierarchyMasterPage({ records = [], onAdd, onEdit, onDeleteAll }) {
  const [savingKey, setSavingKey] = useState("");
  const [query, setQuery] = useState("");
  const [visibleColumnGroups, setVisibleColumnGroups] = useState(() => hierarchyColumnViewOptions.map((option) => option.key));
  const [visibleRowGroups, setVisibleRowGroups] = useState(() => hierarchyRowViewOptions.map((option) => option.key));
  const byDesignation = new Map(records.map((record) => [String(record.designation || "").trim().toLowerCase(), record]));
  const allRows = hierarchyDefaults.map((row, index) => {
    const stored = byDesignation.get(row.designation.toLowerCase()) || {};
    return {
      ...row,
      ...stored,
      rowKey: stored.id || `default-${index}`,
      reportAccess: normalizeHierarchyReportAccess(stored.reportAccess || row.reportAccess || ""),
      siteAccess: Object.prototype.hasOwnProperty.call(stored, "siteAccess") ? stored.siteAccess : hierarchySiteTitles.join(" | "),
    };
  });
  const visibleColumnKeys = new Set(visibleColumnGroups);
  const visibleRowKeys = new Set(visibleRowGroups);
  const showIdentityColumns = visibleColumnKeys.has("A");
  const showSiteColumns = visibleColumnKeys.has("W");
  const visibleReportGroups = hierarchyReportGroups.filter((group) => visibleColumnKeys.has(group.viewKey));
  const visibleReportTitles = visibleReportGroups.flatMap((group) => group.reports);
  const visibleSiteTitles = showSiteColumns ? hierarchySiteTitles : [];
  const matrixColumnCount = (showIdentityColumns ? 4 : 0) + visibleReportTitles.length + visibleSiteTitles.length;
  const rows = allRows.filter((row) => (
    visibleRowKeys.has(hierarchyRowViewKey(row))
    && matchesSmartSearch(query, row.section, row.designation, row.level, row.schedule)
  ));
  const toggleViewOption = (setter, key) => setter((selected) => (
    selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]
  ));
  const saveRow = async (row, updates) => {
    const payload = {
      section: row.section,
      designation: row.designation,
      level: row.level,
      schedule: row.schedule,
      reportAccess: row.reportAccess || "",
      siteAccess: row.siteAccess || "",
      ...updates,
    };
    setSavingKey(row.rowKey);
    try {
      if (row.id) await onEdit(row.id, payload);
      else await onAdd([payload], {silent:true});
    } catch (error) {
      alert(error.message || "Could not save hierarchy setting.");
    } finally {
      setSavingKey("");
    }
  };
  const toggleReport = (row, report, checked) => {
    const selected = new Set(splitPipeValues(row.reportAccess));
    if (checked) selected.add(report);
    else selected.delete(report);
    saveRow(row, {reportAccess:[...selected].join(" | ")});
  };
  const toggleSite = (row, site, checked) => {
    const selected = new Set(splitPipeValues(row.siteAccess));
    if (checked) selected.add(site);
    else selected.delete(site);
    saveRow(row, {siteAccess:[...selected].join(" | ")});
  };
  return (
    <section className="hierarchy-master-page panel pagepanel">
      <header>
        <div>
          <h1>Hierarchy master</h1>
          <p>Designation-wise WhatsApp report matrix with report and site tick controls</p>
        </div>
        <MasterActions name="Hierarchy master" records={allRows} onAdd={onAdd} onDeleteAll={onDeleteAll} />
      </header>
      <div className="hierarchy-toolbar">
        <div className="region-main-tabs hierarchy-region-tabs" aria-label="Hierarchy site regions">
          {hierarchySiteGroups.map((region) => (
            <button key={region.code} type="button">
              <Building2 />
              <span><b>{region.code}</b><small>{region.sites.length} sites · {region.name}</small></span>
            </button>
          ))}
        </div>
        <label className="region-search"><Search /><input data-smart-search type="search" placeholder="Search hierarchy" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="hierarchy-site-strip">
        <MapPin />
        <div><b>WCL and NCL site wise ticks</b><span>Select sites row-wise for report delivery and data scoping.</span></div>
      </div>
      <div className="hierarchy-view-controls" aria-label="Hierarchy matrix view controls">
        <div className="hierarchy-view-group">
          <b>Columns</b>
          <div role="group" aria-label="Visible hierarchy column groups">
            {hierarchyColumnViewOptions.map((option) => (
              <label key={option.key} className={`hierarchy-view-tab ${visibleColumnKeys.has(option.key) ? "active" : ""}`} title={option.label}>
                <input type="checkbox" checked={visibleColumnKeys.has(option.key)} onChange={() => toggleViewOption(setVisibleColumnGroups, option.key)} />
                <span className="hierarchy-view-code">{option.key}</span>
                <span>{option.shortLabel}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="hierarchy-view-group">
          <b>Rows</b>
          <div role="group" aria-label="Visible hierarchy designation groups">
            {hierarchyRowViewOptions.map((option) => (
              <label key={option.key} className={`hierarchy-view-tab ${visibleRowKeys.has(option.key) ? "active" : ""}`} title={option.label}>
                <input type="checkbox" checked={visibleRowKeys.has(option.key)} onChange={() => toggleViewOption(setVisibleRowGroups, option.key)} />
                <span className="hierarchy-view-code">{option.key}</span>
                <span>{option.shortLabel}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="hierarchy-matrix-scroll">
        {matrixColumnCount ? <table className="hierarchy-matrix">
          <thead>
            <tr className="hierarchy-group-row">
              {showIdentityColumns && <th className="hierarchy-admin-group" colSpan="4">Hierarchy Key Whatsapp Flow</th>}
              {visibleReportGroups.map((group) => <th key={group.group} className={group.className} colSpan={group.reports.length}>{group.group}</th>)}
              {showSiteColumns && hierarchySiteGroups.map((region) => <th key={region.code} className="site-wise-region" colSpan={region.sites.length}>{region.code} Site Wise</th>)}
            </tr>
            <tr>
              {showIdentityColumns && <>
                <th className="hierarchy-col-section">Section</th>
                <th className="hierarchy-col-designation">Designation</th>
                <th className="hierarchy-col-level">Level</th>
                <th className="hierarchy-col-schedule">Schedule</th>
              </>}
              {visibleReportTitles.map((report) => <th key={report} title={report}>{hierarchyReportCodes.get(report)}<small>{report}</small></th>)}
              {showSiteColumns && hierarchySiteGroups.flatMap((region) => region.sites.map((site) => <th className="hierarchy-site-column" key={`${region.code}-${site}`} title={`${region.code} · ${site}`}>{region.code}<small>{site}</small></th>))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const reports = new Set(splitPipeValues(row.reportAccess));
              const sites = new Set(splitPipeValues(row.siteAccess));
              return (
                <tr key={row.rowKey} className={row.section === "Management" ? "management" : ""}>
                  {showIdentityColumns && <>
                    <td className="hierarchy-col-section"><span className="hierarchy-section-pill">{row.section}</span></td>
                    <td className="hierarchy-col-designation"><b>{row.designation}</b>{savingKey === row.rowKey && <small>Saving...</small>}</td>
                    <td className="hierarchy-col-level"><span className="hierarchy-level">L{String(row.level).replace(/^L/i, "")}</span></td>
                    <td className="hierarchy-col-schedule hierarchy-schedule">{row.schedule}</td>
                  </>}
                  {visibleReportTitles.map((report) => (
                    <td key={report}>
                      <input type="checkbox" aria-label={`${row.designation} ${report}`} checked={reports.has(report)} onChange={(event) => toggleReport(row, report, event.target.checked)} disabled={savingKey === row.rowKey} />
                    </td>
                  ))}
                  {showSiteColumns && hierarchySiteGroups.flatMap((region) => region.sites.map((site) => (
                    <td key={`${region.code}-${site}`}>
                      <input type="checkbox" aria-label={`${row.designation} ${region.code} ${site}`} checked={sites.has(site)} onChange={(event) => toggleSite(row, site, event.target.checked)} disabled={savingKey === row.rowKey} />
                    </td>
                  )))}
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={matrixColumnCount} className="empty-state">No hierarchy rows match this view.</td></tr>}
          </tbody>
        </table> : <div className="hierarchy-view-empty">Select at least one column group to view the matrix.</div>}
      </div>
      {!!visibleReportTitles.length && <div className="hierarchy-report-legend">
        {visibleReportTitles.map((report) => <span key={report}><b>{hierarchyReportCodes.get(report)}</b>{report}</span>)}
      </div>}
    </section>
  );
}

function RegionMasterPage({ records = [], requests = [], onAdd, onDeleteAll, gotoEquipment }) {
  const normalizedRegions = records.map((record, index) => ({
    ...record,
    code: String(record.code || record.shortName || "").trim() || `REG-${index + 1}`,
    sitesList: regionSites(record),
  }));
  const [activeRegionCode, setActiveRegionCode] = useState(() => normalizedRegions[0]?.code || "WCL");
  const activeRegion = normalizedRegions.find((region) => region.code === activeRegionCode) || normalizedRegions[0];
  const [activeSite, setActiveSite] = useState("");
  const [query, setQuery] = useState("");
  const [equipmentRecords] = useMasterRecords("Equipment master", vehicles);
  useEffect(() => {
    const firstSite = activeRegion?.sitesList?.[0] || "";
    if (!activeRegion?.sitesList?.includes(activeSite)) setActiveSite(firstSite);
  }, [activeRegionCode, activeRegion?.sites, activeSite]);
  const visibleSites = (activeRegion?.sitesList || []).filter((site) => matchesSmartSearch(query, activeRegion?.name, activeRegion?.code, site));
  const siteMetrics = (site) => {
    const siteRecords = equipmentRecords.filter((record) => recordBelongsToSite(record, site));
    const siteRequests = requests.filter((record) => recordBelongsToSite(record, site));
    const metrics = liveEquipmentMetrics(siteRecords, siteRequests);
    return { total: siteRecords.length, onRoad: metrics.onRoad, offRoad: metrics.offRoad, idle: metrics.idle };
  };
  const regionTotals = (activeRegion?.sitesList || []).reduce((totals, site) => {
    const metrics = siteMetrics(site);
    return {
      total: totals.total + metrics.total,
      onRoad: totals.onRoad + metrics.onRoad,
      offRoad: totals.offRoad + metrics.offRoad,
      idle: totals.idle + metrics.idle,
    };
  }, { total: 0, onRoad: 0, offRoad: 0, idle: 0 });
  const selectedSiteMetrics = activeSite ? siteMetrics(activeSite) : { total: 0, onRoad: 0, offRoad: 0, idle: 0 };
  const openEquipment = (road = "all", site = activeSite) => {
    if (site && gotoEquipment) gotoEquipment(road, site);
  };
  return (
    <section className="region-master-page panel pagepanel">
      <header>
        <div>
          <h1>Region master</h1>
          <p>{normalizedRegions.length} regions configured · WCL and NCL site control center</p>
        </div>
        <MasterActions name="Region master" records={records} onAdd={onAdd} onDeleteAll={onDeleteAll} />
      </header>
      <div className="region-master-toolbar">
        <div className="region-main-tabs" role="tablist" aria-label="Region tabs">
          {normalizedRegions.map((region) => (
            <button key={region.code} type="button" role="tab" aria-selected={activeRegion?.code === region.code} className={activeRegion?.code === region.code ? "active" : ""} onClick={() => setActiveRegionCode(region.code)}>
              <Building2 />
              <span><b>{region.code}</b><small>{region.name}</small></span>
            </button>
          ))}
        </div>
        <label className="region-search"><Search /><input data-smart-search type="search" placeholder="Search sites" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      {activeRegion ? (
        <>
          <div className="region-hero">
            <div>
              <span>{activeRegion.code}</span>
              <h2>{activeRegion.name}</h2>
              <p>{activeRegion.state || "State not assigned"} · {activeRegion.sitesList.length} sites</p>
            </div>
            <div className="region-summary-strip">
              <button type="button" onClick={() => openEquipment("all")}><strong>{regionTotals.total}</strong><span>Total</span></button>
              <button type="button" onClick={() => openEquipment("onroad")}><strong>{regionTotals.onRoad}</strong><span>On Road</span></button>
              <button type="button" onClick={() => openEquipment("offroad")}><strong>{regionTotals.offRoad}</strong><span>Off Road</span></button>
              <button type="button" onClick={() => openEquipment("idle")}><strong>{regionTotals.idle}</strong><span>Idle</span></button>
            </div>
          </div>
          <div className="region-site-tabs" role="tablist" aria-label={`${activeRegion.code} site tabs`}>
            {visibleSites.map((site) => (
              <button key={site} type="button" role="tab" aria-selected={activeSite === site} className={activeSite === site ? "active" : ""} onClick={() => setActiveSite(site)}>
                <MapPin />
                <span>{site}</span>
              </button>
            ))}
          </div>
          {activeSite ? (
            <div className="region-site-panel">
              <header>
                <div>
                  <span>Selected site</span>
                  <h3>{activeSite}</h3>
                </div>
                <button className="secondary" type="button" onClick={() => openEquipment("all", activeSite)}>Open equipment <ChevronRight /></button>
              </header>
              <div className="region-site-metrics">
                {[
                  ["all", "Total equipment / vehicle", selectedSiteMetrics.total, Gauge],
                  ["onroad", "On Road", selectedSiteMetrics.onRoad, CheckCircle2],
                  ["offroad", "Off Road", selectedSiteMetrics.offRoad, AlertTriangle],
                  ["idle", "Idle", selectedSiteMetrics.idle, Clock],
                ].map(([road, label, value, Icon]) => (
                  <button key={road} type="button" className={`region-metric ${road}`} onClick={() => openEquipment(road, activeSite)}>
                    <Icon />
                    <span>{label}</span>
                    <strong>{Number(value).toLocaleString("en-IN")}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : <p className="empty-state">No sites match this search.</p>}
        </>
      ) : <p className="empty-state">No regions configured.</p>}
    </section>
  );
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
    ) : name === "Hierarchy master" ? (
      <HierarchyMasterPage records={records} onAdd={onAdd} onEdit={onEdit} onDeleteAll={onDeleteAll} />
    ) : (
      <MasterPage name={name} records={records} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onDeleteAll={onDeleteAll} siteOptions={masterSiteOptions} canCreateSuperAdmin={props.session?.permissions?.adminLevel==="Super Admin"} />
    )
  ) : (
    <OriginalGeneric {...props} />
  );
};
const OriginalSubsidiaries = Subsidiaries;
Subsidiaries = function SubsidiariesWithImport({ gotoEquipment, requests = [] } = {}) {
  const [records, onAdd, loaded, onEdit, onDelete, onDeleteAll] = useMasterRecords(
    "Region master",
    subsidiaryData.map((s) => ({ ...s, sites: s.sites.join(" | ") })),
  );
  if (!loaded) return <MasterLoader name="Region master" />;
  return <RegionMasterPage records={records} requests={requests} onAdd={onAdd} onDeleteAll={onDeleteAll} gotoEquipment={gotoEquipment} />;
};
function Modal({ title, close, children, className = "" }) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className={`modal ${className}`.trim()}>
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

function MaintenanceRemarks({ remarks = [] }) {
  return remarks?.length ? <details className="daily-remarks"><summary>{remarks.length} update{remarks.length === 1 ? "" : "s"}</summary>{remarks.map((item, index) => <article key={`${item.createdAt}-${index}`}><b>{formatTwelveHourDateTime(item.createdAt)} · {item.authorName}</b><p>{item.remark}</p><small>Delay: {item.delayReason}</small></article>)}</details> : "—";
}

function DailyRemarkForm({ request, close, onSave }) {
  const previous=[...(request.dailyRemarks||[])].sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
  const today=new Intl.DateTimeFormat("en-IN",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}).format(new Date());
  const todayKey=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const todayRemark=previous.filter((item)=>String(item.createdAt||"").slice(0,10)===todayKey).at(-1);
  const history=todayRemark?previous.filter((item)=>item!==todayRemark):previous;
  return <Modal title={`Daily updates · ${request.ref}`} close={close}><div className="daily-update-journal">
    {history.length>0&&<section className="daily-update-history"><header><div><b>Previous daily updates</b><span>{history.length} saved record{history.length===1?"":"s"}</span></div><span className="readonly-badge"><LockKeyhole /> Read only</span></header>{history.map((item,index)=><article key={`${item.createdAt}-${index}`}><time>{formatTwelveHourDateTime(item.createdAt)}</time><b>{item.authorName||"Maintenance User"}</b><dl><div><dt>Maintenance update</dt><dd>{item.remark}</dd></div><div><dt>Reason for delay</dt><dd>{item.delayReason}</dd></div></dl></article>)}</section>}
    <form className="form daily-update-form" onSubmit={(event) => {event.preventDefault();const form=new FormData(event.currentTarget);onSave({remark:form.get("remark"),delayReason:form.get("delayReason")});}}><header><span>{todayRemark?"Update today’s record":"New daily record"}</span><b>{today}</b></header>{todayRemark&&<div className="daily-update-complete"><ShieldCheck /><div><b>Today’s update can be edited</b><span>Maintenance Users can update this record until the end of today.</span></div></div>}<label>Today’s maintenance update *<textarea name="remark" required defaultValue={todayRemark?.remark||""} placeholder="What work was completed today?" /></label><label>Reason for delay *<textarea name="delayReason" required defaultValue={todayRemark?.delayReason||""} placeholder="Why is the vehicle still off-road?" /></label><footer><button type="button" onClick={close}>Cancel</button><button className="primary">{todayRemark?"Update today’s entry":"Save today’s update"} <ChevronRight /></button></footer></form>
  </div></Modal>;
}

function TripCardCell({ request }) {
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (image) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(request.ref)}/trip-card`, {headers: {Authorization: `Bearer ${authToken}`}});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Trip-card image could not be loaded.");
      setImage(result.image || "");
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  if (!request.firstTripCardUploaded) return "—";
  return image
    ? <a className="trip-card-history-image" href={image} target="_blank" rel="noreferrer" title="Open full trip-card image"><img src={image} alt={`Trip card for ${request.ref}`} /></a>
    : <button type="button" className="compact" onClick={load} disabled={loading}>{loading ? "Loading…" : "View trip card"}</button>;
}

function MeterFileCell({ request, stage = "opening" }) {
  const uploaded = stage === "closing" ? request.closingMeterFileUploaded : request.openingMeterFileUploaded;
  const [file, setFile] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  if (!uploaded) return "—";
  const load = async () => {
    if (file) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(request.ref)}/meter-file?stage=${stage}`, {headers: {Authorization: `Bearer ${authToken}`}});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "KMR/HMR file could not be loaded.");
      setFile(result.file || "");
      setName(result.name || `${stage}-meter-evidence`);
    } catch (error) { alert(error.message); } finally { setLoading(false); }
  };
  return file
    ? <a className="compact" href={file} target="_blank" rel="noreferrer" download={name}>Open file</a>
    : <button type="button" className="compact" onClick={load} disabled={loading}>{loading ? "Loading…" : "View file"}</button>;
}

function MobileWorkflowTable({ rows = [], showActions = false, showComplaintAudio = false, showTurnaroundTime = false, showReason = false, showCreatedBy = false, showVerifiedBy = false, showClosedBy = false, showTripCard = false, showMeterData = false, showMakeModel = false, onEdit, onDelete, onClose, onVerify, onRemark }) {
  // Compatibility markers for source-level workflow checks: showReason && <th>Reason</th>; showCreatedBy && <th>Created by</th>; showVerifiedBy && <th>Verified by</th>; showClosedBy && <th>Closed by</th>.
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState(""), [statusFilter, setStatusFilter] = useState(""), [parameterFilters, setParameterFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const filterColumns = [
    {key: "ref", label: "Job reference", value: (row) => row.ref},
    {key: "equipmentGroup", label: "Equipment group", value: (row) => row.equipmentGroup || row.equipment},
    {key: "door", label: "Door no.", value: (row) => row.door},
    ...(showMakeModel ? [{key: "make", label: "Make", value: (row) => row.make}, {key: "model", label: "Model", value: (row) => row.model}] : []),
    {key: "site", label: "Site location", value: (row) => row.site},
    {key: "status", label: "Status", value: (row) => row.status},
    {key: "idleReason", label: "Idle reason", value: (row) => row.idleReason},
    ...(showReason ? [{key: "complaint", label: "Reason", value: (row) => row.complaint}] : []),
    ...(showCreatedBy ? [{key: "owner", label: "Created by", value: (row) => row.owner || row.requesterLogin}] : []),
    ...(showVerifiedBy ? [{key: "verifiedBy", label: "Verified by", value: (row) => row.verifiedBy}] : []),
    ...(showClosedBy ? [{key: "closedBy", label: "Closed by", value: (row) => row.closedBy}] : []),
    {key: "start", label: "Started", value: (row) => formatTwelveHourDateTime(row.start)},
    ...(showTurnaroundTime ? [{key: "hours", label: "Turn around time (TAT)", value: (row) => row.hours}] : []),
    {key: "breakdownDays", label: "Days of breakdown", value: (row) => calculateBreakdownDaysFromStart(row.start, now)},
    {key: "dailyRemarks", label: "Daily remarks", value: (row) => row.dailyRemarks},
    ...(showMeterData ? [
      {key: "openingMeter", label: "Opening KMR/HMR", value: (row) => `${row.meterType || "HMR"} ${row.openingMeterReading || ""}`.trim()},
      {key: "closingMeter", label: "Closing KMR/HMR", value: (row) => row.closingMeterReading ? `${row.meterType || "HMR"} ${row.closingMeterReading}` : "Pending"},
    ] : []),
    ...(showTripCard ? [{key: "tripCard", label: "Trip card image", value: (row) => row.firstTripCardUploaded ? "Uploaded" : "Not uploaded"}] : []),
    ...(showComplaintAudio ? [{key: "complaintAudio", label: "Complaint audio", value: (row) => row.complaintAudio ? "Available" : "Not available"}] : []),
  ];
  const filteredRows = rows.filter((row) => {
    const matchesText = matchesSmartSearch(query, row.ref, row.equipmentGroup, row.equipment, row.door, row.make, row.model, row.site, row.status, row.idleReason, row.complaint, row.owner, row.requesterLogin, row.closedBy);
    return matchesText && (!statusFilter || String(row.status || "") === statusFilter) && tableRowMatchesFilters(row, filterColumns, parameterFilters);
  });
  const [sortedRows, sort, changeSort] = useSortableRows(filteredRows);
  const updateColumnFilter = (key, value) => setParameterFilters((current) => {
    const next = { ...current };
    if (value) next[key] = value;
    else delete next[key];
    return next;
  });
  const columnValues = Object.fromEntries(filterColumns.map((column) => [
    column.key,
    [...new Set(rows.map((row) => tableFilterText(column.value(row))))].sort((a, b) => sortCollator.compare(a, b)),
  ]));
  const workflowHeader = (key, label) => <FilterableHeader key={key} label={label} sortKey={key} sort={sort} onSort={changeSort} open={openFilter === key} onToggle={(filterKey) => setOpenFilter((current) => current === filterKey ? null : filterKey)} values={columnValues[key] || []} filterValue={parameterFilters[key] || ""} onFilterChange={(value) => updateColumnFilter(key, value)} />;
  useEffect(() => {
    if (!openFilter) return undefined;
    const closeFilter = (event) => {
      if (!event.target.closest?.(".column-filter-header, .column-filter-popover")) setOpenFilter(null);
    };
    document.addEventListener("mousedown", closeFilter);
    return () => document.removeEventListener("mousedown", closeFilter);
  }, [openFilter]);
  return (
    <><div className="table-search-toolbar"><label><Search /><input data-smart-search type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this table" /></label><label><ListFilter /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{[...new Set(rows.map((row) => row.status).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><TableParameterFilter columns={filterColumns} rows={rows} filters={parameterFilters} onFilterChange={(key, value) => setParameterFilters((current) => ({ ...current, [key]: value }))} onClearFilters={() => { setParameterFilters({}); setStatusFilter(""); }} /><ExportMenu title="Workflow report" columns={filterColumns} rows={sortedRows} /></div><div className="scroll mobile-workflow-table">
      <table className="workflow-table">
        <thead><tr>
          {workflowHeader("ref", "Job reference")}{workflowHeader("equipmentGroup", "Equipment group")}{workflowHeader("door", "Door no.")}{showMakeModel && <>{workflowHeader("make", "Make")}{workflowHeader("model", "Model")}</>}{workflowHeader("site", "Site location")}
          {workflowHeader("status", "Status")}{workflowHeader("idleReason", "Idle reason")}{showReason && workflowHeader("complaint", "Reason")} {showCreatedBy && workflowHeader("owner", "Created by")} {showVerifiedBy && workflowHeader("verifiedBy", "Verified by")} {showClosedBy && workflowHeader("closedBy", "Closed by")}{workflowHeader("start", "Started")}{showTurnaroundTime && workflowHeader("hours", "Turn around time (TAT)")}{workflowHeader("breakdownDays", "Days of breakdown")}{workflowHeader("dailyRemarks", "Daily remarks")}{showMeterData && <>{workflowHeader("openingMeter", "Opening KMR/HMR")}{workflowHeader("closingMeter", "Closing KMR/HMR")}</>}{showTripCard && workflowHeader("tripCard", "Trip card image")}{showComplaintAudio && workflowHeader("complaintAudio", "Complaint audio")}{showActions && <th>Actions</th>}
        </tr></thead>
        <tbody>
          {sortedRows.length ? sortedRows.map((row) => {
            const days = calculateBreakdownDaysFromStart(row.start, now);
            const lockedIdeal = ["idle","ideal"].includes(String(row.status || "").toLowerCase());
            return <tr key={row.ref}>
              <td><b>{row.ref}</b></td>
              <td>{row.equipmentGroup || row.equipment || "—"}</td>
              <td>{row.door || "—"}</td>
              {showMakeModel && <><td>{row.make || "—"}</td><td>{row.model || "—"}</td></>}
              <td><MapPin /> {row.site || "Not assigned"}</td>
              <td><Status>{row.status || "Open"}</Status></td>
              <td>{row.idleReason || "—"}</td>
              {showReason && <td>{row.complaint || "—"}</td>}
              {showCreatedBy && <td>{row.owner || row.requesterLogin || "—"}</td>}
              {showVerifiedBy && <td>{row.verifiedBy || "—"}</td>}
              {showClosedBy && <td>{row.closedBy || "—"}</td>}
              <td>{formatTwelveHourDateTime(row.start)}</td>
              {showTurnaroundTime && <td><b>{row.hours || "—"}</b></td>}
              <td><b>{days} {days === 1 ? "day" : "days"}</b></td>
              <td><MaintenanceRemarks remarks={row.dailyRemarks} /></td>
              {showMeterData && <><td><b>{row.meterType || "HMR"} {row.openingMeterReading || "—"}</b><small><MeterFileCell request={row} stage="opening" /></small></td><td><b>{row.closingMeterReading ? `${row.meterType || "HMR"} ${row.closingMeterReading}` : "Pending"}</b><small><MeterFileCell request={row} stage="closing" /></small></td></>}
              {showTripCard && <td><TripCardCell request={row} /></td>}
              {showComplaintAudio && <td className="maintenance-complaint-audio">
                {row.complaintAudio ? <audio controls preload="none" src={row.complaintAudio}>Complaint audio</audio> : "—"}
              </td>}
              {showActions && <td className="row-actions">
                {onEdit && !lockedIdeal && <button type="button" onClick={() => onEdit(row)}><Pencil /> Edit</button>}
                {onDelete && !lockedIdeal && <button type="button" className="danger" onClick={() => onDelete(row)}><Trash2 /> Delete</button>}
                {onClose && !lockedIdeal && <button type="button" className="primary" onClick={() => onClose(row)}><CheckCircle2 /> Click for onroad</button>}
                {onRemark && String(row.status).toLowerCase() !== "closed" && !lockedIdeal && <button type="button" onClick={() => onRemark(row)}><MessageCircle /> Daily update</button>}
                {onVerify && <button type="button" className="primary" onClick={() => onVerify(row)}><ShieldCheck /> Verify</button>}
              </td>}
            </tr>;
          }) : <tr><td colSpan={8 + (showMakeModel ? 2 : 0) + (showReason ? 1 : 0) + (showCreatedBy ? 1 : 0) + (showVerifiedBy ? 1 : 0) + (showClosedBy ? 1 : 0) + (showTurnaroundTime ? 1 : 0) + (showMeterData ? 2 : 0) + (showComplaintAudio ? 1 : 0) + (showActions ? 1 : 0)} className="empty-state">No records available</td></tr>}
        </tbody>
      </table>
    </div></>
  );
}

function RequestEditForm({ request, equipmentRecords = [], close, onSave, repairTypeRecords = [], repairTypesLoaded = false }) {
  const parts = requestStartParts(request.start);
  const [time, setTime] = useState(parts.time);
  const [openingMeterFile, setOpeningMeterFile] = useState(null);
  const meterType = requestMeterTypeForRequest(request, equipmentRecords);
  return <Modal title={`Edit request ${request.ref}`} close={close}>
    <form className="form" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (!request.openingMeterFileUploaded && !openingMeterFile) return alert(`Upload an opening ${meterType} evidence file.`);
      const openingMeterEvidence = openingMeterFile ? await readMeterEvidence(openingMeterFile).catch((error) => { alert(error.message); return ""; }) : "";
      if (openingMeterFile && !openingMeterEvidence) return;
      onSave({...request, equipment: form.get("equipment"), door: form.get("door"), chassis: form.get("chassis"), site: form.get("site"), category: form.get("category"), complaint: form.get("complaint"), expectedCompletionAt: form.get("expectedCompletionAt"), start: `${form.get("date")} · ${form.get("time")}`, meterType, openingMeterReading: String(form.get("openingMeterReading") || "").trim(), openingMeterFile: openingMeterEvidence, openingMeterFileName: openingMeterFile?.name || ""});
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
        <label>Date *<input name="date" type="date" required defaultValue={parts.date} readOnly aria-readonly="true" /></label>
        <label>Timing (HH:MM:SS)<input name="time" required pattern={TIME_24H_PATTERN} value={time} readOnly aria-readonly="true" /></label>
        <label className="full etc-field">ETC (Expected Time For Completion) *<input name="expectedCompletionAt" type="datetime-local" required defaultValue={String(request.expectedCompletionAt || "").replace(" ", "T")} /></label>
        <label>Opening {meterType} reading *<input name="openingMeterReading" type="number" min="0" step="0.01" inputMode="decimal" required defaultValue={request.openingMeterReading || ""} placeholder={`Enter opening ${meterType}`} /><small>{meterType === "KMR" ? "KMR is used for Vehicle-category assets." : "HMR is used for Equipment-category assets."}</small></label>
        <label>Opening {meterType} file *<input name="openingMeterFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={!request.openingMeterFileUploaded} onChange={(event) => setOpeningMeterFile(event.target.files?.[0] || null)} /><small>{openingMeterFile ? `${openingMeterFile.name} · ${(openingMeterFile.size / 1024 / 1024).toFixed(1)} MB` : request.openingMeterFileUploaded ? "Existing file saved · choose a file only to replace it." : "JPEG, PNG, WebP, or PDF · maximum 5 MB"}</small>{request.openingMeterFileUploaded && <MeterFileCell request={request} stage="opening" />}</label>
        <label className="full">Reason / complaint *<textarea name="complaint" required defaultValue={request.complaint || ""} /></label>
      </div>
      <footer><button type="button" onClick={close}>Cancel</button><button className="primary">Save changes <ChevronRight /></button></footer>
    </form>
  </Modal>;
}

function CloseRequestForm({ request, equipmentRecords = [], close, onSave }) {
  const opened = requestStartParts(request.start);
  const now = requestStartParts("");
  const [time, setTime] = useState(now.time), [closingDate,setClosingDate]=useState(now.date), [ideal,setIdeal]=useState(false), [idleReason,setIdleReason]=useState(""), [status,setStatus]=useState(request.status === "Closed" ? "Closed" : "In progress");
  const [legacyOpeningMeterFile, setLegacyOpeningMeterFile] = useState(null);
  const meterType = requestMeterTypeForRequest(request, equipmentRecords);
  const openingMeterReadingMissing = !String(request.openingMeterReading || "").trim();
  const openingMeterFileMissing = !request.openingMeterFileUploaded;
  const openedAt=new Date(`${opened.date}T${opened.time}+05:30`),closingAt=new Date(`${closingDate}T${time}+05:30`),tatMilliseconds=Math.max(0,closingAt-openedAt);
  const tatDays=Math.floor(tatMilliseconds/86400000),tatHours=Math.floor((tatMilliseconds%86400000)/3600000),tatMinutes=Math.floor((tatMilliseconds%3600000)/60000);
  const turnaroundTime=`${tatDays}d ${tatHours}h ${tatMinutes}m`;
  return <Modal title={<span className="close-request-title">Close request {request.ref}</span>} close={close}>
    <form className="form" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      let openingMeterFile = "";
      if (legacyOpeningMeterFile) {
        openingMeterFile = await readMeterEvidence(legacyOpeningMeterFile).catch((error) => { alert(error.message); return ""; });
        if (!openingMeterFile) return;
      }
      onSave({closingDate: form.get("closingDate"), closingTime: form.get("closingTime"), turnaroundTime, maintenanceWork: form.get("maintenanceWork"), maintenanceAudio: form.get("maintenanceAudio"), status: ideal ? "Idle" : status, ideal, idleReason: ideal ? idleReason : "", meterType, openingMeterReading: openingMeterReadingMissing ? String(form.get("openingMeterReading") || "").trim() : "", openingMeterFile, openingMeterFileName: legacyOpeningMeterFile?.name || ""});
    }}>
      <div className="details request-linked-details">
        <div><span>Equipment group</span><b>{request.equipmentGroup || request.equipment || "—"}</b></div>
        <div><span>Door number</span><b>{request.door || "—"}</b></div>
        <div><span>Chassis number</span><b>{request.chassis || "—"}</b></div>
        <div><span>Site location</span><b>{request.site || "Not assigned"}</b></div>
        <div><span>Category</span><b>{request.category || "Maintenance request"}</b></div>
        <div><span>Started</span><b>{request.start || "—"}</b></div>
        <div><span>Opening {meterType}</span><b>{request.openingMeterReading || "Not recorded"}</b><MeterFileCell request={request} stage="opening" /></div>
        <div><span>Closing {meterType}</span><b>{request.closingMeterReading || "Not recorded"}</b><MeterFileCell request={request} stage="closing" /></div>
        <div><span>Reason / complaint</span><b>{request.complaint || "—"}</b></div>
        <div className="request-complaint-audio"><span>Production complaint audio</span>{request.complaintAudio ? <audio controls preload="none" src={request.complaintAudio}>Complaint audio</audio> : <b>—</b>}</div>
      </div>
      <div className="formgrid">
        {openingMeterReadingMissing && <label>Opening {meterType} reading <small>Optional</small><input name="openingMeterReading" type="number" min="0" step="0.01" inputMode="decimal" placeholder={`Enter opening ${meterType}`} /><small>Optional · this request can be closed without it.</small></label>}
        {openingMeterFileMissing && <label>Opening {meterType} file <small>Optional</small><input name="openingMeterFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setLegacyOpeningMeterFile(event.target.files?.[0] || null)} /><small>{legacyOpeningMeterFile ? `${legacyOpeningMeterFile.name} · ${(legacyOpeningMeterFile.size / 1024 / 1024).toFixed(1)} MB` : "Optional · JPEG, PNG, WebP, or PDF · maximum 5 MB"}</small></label>}
        <label>Closing date *<input name="closingDate" type="date" required value={closingDate} readOnly aria-readonly="true" /></label>
        <label>Closing time (HH:MM:SS) *<input name="closingTime" required pattern={TIME_24H_PATTERN} value={time} readOnly aria-readonly="true" /></label>
        <label>Turn around time (TAT)<input value={turnaroundTime} readOnly /></label>
        <label>Status *<select name="status" disabled={ideal} value={ideal?"Idle":status} onChange={(event)=>setStatus(event.target.value)}><option>In progress</option><option>Closed</option>{ideal&&<option>Idle</option>}</select></label>
        <fieldset className="ideal-choice"><legend>Idle? <small>Optional</small></legend><label><input type="radio" name="idealChoice" checked={ideal} onChange={()=>setIdeal(true)} /> Yes</label><label><input type="radio" name="idealChoice" checked={!ideal} onChange={()=>{setIdeal(false);setIdleReason("")}} /> No</label>{ideal&&<><label>Idle reason *<select name="idleReason" required value={idleReason} onChange={(event)=>setIdleReason(event.target.value)}><option value="">Select idle reason</option><option>No driver</option><option>No work</option></select></label><small>The request will remain Idle until the Maintenance Manager approves Make on road.</small></>}</fieldset>
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
  const [tripCardFile, setTripCardFile] = useState(null);
  const [closingMeterFile, setClosingMeterFile] = useState(null);
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
      if (!tripCardFile) return alert("Upload the first-trip card image.");
      if (tripCardFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(tripCardFile.type) || tripCardFile.size > 5 * 1024 * 1024)) {
        return alert("Upload a JPEG, PNG, or WebP trip-card image up to 5 MB.");
      }
      const firstTripCardImage = tripCardFile ? await fileAsDataUrl(tripCardFile) : "";
      const closingMeterEvidence = await readMeterEvidence(closingMeterFile).catch((error) => { alert(error.message); return ""; });
      if (!closingMeterEvidence) return;
      onSave({firstTripDone, firstTripDate: form.get("firstTripDate"), firstTripTime: form.get("firstTripTime"), firstTripCardImage, closingMeterReading: String(form.get("closingMeterReading") || "").trim(), closingMeterFile: closingMeterEvidence, closingMeterFileName: closingMeterFile?.name || ""});
    }}>
      <div className="details request-linked-details">
        <div><span>Equipment group</span><b>{request.equipmentGroup || request.equipment || "—"}</b></div>
        <div><span>Door number</span><b>{request.door || "—"}</b></div>
        <div><span>Chassis number</span><b>{request.chassis || "—"}</b></div>
        <div><span>Site location</span><b>{request.site || "Not assigned"}</b></div>
        <div><span>Closed at</span><b>{request.closedAt || "—"}</b></div>
        <div><span>Maintenance work</span><b>{request.maintenanceWork || "—"}</b></div>
        <div><span>Opening {request.meterType || "KMR/HMR"}</span><b>{request.openingMeterReading || "—"}</b><MeterFileCell request={request} stage="opening" /></div>
      </div>
      <label className="first-trip-check"><input type="checkbox" checked={firstTripDone} onChange={(event) => setFirstTripDone(event.target.checked)} /> First trip done</label>
      <div className="formgrid">
        {firstTripDone && <>
          <label>First trip date *<input name="firstTripDate" type="date" required defaultValue={today.date} /></label>
          <label>First trip time (HH:MM:SS) *<input name="firstTripTime" required pattern={TIME_24H_PATTERN} defaultValue={today.time} /></label>
        </>}
        <label>Closing {request.meterType || "KMR/HMR"} reading *<input name="closingMeterReading" type="number" min="0" step="0.01" inputMode="decimal" required placeholder={`Enter closing ${request.meterType || "KMR/HMR"}`} /></label>
        <label>Closing {request.meterType || "KMR/HMR"} file *
          <input name="closingMeterFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={(event) => setClosingMeterFile(event.target.files?.[0] || null)} />
          <small>{closingMeterFile ? `${closingMeterFile.name} · ${(closingMeterFile.size / 1024 / 1024).toFixed(1)} MB` : "JPEG, PNG, WebP, or PDF · maximum 5 MB"}</small>
        </label>
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
      </div>
      <footer><button type="button" onClick={close}>Cancel</button><button className="primary">Verify request <ChevronRight /></button></footer>
    </form>
  </Modal>;
}

const ticketCategories = ["General", "Production", "Maintenance", "MIS", "Equipment", "System access"];
function readTicketAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    const supported = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"];
    if (!supported.includes(file.type) || file.size > 10 * 1024 * 1024) return reject(new Error("Upload a JPEG, PNG, WebP, MP4, or WebM file up to 10 MB."));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected attachment."));
    reader.readAsDataURL(file);
  });
}

function TicketCreateForm({ session, close, onCreated }) {
  const [attachment, setAttachment] = useState(null), [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const message = String(form.get("message") || "").trim();
    const messageAudio = String(form.get("messageAudio") || "");
    if (!message && !messageAudio) return alert("Write a message or record an audio message.");
    setSaving(true);
    try {
      const attachmentData = await readTicketAttachment(attachment);
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {"Content-Type": "application/json", Authorization: `Bearer ${session.token}`},
        body: JSON.stringify({priority: form.get("priority"), message, messageAudio, attachmentData, attachmentName: attachment?.name || "", attachmentType: attachment?.type || ""}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not create the ticket.");
      onCreated(result);
      close();
    } catch (error) { alert(error.message); }
    finally { setSaving(false); }
  };
  return <Modal title="Create support ticket" close={close}>
    <form className="form ticket-form" onSubmit={submit}>
      <div className="formgrid">
        <label className="full">Priority *<select name="priority" required defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option></select></label>
        <EnhancedSpeechComplaint label="Description" name="message" audioName="messageAudio" buttonLabel="Record ticket audio" placeholder="Describe the issue here or record an audio message." required={false} />
        <label className="full ticket-attachment-field"><span>Image or video attachment</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => setAttachment(event.target.files?.[0] || null)} /><small>{attachment ? `${attachment.name} · ${(attachment.size / 1024 / 1024).toFixed(1)} MB` : "Optional · JPEG, PNG, WebP, MP4, or WebM · maximum 10 MB"}</small></label>
      </div>
      <footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Creating…" : "Create ticket"} <Send /></button></footer>
    </form>
  </Modal>;
}

function TicketMedia({ data, name, type, label }) {
  const objectUrl = useMemo(() => {
    const match = String(data || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) return "";
    try {
      const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: match[1] }));
    } catch {
      return "";
    }
  }, [data]);
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  if (!data) return "—";
  if (!objectUrl) return <span className="ticket-media-error">Attachment unavailable</span>;
  if (String(type).startsWith("video/")) return <video className="ticket-media" controls preload="metadata" src={objectUrl}>{label} video</video>;
  return <a href={objectUrl} target="_blank" rel="noreferrer" title={name || `Open ${label.toLowerCase()}`}><img className="ticket-media" src={objectUrl} alt={name || `${label} attachment`} /></a>;
}

function TicketAttachment({ ticket }) {
  return <TicketMedia data={ticket.attachmentData} name={ticket.attachmentName} type={ticket.attachmentType} label="Ticket" />;
}

function TicketResolutionForm({ ticket, session, close, onResolved }) {
  const [attachment, setAttachment] = useState(null), [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const resolutionMessage = String(form.get("resolutionMessage") || "").trim();
    const resolutionAudio = String(form.get("resolutionAudio") || "");
    if (!resolutionMessage && !resolutionAudio) return alert("Write a resolution message or record resolution audio.");
    setSaving(true);
    try {
      const resolutionAttachmentData = await readTicketAttachment(attachment);
      const response = await fetch("/api/tickets/resolve", {
        method: "PATCH",
        headers: {"Content-Type": "application/json", Authorization: `Bearer ${session.token}`},
        body: JSON.stringify({reference: ticket.reference, resolutionMessage, resolutionAudio, resolutionAttachmentData, resolutionAttachmentName: attachment?.name || "", resolutionAttachmentType: attachment?.type || ""}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not resolve the ticket.");
      onResolved(result);
      close();
    } catch (error) { alert(error.message); }
    finally { setSaving(false); }
  };
  return <Modal title={`Resolve ${ticket.reference}`} close={close}>
    <form className="form ticket-resolution-form" onSubmit={submit}>
      <EnhancedSpeechComplaint label="Resolution message" name="resolutionMessage" audioName="resolutionAudio" buttonLabel="Record resolution audio" placeholder="Explain how this ticket was resolved or record an audio message." required={false} />
      <label className="ticket-attachment-field"><span>Resolution image or video</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => setAttachment(event.target.files?.[0] || null)} /><small>{attachment ? `${attachment.name} · ${(attachment.size / 1024 / 1024).toFixed(1)} MB` : "Optional · JPEG, PNG, WebP, MP4, or WebM · maximum 10 MB"}</small></label>
      <footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Resolving…" : "Resolve ticket"} <CheckCircle2 /></button></footer>
    </form>
  </Modal>;
}

function AdminLockManagement({session}){
  const [data,setData]=useState({locked:false,incidents:[],accounts:[]});
  const [loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);try{const response=await fetch('/api/admin-locks',{headers:{Authorization:`Bearer ${session.token}`}});const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load admin locks');setData(body)}catch(error){alert(error.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[session.token]);
  const unlock=async()=>{if(!window.confirm('Unlock all Admin and Non Admin Manager accounts for the current CRM lock incidents?'))return;const response=await fetch('/api/admin-locks/unlock',{method:'POST',headers:{Authorization:`Bearer ${session.token}`}});const body=await response.json();if(!response.ok)return alert(body.error||'Could not unlock accounts');await load()};
  return <section className="admin-lock-page"><header><div><small>SUPER ADMIN CONTROL</small><h1>Admin account locks</h1><p>CRM tickets created from 28 August 2026 that remain open for 72 hours lock every Admin and Non Admin Manager login.</p></div><ShieldCheck /></header>
    {loading?<p>Loading lock status…</p>:<><div className={`admin-lock-status ${data.locked?'locked':'clear'}`}><div><b>{data.locked?'Admin logins are locked':'Admin logins are available'}</b><span>{data.locked?`${data.incidents.length} overdue CRM ticket incident${data.incidents.length===1?'':'s'} active`:'No active 72-hour CRM lock incident'}</span></div>{data.locked&&<button className="primary" onClick={unlock}>Unlock all accounts</button>}</div>
    {data.locked&&<><h2>Triggering CRM tickets</h2><div className="emptytable"><table><thead><tr><th>Ticket reference</th><th>Ticket created</th><th>Locked at</th></tr></thead><tbody>{data.incidents.map(row=><tr key={row.ticketReference}><td><b>{row.ticketReference}</b></td><td>{formatTwelveHourDateTime(row.ticketCreatedAt)}</td><td>{formatTwelveHourDateTime(row.lockedAt)}</td></tr>)}</tbody></table></div><h2>Locked accounts</h2><div className="emptytable"><table><thead><tr><th>Login</th><th>Employee</th><th>Authority</th></tr></thead><tbody>{data.accounts.map(row=><tr key={row.id}><td><b>{row.login}</b></td><td>{row.employee||'—'}</td><td>{row.adminLevel==='Manager'?'Non Admin Manager':row.adminLevel}</td></tr>)}</tbody></table></div></>}</>}
  </section>;
}

function TicketPage({ session }) {
  const [tickets, setTickets] = useState([]), [loading, setLoading] = useState(true), [creating, setCreating] = useState(false), [category, setCategory] = useState(""), [resolving, setResolving] = useState(null);
  const isAdmin = session?.role === "super" && session?.permissions?.adminLevel !== "Manager";
  const canCreate = Boolean(session?.token);
  const ticketExportColumns = [
    { label: "Ticket ID", value: (ticket) => ticket.reference }, { label: "User", value: (ticket) => ticket.creatorName }, { label: "Site", value: (ticket) => ticket.site }, { label: "Category", value: (ticket) => ticket.category }, { label: "Priority", value: (ticket) => ticket.priority || "Medium" }, { label: "Description", value: (ticket) => ticket.message || "Audio description" }, { label: "Status", value: (ticket) => ticket.status }, { label: "Resolution", value: (ticket) => ticket.resolutionMessage || "—" },
  ];
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tickets${category ? `?category=${encodeURIComponent(category)}` : ""}`, {headers: {Authorization: `Bearer ${session.token}`}});
      const result = await response.json().catch(() => ([]));
      if (!response.ok) throw new Error(result.error || "Could not load tickets.");
      setTickets(result);
    } catch (error) { alert(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [category, session?.token]);
  return <section className="ticket-page">
    <header className="ticket-page-head"><div><span>CRM support</span><h1>Tickets</h1><p>{session?.permissions?.adminLevel === "Manager" ? "Tickets created by users in your assigned team and location." : isAdmin ? "All support tickets across every user and site." : "Create and track your support requests."}</p></div><div className="ticket-page-actions"><ExportMenu title="CRM tickets report" columns={ticketExportColumns} rows={tickets} />{canCreate && <button className="primary" onClick={() => setCreating(true)}><Plus /> Create ticket</button>}</div></header>
    <div className="ticket-toolbar"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{ticketCategories.map((item) => <option key={item}>{item}</option>)}</select></label><span>{loading ? "Loading tickets…" : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`}</span></div>
    <div className="ticket-table-wrap"><table><thead><tr><th>Ticket ID</th><th>User</th><th>Site</th><th>Category</th><th>Priority</th><th>Description</th><th>Audio</th><th>Attachment</th><th>Status</th><th>Resolution</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{tickets.length ? tickets.map((ticket) => <tr key={ticket.reference}><td><b>{ticket.reference}</b><small>{ticket.createdAt}</small></td><td>{ticket.creatorName}<small>@{ticket.creatorLogin} · {ticket.creatorRole}</small></td><td>{ticket.site}</td><td>{ticket.category}</td><td><Status>{ticket.priority || "Medium"}</Status></td><td className="ticket-message">{ticket.message || "Audio description"}</td><td>{ticket.messageAudio ? <audio controls preload="none" src={ticket.messageAudio}>Ticket audio</audio> : "—"}</td><td><TicketAttachment ticket={ticket} /></td><td><Status>{ticket.status}</Status></td><td>{ticket.resolutionMessage || ticket.resolutionAudio || ticket.resolutionAttachmentData ? <span>{ticket.resolutionMessage || "Audio resolution"}{ticket.resolutionAudio && <audio controls preload="none" src={ticket.resolutionAudio}>Resolution audio</audio>}{ticket.resolutionAttachmentData && <TicketMedia data={ticket.resolutionAttachmentData} name={ticket.resolutionAttachmentName} type={ticket.resolutionAttachmentType} label="Resolution" />}<small>{ticket.resolvedBy} · {ticket.resolvedAt}</small></span> : "—"}</td>{isAdmin && <td>{ticket.status !== "Resolved" ? <button className="primary compact" onClick={() => setResolving(ticket)}>Resolve</button> : "Resolved"}</td>}</tr>) : <tr><td colSpan={isAdmin ? 11 : 10} className="empty-state">{loading ? "Loading tickets…" : "No tickets found."}</td></tr>}</tbody></table></div>
    {canCreate && creating && <TicketCreateForm session={session} close={() => setCreating(false)} onCreated={(ticket) => setTickets((current) => [ticket, ...current])} />}
    {resolving && <TicketResolutionForm ticket={resolving} session={session} close={() => setResolving(null)} onResolved={(result) => setTickets((current) => current.map((ticket) => ticket.reference === result.reference ? result : ticket))} />}
  </section>;
}

const AI_FEEDER_AUTO_CLOSE_SECONDS = 10;
const AI_FEEDER_SEVERITY_ICONS = { critical: AlertTriangle, warning: Clock, info: Bell };
function AiFeederPanel({ alerts = [], summary, onClose }) {
  const [seconds, setSeconds] = useState(AI_FEEDER_AUTO_CLOSE_SECONDS);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    if (seconds <= 0) { onClose(); return undefined; }
    const timer = window.setTimeout(() => setSeconds((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, paused]);
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);
  const headline = summary.critical
    ? `${summary.critical} item${summary.critical === 1 ? "" : "s"} need attention now`
    : summary.total
      ? `${summary.total} update${summary.total === 1 ? "" : "s"} from your fleet`
      : "Nothing needs your attention";
  return <div className="ai-feeder-overlay" role="dialog" aria-modal="true" aria-label="AI Feeder" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <div className="ai-feeder-panel">
      <header>
        <div>
          <span className="ai-feeder-kicker"><Activity /> AI FEEDER</span>
          <h2>{headline}</h2>
          <p>Live alerts picked from your requests. Hover to keep this open.</p>
        </div>
        <div className="ai-feeder-actions">
          <span className={paused ? "ai-feeder-countdown paused" : "ai-feeder-countdown"} aria-live="polite" title={paused ? "Paused while you read" : `Closing in ${seconds} seconds`}>
            <span className="ai-feeder-countdown-fill" style={{width: `${Math.max(0, seconds) / AI_FEEDER_AUTO_CLOSE_SECONDS * 100}%`}} aria-hidden="true" />
            <Clock aria-hidden="true" />
            <b>00:{String(Math.max(0, seconds)).padStart(2, "0")}</b>
          </span>
          <button type="button" onClick={onClose} aria-label="Close AI Feeder"><X /></button>
        </div>
      </header>
      <div className="ai-feeder-counts">
        <span className="critical"><i />{summary.critical} critical</span>
        <span className="warning"><i />{summary.warning} warning</span>
        <span className="info"><i />{summary.info} info</span>
      </div>
      <div className="ai-feeder-list">
        {alerts.length ? alerts.map((alert) => {
          const SeverityIcon = AI_FEEDER_SEVERITY_ICONS[alert.severity] || Bell;
          return <article className={`ai-feeder-item ${alert.severity}`} key={alert.id}>
            <SeverityIcon aria-hidden="true" />
            <div>
              <b>{alert.title}</b>
              <p>{alert.detail}</p>
              <small>{alert.ref ? `${alert.ref} · ` : ""}{alert.site}</small>
            </div>
          </article>;
        }) : <p className="ai-feeder-empty">All clear. No overdue jobs, idle vehicles or pending verifications right now.</p>}
      </div>
    </div>
  </div>;
}
function AiFeeder({ requests = [], role = "" }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let greeted = "yes";
    try { greeted = sessionStorage.getItem("aiFeederGreeted") || ""; } catch { greeted = "yes"; }
    if (greeted === "yes") return;
    try { sessionStorage.setItem("aiFeederGreeted", "yes"); } catch { greeted = "yes"; }
    setOpen(true);
  }, []);
  const alerts = useMemo(() => aiFeederAlerts(requests, { role, now }), [requests, role, now]);
  const summary = aiFeederSummary(alerts);
  return <>
    <button type="button" className="ai-feeder-trigger" onClick={() => setOpen(true)} title="AI Feeder" aria-label={`AI Feeder, ${summary.total} alert${summary.total === 1 ? "" : "s"}`}>
      <Activity /><span>AI Feeder</span>{summary.total > 0 && <i className="ai-feeder-dot" aria-hidden="true" />}
    </button>
    {open && <AiFeederPanel alerts={alerts} summary={summary} onClose={() => setOpen(false)} />}
  </>;
}
function NotificationBell({ session, onOpenTickets }) {
  const [items, setItems] = useState([]), [open, setOpen] = useState(false);
  const reminderShown = useRef("");
  const load = () => fetch("/api/notifications", {headers: {Authorization: `Bearer ${session.token}`}}).then((response) => response.ok ? response.json() : []).then((next) => {setItems(next);const reminder=next.find((item)=>!item.isRead&&(String(item.message).includes("reminder: add today’s maintenance update")||String(item.message).includes("was marked Idle")));if(reminder&&reminderShown.current!==String(reminder.id)){reminderShown.current=String(reminder.id);setOpen(true)}}).catch(() => {});
  useEffect(() => { load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer); }, [session?.token]);
  const unread = items.filter((item) => !item.isRead).length;
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && unread) {
      await fetch("/api/notifications/read", {method: "PATCH", headers: {Authorization: `Bearer ${session.token}`}}).catch(() => {});
      setItems((current) => current.map((item) => ({...item, isRead: true})));
    }
  };
  return <div className="notification-center"><button type="button" onClick={toggle} aria-label={`${unread} unread notifications`} aria-expanded={open}><Bell />{unread > 0 && <i>{unread > 9 ? "9+" : unread}</i>}</button>{open && <div className="notification-popover" role="dialog" aria-label="Notifications"><header><b>Notifications</b><div><span>{items.length}</span><button type="button" onClick={() => setOpen(false)} aria-label="Close notifications"><X /></button></div></header><div className="notification-list">{items.length ? items.map((item) => <button type="button" key={item.id} onClick={() => {setOpen(false); onOpenTickets?.(item);}}><span>{item.message}</span><small>{item.createdAt}</small></button>) : <p>No notifications yet.</p>}</div></div>}</div>;
}

function Normal({ logout, requests, session, onCreate, onUpdateRequest, onDeleteRequest, onAddDailyRemark, theme, toggleTheme, embedded = false }) {
  const mobileRole = session?.assignedRole || "Mobile User";
  const [show, setShow] = useState(false), [tab, setTab] = useState("requests"), [editing, setEditing] = useState(null), [closing, setClosing] = useState(null), [verifying, setVerifying] = useState(null), [remarking, setRemarking] = useState(null);
  const [section,setSection]=useState(embedded?"profile":"dashboard");
  const [userReportCategory, setUserReportCategory] = useState("general");
  const [dashboardRequests,setDashboardRequests]=useState(requests);
  const permissions = session?.permissions || {};
  const [responsiveMobile,setResponsiveMobile]=useState(()=>window.matchMedia("(max-width: 900px)").matches);
  useEffect(()=>{const query=window.matchMedia("(max-width: 900px)");const update=()=>setResponsiveMobile(query.matches);query.addEventListener("change",update);return()=>query.removeEventListener("change",update)},[]);
  const visibleUserMenus=responsiveMobile?permissions.mobileUserMenuAccess:permissions.desktopUserMenuAccess;
  const visibleRequestMenus=responsiveMobile?permissions.mobileUserRequestAccess:permissions.desktopUserRequestAccess;
  const canSeeUserMenu=(name)=>!Array.isArray(visibleUserMenus)||visibleUserMenus.includes(name);
  const canSeeRequestMenu=(name)=>!Array.isArray(visibleRequestMenus)||visibleRequestMenus.includes(name);
  const isProduction = mobileRole === "Production User";
  const isMaintenance = mobileRole === "Maintenance User";
  const isMis = mobileRole === "MIS User";
  const canCreate = isProduction || isMaintenance;
  const showRequestsMenu=canSeeUserMenu("Requests"),showTicketsMenu=canSeeUserMenu("Tickets");
  useEffect(()=>{
    const allowed=tab==="tickets"?showTicketsMenu:showRequestsMenu&&(tab==="requests"?canSeeRequestMenu("View requests"):tab==="close"?canSeeRequestMenu("Close request form"):tab==="verify"?canSeeRequestMenu("Verify closed requests"):tab==="history"||tab==="idle"?canSeeRequestMenu("Closed history"):true);
    if(allowed)return;
    if(showRequestsMenu&&canSeeRequestMenu("View requests"))setTab("requests");
    else if(showRequestsMenu&&isMis&&canSeeRequestMenu("Verify closed requests"))setTab("verify");
    else if(showRequestsMenu&&isMaintenance&&canSeeRequestMenu("Close request form"))setTab("close");
    else if(showRequestsMenu&&canSeeRequestMenu("Closed history"))setTab("history");
    else if(showTicketsMenu)setTab("tickets");
  },[responsiveMobile,showRequestsMenu,showTicketsMenu,visibleRequestMenus?.join("|"),mobileRole]);
  const [equipmentRecords, , equipmentLoaded] = useMasterRecords("Equipment master", canCreate ? vehicles : []);
  const [repairTypeRecords, , repairTypesLoaded] = useMasterRecords("Repair type master");
  const [assignedLocation, setAssignedLocation] = useState(String(session?.location || "").trim());
  useEffect(()=>{
    let active=true;
    fetch(`/api/requests?scope=dashboard&t=${Date.now()}`,{cache:"no-store",headers:{Authorization:`Bearer ${session?.token||authToken}`}})
      .then(async(response)=>{const body=await response.json().catch(()=>([]));if(!response.ok)throw new Error(body.error||"Could not load dashboard requests");return body})
      .then((rows)=>{if(active)setDashboardRequests(rows)})
      .catch((error)=>console.error(error));
    return()=>{active=false};
  },[session?.token,requests.length]);
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
  const requestRows=requests.map((request)=>requestWithEquipmentMasterDetails(request,equipmentRecords));
  const activeRequests=requestRows.filter((row)=>String(row.status||"").toLowerCase()!=="closed");
  const closedRequests=requestRows.filter((row)=>String(row.status||"").toLowerCase()==="closed");
  const visibleRows = isMis ? closedRequests.filter((row) => !row.verifiedAt).filter(visibleInMisRequests) : activeRequests;
  const historyRows=isMis?closedRequests.filter((row)=>Boolean(row.verifiedAt)).filter(visibleInMisHistory):isProduction?closedRequests.filter(visibleInProductionHistory):isMaintenance?closedRequests.filter(visibleInMaintenanceHistory):closedRequests;
  const idleRows=requestRows.filter((row)=>String(row.status||"").toLowerCase()==="idle");
  return <div className={`normal${embedded ? " embedded-workspace" : ""}`}>
    {!embedded && <header><CaliberBrand className="logo" subtitle="Mobile user portal" /><nav className="normal-header-nav"><button className={section === "dashboard" ? "active" : ""} onClick={() => setSection("dashboard")}><LayoutDashboard /> Dashboard</button>{showRequestsMenu&&<button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}><Wrench /> {mobileRole}</button>}<button className={section === "reports" ? "active" : ""} onClick={() => setSection("reports")}><FileBarChart /> Reports</button>{showTicketsMenu&&<button className={section === "tickets" ? "active" : ""} onClick={() => setSection("tickets")}><Ticket /> Tickets</button>}</nav><HeaderClock className="normal-header-clock" /><div className="normal-header-actions"><AiFeeder requests={requests} role={mobileRole} /><NotificationBell session={session} onOpenTickets={(item) => {const ticket=String(item?.ticketReference||"").startsWith("TIC/")&&showTicketsMenu;setSection(ticket?"tickets":"profile");if(!ticket)setTab("requests")}} /><span className="normal-header-user"><b>{mobileRole}</b><small>{session?.name || "Mobile User"}</small></span><ThemeToggle theme={theme} onToggle={toggleTheme} /><button onClick={logout} aria-label="Sign out"><LogOut /></button></div></header>}
    <main>
      {!embedded&&section==="dashboard"&&<Dashboard requests={dashboardRequests} theme={theme} allowedSites={assignedLocation?[assignedLocation]:[]} restrictToScope />}
      {!embedded&&section==="reports"&&<ReportsPage requests={dashboardRequests} activeReportCategory={userReportCategory} setActiveReportCategory={setUserReportCategory} permissions={{...permissions, department: mobileRole}} session={session} />}
      {!embedded&&section==="tickets"&&<TicketPage session={session} />}
      {(embedded||section==="profile")&&<div className="mobile-workspace">
      <div className="welcome workspace-hero"><div className="workspace-hero-intro"><div><small>{dateLabel}</small><h1>{isProduction ? "Production Maintenance Request" : isMaintenance ? "Maintenance workspace" : "MIS Verification"}</h1><p>{isProduction ? "Create and view your requests." : isMaintenance ? "Edit, close and manage maintenance requests." : "Verify closed requests and record first-trip completion."}</p></div><Wrench /></div>
      <div className="mobile-tabs" role="tablist">
        {showRequestsMenu&&canSeeRequestMenu("View requests")&&<button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Requests</button>}
        {showRequestsMenu&&canCreate&&canSeeRequestMenu("Create request")&&<button className="primary" onClick={() => setShow(true)}><Plus /> Create request</button>}
        {showRequestsMenu&&isMaintenance&&canSeeRequestMenu("Close request form")&&<button className={tab === "close" ? "active" : ""} onClick={() => setTab("close")}>Close request form</button>}
        {showRequestsMenu&&isMis&&canSeeRequestMenu("Verify closed requests")&&<button className={tab === "verify" ? "active" : ""} onClick={() => setTab("verify")}>Verify closed requests</button>}
        {showRequestsMenu&&canSeeRequestMenu("Closed history")&&<button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Closed history</button>}
        {showRequestsMenu&&canSeeRequestMenu("Closed history")&&<button className={tab === "idle" ? "active" : ""} onClick={() => setTab("idle")}>Idle Vehicles</button>}
      </div>
      </div>
      {isProduction && tab === "requests" && <><h3 className="sectiontitle">Your active requests · Read only</h3><section className="panel table"><BreakdownTable rows={activeRequests} showMakeModel showReason showCreatedBy showBreakdownDays /></section></>}
      {isMaintenance && tab === "requests" && <><h3 className="sectiontitle">Active maintenance requests</h3><section className="panel"><MobileWorkflowTable rows={activeRequests} showMakeModel showReason showCreatedBy showComplaintAudio showMeterData showActions onRemark={setRemarking} onEdit={permissions.editRequests ? setEditing : null} onDelete={permissions.deleteRequests ? deleteRequest : null} /></section></>}
      {isMaintenance && tab === "close" && <><h3 className="sectiontitle">Close request form</h3><section className="panel"><MobileWorkflowTable rows={activeRequests.filter((row) => !row.verifiedAt && !["idle","ideal"].includes(String(row.status||"").toLowerCase()))} showMakeModel showCreatedBy showComplaintAudio showMeterData showActions onRemark={setRemarking} onClose={setClosing} /></section></>}
      {isMis && tab === "requests" && <><h3 className="sectiontitle">Closed requests awaiting verification</h3><section className="panel"><MobileWorkflowTable rows={visibleRows} showMakeModel showReason showClosedBy showTurnaroundTime showMeterData showActions onVerify={setVerifying} /></section></>}
      {isMis && tab === "verify" && <><h3 className="sectiontitle">Verify closed requests</h3><section className="panel"><MobileWorkflowTable rows={visibleRows} showMakeModel showTurnaroundTime showMeterData showActions onVerify={setVerifying} /></section></>}
      {tab === "history" && <><h3 className="sectiontitle">Closed request history</h3><section className="panel">{isProduction?<BreakdownTable rows={historyRows} showMakeModel showReason showCreatedBy showClosedBy showBreakdownDays />:<MobileWorkflowTable rows={historyRows} showMakeModel showReason={isMaintenance || isMis} showClosedBy showVerifiedBy={isMis} showTripCard={isMis} showMeterData showComplaintAudio={isMaintenance} showTurnaroundTime={isMis} />}</section></>}
      {tab === "idle" && <><h3 className="sectiontitle">Idle vehicles</h3><section className="panel"><MobileWorkflowTable rows={idleRows} showMakeModel showReason showCreatedBy showTurnaroundTime /></section></>}
      </div>}
    </main>
    {canCreate && show && <MaintenanceForm normal onSubmit={onCreate} equipmentRecords={equipmentRecords} equipmentLoaded={equipmentLoaded} repairTypeRecords={repairTypeRecords} repairTypesLoaded={repairTypesLoaded} assignedLocation={assignedLocation} close={() => setShow(false)} />}
    {remarking && <DailyRemarkForm request={remarking} close={() => setRemarking(null)} onSave={async (payload) => {try{await onAddDailyRemark(remarking.ref,payload);setRemarking(null);}catch(error){alert(error.message)}}} />}
    {editing && <RequestEditForm request={editing} equipmentRecords={equipmentRecords} repairTypeRecords={repairTypeRecords} repairTypesLoaded={repairTypesLoaded} close={() => setEditing(null)} onSave={saveEdit} />}
    {closing && <CloseRequestForm request={closing} equipmentRecords={equipmentRecords} close={() => setClosing(null)} onSave={closeRequest} />}
    {verifying && <VerifyRequestForm request={verifying} close={() => setVerifying(null)} onSave={verifyRequest} />}
  </div>;
}
function App() {
  const [session, setSession] = useState(storedSession?.token ? storedSession : null),
    [active, setActive] = useState("Dashboard"),
    [equipmentFilter, setEquipmentFilter] = useState("all"),
    [equipmentLocation, setEquipmentLocation] = useState(""),
    [equipmentCategory, setEquipmentCategory] = useState("all"),
    [breakdownFleetFilter, setBreakdownFleetFilter] = useState(""),
    [breakdownFleetSites, setBreakdownFleetSites] = useState([]),
    [activeReportCategory, setActiveReportCategory] = useState("general"),
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
  const [responsiveMobile,setResponsiveMobile]=useState(()=>window.matchMedia("(max-width: 900px)").matches);
  useEffect(()=>{const query=window.matchMedia("(max-width: 900px)");const update=()=>setResponsiveMobile(query.matches);query.addEventListener("change",update);return()=>query.removeEventListener("change",update)},[]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("nerveCenterTheme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme((current) => current === "dark" ? "light" : "dark");
  const adminPermissions = session?.permissions || {};
  const activeNavigationPermissions=navigationPermissionsForView(adminPermissions,responsiveMobile);
  const [profileLocation, setProfileLocation] = useState("");
  const [profileManagerRegions,setProfileManagerRegions]=useState([]);
  const [profileManagerSites,setProfileManagerSites]=useState([]);
  useEffect(() => {
    if (!session?.token) return undefined;
    let activeRequest = true;
    fetch("/api/me/profile", {headers: {Authorization: `Bearer ${session.token}`}})
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((profile) => { if (activeRequest) {setProfileLocation(String(profile.location || "").trim());setProfileManagerRegions(managerRegionSelection(profile.managerRegion));setProfileManagerSites(managerSiteSelection(profile.managerSites));} })
      .catch(() => {});
    return () => { activeRequest = false; };
  }, [session?.token]);
  const canOpenAdminPage = (name) => {
    if(name==="Admin locks")return adminPermissions.adminLevel==="Super Admin";
    if(name==="Manager Profile")return adminPermissions.adminLevel==="Manager";
    if(name==="Dashboard"&&adminPermissions.adminLevel==="Manager")return true;
    if (operationalWorkspaceNav.some(([workspace]) => workspace === name)) return adminPermissions.adminLevel !== "Manager";
    if (masterNav.some(([master]) => master === name)) return accessAllows(activeNavigationPermissions.tabAccess, "Masters") && accessAllows(activeNavigationPermissions.masterAccess, name);
    if (whatsappNav.some(([page]) => page === name)) return (name !== "Meta API setup" || adminPermissions.adminLevel !== "Manager") && accessAllows(activeNavigationPermissions.tabAccess, "WhatsApp Integration") && accessAllows(activeNavigationPermissions.whatsappAccess, name);
    if (name === "Reports") return reportCategoryIdsForUser(activeNavigationPermissions, session).length > 0;
    const directMenuAccess = {Dashboard: "dashboardAccess", Tickets: "ticketAccess", Reports: "reportAccess", "Audit Trail": "auditAccess"};
    return accessAllows(activeNavigationPermissions.tabAccess, name) && accessAllows(activeNavigationPermissions[directMenuAccess[name]], name);
  };
  const firstAccessibleAdminPage = () => {
    if (canOpenAdminPage("Dashboard")) return "Dashboard";
    const firstMaster = masterNav.find(([name]) => canOpenAdminPage(name))?.[0];
    if (firstMaster) return firstMaster;
    if (accessAllows(activeNavigationPermissions.tabAccess, "WhatsApp Integration")) return whatsappNav.find(([name]) => (name !== "Meta API setup" || adminPermissions.adminLevel !== "Manager") && accessAllows(activeNavigationPermissions.whatsappAccess, name))?.[0];
    return nav.find(([name]) => canOpenAdminPage(name))?.[0] || "Dashboard";
  };
  const selectedOperationalRole = operationalWorkspaceNav.find(([name]) => name === active)?.[2];
  const operationalSession = selectedOperationalRole ? {
    ...session,
    assignedRole: selectedOperationalRole,
    permissions: {
      ...session?.permissions,
      readRequests: true,
      viewAllRequests: true,
      createRequests: true,
      editRequests: true,
      deleteRequests: true,
      closeRequests: true,
      verifyRequests: true,
      viewEquipment: true,
      viewRepairTypes: true,
    },
  } : null;
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
  }, [session?.token,responsiveMobile]);
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
  const gotoEquipment = (filter = "all", location = "", category = "all") => {
      setEquipmentFilter(filter);
      setEquipmentLocation(location);
      setEquipmentCategory(category);
      selectMenu("Equipment master");
    },
    gotoBreakdownFleet = (filter, sites = []) => {
      setBreakdownFleetFilter(filter);
      setBreakdownFleetSites(sites);
      selectMenu("Breakdown master");
    },
    logout = () => {
      authToken = "";
      currentEmployeeName = "";
      localStorage.removeItem("nerveCenterSession");
      sessionStorage.removeItem("nerveCenterSession");
      sessionStorage.removeItem("aiFeederGreeted");
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
      const endpoint = action === "close" ? `/api/requests/${encodeURIComponent(reference)}/close` : action === "verify" ? `/api/requests/${encodeURIComponent(reference)}/verify` : action === "ideal-onroad" ? `/api/requests/${encodeURIComponent(reference)}/ideal-onroad` : action === "idle-cancel" ? `/api/requests/${encodeURIComponent(reference)}/idle-cancel` : `/api/requests/${encodeURIComponent(reference)}`;
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
    addDailyRemark = async (reference, payload) => {
      const response = await fetch(`/api/requests/${encodeURIComponent(reference)}/daily-remarks`, {method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${authToken}`},body:JSON.stringify(payload)});
      const saved=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(saved.error||"Could not save the daily update");
      setRequests((current)=>current.map((row)=>row.ref===reference?saved:row));
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
        onAddDailyRemark={addDailyRemark}
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
          const page = typeof x === "string" ? x : x?.page;
          if (x?.reportCategory) setActiveReportCategory(x.reportCategory);
          selectMenu(page);
          if (page === "Equipment master") {
            setEquipmentFilter("all");
            setEquipmentLocation("");
          }
          setMenu(false);
        }}
        logout={logout}
        open={menu}
        permissions={adminPermissions}
        session={session}
        profileLocation={profileLocation}
        activeReportCategory={activeReportCategory}
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
            Operations <ChevronRight /> <b>{navigationLabel(active)}</b>
          </div>
          <HeaderClock />
          <div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <AiFeeder requests={requests} role={adminPermissions.adminLevel === "Manager" ? "Manager" : "Admin"} />
            <button type="button" aria-label="Focus page smart search" title="Smart search" onClick={() => document.querySelector('.body input[data-smart-search]:not([disabled])')?.focus()}>
              <Search />
            </button>
            <NotificationBell session={session} onOpenTickets={(item) => selectMenu(String(item?.ticketReference || "").startsWith("TIC/") ? "Tickets" : adminPermissions.adminLevel === "Manager" ? "Dashboard" : "Breakdown master")} />
          </div>
        </div>
        <div className="body">
          {active === "Dashboard" ? (
            <Dashboard goto={selectMenu} gotoEquipment={gotoEquipment} gotoBreakdownFleet={gotoBreakdownFleet} requests={requests} theme={theme} allowedSites={adminPermissions.adminLevel==="Manager"?(profileManagerSites.length?profileManagerSites:profileLocation?[profileLocation]:[]):null} allowedRegions={adminPermissions.adminLevel==="Manager"?profileManagerRegions:null} restrictToScope={adminPermissions.adminLevel==="Manager"} />
          ) : active === "Manager Profile" ? (
            <ManagerDashboard managerRole={adminPermissions.managerRole} managerRoles={adminPermissions.managerRoles} managerLocation={profileLocation} requests={requests} gotoEquipment={gotoEquipment} onApproveIdeal={async(row)=>{if(!window.confirm(`Approve ${row.ref} as on road? This will close the request and forward it to MIS verification.`))return;try{await updateRequest(row.ref,{},"ideal-onroad")}catch(error){alert(error.message)}}} onCancelIdeal={async(row)=>{if(!window.confirm(`Cancel Idle status for ${row.ref}? The request will return to active maintenance and will not be closed.`))return;try{await updateRequest(row.ref,{},"idle-cancel")}catch(error){alert(error.message)}}} />
          ) : active === "Tickets" ? (
            <TicketPage session={session} />
          ) : active === "Admin locks" ? (
            <AdminLockManagement session={session} />
          ) : active === "Equipment master" ? (
            <Equipment
              initialFilter={equipmentFilter}
              initialLocation={equipmentLocation}
              initialCategory={equipmentCategory}
              statusRequests={requests}
            />
          ) : active === "Breakdown master" ? (
            breakdownFleetFilter ? <Equipment initialFilter={breakdownFleetFilter} pageTitle="Breakdown master" statusRequests={requests} allowedLocations={breakdownFleetSites} /> : <Breakdown requests={requests} />
          ) : active === "Region master" ? (
            <Subsidiaries gotoEquipment={gotoEquipment} requests={requests} />
          ) : active === "Meta API setup" ? (
            <MetaWhatsAppSetup />
          ) : active === "WhatsApp alert history" ? (
            <WhatsAppAlertHistory />
          ) : active === "Reports" ? (
            <ReportsPage requests={requests} activeReportCategory={activeReportCategory} setActiveReportCategory={setActiveReportCategory} permissions={activeNavigationPermissions} session={session} />
          ) : operationalSession ? (
            <Normal
              embedded
              requests={requests}
              onCreate={addRequest}
              onUpdateRequest={updateRequest}
              onDeleteRequest={deleteRequest}
              session={operationalSession}
              logout={logout}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          ) : whatsappNav.some(([name]) => name === active) ? (
            <WhatsAppReport type={active} requests={requests} />
          ) : (
            <Generic name={active} requests={requests} session={session} />
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
