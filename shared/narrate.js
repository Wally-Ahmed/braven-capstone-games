/* Shared in-game narration for every Northbridge page (games and hub).
 *
 * Mark any block the player has to read with data attributes; Narrate finds it, reads it aloud
 * when it appears, pins a pulsing 🔊 badge to it while it is being read, and gives it a
 * "🔁 Replay" button that stays visible.
 *
 *   data-narrate="id1 id2 _ id3"  line ids from /shared/narration/<slug>/lines.json, read in order.
 *                                 "_" marks where data-narrate-say is spoken (default: first).
 *   data-narrate-say="text"       a dynamic part (names, scores), read by the browser voice.
 *   data-narrate-key="k"          identity of the block (default: its ids + say). A block is read once
 *                                 when its key appears and again only after it has left the screen.
 *   data-narrate-auto="0"         do not read on appear (Replay, focus or a tap still read it).
 *   data-narrate-interrupt="1"    stop whatever is playing and read this now (warnings, results).
 *   data-narrate-label="text"     what the Replay button's accessible name says it replays.
 *
 * A line plays its ElevenLabs MP3 (lines/<id>.mp3) when lines.json lists "audio"; otherwise, or if
 * the file fails, the browser's speech synthesis reads the same text. One queue, so nothing
 * overlaps. Shares the global mute with the sound effects (Sfx, localStorage "nb-muted"), waits
 * while the tutorial overlay is open, and stops a block's audio as soon as the block disappears.
 *
 *   Narrate.init({ slug })          load the manifest and start watching the page
 *   Narrate.say(id, text, el)       queue one ad-hoc line (id may be null: text only)
 *   Narrate.replay(el)              read a block again now
 *   Narrate.stop()                  stop and clear the queue
 *   Narrate.lines()                 the loaded manifest ({ id: { text, audio } })
 *   Narrate.log                     every part started: { key, id, via: 'audio'|'tts', text }
 */
(function () {
  'use strict';
  var cfg = null, lines = {}, ready = false, holdForTutorial = false;
  var present = new Map();      // key -> element currently on screen
  var queue = [];               // [{ key, el, parts }]
  var current = null;           // { key, el, parts, i }
  var audioEl = null, safety = null, scanQueued = false, observer = null, gen = 0;
  var log = [];

  function muted() {
    if (window.Sfx) return window.Sfx.muted();
    try { return window.localStorage.getItem('nb-muted') === '1'; } catch (e) { return false; }
  }
  function unmute() {
    if (window.Sfx) window.Sfx.setMuted(false);
    else { try { window.localStorage.setItem('nb-muted', '0'); } catch (e) { /* ignore */ } }
  }
  function tutorialOpen() { return !!(window.Tutorial && window.Tutorial.isOpen && window.Tutorial.isOpen()); }
  function paused() { return !ready || holdForTutorial || tutorialOpen(); }

  /* ---------------- blocks ---------------- */
  function keyOf(el) {
    return el.getAttribute('data-narrate-key') || (el.getAttribute('data-narrate') + '|' + (el.getAttribute('data-narrate-say') || ''));
  }
  function partsOf(el) {
    var ids = String(el.getAttribute('data-narrate') || '').trim().split(/\s+/).filter(Boolean);
    var say = el.getAttribute('data-narrate-say');
    if (say && ids.indexOf('_') < 0) ids.unshift('_');
    var parts = [];
    ids.forEach(function (id) {
      if (id === '_') { if (say) parts.push({ id: null, text: say }); return; }
      var L = lines[id];
      if (L) parts.push({ id: id, text: L.text, audio: !!L.audio });
      else if (!ready) parts.push({ id: id, text: '' }); // manifest not loaded yet: resolved at play time
    });
    if (!parts.length) {
      var t = (el.textContent || '').replace(/🔁 Replay/g, '').trim();
      if (t) parts.push({ id: null, text: t });
    }
    return parts;
  }
  function attachReplay(el) {
    if (el.querySelector(':scope > .nr-bar')) return;
    var bar = document.createElement('span');
    bar.className = 'nr-bar';
    var badge = document.createElement('span');
    badge.className = 'nr-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.setAttribute('data-testid', 'narrate-indicator');
    badge.textContent = '🔊';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nr-replay';
    b.setAttribute('data-testid', 'narrate-replay');
    b.setAttribute('data-sfx', 'none');
    var label = el.getAttribute('data-narrate-label');
    b.setAttribute('aria-label', 'Replay narration' + (label ? ': ' + label : ''));
    b.textContent = '🔁 Replay';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); Narrate.replay(el); });
    bar.appendChild(badge); bar.appendChild(b);
    el.appendChild(bar);
    el.classList.add('nr-block');
  }
  function mark() {
    document.querySelectorAll('.nr-speaking').forEach(function (n) {
      if (!current || n !== current.el) { n.classList.remove('nr-speaking'); n.removeAttribute('data-narrating'); }
    });
    if (current && current.el && current.el.isConnected) {
      current.el.classList.add('nr-speaking');
      current.el.setAttribute('data-narrating', 'true');
    }
  }

  function scan() {
    scanQueued = false;
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-narrate]'));
    var now = new Map(), fresh = [];
    els.forEach(function (el) {
      attachReplay(el);
      var k = keyOf(el);
      if (now.has(k)) return;
      now.set(k, el);
      if (!present.has(k)) fresh.push(el);
    });
    present = now;
    if (current) {
      if (now.has(current.key)) current.el = now.get(current.key);
      else stopCurrent(); // its block left the screen
    }
    queue = queue.filter(function (it) { if (!now.has(it.key)) return false; it.el = now.get(it.key); return true; });
    if (!paused() && !muted()) {
      fresh.forEach(function (el) {
        if (el.getAttribute('data-narrate-auto') === '0') return;
        enqueue(el, el.getAttribute('data-narrate-interrupt') === '1');
      });
    }
    mark();
    pump();
  }
  function requestScan() {
    if (scanQueued) return;
    scanQueued = true;
    Promise.resolve().then(scan);
  }

  /* ---------------- queue + playback ---------------- */
  function enqueue(el, interrupt) {
    var item = { key: keyOf(el), el: el, parts: partsOf(el), i: 0 };
    if (!item.parts.length) return;
    queue = queue.filter(function (it) { return it.key !== item.key; });
    if (current && current.key === item.key && !interrupt) return;
    if (interrupt) { queue.unshift(item); stopCurrent(); }
    else queue.push(item);
  }
  function clearSafety() { if (safety) { clearTimeout(safety); safety = null; } }
  function stopCurrent() {
    gen++;
    clearSafety();
    current = null;
    if (audioEl) { try { audioEl.onended = audioEl.onerror = null; audioEl.pause(); } catch (e) { /* ignore */ } }
    try { if (window.speechSynthesis && !tutorialOpen() && !navigator.webdriver) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    mark();
  }
  function pump() {
    if (current || paused() || muted()) return;
    var item = queue.shift();
    if (!item) { mark(); return; }
    current = item; item.i = 0;
    mark();
    playPart();
  }
  function nextPart(g) {
    if (g !== gen || !current) return;
    clearSafety();
    current.i++;
    if (current.i >= current.parts.length) { current = null; mark(); pump(); return; }
    playPart();
  }
  function playPart() {
    var g = gen, item = current, p = item.parts[item.i];
    if (p.id && !p.text && lines[p.id]) { p.text = lines[p.id].text; p.audio = !!lines[p.id].audio; }
    if (!p.text) { nextPart(g); return; }
    if (p.audio && cfg) {
      if (!audioEl) { audioEl = new Audio(); audioEl.preload = 'auto'; }
      audioEl.onended = function () { nextPart(g); };
      audioEl.onerror = function () { if (g === gen) speak(p, item, g); };
      try { audioEl.src = '/shared/narration/' + cfg.slug + '/lines/' + p.id + '.mp3'; audioEl.currentTime = 0; } catch (e) { /* ignore */ }
      log.push({ key: item.key, id: p.id, via: 'audio', text: p.text });
      var pr;
      try { pr = audioEl.play(); } catch (e) { pr = null; }
      if (pr && pr.catch) pr.catch(function (err) {
        if (g !== gen) return;
        if (err && err.name === 'NotAllowedError') { blocked(item); return; }
        if (err && err.name !== 'AbortError') speak(p, item, g);
      });
      // never let one stuck file hold the queue
      safety = setTimeout(function () { nextPart(g); }, 30000);
    } else {
      speak(p, item, g);
    }
  }
  function blocked(item) {
    // autoplay is blocked until the player taps: keep the block, make its Replay pulse
    if (item.el) item.el.classList.add('nr-blocked');
    current = null; queue = []; mark();
    pendingGesture = item.el;
  }
  // the first tap or key press anywhere starts the block autoplay could not
  var pendingGesture = null;
  function onGesture(e) {
    var el = pendingGesture;
    if (!el) return;
    pendingGesture = null;
    if (muted() || (e.target && e.target.closest && e.target.closest('.nr-replay, .nbm-bar, .nbm-panel, .tut-overlay'))) return; // Replay and menu taps decide for themselves
    setTimeout(function () { if (el.isConnected && !current && !muted()) Narrate.replay(el); }, 0);
  }
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);

  function pickVoice() {
    try {
      var vs = window.speechSynthesis.getVoices() || [];
      var en = vs.filter(function (v) { return /^en(-|_|$)/i.test(v.lang); });
      var pref = ['Samantha', 'Google US English', 'Ava', 'Allison', 'Karen', 'Microsoft Aria', 'Microsoft Jenny', 'Daniel'];
      for (var i = 0; i < pref.length; i++) for (var j = 0; j < en.length; j++) if (en[j].name.indexOf(pref[i]) === 0) return en[j];
      return en[0] || null;
    } catch (e) { return null; }
  }
  function speak(p, item, g) {
    clearSafety();
    log.push({ key: item.key, id: p.id, via: 'tts', text: p.text });
    var est = Math.min(20000, 1500 + p.text.length * 75);
    safety = setTimeout(function () { nextPart(g); }, est); // some browsers never fire onend
    if (navigator.webdriver) {
      // Automated test browsers: simulate the voice (silent, timed) instead of using the OS speech engine.
      clearSafety();
      var ms = window.__narrateSimMs != null ? window.__narrateSimMs : Math.max(800, Math.min(3000, p.text.length * 20));
      safety = setTimeout(function () { nextPart(g); }, ms);
      return;
    }
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
    try {
      var u = new window.SpeechSynthesisUtterance(p.text);
      var v = pickVoice(); if (v) u.voice = v;
      u.lang = (v && v.lang) || 'en-US'; u.rate = 1.0; u.pitch = 1.05;
      u.onend = function () { nextPart(g); };
      u.onerror = function (ev) { if (ev && ev.error === 'not-allowed') { if (g === gen) blocked(item); } else nextPart(g); };
      window.speechSynthesis.speak(u);
    } catch (e) { /* narration is optional */ }
  }

  /* ---------------- public ---------------- */
  var Narrate = {
    init: function (options) {
      if (cfg) return;
      cfg = options || {};
      if (!cfg.slug) { cfg = null; return; }
      // hold auto-play until the tutorial has decided whether to open (it reads first)
      holdForTutorial = !!(window.Tutorial && window.Tutorial.loaded && !window.Tutorial.loaded());
      var holdTimer = setTimeout(function () { if (holdForTutorial) { holdForTutorial = false; requestScan(); } }, 2500);
      document.addEventListener('nb-tutorial-ready', function () { holdForTutorial = false; clearTimeout(holdTimer); present = new Map(); requestScan(); });
      document.addEventListener('nb-tutorial-open', function () { stopCurrent(); queue = []; });
      document.addEventListener('nb-tutorial-close', function () { present = new Map(); requestScan(); });
      if (window.Sfx) window.Sfx.onChange(function (m) { if (m) { stopCurrent(); queue = []; } });
      var done = function (data) {
        lines = {};
        var src = (data && data.lines) || data || {};
        Object.keys(src).forEach(function (id) {
          var v = src[id];
          lines[id] = typeof v === 'string' ? { text: v, audio: false } : { text: v.text, audio: !!v.audio };
        });
        ready = true;
        present = new Map();
        requestScan();
      };
      if (window.fetch) {
        window.fetch('/shared/narration/' + cfg.slug + '/lines.json', { cache: 'no-cache' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(done, function () { done(null); });
      } else done(null);
      observer = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var t = muts[i].target;
          if (!(t.closest && t.closest('.nr-bar'))) { requestScan(); return; }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // Hub cards and any block marked auto=0 read when a control inside them gets keyboard focus.
      document.addEventListener('focusin', function (e) {
        var el = e.target && e.target.closest && e.target.closest('[data-narrate-focus="1"]');
        if (el && !e.target.classList.contains('nr-replay') && (!current || current.el !== el)) Narrate.replay(el);
      });
      document.addEventListener('click', function (e) {
        var el = e.target && e.target.closest && e.target.closest('[data-narrate-tap="1"]');
        if (el && !(e.target.closest('a, button'))) Narrate.replay(el);
      });
    },
    say: function (id, text, el) {
      var parts = [];
      if (id && lines[id]) parts.push({ id: id, text: lines[id].text, audio: !!lines[id].audio });
      else if (text) parts.push({ id: null, text: text });
      if (!parts.length || muted()) return;
      queue.push({ key: 'say:' + (id || text), el: el || null, parts: parts, i: 0 });
      pump();
    },
    replay: function (el) {
      if (!el) return;
      if (muted()) unmute(); // an explicit tap means "I want to hear it"
      el.classList.remove('nr-blocked');
      queue = queue.filter(function (it) { return it.key !== keyOf(el); });
      var item = { key: keyOf(el), el: el, parts: partsOf(el), i: 0 };
      if (!item.parts.length) return;
      stopCurrent();
      queue.unshift(item);
      pump();
    },
    stop: function () { stopCurrent(); queue = []; },
    lines: function () { return lines; },
    busy: function () { return !!current; },
    current: function () { return current ? current.key : null; },
    log: log
  };
  window.Narrate = Narrate;
})();
