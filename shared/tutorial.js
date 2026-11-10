/* Shared "How to play" tutorial for every Northbridge game.
 * A game calls Tutorial.init({ slug, name }) once the DOM is ready. The steps (illustration,
 * caption, optional narration MP3) come from /shared/narration/<slug>/script.json.
 *
 * - Opens on load unless the player ticked "Skip the tutorial next time" (localStorage
 *   "nb-tutorial-skip:<slug>"). ?tutorial=1 always opens it, ?tutorial=0 never does.
 * - Narration auto-plays per step: the step's MP3 when script.json lists one, otherwise the
 *   browser's speech synthesis reads the same caption. Captions are always on screen.
 *   If the browser blocks autoplay, a "Tap to hear" button appears instead of an error.
 * - The voice shares the global mute with the sound effects (Sfx in shared/audio.js).
 * - Keyboard: Right/Left arrows step, Esc skips, Tab stays inside the dialog.
 * Tutorial.open() re-opens it (the shared Menu's "How to play" does this).
 */
(function () {
  'use strict';
  /* Site root, worked out from this script's own URL (shared/<file>.js), so the site works at a domain
     root and under a sub-path such as GitHub Pages' /braven-capstone-games/. */
  var ROOT = (function () {
    try { var src = document.currentScript && document.currentScript.src; if (src) return src.replace(/shared\/[^\/]*$/, ''); } catch (e) { /* ignore */ }
    return '/';
  })();
  var cfg = null, steps = [], idx = 0, overlay = null, lastFocus = null, audioEl = null;
  var playGen = 0, els = {}, localMute = false, speaking = false, loaded = false, pendingOpen = false;
  var HUES = ['#ff4fa3', '#22d3ee', '#ffd23f', '#84f06b', '#a78bfa'];

  function skipKey() { return 'nb-tutorial-skip:' + cfg.slug; }
  function getSkip() { try { return window.localStorage.getItem(skipKey()) === '1'; } catch (e) { return false; } }
  function setSkip(on) {
    try { if (on) window.localStorage.setItem(skipKey(), '1'); else window.localStorage.removeItem(skipKey()); } catch (e) { /* storage blocked */ }
  }
  function isMuted() { return window.Sfx ? window.Sfx.muted() : localMute; }
  function setMuted(on) { if (window.Sfx) window.Sfx.setMuted(on); else { localMute = !!on; syncMute(); } }

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------------- narration ---------------- */
  function syncTalking() { if (els.card) els.card.classList.toggle('talking', speaking); }
  function showBlocked(on) { if (els.listen) els.listen.hidden = !on; }
  function stopNarration() {
    speaking = false;
    if (audioEl) { try { audioEl.onerror = null; audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch (e) { /* ignore */ } }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    syncTalking();
  }

  function pickVoice() {
    try {
      var vs = window.speechSynthesis.getVoices() || [];
      var en = vs.filter(function (v) { return /^en(-|_|$)/i.test(v.lang); });
      var pref = ['Samantha', 'Google US English', 'Ava', 'Allison', 'Karen', 'Microsoft Aria', 'Microsoft Jenny', 'Daniel'];
      for (var i = 0; i < pref.length; i++) {
        for (var j = 0; j < en.length; j++) if (en[j].name.indexOf(pref[i]) === 0) return en[j];
      }
      return en[0] || null;
    } catch (e) { return null; }
  }

  function speakTTS(text) {
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
    try {
      window.speechSynthesis.cancel();
      var u = new window.SpeechSynthesisUtterance(text);
      var v = pickVoice(); if (v) u.voice = v;
      u.lang = (v && v.lang) || 'en-US';
      u.rate = 1.0; u.pitch = 1.05; u.volume = 1;
      u.onstart = function () { speaking = true; showBlocked(false); syncTalking(); };
      u.onend = function () { speaking = false; syncTalking(); };
      u.onerror = function (ev) { speaking = false; syncTalking(); if (ev && ev.error === 'not-allowed') showBlocked(true); };
      window.speechSynthesis.speak(u);
    } catch (e) { /* narration is optional */ }
  }

  function narrate() {
    stopNarration();
    if (isMuted() || !overlay || overlay.hidden) return;
    var s = steps[idx]; if (!s) return;
    var text = s.say || (s.title + '. ' + s.text);
    if (s.audio) {
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.preload = 'auto';
        audioEl.addEventListener('playing', function () { speaking = true; showBlocked(false); syncTalking(); });
        audioEl.addEventListener('ended', function () { speaking = false; syncTalking(); });
      }
      // Wally 11/10: never swap the recorded coach for the system voice. A clip that fails is retried
      // once (fresh request); if it still fails the caption stays on screen silently. ?voice=mixed
      // restores the old browser-voice fallback.
      var mixed = /[?&]voice=mixed/.test(location.search), tries = 0, my = ++playGen;
      var url = ROOT + 'shared/narration/' + cfg.slug + '/' + s.audio;
      var failed = function () {
        if (my !== playGen) return;
        if (tries < 1) { tries++; start(url + '?r=' + Date.now()); return; }
        speaking = false; syncTalking();
        if (mixed) speakTTS(text);
      };
      var start = function (u) {
        audioEl.onerror = failed;
        audioEl.src = u;
        var p;
        try { p = audioEl.play(); } catch (e) { p = null; }
        if (p && p.catch) p.catch(function (err) {
          if (my !== playGen) return;
          if (err && err.name === 'NotAllowedError') showBlocked(true);
          else if (err && err.name !== 'AbortError') failed();
        });
      };
      start(url);
    } else {
      speakTTS(text);
    }
  }

  /* ---------------- rendering ---------------- */
  function syncMute() {
    if (!els.mute) return;
    var m = isMuted();
    els.mute.textContent = m ? '🔇 Voice off' : '🔊 Voice on';
    els.mute.setAttribute('aria-pressed', m ? 'true' : 'false');
    els.mute.setAttribute('data-state', m ? 'muted' : 'on');
    if (m) { stopNarration(); showBlocked(false); }
  }

  function renderStep() {
    var s = steps[idx];
    els.card.setAttribute('data-step', String(idx));
    els.card.setAttribute('data-kind', s.intro ? 'intro' : s.id === 'about' ? 'about' : 'howto');
    els.card.style.setProperty('--tut-hue', HUES[idx % HUES.length]);
    els.art.textContent = '';
    els.art.className = 'tut-art anim-' + (s.anim || 'float');
    (s.art || ['🎮']).forEach(function (e, i) { els.art.appendChild(el('span', { 'class': 'tut-emo', style: '--i:' + i }, e)); });
    els.chips.textContent = '';
    (s.chips || []).forEach(function (c, i) { els.chips.appendChild(el('span', { 'class': 'tut-chip c' + (i % 5), style: '--i:' + i }, c)); });
    els.title.textContent = s.title;
    els.text.textContent = s.text;
    els.progress.textContent = 'Step ' + (idx + 1) + ' of ' + steps.length;
    els.dots.textContent = '';
    steps.forEach(function (_, i) { els.dots.appendChild(el('span', { 'class': 'tut-dot' + (i === idx ? ' on' : i < idx ? ' done' : '') })); });
    els.back.disabled = idx === 0;
    var last = idx === steps.length - 1;
    els.next.textContent = last ? "🎮 Let's play!" : 'Next ➡️';
    els.next.setAttribute('data-last', last ? 'true' : 'false');
    els.card.classList.remove('tut-in'); void els.card.offsetWidth; els.card.classList.add('tut-in');
  }

  function go(i) {
    if (i < 0 || i >= steps.length) return;
    idx = i; renderStep(); narrate();
  }

  function build() {
    overlay = el('div', { 'class': 'tut-overlay', 'data-testid': 'tutorial-overlay', role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': 'tut-title', 'aria-describedby': 'tut-text' });
    overlay.hidden = true;
    var box = el('div', { 'class': 'tut-box' });

    var head = el('div', { 'class': 'tut-head' });
    head.appendChild(el('div', { 'class': 'tut-kicker' }, '❓ How to play · ' + (cfg.name || 'Game')));
    els.mute = el('button', { 'class': 'tut-btn tut-ghost', type: 'button', 'data-testid': 'tutorial-mute', 'data-sfx': 'none' });
    els.skip = el('button', { 'class': 'tut-btn tut-skip', type: 'button', 'data-testid': 'tutorial-skip' }, '⏭️ Skip tutorial');
    var headBtns = el('div', { 'class': 'tut-head-btns' });
    headBtns.appendChild(els.mute); headBtns.appendChild(els.skip);
    head.appendChild(headBtns);

    els.card = el('div', { 'class': 'tut-card', 'data-testid': 'tutorial-step' });
    els.art = el('div', { 'class': 'tut-art', 'data-testid': 'tutorial-art', 'aria-hidden': 'true' });
    els.chips = el('div', { 'class': 'tut-chips', 'aria-hidden': 'true' });
    var bars = el('span', { 'class': 'tut-bars', 'aria-hidden': 'true' });
    for (var b = 0; b < 4; b++) bars.appendChild(el('i', {}));
    var cap = el('div', { 'class': 'tut-caption', 'data-testid': 'tutorial-caption' });
    els.title = el('h2', { id: 'tut-title' });
    els.text = el('p', { id: 'tut-text' });
    cap.appendChild(els.title); cap.appendChild(els.text);
    els.listen = el('button', { 'class': 'tut-btn tut-listen', type: 'button', 'data-testid': 'tutorial-listen', 'data-sfx': 'none' }, '🔊 Tap to hear the coach');
    els.listen.hidden = true;
    [els.art, els.chips, bars, cap, els.listen].forEach(function (n) { els.card.appendChild(n); });

    var nav = el('div', { 'class': 'tut-nav' });
    els.dots = el('div', { 'class': 'tut-dots', 'data-testid': 'tutorial-dots', 'aria-hidden': 'true' });
    els.progress = el('div', { 'class': 'tut-progress', 'data-testid': 'tutorial-progress', 'aria-live': 'polite' });
    els.back = el('button', { 'class': 'tut-btn tut-ghost', type: 'button', 'data-testid': 'tutorial-back' }, '⬅️ Back');
    els.next = el('button', { 'class': 'tut-btn tut-next', type: 'button', 'data-testid': 'tutorial-next' }, 'Next ➡️');
    var btnRow = el('div', { 'class': 'tut-row' });
    btnRow.appendChild(els.back); btnRow.appendChild(els.next);
    nav.appendChild(els.dots); nav.appendChild(els.progress); nav.appendChild(btnRow);

    var rem = el('label', { 'class': 'tut-remember' });
    els.remember = el('input', { type: 'checkbox', 'data-testid': 'tutorial-remember' });
    rem.appendChild(els.remember); rem.appendChild(document.createTextNode(' Skip the tutorial next time'));

    [head, els.card, nav, rem].forEach(function (n) { box.appendChild(n); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    els.skip.addEventListener('click', function () { close('skip'); });
    els.next.addEventListener('click', function () { if (idx >= steps.length - 1) close('done'); else go(idx + 1); });
    els.back.addEventListener('click', function () { go(idx - 1); });
    els.listen.addEventListener('click', function () { showBlocked(false); if (isMuted()) setMuted(false); narrate(); });
    els.mute.addEventListener('click', function () { setMuted(!isMuted()); syncMute(); if (!isMuted()) narrate(); });
    els.remember.addEventListener('change', function () { setSkip(els.remember.checked); });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('skip'); }
      else if (e.key === 'ArrowRight' && e.target !== els.remember) { e.preventDefault(); if (idx < steps.length - 1) go(idx + 1); }
      else if (e.key === 'ArrowLeft' && e.target !== els.remember) { e.preventDefault(); go(idx - 1); }
      else if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(overlay.querySelectorAll('button, input'), function (n) { return !n.disabled && !n.hidden; });
        if (!f.length) return;
        var first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    });
    if (window.Sfx) window.Sfx.onChange(syncMute);
  }

  function open() {
    if (!cfg) return;
    if (!loaded) { pendingOpen = true; return; }
    if (!steps.length) return;
    if (!overlay) build();
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.documentElement.classList.add('tut-open');
    els.remember.checked = getSkip();
    showBlocked(false);
    idx = 0; renderStep(); syncMute();
    try { els.next.focus({ preventScroll: true }); } catch (e) { els.next.focus(); }
    emit('nb-tutorial-open');
    narrate();
  }

  /* Lets shared/narrate.js hold the in-game narration while the tutorial talks. */
  function emit(name) { try { document.dispatchEvent(new CustomEvent(name)); } catch (e) { /* ignore */ } }

  function close(why) {
    if (!overlay || overlay.hidden) return;
    stopNarration();
    overlay.hidden = true;
    document.documentElement.classList.remove('tut-open');
    if (els.remember.checked) setSkip(true);
    if (lastFocus && lastFocus.focus && lastFocus !== document.body && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    emit('nb-tutorial-close');
    if (typeof cfg.onClose === 'function') cfg.onClose(why);
  }

  function load() {
    var done = function (data) {
      steps = (data && data.steps) || [];
      loaded = true;
      var q = new URLSearchParams(window.location.search).get('tutorial');
      if (pendingOpen || q === '1' || (q !== '0' && !getSkip())) { pendingOpen = false; open(); }
      emit('nb-tutorial-ready');
    };
    if (!window.fetch) { done(null); return; }
    window.fetch(ROOT + 'shared/narration/' + cfg.slug + '/script.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(done, function () { done(null); });
  }

  window.Tutorial = {
    init: function (options) {
      if (cfg) return;
      cfg = options || {};
      if (!cfg.slug) { cfg = null; return; }
      load();
    },
    open: open,
    close: function () { close('api'); },
    isOpen: function () { return !!(overlay && !overlay.hidden); },
    loaded: function () { return loaded; },
    step: function () { return idx; }
  };
})();
