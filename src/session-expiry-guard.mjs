const EXPIRED_SESSION_MESSAGE = "Your sign-in has expired. Please sign in again.";

// Capture the credential actually sent, before an asynchronous response can
// arrive after a different user/session has signed in. Never inspect third-party
// requests or public/login requests as evidence that the current session ended.
export function authenticatedApiRequest(input, init, {origin, token}) {
  if (!token) return null;
  try {
    const url = new URL(typeof input === "string" ? input : input?.url || String(input), origin);
    if (url.origin !== origin || !url.pathname.startsWith("/api/") ||
        url.pathname === "/api/login" || url.pathname.startsWith("/api/login/")) return null;
    const headers = new Headers(init?.headers ?? input?.headers);
    const sentToken = /^Bearer\s+(.+)$/i.exec(headers.get("Authorization") || "")?.[1];
    return sentToken === token ? {token} : null;
  } catch {
    return null;
  }
}

export function removeMatchingStoredSession(storage, token) {
  try {
    // Another tab may have saved a newer login while this tab was validating
    // its old token. Expiring this tab must not erase that newer stored session.
    if (!token || JSON.parse(storage.getItem("nerveCenterSession") || "null")?.token === token) {
      storage.removeItem("nerveCenterSession");
    }
  } catch { /* Unavailable storage must not prevent clearing in-memory auth. */ }
}

export function createSessionExpiryGuard({fetch: nativeFetch, getToken, onExpired, deviceId = "", timeoutMs = 10_000}) {
  const checks = new Map();
  let expiredToken = "";

  async function validate(token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {Authorization: `Bearer ${token}`};
      if (deviceId) headers["X-BDMS-Device-ID"] = deviceId;
      // Use the original fetch: validation must not recurse through the global
      // interceptor or replay the business request that received the 401.
      const response = await nativeFetch("/api/session-heartbeat", {
        method: "POST", headers, cache: "no-store", redirect: "error", signal: controller.signal,
      });
      if (response.status !== 401 || response.redirected ||
          !/\bapplication\/json\b/i.test(response.headers.get("content-type") || "")) return false;
      const body = await response.json();
      if (body?.error !== EXPIRED_SESSION_MESSAGE || getToken() !== token || expiredToken === token) return false;
      expiredToken = token;
      onExpired(token);
      return true;
    } catch {
      // Offline, gateway errors, aborted or malformed validation are not proof
      // of expiry. The original API failure is still returned to its caller.
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async check(response, request) {
      const token = request?.token;
      if (response.status !== 401 || !token || getToken() !== token || expiredToken === token) return false;
      if (!checks.has(token)) {
        const pending = validate(token).finally(() => checks.delete(token));
        checks.set(token, pending);
      }
      return checks.get(token);
    },
  };
}
