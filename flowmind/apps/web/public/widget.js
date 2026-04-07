/*!
 * FlowMind Embed Widget
 * --------------------
 * Drop-in floating chat bubble. Reads its config from the <script> tag's
 * data-* attributes and lazily mounts an iframe pointing at
 *   <host>/chat/<assistantId>?embed=1
 *
 * Usage:
 *   <script
 *     src="https://your-flowmind-host/widget.js"
 *     data-flowmind-assistant="abc123"
 *     data-flowmind-host="https://your-flowmind-host"
 *     data-flowmind-theme="auto"  // "auto" | "light" | "dark"
 *     defer
 *   ></script>
 *
 * The script is intentionally dependency-free, vanilla, and ~3KB minified
 * so it's safe to drop on any third-party site.
 */
(function () {
  if (window.__flowmindWidgetMounted) return;
  window.__flowmindWidgetMounted = true;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function findOwnScript() {
    // Find the script tag that loaded us so we can read its data attributes.
    var current = document.currentScript;
    if (current && current.getAttribute('data-flowmind-assistant')) return current;
    var scripts = document.querySelectorAll('script[data-flowmind-assistant]');
    return scripts[scripts.length - 1] || null;
  }

  function resolveTheme(declared) {
    if (declared === 'light' || declared === 'dark') return declared;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  ready(function () {
    var script = findOwnScript();
    if (!script) {
      // No tag found — silently noop so we never break the host page.
      return;
    }

    var assistantId = script.getAttribute('data-flowmind-assistant');
    var host =
      script.getAttribute('data-flowmind-host') ||
      (script.src ? new URL(script.src).origin : window.location.origin);
    var declaredTheme = script.getAttribute('data-flowmind-theme') || 'auto';
    var theme = resolveTheme(declaredTheme);
    var position = script.getAttribute('data-flowmind-position') || 'bottom-right';

    if (!assistantId) {
      console.warn('[FlowMind] Missing data-flowmind-assistant attribute.');
      return;
    }

    var isDark = theme === 'dark';
    var posStyles =
      position === 'bottom-left'
        ? 'left: 20px; right: auto;'
        : 'right: 20px; left: auto;';

    // -------------------------------------------------------------------
    // Mount root + Shadow DOM so host page styles can never bleed in.
    // -------------------------------------------------------------------
    var root = document.createElement('div');
    root.id = 'flowmind-widget-root';
    root.style.cssText =
      'position: fixed; bottom: 0; ' +
      posStyles +
      ' z-index: 2147483646; pointer-events: none;';
    document.body.appendChild(root);

    var shadow = root.attachShadow ? root.attachShadow({ mode: 'open' }) : root;

    var style = document.createElement('style');
    style.textContent =
      ':host, * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }' +
      '.fm-bubble { pointer-events: auto; position: fixed; bottom: 20px; ' +
      posStyles +
      ' width: 56px; height: 56px; border-radius: 9999px; ' +
      'background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); ' +
      'box-shadow: 0 10px 40px -5px rgba(124, 58, 237, 0.5), 0 4px 12px rgba(0,0,0,0.15); ' +
      'border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; ' +
      'transition: transform 0.2s ease, box-shadow 0.2s ease; }' +
      '.fm-bubble:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 14px 50px -5px rgba(124, 58, 237, 0.6), 0 6px 16px rgba(0,0,0,0.18); }' +
      '.fm-bubble svg { width: 26px; height: 26px; color: white; }' +
      '.fm-panel { pointer-events: auto; position: fixed; bottom: 92px; ' +
      posStyles +
      ' width: min(400px, calc(100vw - 40px)); height: min(620px, calc(100vh - 120px)); ' +
      'border-radius: 18px; overflow: hidden; ' +
      'background: ' +
      (isDark ? '#0a0a0a' : '#ffffff') +
      '; ' +
      'box-shadow: 0 24px 80px -12px rgba(0, 0, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.12); ' +
      'border: 1px solid ' +
      (isDark ? '#262626' : '#e5e7eb') +
      '; ' +
      'transform: translateY(20px) scale(0.96); opacity: 0; transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1); ' +
      'display: none; }' +
      '.fm-panel.open { display: block; transform: translateY(0) scale(1); opacity: 1; }' +
      '.fm-iframe { width: 100%; height: 100%; border: 0; background: transparent; }' +
      '.fm-close { position: absolute; top: 14px; right: 14px; width: 28px; height: 28px; ' +
      'border-radius: 9999px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; ' +
      'background: rgba(0,0,0,0.06); color: ' +
      (isDark ? '#fff' : '#374151') +
      '; z-index: 2; }' +
      '.fm-close:hover { background: rgba(0,0,0,0.12); }';
    shadow.appendChild(style);

    var bubble = document.createElement('button');
    bubble.className = 'fm-bubble';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '</svg>';

    var panel = document.createElement('div');
    panel.className = 'fm-panel';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'fm-close';
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    var iframe = document.createElement('iframe');
    iframe.className = 'fm-iframe';
    iframe.setAttribute('title', 'FlowMind Assistant');
    iframe.setAttribute(
      'allow',
      'clipboard-write; microphone *; camera *',
    );
    // Lazy: only set src on first open so the iframe doesn't run unless used.
    var loaded = false;
    var chatUrl =
      host.replace(/\/$/, '') +
      '/chat/' +
      encodeURIComponent(assistantId) +
      '?embed=1&theme=' +
      encodeURIComponent(theme);

    panel.appendChild(closeBtn);
    panel.appendChild(iframe);
    shadow.appendChild(bubble);
    shadow.appendChild(panel);

    function open() {
      if (!loaded) {
        iframe.src = chatUrl;
        loaded = true;
      }
      panel.classList.add('open');
      bubble.style.display = 'none';
    }

    function close() {
      panel.classList.remove('open');
      bubble.style.display = '';
    }

    bubble.addEventListener('click', open);
    closeBtn.addEventListener('click', close);

    // Public API on window for host pages that want programmatic control.
    window.FlowMind = window.FlowMind || {};
    window.FlowMind.open = open;
    window.FlowMind.close = close;
    window.FlowMind.assistantId = assistantId;
  });
})();
