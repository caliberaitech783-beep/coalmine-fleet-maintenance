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

// The tabs not yet open are loaded one after another once the first tab has loaded, so the first
// switch to them is already instant. Order: the tabs after the open one, then those before it.
export function preloadOrder(openKey, apps = APPS) {
  const index = Math.max(0, apps.findIndex(app => app.key === openKey));
  return [...apps.slice(index + 1), ...apps.slice(0, index)].map(app => app.key);
}
