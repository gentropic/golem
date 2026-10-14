// ⚠ VENDORED — DO NOT EDIT. @gcu/sw's page-side companion, copied from ../auditable/ext/sw/register.js (at auditable 8837da6e).

// @gcu/sw — the page-side companion (ES module). Registration + persistent
// storage + the gcu-sw:* protocol, wrapped in a small client:
//
//   import { registerGcuSw } from '@gcu/sw';   // works: '#sw-register'
//   const sw = registerGcuSw({
//     url: 'sw.js',
//     onUpdateAvailable: () => showBanner(),   // toast → user clicks → sw.applyUpdate()
//     persist: true,                            // navigator.storage.persist()
//   });
//   sw.applyUpdate();          // coordinated reload of ALL tabs onto the new shell
//   await sw.checkNow();       // → { changed, at }
//   sw.setAutoCheck(false);
//   await sw.status();         // → { app, cache, autoCheck, at }
//   await sw.nuke();           // repair: delete caches + unregister (then reload)
//
// Everything is best-effort and no-ops gracefully where SWs don't exist
// (file://, older engines) — registerGcuSw never throws.

export function registerGcuSw(opts = {}) {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && window.isSecureContext;

  if (supported && opts.url) {
    try {
      addEventListener('load', () => {
        navigator.serviceWorker.register(opts.url).catch(() => {});
      });
    } catch { /* */ }
  }
  if (opts.persist !== false) {
    // A controlled PWA + persist() keep IndexedDB workspaces from eviction.
    try { navigator.storage?.persist?.().catch(() => {}); } catch { /* */ }
  }
  if (supported) {
    try {
      navigator.serviceWorker.addEventListener('message', (e) => {
        const t = e && e.data && e.data.type;
        if (t === 'gcu-sw:update-available' && opts.onUpdateAvailable) {
          try { opts.onUpdateAvailable(e.data); } catch { /* */ }
        }
        if (t === 'gcu-sw:reload') location.reload();
      });
    } catch { /* */ }
  }

  // One round-trip on a fresh MessageChannel; resolves null when no SW controls
  // the page (uncontrolled first load, file://, unsupported).
  const call = (msg, timeoutMs = 10000) => new Promise((resolve) => {
    const ctl = supported && navigator.serviceWorker.controller;
    if (!ctl) { resolve(null); return; }
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data); };
    try { ctl.postMessage(msg, [ch.port2]); } catch { clearTimeout(t); resolve(null); }
  });

  return {
    supported,
    checkNow: () => call({ type: 'gcu-sw:check-now' }, 30000),
    status: () => call({ type: 'gcu-sw:status' }),
    nuke: () => call({ type: 'gcu-sw:nuke' }),
    setAutoCheck(value) {
      try { navigator.serviceWorker?.controller?.postMessage({ type: 'gcu-sw:set-auto-check', value: !!value }); } catch { /* */ }
    },
    applyUpdate() {
      const ctl = supported && navigator.serviceWorker.controller;
      if (ctl) { try { ctl.postMessage({ type: 'gcu-sw:apply-update' }); return; } catch { /* */ } }
      try { location.reload(); } catch { /* */ }   // uncontrolled fallback
    },
  };
}
