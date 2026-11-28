import { APPS, STORAGE_KEY, PULSE_SESSION_KEY, SIGN_OUT_MESSAGE, appByKey, frameUrl, initialKey, frameAllow, keyFromShortcut, preloadOrder, pulseTokenFrom, signOutTargets } from './one-tabs.mjs';

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
  const hint = document.querySelector('.one-hint');
  const allow = frameAllow();
  const frames = new Map();
  const tabs = new Map();
  let current = '';
  let preloadStarted = false;
  // One sign-in (owner, 28 Nov 2026): signed out, every tab shows the same single sign-in (Pulse's);
  // after it all four open. A sign-out in any tab signs out of all of them.
  let signedIn = false;
  let leaving = false;
  let liveToken = '';
  let lastCheck = 0;

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
    frame.src = frameUrl(app);
    stage.append(frame);
    frames.set(key, frame);
    return frame;
  }

  function show(key) {
    const app = appByKey(key);
    if (!app) return;
    current = key;
    // Signed out, whichever tab is chosen shows the one sign-in, in the Pulse frame.
    const shown = signedIn ? key : 'pulse';
    frameFor(shown);
    for (const [otherKey, frame] of frames) frame.classList.toggle('is-open', otherKey === shown);
    hint.hidden = signedIn;
    for (const [otherKey, tab] of tabs) {
      tab.setAttribute('aria-selected', String(otherKey === key));
      tab.tabIndex = otherKey === key ? 0 : -1;
    }
    document.title = `${signedIn ? app.label : 'Sign in'} · Caliber One`;
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
      if (!key || leaving) return;
      if (document.visibilityState === 'hidden') {
        document.addEventListener('visibilitychange', () => { queue.unshift(key); next(); }, { once: true });
        return;
      }
      if (!frames.has(key)) frameFor(key);
      setTimeout(next, 2500);
    };
    setTimeout(next, 1000);
  }

  // The sign-in counts once Pulse accepts it (its sign-in rules passed). The same call renews the
  // first-party cookie by which Pulse recognises the sign-in for Diesel.
  async function accepted(token) {
    try {
      const response = await fetch('/api/mis-sso/remember', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      return response.ok;
    } catch { return false; }
  }
  // Afterwards a light question every few seconds: does the sign-in still stand? Only a clear "no"
  // signs out; a failed or odd answer (network, a release in progress) changes nothing.
  async function ended(token) {
    try {
      const response = await fetch('/api/caliber-one/session', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (!response.ok) return false;
      return (await response.json()).signedIn === false;
    } catch { return false; }
  }

  // Sign out anywhere = sign out everywhere: the MIS and HR Pulse tabs sign out of themselves, Pulse
  // ends the sign-ins it opened, Diesel and HR ride on the Pulse sign-in. Then the window starts again
  // at the one sign-in. Other computers are not signed out.
  async function leave() {
    if (leaving) return;
    leaving = true;
    for (const { key, origin } of signOutTargets()) {
      try { frames.get(key)?.contentWindow?.postMessage({ type: SIGN_OUT_MESSAGE }, origin); } catch { /* tab not open */ }
    }
    const token = pulseToken() || liveToken;
    if (token) await fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(() => null);
    for (const store of [window.localStorage, window.sessionStorage]) { try { store.removeItem(PULSE_SESSION_KEY); } catch { /* ignore */ } }
    // Gives MIS and HR Pulse a moment to finish signing out before every tab reloads.
    setTimeout(() => window.location.reload(), 1500);
  }

  async function watch() {
    if (leaving) return;
    const token = pulseToken();
    if (!signedIn) {
      if (token && await accepted(token)) {
        signedIn = true;
        liveToken = token;
        lastCheck = Date.now();
        show(current);
        startPreload();
      }
    } else if (!token) {
      // Signed out in the Pulse tab.
      await leave();
    } else if (token !== liveToken) {
      // The same window signed in again (another role): carry on with the new sign-in.
      if (await accepted(token)) { liveToken = token; lastCheck = Date.now(); }
    } else if (document.visibilityState === 'visible' && Date.now() - lastCheck >= 5000) {
      // Signed out in the MIS, HR Pulse or Diesel tab, on the server, or the sign-in ran out.
      lastCheck = Date.now();
      if (await ended(token)) await leave();
    }
    if (!leaving) setTimeout(watch, 1000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lastCheck = 0; });

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
    const shown = signedIn ? current : 'pulse';
    const frame = frames.get(shown);
    if (!frame) return;
    tabs.get(shown).dataset.state = 'loading';
    frame.src = frameUrl(appByKey(shown));
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
    const token = pulseToken();
    if (token && await accepted(token)) { signedIn = true; liveToken = token; lastCheck = Date.now(); }
    show(initialKey({ hash: window.location.hash, saved: readSaved() }));
    setTimeout(watch, 1000);
  })();
}
