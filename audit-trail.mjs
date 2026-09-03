const SENSITIVE_FIELD = /(password|hash|token|secret|otp|audio|image|attachment|file_data|accessToken)/i;

const auditText = (value, limit = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

function auditValue(field, value) {
  if (SENSITIVE_FIELD.test(String(field))) return value === undefined || value === null || value === "" ? "" : "[protected]";
  if (Array.isArray(value)) return auditText(value.join(" | "));
  if (value && typeof value === "object") return auditText(JSON.stringify(value));
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

export function auditRouteDetails(method = "", path = "") {
  const verb = String(method).toUpperCase();
  const route = String(path);
  if (route === "/api/login") return { module: "Authentication", eventType: "Security", action: "Login" };
  if (route.includes("password-reset")) return { module: "Authentication", eventType: "Security", action: route.endsWith("/request") ? "Request password reset" : "Complete password reset" };
  if (route.includes("change-initial-password")) return { module: "Authentication", eventType: "Security", action: "Change initial password" };
  if (route.includes("/password")) return { module: "Users & employees", eventType: "Security", action: "Administrator password change" };
  if (route.startsWith("/api/masters/")) return { module: decodeURIComponent(route.split("/")[3] || "Masters"), eventType: "Master data", action: verb === "POST" ? "Create or import records" : verb === "PUT" ? "Edit record" : "Delete record" };
  if (route.startsWith("/api/requests")) return { module: "Maintenance requests", eventType: "Workflow", action: verb === "POST" ? "Create request" : verb === "DELETE" ? "Delete request" : route.endsWith("/verify") ? "Verify request" : route.endsWith("/close") ? "Close request" : "Update request" };
  if (route.startsWith("/api/tickets")) return { module: "Tickets", eventType: "CRM", action: verb === "POST" ? "Create ticket" : "Resolve ticket" };
  if (route.includes("report-schedule")) return { module: "Reports", eventType: "Configuration", action: "Update report schedules" };
  if (route.startsWith("/api/whatsapp")) return { module: "WhatsApp Integration", eventType: "Integration", action: verb === "PUT" ? "Update Meta settings" : "Send WhatsApp message" };
  if (route.includes("navigation-settings")) return { module: "Access control", eventType: "Configuration", action: "Update navigation settings" };
  if (route.includes("admin-locks")) return { module: "Authentication", eventType: "Security", action: "Unlock administrator accounts" };
  if (route.startsWith("/api/oracle")) return { module: "Oracle synchronization", eventType: "Integration", action: "Synchronize master data" };
  if (route.startsWith("/api/exports")) return { module: "Reports", eventType: "Report", action: "Generate report" };
  return { module: "Application", eventType: "Activity", action: `${verb} ${route}` };
}
