// Caliber One (owner, 28 Nov 2026): one installed window with Pulse, Pulse-II MIS, HR Pulse and Diesel
// as tabs along the top, switched like Chrome tabs. Each tab is the real website in a frame that stays
// loaded, so switching does not reload anything. Each website must allow pulse.cmll.in in its
// frame-ancestors (Pulse-II, HR Pulse and Diesel do from Phase 1).
export const APPS = Object.freeze([
  Object.freeze({ key: 'pulse', label: 'Pulse', short: 'Pulse', url: 'https://pulse.cmll.in/', colour: '#8b5cf6' }),
  Object.freeze({ key: 'mis', label: 'Pulse-II MIS', short: 'MIS', url: 'https://pulse-ll.cmll.in/', colour: '#e0a526' }),
  Object.freeze({ key: 'hr', label: 'HR Pulse', short: 'HR', url: 'https://hrpulse.cmll.in/', colour: '#16a34a' }),
  Object.freeze({ key: 'diesel', label: 'Diesel', short: 'Diesel', url: 'https://pulse-lll.cmll.in/', colour: '#ea580c' }),
]);

export const STORAGE_KEY = 'caliberOne.tab';

export function appByKey(key) {
  return APPS.find(app => app.key === key) || null;
}

// The tab named in the address (#mis) wins, then the tab used last, then Pulse.
export function initialKey({ hash = '', saved = '' } = {}) {
  const fromHash = String(hash).replace(/^#/, '').trim().toLowerCase();
  if (appByKey(fromHash)) return fromHash;
  if (appByKey(saved)) return saved;
  return APPS[0].key;
}

// A frame may only use a feature its parent delegates. Sign-in runs on pulse.cmll.in inside the
// Pulse-II and Diesel tabs, so every feature is delegated to every Caliber website, and to no other.
const FEATURES = ['camera', 'microphone', 'geolocation', 'clipboard-read', 'clipboard-write', 'fullscreen', 'display-capture', 'screen-wake-lock'];
export function frameAllow(apps = APPS) {
  const origins = [...new Set(apps.map(app => new URL(app.url).origin))].join(' ');
  return FEATURES.map(feature => `${feature} ${origins}`).join('; ');
}

// Ctrl+1 … Ctrl+4 pick a tab; Ctrl+PageDown / Ctrl+PageUp move to the next / previous tab.
export function keyFromShortcut(event, currentKey, apps = APPS) {
  if (!event?.ctrlKey || event.altKey || event.metaKey) return null;
  const index = apps.findIndex(app => app.key === currentKey);
  if (/^[1-9]$/.test(event.key || '')) return apps[Number(event.key) - 1]?.key || null;
  if (event.key === 'PageDown') return apps[(index + 1) % apps.length].key;
  if (event.key === 'PageUp') return apps[(index - 1 + apps.length) % apps.length].key;
  return null;
}

// One sign-in (Phase 2): Pulse keeps its sign-in as nerveCenterSession, in localStorage with
// "Remember me" and in sessionStorage without; Caliber One shares both with the Pulse tab.
export const PULSE_SESSION_KEY = 'nerveCenterSession';
export function pulseTokenFrom(stores) {
  for (const store of stores) {
    try {
      const token = JSON.parse(store?.getItem(PULSE_SESSION_KEY) || 'null')?.token;
      if (typeof token === 'string' && token) return token;
    } catch { /* unreadable storage or old value */ }
  }
  return '';
}

// HR Pulse is told to open with the Pulse sign-in (?hrSso=start), also right after a sign-out.
// justSignedIn: the window signed in a moment ago, so MIS holds no sign-in of its own (a sign-out
// anywhere ended it): MIS opens at its sign-in step and starts once, not twice. Every other tab,
// and MIS when the window reopens already signed in, opens at its home page.
export function frameUrl(app, { justSignedIn = false } = {}) {
  if (app.key === 'hr') return app.url + '?hrSso=start';
  if (app.key === 'mis' && justSignedIn) return app.url + 'api/mis-credentials/start';
  return app.url;
}

// The tabs behind the open one load one at a time, each only when the window has been quiet for a
// moment (no tab finished a page in the last quietMs), so the tab the person is looking at is not
// slowed by the others. After maxWaitMs the next one loads anyway.
export function preloadMayStart({ now, lastLoadAt, waitingSince, quietMs = 2000, maxWaitMs = 15000 }) {
  return now - lastLoadAt >= quietMs || now - waitingSince >= maxWaitMs;
}

// A sign-out anywhere tells these tabs to sign out of their own website; Diesel and HR's grant
// follow the Pulse sign-in.
export const SIGN_OUT_MESSAGE = 'caliber-one:sign-out';
export function signOutTargets(apps = APPS) {
  return apps.filter(app => app.key === 'mis' || app.key === 'hr').map(app => ({ key: app.key, origin: new URL(app.url).origin }));
}

// The tabs not yet open are loaded one after another once the first tab has loaded, so the first
// switch to them is already instant. Order: the tabs after the open one, then those before it.
export function preloadOrder(openKey, apps = APPS) {
  const index = Math.max(0, apps.findIndex(app => app.key === openKey));
  return [...apps.slice(index + 1), ...apps.slice(0, index)].map(app => app.key);
}
