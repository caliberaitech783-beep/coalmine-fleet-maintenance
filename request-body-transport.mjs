/**
 * Production traffic passes through the Azure Front Door edge firewall, which
 * inspects JSON, form and multipart bodies and rejects any larger than 128 KB
 * with an HTML 403 before the app ever sees the request. Bodies sent as
 * text/plain are not size-checked, so large JSON payloads (meter evidence,
 * trip cards, complaint audio, CSV imports) travel as text/plain and the
 * server parses them as JSON.
 *
 * Measured against https://bdms.cmll.in on 2026-09-04: JSON and multipart
 * bodies of 129 KB and above returned an HTML 403 from the edge, 127 KB and
 * below reached the app, and text/plain bodies of 200 KB reached the app.
 */
export const EDGE_INSPECTED_BODY_LIMIT_BYTES = 128 * 1024;
export const LARGE_JSON_BODY_THRESHOLD_BYTES = 100 * 1024;
export const LARGE_JSON_CONTENT_TYPE = "text/plain; charset=utf-8";
export const JSON_BODY_CONTENT_TYPES = ["application/json", "text/plain"];

export function bodyByteLength(body) {
  if (typeof body !== "string") return 0;
  if (typeof TextEncoder === "function") return new TextEncoder().encode(body).length;
  return body.length;
}

function readContentType(headers) {
  if (!headers) return "";
  if (typeof Headers === "function" && headers instanceof Headers) return headers.get("content-type") || "";
  if (Array.isArray(headers)) {
    const entry = headers.find(([name]) => String(name).toLowerCase() === "content-type");
    return entry ? String(entry[1]) : "";
  }
  const key = Object.keys(headers).find((name) => name.toLowerCase() === "content-type");
  return key ? String(headers[key]) : "";
}

function withContentType(headers, value) {
  if (typeof Headers === "function" && headers instanceof Headers) {
    const next = new Headers(headers);
    next.set("Content-Type", value);
    return next;
  }
  if (Array.isArray(headers)) {
    return [...headers.filter(([name]) => String(name).toLowerCase() !== "content-type"), ["Content-Type", value]];
  }
  const next = {};
  for (const [name, headerValue] of Object.entries(headers || {})) {
    if (name.toLowerCase() !== "content-type") next[name] = headerValue;
  }
  next["Content-Type"] = value;
  return next;
}

/** Returns true when a JSON body of this size would be rejected by the edge. */
export function largeJsonBody(body, threshold = LARGE_JSON_BODY_THRESHOLD_BYTES) {
  return bodyByteLength(body) > threshold;
}

/**
 * Rewrites a fetch init so an oversized JSON string body is sent as text/plain.
 * Small bodies and non-JSON bodies are returned unchanged.
 */
export function edgeSafeJsonInit(init = {}, threshold = LARGE_JSON_BODY_THRESHOLD_BYTES) {
  const body = init?.body;
  if (typeof body !== "string") return init;
  const contentType = readContentType(init.headers).toLowerCase();
  if (!contentType.includes("application/json")) return init;
  if (!largeJsonBody(body, threshold)) return init;
  return { ...init, headers: withContentType(init.headers, LARGE_JSON_CONTENT_TYPE) };
}
