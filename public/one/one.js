import { APPS, STORAGE_KEY, appByKey, initialKey, frameAllow, keyFromShortcut, preloadOrder } from './one-tabs.mjs';

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
  const allow = frameAllow();
  const frames = new Map();
  const tabs = new Map();
  let current = '';
  let preloadStarted = false;

  const readSaved = () => { try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; } };
  const save = key => { try { localStorage.setItem(STORAGE_KEY, key); } catch { /* private window */ } };

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
    frame.src = app.url;
    stage.append(frame);
    frames.set(key, frame);
    return frame;
  }

  function show(key) {
    const app = appByKey(key);
    if (!app) return;
    current = key;
    frameFor(key);
    for (const [otherKey, frame] of frames) frame.classList.toggle('is-open', otherKey === key);
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
    if (preloadStarted) return;
    preloadStarted = true;
    const waiting = preloadOrder(current).filter(key => !frames.has(key));
    const next = () => {
      const key = waiting.shift();
      if (!key) return;
      if (document.visibilityState === 'hidden') {
        document.addEventListener('visibilitychange', () => { waiting.unshift(key); next(); }, { once: true });
        return;
      }
      if (!frames.has(key)) frameFor(key);
      setTimeout(next, 2500);
    };
    setTimeout(next, 3000);
  }

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

  show(initialKey({ hash: window.location.hash, saved: readSaved() }));
}
