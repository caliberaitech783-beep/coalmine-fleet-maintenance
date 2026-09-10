const SENSITIVE_FIELD = /(password|hash|token|secret|otp|audio|image|attachment|file_data|accessToken|authorization|cookie)/i;

const auditText = (value, limit = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

function auditObject(value, depth = 0) {
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => auditObject(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([field, item]) => [
    field,
    SENSITIVE_FIELD.test(field) ? "[protected]" : auditObject(item, depth + 1),
  ]));
}

function auditValue(field, value) {
  if (SENSITIVE_FIELD.test(String(field))) return value === undefined || value === null || value === "" ? "" : "[protected]";
  if (Array.isArray(value) || (value && typeof value === "object")) return auditText(JSON.stringify(auditObject(value)));
  return auditText(value);
}

export function auditChangedFields(before = {}, after = {}) {
  const previous = before && typeof before === "object" && !Array.isArray(before) ? before : {};
  const next = after && typeof after === "object" && !Array.isArray(after) ? after : {};
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((field) => JSON.stringify(previous[field] ?? null) !== JSON.stringify(next[field] ?? null))
    .slice(0, 40)
    .map((field) => ({ field: auditText(field, 80), before: auditValue(field, previous[field]), after: auditValue(field, next[field]) }));
}

export function auditSubmittedFields(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body).slice(0, 40).map((field) => ({
    field: auditText(field, 80),
    before: "",
    after: auditValue(field, body[field]),
  }));
}

export function auditSafeError(error = {}) {
  const code = auditText(error?.code || error?.type || error?.name || "Error", 80);
  const message = auditText(error?.message || "Unexpected server error", 320)
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[protected]")
    .replace(/((?:password|token|secret|otp|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[protected]");
  return { code, message };
}

export function auditRouteDetails(method = "", path = "") {
  const verb = String(method).toUpperCase();
  const route = String(path);
  if (route === "/api/login") return { module: "Authentication", eventType: "Security", action: "Login" };
  if (route === "/api/logout") return { module: "Authentication", eventType: "Security", action: "Logout" };
  if (route.includes("password-reset")) return { module: "Authentication", eventType: "Security", action: route.endsWith("/request") ? "Request password reset" : "Complete password reset" };
  if (route.includes("change-initial-password")) return { module: "Authentication", eventType: "Security", action: "Change initial password" };
  if (route.includes("/password")) return { module: "Users & employees", eventType: "Security", action: "Administrator password change" };
  if (route.startsWith("/api/masters/")) return { module: decodeURIComponent(route.split("/")[3] || "Masters"), eventType: "Master data", action: verb === "POST" ? "Create or import records" : verb === "PUT" || verb === "PATCH" ? "Edit record" : verb === "DELETE" ? "Delete record" : "View records" };
  if (route.startsWith("/api/requests")) {
    const action = verb === "DELETE" ? "Delete request"
      : route.endsWith("/verify") ? "Verify request"
      : route.endsWith("/close") ? "Close request"
      : route.endsWith("/daily-remarks") ? "Add daily remark"
      : route.endsWith("/arrival-flag") ? "Update arrival red flag"
      : route.endsWith("/mis-flag") ? "Update MIS red flag"
      : route.endsWith("/ideal-onroad") ? "Approve idle vehicle on road"
      : route.endsWith("/idle-cancel") ? "Cancel idle vehicle request"
      : verb === "POST" ? "Create request"
      : ["PUT", "PATCH"].includes(verb) ? "Edit request"
      : "View requests";
    return { module: "Maintenance requests", eventType: "Workflow", action };
  }
  if (route.startsWith("/api/tickets")) return { module: "Tickets", eventType: "CRM", action: verb === "POST" ? "Create ticket" : ["PUT", "PATCH"].includes(verb) ? "Resolve ticket" : "View tickets" };
  if (route.startsWith("/api/notifications")) return { module: "Notifications", eventType: "Activity", action: verb === "PATCH" ? "Mark notifications read" : "View notifications" };
  if (route.startsWith("/api/info-pulse")) return { module: "Info Pulse", eventType: "Activity", action: "View Info Pulse" };
  if (route.includes("report-schedule")) return { module: "Reports", eventType: "Configuration", action: verb === "GET" ? "View report schedules" : "Update report schedules" };
  if (route.startsWith("/api/whatsapp-alert-history")) return { module: "WhatsApp Integration", eventType: "Integration", action: verb === "POST" ? "Create WhatsApp alert record" : "View WhatsApp alert history" };
  if (route.startsWith("/api/whatsapp")) return { module: "WhatsApp Integration", eventType: "Integration", action: verb === "PUT" ? "Update Meta settings" : verb === "POST" ? "Send or register WhatsApp message" : "View WhatsApp settings" };
  if (route.includes("navigation-settings")) return { module: "Access control", eventType: "Configuration", action: verb === "GET" ? "View navigation settings" : "Update navigation settings" };
  if (route.includes("admin-locks")) return { module: "Authentication", eventType: "Security", action: verb === "GET" ? "View administrator locks" : "Unlock administrator accounts" };
  if (route.startsWith("/api/oracle")) return { module: "Oracle synchronization", eventType: "Integration", action: verb === "GET" ? "View Oracle data" : "Synchronize master data" };
  if (route.startsWith("/api/exports")) return { module: "Reports", eventType: "Report", action: "Generate report" };
  if (route.startsWith("/api/reports")) return { module: "Reports", eventType: "Report", action: verb === "GET" ? "View report data" : "Generate or send report" };
  const segment = decodeURIComponent(route.split("/")[2] || "Application").replace(/[-_]+/g, " ");
  const action = verb === "POST" ? "Create or run" : verb === "PUT" || verb === "PATCH" ? "Edit or update" : verb === "DELETE" ? "Delete" : "View";
  return { module: segment.replace(/\b\w/g, (letter) => letter.toUpperCase()), eventType: "Activity", action: `${action}: ${route}` };
}
