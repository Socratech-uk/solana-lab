// A publication mode, independent of installed/runtime feature detection.
export function isHostedPreview(win = globalThis) {
  return win.document?.querySelector('meta[name="solana-lab-mode"]')?.content === 'preview';
}
export const PREVIEW = isHostedPreview();
export const PREVIEW_REASON = 'Requires the installed app and its Sidecars.';
export function requireRuntime() {
  if (isHostedPreview()) throw Object.assign(new Error(PREVIEW_REASON), {code:'LAB_PREVIEW_ONLY'});
}
export function routePath() {
  if (!PREVIEW) return location.hash.replace(/^#\/?/, '');
  if (location.hash.startsWith('#/')) return location.hash.slice(2);
  const base = new URL(document.baseURI).pathname;
  return location.pathname === base.slice(0, -1) ? '' : location.pathname.slice(base.length).replace(/\/$/, '');
}
export function previewHref(route = '') {
  const base = new URL(document.baseURI).pathname;
  return route ? base + route : base.slice(0, -1);
}
export function wirePreviewNavigation(render) {
  if (!PREVIEW) return;
  const migrateHash = () => {
    if (location.hash.startsWith('#/')) history.replaceState(null, '', previewHref(location.hash.slice(2)) + location.search);
  };
  migrateHash();
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a');
    if (!link || link.hasAttribute('download') || link.target && link.target !== '_self') return;
    const url = new URL(link.href, location.href), base = new URL(document.baseURI).pathname;
    if (url.origin !== location.origin || !(url.pathname === base.slice(0,-1) || url.pathname.startsWith(base))) return;
    if (url.hash || /\.[a-z0-9]+$/i.test(url.pathname)) return;
    event.preventDefault();history.pushState(null, '', url.pathname + url.search);render();
    document.querySelector('#content')?.focus({preventScroll:true});window.scrollTo({top:0});
  });
  window.addEventListener('popstate', render);
  window.addEventListener('hashchange', () => {migrateHash();render();});
}
export function applyPreviewPresentation() {
  if (!PREVIEW) return;
  const skip=document.querySelector('.skip');
  if(skip)skip.setAttribute('href',location.pathname+location.search+'#content');
  document.querySelectorAll('a[href^="#/"]').forEach(link => link.setAttribute('href', previewHref(link.getAttribute('href').slice(2))));
  document.querySelectorAll('#content [data-action], #content form[data-form] input, #content form[data-form] select, #content form[data-form] textarea, #content form[data-form] button, #export-all').forEach(control => {
    control.disabled = true;control.title = PREVIEW_REASON;control.setAttribute('aria-describedby', 'preview-notice');
  });
  const note = document.querySelector('[data-market-note]');
  if (note) note.textContent = 'Live pricing and Arena execution require the installed app.';
  const entry = document.querySelector('[data-market-entry]');
  if (entry) entry.value = 'Available in the installed app';
}
