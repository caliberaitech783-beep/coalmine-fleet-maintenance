// Follow the host theme without reloading the directory or losing filters/forms.
(() => {
  const root = document.documentElement;
  let hostRoot;
  try { if (window.parent !== window) hostRoot = window.parent.document.documentElement; } catch {}
  const embedded = new URLSearchParams(window.location.search).get('embedded') === '1' || Boolean(hostRoot);
  root.dataset.embedded = embedded ? 'true' : 'false';
  const apply = () => {
    let saved;
    try { saved = localStorage.getItem('nerveCenterTheme'); } catch {}
    root.dataset.theme = (hostRoot?.dataset.theme || saved) === 'dark' ? 'dark' : 'light';
    root.style.colorScheme = root.dataset.theme;
  };
  apply();
  if (hostRoot) new MutationObserver(apply).observe(hostRoot, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('storage', event => { if (event.key === 'nerveCenterTheme') apply(); });

  // In BDMS the directory should participate in the application's page scroll,
  // rather than looking like a second scrollable website inside it.
  if (embedded && window.parent !== window) {
    let lastHeight = 0;
    let resizeFrame = 0;
    const publishHeight = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const wrap = document.querySelector('.wrap');
        const height = Math.ceil(wrap ? wrap.offsetTop + wrap.scrollHeight : Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight || 0));
        if (!height || Math.abs(height - lastHeight) < 2) return;
        lastHeight = height;
        window.parent.postMessage({ type: 'cdir:resize', height }, window.location.origin);
      });
    };
    const observe = () => {
      publishHeight();
      if (window.ResizeObserver && document.body) {
        const observer = new ResizeObserver(publishHeight);
        observer.observe(document.body);
        const wrap = document.querySelector('.wrap');
        if (wrap) observer.observe(wrap);
      }
      if (document.fonts?.ready) document.fonts.ready.then(publishHeight);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, { once: true });
    else observe();
    window.addEventListener('load', publishHeight, { once: true });
    window.addEventListener('resize', publishHeight);
  }
})();
