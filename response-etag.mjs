import {createHash} from "node:crypto";

export function jsonEntityTag(namespace, body) {
  const prefix = String(namespace || "json").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "json";
  const digest = createHash("sha256").update(String(body)).digest("base64url").slice(0, 24);
  return `W/"bdms-${prefix}-${digest}"`;
}

const normalizedTag = (value) => String(value || "").trim().replace(/^W\//i, "");

export function requestEtagMatches(header, etag) {
  const expected = normalizedTag(etag);
  if (!expected) return false;
  return String(header || "").split(",").some((candidate) => {
    const tag = candidate.trim();
    return tag === "*" || normalizedTag(tag) === expected;
  });
}
