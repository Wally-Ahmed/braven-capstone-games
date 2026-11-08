/* Shared menu for every Northbridge game.
 * Each game calls Menu.init({ name, restart, setShield, howTo, shield }) once the DOM is ready:
 *   name      game title shown in the top bar
 *   restart() reset the game to its setup screen
 *   setShield(on) turn the Shield assistant on (true) or off (false)
 *   howTo     rules text (string; plain text, lines starting with "- " become a list)
 *   shield    initial Shield state (boolean, default true)
 */
(function () {
  'use strict';
  /* Site root, worked out from this script's own URL (shared/<file>.js), so the site works at a domain
     root and under a sub-path such as GitHub Pages' /braven-capstone-games/. */
  var ROOT = (function () {
    try { var src = document.currentScript && document.currentScript.src; if (src) return src.replace(/shared\/[^\/]*$/, ''); } catch (e) { /* ignore */ }
    return '/';
  })();
  var cfg = null, bar, overlay, panel, menuBtn, shieldBtn, howtoBox, soundBtn = null, shieldOn = true, lastFocus = null;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  function renderHowTo(text) {
    howtoBox.textContent = '';
    if (window.Tutorial) {
      var tut = el('button', { 'class': 'nbm-btn nbm-tut', type: 'button', 'data-testid': 'menu-tutorial' }, '🎬 Watch the tutorial (with voice)');
      tut.addEventListener('click', function () { close(); window.Tutorial.open(); });
      howtoBox.appendChild(tut);
    }
    var lines = String(text || 'No rules text yet.').split('\n'), ul = null;
    lines.forEach(function (line) {
      line = line.trim();
      if (!line) return;
      if (line.indexOf('- ') === 0) {
        if (!ul) { ul = el('ul', {}); howtoBox.appendChild(ul); }
        ul.appendChild(el('li', {}, line.slice(2)));
      } else {
        ul = null;
        howtoBox.appendChild(el('p', { style: 'margin:4px 0' }, line));
      }
    });
  }

  function updateShieldLabel() {
    shieldBtn.textContent = '🛡️ Shield: ' + (shieldOn ? 'on' : 'off');
    shieldBtn.setAttribute('aria-pressed', shieldOn ? 'true' : 'false');
    shieldBtn.setAttribute('data-state', shieldOn ? 'on' : 'off');
  }

  function updateSoundLabel() {
    if (!soundBtn) return;
    var m = window.Sfx.muted();
    soundBtn.textContent = m ? '🔇' : '🔊';
    soundBtn.setAttribute('aria-label', m ? 'Sound off, turn sound on' : 'Sound on, turn sound off');
    soundBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
    soundBtn.setAttribute('data-state', m ? 'muted' : 'on');
  }

  /* Fullscreen: the Start button asks for it on the first tap (where the browser allows it; iPhone Safari does
     not, and automated test browsers are left alone), and the Menu has an on/off item that shows the real state. */
  var fsBtn = null;
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function fsSupported() {
    var d = document.documentElement;
    return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(d.requestFullscreen || d.webkitRequestFullscreen);
  }
  function enterFullscreen() {
    try {
      var d = document.documentElement, req = d.requestFullscreen || d.webkitRequestFullscreen;
      if (!req || fsElement()) return;
      var p = req.call(d, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(function () { /* refused: stay in the page */ });
    } catch (e) { /* unsupported */ }
  }
  function exitFullscreen() {
    try {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex && fsElement()) { var p = ex.call(document); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { /* ignore */ }
  }
  function updateFsLabel() {
    if (!fsBtn) return;
    var on = !!fsElement(), ok = fsSupported();
    fsBtn.textContent = '⛶ Fullscreen: ' + (ok ? (on ? 'on' : 'off') : 'not available here');
    fsBtn.disabled = !ok;
    fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fsBtn.setAttribute('data-state', on ? 'on' : 'off');
  }
  document.addEventListener('fullscreenchange', updateFsLabel);
  document.addEventListener('webkitfullscreenchange', updateFsLabel);
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-testid="btn-start"]') : null;
    if (b && !navigator.webdriver && fsSupported()) enterFullscreen();
  }, true);

  function open() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    var first = panel.querySelector('button');
    if (first) first.focus();
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    howtoBox.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.focus();
  }

  function build() {
    bar = el('div', { 'class': 'nbm-bar', 'data-testid': 'menu-bar', role: 'banner' });
    var title = el('div', { 'class': 'nbm-title', 'data-testid': 'menu-title' }, cfg.name || 'Game');
    menuBtn = el('button', { 'class': 'nbm-btn', type: 'button', 'data-testid': 'menu-btn', 'aria-haspopup': 'dialog',
      'aria-expanded': 'false', 'aria-controls': 'nbm-panel' }, '☰ Menu');
    bar.appendChild(title);
    var right = el('div', { 'class': 'nbm-right' });
    right.appendChild(menuBtn);
    if (window.Sfx) {
      // After the Menu button in the DOM so Tab still reaches Menu first; shown to its left.
      soundBtn = el('button', { 'class': 'nbm-btn nbm-sound', type: 'button', 'data-testid': 'sound-toggle', 'data-sfx': 'none' });
      soundBtn.addEventListener('click', function () { window.Sfx.toggle(); });
      window.Sfx.onChange(updateSoundLabel);
      right.appendChild(soundBtn);
      updateSoundLabel();
    }
    bar.appendChild(right);

    overlay = el('div', { 'class': 'nbm-overlay', 'data-testid': 'menu-overlay' });
    overlay.hidden = true;
    panel = el('div', { 'class': 'nbm-panel', id: 'nbm-panel', 'data-testid': 'menu-panel', role: 'dialog',
      'aria-modal': 'true', 'aria-label': 'Game menu' });
    panel.appendChild(el('h2', {}, 'Menu'));
    var sel = el('button', { 'class': 'nbm-btn', type: 'button', 'data-testid': 'menu-game-selection' }, '🏠 Game selection');
    var rst = el('button', { 'class': 'nbm-btn', type: 'button', 'data-testid': 'menu-restart' }, '🔄 Restart');
    shieldBtn = el('button', { 'class': 'nbm-btn', type: 'button', 'data-testid': 'menu-shield' });
    fsBtn = el('button', { 'class': 'nbm-btn', type: 'button', 'data-testid': 'menu-fullscreen' });
    var how = el('button', { 'class': 'nbm-btn', type: 'button', 'data-testid': 'menu-howto', 'aria-expanded': 'false' }, '❓ How to play');
    howtoBox = el('div', { 'class': 'nbm-howto', 'data-testid': 'menu-howto-text' });
    howtoBox.hidden = true;
    var closeBtn = el('button', { 'class': 'nbm-btn', type: 'button', 'data-testid': 'menu-close' }, '✕ Close');
    var note = el('p', { 'class': 'nbm-small' }, 'Shield is a prototype, scripted agent. Press Esc to close.');
    [sel, rst, shieldBtn, fsBtn, how, howtoBox, closeBtn, note].forEach(function (n) { panel.appendChild(n); });
    overlay.appendChild(panel);

    renderHowTo(cfg.howTo);
    updateShieldLabel();
    updateFsLabel();
    fsBtn.addEventListener('click', function () { if (fsElement()) exitFullscreen(); else enterFullscreen(); });

    menuBtn.addEventListener('click', function () { overlay.hidden ? open() : close(); });
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    sel.addEventListener('click', function () { window.location.href = ROOT; });
    rst.addEventListener('click', function () { close(); if (typeof cfg.restart === 'function') cfg.restart(); });
    shieldBtn.addEventListener('click', function () {
      shieldOn = !shieldOn;
      updateShieldLabel();
      if (typeof cfg.setShield === 'function') cfg.setShield(shieldOn);
    });
    how.addEventListener('click', function () {
      howtoBox.hidden = !howtoBox.hidden;
      how.setAttribute('aria-expanded', howtoBox.hidden ? 'false' : 'true');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) { e.preventDefault(); close(); }
    });

    document.body.insertBefore(bar, document.body.firstChild);
    document.body.appendChild(overlay);
  }

  window.Menu = {
    init: function (options) {
      if (cfg) return;
      cfg = options || {};
      shieldOn = cfg.shield !== false;
      build();
    },
    /* Let a game sync the label if Shield changes elsewhere (e.g. a URL param). */
    setShieldState: function (on) { shieldOn = !!on; if (shieldBtn) updateShieldLabel(); },
    open: function () { if (overlay) open(); },
    close: function () { if (overlay) close(); }
  };
})();
