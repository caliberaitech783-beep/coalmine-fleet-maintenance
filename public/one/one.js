import { APPS, STORAGE_KEY, PULSE_SESSION_KEY, SIGN_OUT_MESSAGE, appByKey, initialKey, frameAllow, keyFromShortcut, preloadOrder, pulseTokenFrom, signOutTargets } from './one-tabs.mjs';

// Caliber One must never open inside one of its own tabs (a link to /one/ from inside Pulse).
if (window.self !== window.top) {
  window.location.replace('/');
} else {
  start();
}

function start() {
  const tabsNav = document.querySelector('.one-tabs');
  const stage = document.querySelector('.one-stage');
  const reloadButton = document.querySelector('.one-reload');
  const windowButton = document.querySelector('.one-window');
  const installButton = document.querySelector('.one-install');
  const signOutButton = document.querySelector('.one-signout');
  const waiting = document.querySelector('.one-waiting');
  const allow = frameAllow();
  const frames = new Map();
  const tabs = new Map();
  const openedAnyway = new Set();
  let current = '';
  let preloadStarted = false;
  // One sign-in: until Pulse is signed in, only the Pulse tab opens. MIS, HR Pulse and Diesel
  // would each ask for a password of their own; after Pulse they open signed in.
  let signedIn = false;
  let checkedToken = '';
  let checkedAt = 0;

  const readSaved = () => { try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; } };
  const save = key => { try { localStorage.setItem(STORAGE_KEY, key); } catch { /* private window */ } };
  const pulseToken = () => pulseTokenFrom([window.localStorage, window.sessionStorage]);

  for (const [index, app] of APPS.entries()) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'one-tab';
    tab.id = `one-tab-${app.key}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('aria-controls', `one-frame-${app.key}`);
    tab.dataset.key = app.key;
    tab.dataset.state = 'idle';
    tab.style.setProperty('--app-colour', app.colour);
    tab.title = `${app.label} (Ctrl+${index + 1})`;
    tab.innerHTML = '<span class="one-dot" aria-hidden="true"></span><span class="one-label"></span><span class="one-short"></span>';
    tab.querySelector('.one-label').textContent = app.label;
    tab.querySelector('.one-short').textContent = app.short;
    tab.addEventListener('click', () => show(app.key));
    tabsNav.append(tab);
    tabs.set(app.key, tab);
  }

  const mayOpen = key => key === 'pulse' || signedIn || openedAnyway.has(key);

  function frameFor(key) {
    if (frames.has(key)) return frames.get(key);
    const app = appByKey(key);
    const frame = document.createElement('iframe');
    frame.id = `one-frame-${key}`;
    frame.className = 'one-frame';
    frame.title = app.label;
    frame.name = `caliber-one-${key}`;
    frame.setAttribute('allow', allow);
    frame.setAttribute('role', 'tabpanel');
    frame.setAttribute('aria-labelledby', `one-tab-${key}`);
    tabs.get(key).dataset.state = 'loading';
    frame.addEventListener('load', () => {
      tabs.get(key).dataset.state = 'ready';
      listenForShortcuts(frame);
      if (key === current) startPreload();
    });
    frame.src = app.url;
    stage.append(frame);
    frames.set(key, frame);
    return frame;
  }

  function show(key) {
    const app = appByKey(key);
    if (!app) return;
    current = key;
    const open = mayOpen(key);
    if (open) frameFor(key);
    for (const [otherKey, frame] of frames) frame.classList.toggle('is-open', open && otherKey === key);
    waiting.hidden = open;
    if (!open) waiting.querySelector('.one-waiting-name').textContent = app.label;
    for (const [otherKey, tab] of tabs) {
      tab.setAttribute('aria-selected', String(otherKey === key));
      tab.tabIndex = otherKey === key ? 0 : -1;
    }
    document.title = `${app.label} · Caliber One`;
    save(key);
    if (window.location.hash !== `#${key}`) history.replaceState(null, '', `#${key}`);
    // Focus stays on the tab strip so Ctrl+1 … Ctrl+4 keep working until the user clicks into the page.
  }

  function startPreload() {
    if (preloadStarted || !signedIn) return;
    preloadStarted = true;
    const queue = preloadOrder(current).filter(key => !frames.has(key));
    const next = () => {
      const key = queue.shift();
      if (!key) return;
      if (document.visibilityState === 'hidden') {
        document.addEventListener('visibilitychange', () => { queue.unshift(key); next(); }, { once: true });
        return;
      }
      if (!frames.has(key)) frameFor(key);
      setTimeout(next, 2500);
    };
    setTimeout(next, 3000);
  }

  // Pulse is signed in when its saved sign-in is accepted. The same call renews the first-party
  // cookie by which Pulse recognises the sign-in for Diesel.
  async function checkPulse() {
    const token = pulseToken();
    if (!token) return false;
    if (token === checkedToken && Date.now() - checkedAt < 60000) return signedIn;
    checkedToken = token;
    checkedAt = Date.now();
    try {
      const response = await fetch('/api/mis-sso/remember', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      return response.ok;
    } catch { return false; }
  }
  async function watchSignIn() {
    const now = await checkPulse();
    if (now !== signedIn) {
      signedIn = now;
      signOutButton.hidden = !signedIn;
      if (signedIn) { show(current); startPreload(); }
    }
    setTimeout(watchSignIn, signedIn ? 15000 : 2000);
  }
  waiting.querySelector('.one-open-anyway').addEventListener('click', () => {
    openedAnyway.add(current);
    show(current);
  });
  waiting.querySelector('.one-go-pulse').addEventListener('click', () => show('pulse'));

  // Sign out all: MIS and HR Pulse sign out of themselves, Pulse ends the MIS and HR sign-ins it
  // opened and then its own, which also ends Diesel. Other computers are not signed out.
  signOutButton.addEventListener('click', async () => {
    if (!window.confirm('Sign out of Pulse, MIS, HR Pulse and Diesel on this computer?')) return;
    signOutButton.disabled = true;
    for (const { key, origin } of signOutTargets()) {
      try { frames.get(key)?.contentWindow?.postMessage({ type: SIGN_OUT_MESSAGE }, origin); } catch { /* tab not open */ }
    }
    const token = pulseToken();
    const headers = { Authorization: 'Bearer ' + token };
    if (token) {
      await fetch('/api/caliber-one/sign-out-all', { method: 'POST', headers }).catch(() => null);
      await fetch('/api/logout', { method: 'POST', headers }).catch(() => null);
    }
    for (const store of [window.localStorage, window.sessionStorage]) { try { store.removeItem(PULSE_SESSION_KEY); } catch { /* ignore */ } }
    // Gives MIS and HR Pulse a moment to finish signing out before every tab reloads.
    setTimeout(() => { history.replaceState(null, '', '#pulse'); window.location.reload(); }, 1500);
  });

  function onShortcut(event) {
    const key = keyFromShortcut(event, current);
    if (!key) return;
    event.preventDefault();
    show(key);
  }
  // A key pressed inside another website's tab stays in that website; only the Pulse tab (same
  // website as Caliber One) and the tab strip itself pass the shortcut on.
  function listenForShortcuts(frame) {
    try { frame.contentWindow.addEventListener('keydown', onShortcut); } catch { /* another website */ }
  }
  window.addEventListener('keydown', onShortcut);

  tabsNav.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = APPS.findIndex(app => app.key === current);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const key = APPS[(index + step + APPS.length) % APPS.length].key;
    show(key);
    tabs.get(key).focus();
  });

  // Another website's frame cannot be reloaded where it stands, so Reload opens the tab's home page.
  reloadButton.addEventListener('click', () => {
    const frame = frames.get(current);
    if (!frame) return;
    tabs.get(current).dataset.state = 'loading';
    frame.src = appByKey(current).url;
  });
  windowButton.addEventListener('click', () => window.open(appByKey(current).url, '_blank', 'noopener'));

  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener('appinstalled', () => { installButton.hidden = true; });

  window.addEventListener('hashchange', () => {
    const key = initialKey({ hash: window.location.hash, saved: current });
    if (key !== current) show(key);
  });

  (async () => {
    signedIn = await checkPulse();
    signOutButton.hidden = !signedIn;
    const first = initialKey({ hash: window.location.hash, saved: readSaved() });
    show(signedIn ? first : 'pulse');
    setTimeout(watchSignIn, signedIn ? 15000 : 2000);
  })();
}
