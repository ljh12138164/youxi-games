/* 游隙 game protocol v1. Copy this file into the game's built assets. */
(() => {
  'use strict';
  function connect(options) {
    const origin = new URL(options.platformOrigin).origin;
    if (origin !== options.platformOrigin || origin === location.origin || parent === window) throw new Error('INVALID_PLATFORM_ORIGIN');
    let instance = null, playable = false, destroyed = false;
    let state = { boss: false, sidebar: false }, preferences = null;
    const received = new Set();
    const send = (type, payload) => {
      if (instance && !destroyed) parent.postMessage({ protocol_version: 1, instance_id: instance, request_id: crypto.randomUUID(), type, payload }, origin);
    };
    function apply(next, report) {
      state = { boss: next.boss === true, sidebar: next.sidebar === true };
      try { options.onState?.({ ...state }); } catch { /* A broken game callback cannot remove the platform cover. */ }
      let muted = false;
      try { muted = options.setTemporaryMuted?.(state.boss) === true; } catch { muted = false; }
      if (state.boss) {
        try { document.exitPointerLock?.(); } catch { /* Parent also releases its lock. */ }
      }
      if (report) {
        let running = 'running';
        try { if (options.isRunning?.() === false) running = 'paused'; } catch { /* Default is unknown/running. */ }
        send('boss.ack', { muted: state.boss && muted, running });
      }
    }
    const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const onMessage = event => {
      if (event.source !== parent || event.origin !== origin || destroyed) return;
      const m = event.data;
      try { if (JSON.stringify(m).length > 8192) return; } catch { return; }
      if (!m || m.protocol_version !== 1 || !uuid(m.instance_id) || !uuid(m.request_id)) return;
      if (m.type === 'platform.init') {
        if (!m.payload || typeof m.payload.state?.boss !== 'boolean' || typeof m.payload.state?.sidebar !== 'boolean') return;
        if (instance !== m.instance_id) received.clear();
        instance = m.instance_id;
      } else if (m.instance_id !== instance) return;
      if (received.has(m.request_id)) return;
      received.add(m.request_id); if (received.size > 1024) received.delete(received.values().next().value);
      if (m.type === 'platform.init') {
        preferences = m.payload.preferences;
        try { options.onIdentity?.(m.payload.identity); } catch { /* Game owns its display. */ }
        apply(m.payload.state, m.payload.state.boss);
        if (playable) send('game.ready', {});
      } else if (m.type === 'identity.changed') {
        try { options.onIdentity?.(m.payload); } catch { /* Keep the connection alive. */ }
      } else if (m.type === 'preferences.changed') preferences = m.payload;
      else if (['sidebar.changed', 'boss.enter', 'boss.exit'].includes(m.type)) apply(m.payload, m.type !== 'sidebar.changed');
    };
    const onKey = event => {
      if (!preferences || event.repeat || event.isComposing || !event.altKey || event.ctrlKey || event.metaKey) return;
      const action = ['sidebar', 'enter', 'exit'].find(name => preferences.shortcuts?.[name]?.code === event.code && preferences.shortcuts[name].shift === event.shiftKey);
      const editable = event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]');
      if (!action || (action === 'sidebar' && editable)) return;
      event.preventDefault(); event.stopImmediatePropagation(); send('shortcut.triggered', { action });
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey, true);
    parent.postMessage({ protocol_version: 1, type: 'game.hello' }, origin);
    return Object.freeze({
      ready() { playable = true; send('game.ready', {}); },
      open(panel = 'sidebar') { if (['sidebar', 'login', 'instructions', 'settings'].includes(panel)) send('platform.open', { panel }); },
      destroy() { destroyed = true; window.removeEventListener('message', onMessage); window.removeEventListener('keydown', onKey, true); },
    });
  }
  window.YouxiGame = Object.freeze({ connect });
})();
