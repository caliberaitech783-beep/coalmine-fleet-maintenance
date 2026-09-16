const MOBILE_REFRESH_MS = 60_000;
const CONSTRAINED_REFRESH_MS = 120_000;

function mediaMatches(win, query) {
  try { return Boolean(win?.matchMedia?.(query)?.matches); }
  catch { return false; }
}

export function mobileDataProfile(win = globalThis.window) {
  const connection = win?.navigator?.connection || globalThis.navigator?.connection;
  const effectiveType = String(connection?.effectiveType || "").trim().toLowerCase();
  const constrained = connection?.saveData === true || effectiveType === "slow-2g" || effectiveType === "2g";
  const mobile = mediaMatches(win, "(max-width: 900px)") || mediaMatches(win, "(pointer: coarse)");
  return { mobile, constrained };
}

// Preserve the existing desktop cadence while using a gentler interval on
// phones. Mutation, focus and online events still refresh immediately.
export function adaptiveRefreshInterval(win = globalThis.window, desktopMs = 10_000) {
  const safeDesktopMs = Number.isFinite(desktopMs) && desktopMs > 0 ? desktopMs : 10_000;
  const { mobile, constrained } = mobileDataProfile(win);
  if (constrained) return Math.max(safeDesktopMs, CONSTRAINED_REFRESH_MS);
  if (mobile) return Math.max(safeDesktopMs, MOBILE_REFRESH_MS);
  return safeDesktopMs;
}

export function mobileTablePageSize(win = globalThis.window) {
  return mobileDataProfile(win).mobile ? 25 : 0;
}
