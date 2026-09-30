// Follow the host theme without reloading the directory or losing filters/forms.
(() => {
  const root = document.documentElement;
  let hostRoot;
  try { if (window.parent !== window) hostRoot = window.parent.document.documentElement; } catch {}
  const apply = () => {
    root.dataset.simpleMobile=String(new URLSearchParams(location.search).get('simple')==='1'||hostRoot?.dataset.simpleMobile==='true');
    let saved;
    try { saved = localStorage.getItem('nerveCenterTheme'); } catch {}
    root.dataset.theme = (hostRoot?.dataset.theme || saved) === 'dark' ? 'dark' : 'light';
    root.style.colorScheme = root.dataset.theme;
  };
  apply();
  if (hostRoot) new MutationObserver(apply).observe(hostRoot, { attributes: true, attributeFilter: ['data-theme','data-simple-mobile'] });
  window.addEventListener('storage', event => { if (event.key === 'nerveCenterTheme') apply(); });
})();
