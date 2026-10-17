const STORAGE_KEY = 'pulse.navigation.v1';
let owner = '';
let generation = 0;

export const navigationScope = () => `${owner}:${generation}`;

function browserStorage() {
  try { return globalThis.sessionStorage; } catch { return undefined; }
}

export function configureNavigation(session) {
  generation += 1;
  owner = session?.token ? JSON.stringify([session.id, session.username, session.name, session.role, session.assignedRole, session.location]) : '';
}

function load(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    return owner && saved?.owner === owner && saved.values && typeof saved.values === 'object' ? saved.values : {};
  } catch { return {}; }
}

export function readNavigation(key, fallback, storage = browserStorage()) {
  const initial = typeof fallback === 'function' ? fallback() : fallback;
  const saved = load(storage)[key];
  if (saved === undefined || saved === null || typeof saved !== typeof initial || Array.isArray(saved) !== Array.isArray(initial)) return initial;
  return saved;
}

export function writeNavigation(key, value, storage = browserStorage()) {
  if (!owner) return;
  try { storage?.setItem(STORAGE_KEY, JSON.stringify({owner, values: {...load(storage), [key]: value}})); } catch {}
}

export function resetNavigation(storage = browserStorage()) {
  generation += 1;
  try { storage?.removeItem(STORAGE_KEY); } catch {}
}
