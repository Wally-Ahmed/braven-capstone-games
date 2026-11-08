/* Shared visual effects (CSS/JS only, no library). Styles live in shared/theme.css.
 *   FX.confetti(target?, count?)  burst of colored particles from an element (or the screen centre)
 *   FX.pop(el)    score pop      FX.shake(el)  red shake      FX.pulse(el)  green pulse
 *   FX.glow(el)   amber glow (Shield warning)
 *   FX.selectPunch(el, label?, {lite?})  the chosen option punches in full screen (0.7 s) with a whoosh + thud
 *   FX.wrongFull({variant?, lite?})  full-screen wrong-answer animation + sound (6 variants, random by default)
 * Every effect is skipped when the player prefers reduced motion. Particles never take clicks.
 */
(function () {
  'use strict';
  var COLORS = ['#ff4fa3', '#ffd23f', '#22d3ee', '#84f06b', '#a78bfa', '#ff8a3d'];
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduced = false; }
  var layer = null;

  function getLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-testid', 'fx-layer');
    document.body.appendChild(layer);
    return layer;
  }

  function restart(el, cls) {
    if (!el || reduced) return;
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    el.addEventListener('animationend', function done() { el.classList.remove(cls); el.removeEventListener('animationend', done); });
  }

  var FX = {
    confetti: function (target, count) {
      if (reduced) return;
      var l = getLayer(), lr = l.getBoundingClientRect(), w = lr.width || window.innerWidth, h = lr.height || window.innerHeight, x = w / 2, y = h / 3;
      if (target && target.getBoundingClientRect) {
        var r = target.getBoundingClientRect();
        x = r.left - lr.left + r.width / 2; y = r.top - lr.top + Math.min(r.height / 2, 60); // layer-relative (the portrait frame on desktop)
      }
      var n = count || 28;
      for (var i = 0; i < n; i++) {
        var p = document.createElement('i');
        p.className = 'fx-bit' + (i % 3 === 0 ? ' round' : '');
        var ang = Math.random() * Math.PI * 2, dist = 80 + Math.random() * 160;
        p.style.left = Math.max(0, Math.min(w - 10, x)) + 'px';
        p.style.top = Math.max(0, Math.min(h - 10, y)) + 'px';
        p.style.background = COLORS[i % COLORS.length];
        p.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
        p.style.setProperty('--dy', Math.round(Math.sin(ang) * dist * 0.7 + 120) + 'px');
        p.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
        p.style.animationDelay = Math.round(Math.random() * 120) + 'ms';
        l.appendChild(p);
      }
      setTimeout(function () { while (l.childNodes.length > n * 2) l.removeChild(l.firstChild); }, 50);
      setTimeout(function () { l.textContent = ''; }, 1700);
    },
    pop: function (el) { restart(el, 'fx-pop'); },
    shake: function (el) { restart(el, 'fx-shake'); },
    pulse: function (el) { restart(el, 'fx-pulse'); },
    glow: function (el) { restart(el, 'fx-glow'); },
    reduced: function () { return reduced; },
    /* Full-screen "wrong answer" moment: one of WRONG_VARIANTS at random (or opts.variant), each with its own
       sound (shared/audio.js Sfx.wrongVariant, muted with the global mute). It never takes clicks
       (pointer-events: none), a tap anywhere dismisses it, and it clears by itself within 1.6 s.
       opts.lite: smaller and shorter (the phone in room mode). Reduced motion: a static card + the sound. */
    wrongFull: function (opts) { return wrongFull(opts || {}); },
    WRONG_VARIANTS: null
  };

  var WRONG_VARIANTS = ['alarm', 'glass', 'stamp', 'glitch', 'nope', 'lock'];
  FX.WRONG_VARIANTS = WRONG_VARIANTS.slice();
  var WRONG_CSS = '' +
    '.fxw{position:fixed;inset:0;z-index:9800;pointer-events:none;overflow:hidden;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:fxw-out var(--fxw-ms,1400ms) ease-in forwards}' +
    '@keyframes fxw-out{0%,80%{opacity:1}100%{opacity:0}}' +
    '.fxw .fxw-word{font-weight:900;font-size:clamp(2rem,calc(11*var(--vw,1vw)),6rem);color:#fff;text-align:center;line-height:1;text-shadow:0 4px 0 rgba(0,0,0,.35);padding:0 12px;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}' +
    '.fxw.lite .fxw-word{font-size:clamp(1.6rem,calc(9*var(--vw,1vw)),3.2rem)}' +
    /* 0 alarm: red flashes + shake */
    '.fxw-alarm{animation:fxw-flash .22s steps(2) 5,fxw-out var(--fxw-ms,1400ms) ease-in forwards}@keyframes fxw-flash{0%{background:rgba(239,68,68,.75)}50%{background:rgba(127,29,29,.35)}}' +
    '.fxw-alarm .fxw-word{animation:fxw-shake .12s linear 8}@keyframes fxw-shake{0%,100%{transform:translate(0)}25%{transform:translate(-14px,6px)}75%{transform:translate(14px,-6px)}}' +
    /* 1 glass: crack lines grow out of the centre */
    '.fxw-glass{background:rgba(15,23,42,.35)}.fxw-glass svg{position:absolute;inset:0;width:100%;height:100%}.fxw-glass line{stroke:#fff;stroke-width:2.5;stroke-linecap:round;stroke-dasharray:1000;stroke-dashoffset:1000;animation:fxw-crack .25s ease-out forwards;filter:drop-shadow(0 0 2px #38bdf8)}@keyframes fxw-crack{to{stroke-dashoffset:0}}' +
    '.fxw-glass .fxw-word{position:relative;animation:fxw-drop .5s .2s cubic-bezier(.3,1.6,.5,1) both}@keyframes fxw-drop{from{transform:translateY(-60px);opacity:0}}' +
    /* 2 stamp: ACCESS DENIED slams in */
    '.fxw-stamp{background:rgba(0,0,0,.35)}.fxw-stamp .fxw-word{color:#ef4444;border:.12em solid #ef4444;border-radius:.15em;padding:.1em .3em;background:rgba(255,255,255,.9);text-shadow:none;transform:rotate(-12deg);animation:fxw-slam .28s cubic-bezier(.2,1.8,.4,1) both}@keyframes fxw-slam{from{transform:rotate(-12deg) scale(3.2);opacity:0}}' +
    /* 3 glitch: scanlines + falling green characters */
    '.fxw-glitch{background:repeating-linear-gradient(0deg,rgba(0,0,0,.55) 0 2px,rgba(0,20,0,.45) 2px 4px)}.fxw-glitch .fxw-col{position:absolute;top:-40%;color:#4ade80;font:700 18px/1.1 ui-monospace,Menlo,monospace;white-space:pre;animation:fxw-fall 1.2s linear both;text-shadow:0 0 6px #22c55e}@keyframes fxw-fall{to{transform:translateY(160vh)}}' +
    '.fxw-glitch .fxw-word{color:#4ade80;font-family:ui-monospace,Menlo,monospace;position:relative;animation:fxw-jit .09s steps(2) 12}@keyframes fxw-jit{0%{transform:translate(3px,-2px) skewX(8deg);text-shadow:-4px 0 #f0f,4px 0 #0ff}100%{transform:translate(-3px,2px);text-shadow:4px 0 #f0f,-4px 0 #0ff}}' +
    /* 4 nope: a big no-entry sign bounces in and bursts */
    '.fxw-nope{background:rgba(0,0,0,.3)}.fxw-nope .fxw-big{font-size:clamp(6rem,calc(40*var(--vw,1vw)),16rem);line-height:1;animation:fxw-bounce .9s cubic-bezier(.3,1.7,.5,1) both}.fxw.lite.fxw-nope .fxw-big{font-size:clamp(4rem,calc(28*var(--vw,1vw)),9rem)}@keyframes fxw-bounce{0%{transform:scale(0)}40%{transform:scale(1.25)}60%{transform:scale(.9)}85%{transform:scale(1);opacity:1}100%{transform:scale(1.6);opacity:0}}' +
    '.fxw-nope .fxw-p{position:absolute;left:50%;top:50%;width:14px;height:14px;border-radius:50%;background:#ef4444;opacity:0;animation:fxw-burst .6s .75s ease-out both}@keyframes fxw-burst{0%{opacity:1;transform:translate(-50%,-50%)}100%{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy)))}}' +
    /* 5 lock: an open padlock snaps shut */
    '.fxw-lock{background:rgba(30,27,75,.55);flex-direction:column;gap:8px}.fxw-lock .fxw-big{font-size:clamp(5rem,calc(32*var(--vw,1vw)),12rem);line-height:1;animation:fxw-snap .35s .35s cubic-bezier(.2,2,.4,1) both}@keyframes fxw-snap{from{transform:translateY(-30px) scale(1.2)}}' +
    '@media (prefers-reduced-motion:reduce){.fxw,.fxw *{animation:none!important}.fxw{background:rgba(15,23,42,.55)!important}.fxw-col,.fxw-p,.fxw svg{display:none}}';
  var current = null;
  function injectWrongCss() {
    if (document.getElementById('fxw-css')) return;
    var st = document.createElement('style'); st.id = 'fxw-css'; st.textContent = WRONG_CSS; document.head.appendChild(st);
  }
  function clearWrong() {
    if (!current) return;
    clearTimeout(current.timer); window.removeEventListener('pointerdown', current.tap, true);
    if (current.el.parentNode) current.el.parentNode.removeChild(current.el);
    current = null;
  }
  function wrongFull(opts) {
    if (!document.body) return null;
    injectWrongCss();
    clearWrong();
    var i = opts.variant != null ? ((Number(opts.variant) % WRONG_VARIANTS.length) + WRONG_VARIANTS.length) % WRONG_VARIANTS.length : Math.floor(Math.random() * WRONG_VARIANTS.length);
    var name = WRONG_VARIANTS[i], lite = !!opts.lite, ms = lite ? 1000 : 1400;
    var el = document.createElement('div');
    el.className = 'fxw fxw-' + name + (lite ? ' lite' : '');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-testid', 'fx-wrong');
    el.setAttribute('data-variant', name);
    el.style.setProperty('--fxw-ms', ms + 'ms');
    function word(t) { var w = document.createElement('div'); w.className = 'fxw-word'; w.textContent = t; return w; }
    function big(t) { var b = document.createElement('div'); b.className = 'fxw-big'; b.textContent = t; return b; }
    if (name === 'alarm') el.appendChild(word('🚨 WRONG 🚨'));
    else if (name === 'glass') {
      var svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
      for (var k = 0; k < 11; k++) {
        var a = k / 11 * Math.PI * 2 + Math.random() * 0.4, len = 35 + Math.random() * 40, ln = document.createElementNS(svgNS, 'line');
        ln.setAttribute('x1', 50); ln.setAttribute('y1', 50); ln.setAttribute('x2', 50 + Math.cos(a) * len); ln.setAttribute('y2', 50 + Math.sin(a) * len);
        ln.setAttribute('vector-effect', 'non-scaling-stroke'); ln.style.animationDelay = (k * 15) + 'ms';
        svg.appendChild(ln);
      }
      el.appendChild(svg); el.appendChild(word('CRACKED!'));
    } else if (name === 'stamp') el.appendChild(word('ACCESS DENIED'));
    else if (name === 'glitch') {
      var cols = lite ? 8 : 16, chars = '01アイウエオカキクケコ#$%&@';
      for (var c = 0; c < cols; c++) {
        var col = document.createElement('div'); col.className = 'fxw-col';
        var txt = ''; for (var r = 0; r < 14; r++) txt += chars[Math.floor(Math.random() * chars.length)] + '\n';
        col.textContent = txt; col.style.left = (c / cols * 100 + Math.random() * 3) + '%'; col.style.animationDelay = Math.round(Math.random() * 300) + 'ms';
        el.appendChild(col);
      }
      el.appendChild(word('SYSTEM BREACH'));
    } else if (name === 'nope') {
      el.appendChild(big('🚫'));
      for (var q = 0; q < (lite ? 10 : 18); q++) {
        var p = document.createElement('i'), an = Math.random() * Math.PI * 2, d = 90 + Math.random() * 160;
        p.className = 'fxw-p'; p.style.setProperty('--dx', Math.round(Math.cos(an) * d) + 'px'); p.style.setProperty('--dy', Math.round(Math.sin(an) * d) + 'px');
        p.style.background = COLORS[q % COLORS.length]; el.appendChild(p);
      }
    } else if (name === 'lock') {
      var lk = big('🔓'); el.appendChild(lk); el.appendChild(word('LOCKED OUT'));
      setTimeout(function () { lk.textContent = '🔒'; }, reduced ? 0 : 350);
    }
    document.body.appendChild(el);
    try { if (window.Sfx && window.Sfx.wrongVariant) window.Sfx.wrongVariant(name); else if (window.Sfx) window.Sfx.wrong(); } catch (e) { /* audio is optional */ }
    var me = { el: el, timer: 0, tap: function () { clearWrong(); } };
    me.timer = setTimeout(clearWrong, ms);
    el.addEventListener('animationend', function (e) { if (e.target === el && e.animationName === 'fxw-out' && current === me) clearWrong(); });
    // the tap that caused the wrong answer is already over; a later tap anywhere dismisses it (and still reaches the page)
    setTimeout(function () { if (current === me) window.addEventListener('pointerdown', me.tap, true); }, 0);
    current = me;
    return name;
  }

  /* Selection punch-in: the chosen option's label zooms from where it was tapped to the centre with an
     overshoot and a radial flash in its colour, then shrinks back (0.7 s; lite 0.5 s on phones), with a
     whoosh + thud (Sfx.punch). pointer-events: none, so it never blocks input. Reduced motion: a quick fade. */
  var PUNCH_CSS = '' +
    '.fxp{position:fixed;inset:0;z-index:9700;pointer-events:none;overflow:hidden;animation:fxp-flash var(--fxp-ms,700ms) ease-out forwards;background:radial-gradient(circle at 50% 50%,var(--fxp-c,#22d3ee) 0,transparent 65%)}' +
    '@keyframes fxp-flash{0%{opacity:0}25%{opacity:.55}60%{opacity:.25}100%{opacity:0}}' +
    '.fxp-label{position:absolute;left:50%;top:50%;max-width:calc(88*var(--vw,1vw));box-sizing:border-box;padding:.25em .6em;border-radius:.5em;background:var(--fxp-c,#22d3ee);color:var(--fxp-t,#0f172a);font:900 clamp(1.6rem,calc(9*var(--vw,1vw)),4.2rem)/1.1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;overflow-wrap:anywhere;box-shadow:0 10px 40px rgba(0,0,0,.45);animation:fxp-zoom var(--fxp-ms,700ms) cubic-bezier(.2,1.3,.4,1) forwards}' +
    '.fxp.lite .fxp-label{font-size:clamp(1.3rem,calc(7*var(--vw,1vw)),2.4rem)}' +
    '@keyframes fxp-zoom{0%{transform:translate(-50%,-50%) translate(var(--sx),var(--sy)) scale(var(--sc))}35%{transform:translate(-50%,-50%) scale(1.15)}50%{transform:translate(-50%,-50%) scale(1)}75%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-50%) translate(var(--sx),var(--sy)) scale(var(--sc));opacity:0}}' +
    '@media (prefers-reduced-motion:reduce){.fxp{animation:fxp-fade var(--fxp-ms,700ms) linear forwards;background:none}.fxp-label{animation:fxp-fade var(--fxp-ms,700ms) linear forwards;transform:translate(-50%,-50%)}}' +
    '@keyframes fxp-fade{0%{opacity:0}20%,70%{opacity:1}100%{opacity:0}}';
  var punch = null, wrongQueue = null;
  function clearPunch() {
    if (!punch) return;
    clearTimeout(punch.timer);
    if (punch.el.parentNode) punch.el.parentNode.removeChild(punch.el);
    punch = null;
    if (wrongQueue) { var w = wrongQueue; wrongQueue = null; wrongFull(w); } // the wrong-answer moment follows the punch
  }
  function solid(c) { return c && !/rgba\([^)]*,\s*0\)|transparent/.test(c) ? c : null; }
  function selectPunch(el, label, opts) {
    opts = opts || {};
    if (!document.body) return null;
    if (!document.getElementById('fxp-css')) { var st = document.createElement('style'); st.id = 'fxp-css'; st.textContent = PUNCH_CSS; document.head.appendChild(st); }
    if (punch) { var q = wrongQueue; wrongQueue = null; clearPunch(); wrongQueue = q; }
    var text = String(label != null ? label : (el && el.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 48);
    if (!text) return null;
    var ms = opts.lite ? 500 : 700, cs = el && el.getBoundingClientRect ? getComputedStyle(el) : null;
    var color = opts.color || (cs && (solid(cs.backgroundColor) || solid(cs.borderColor))) || '#22d3ee';
    var ov = document.createElement('div');
    ov.className = 'fxp' + (opts.lite ? ' lite' : ''); ov.setAttribute('aria-hidden', 'true'); ov.setAttribute('data-testid', 'fx-punch');
    ov.style.setProperty('--fxp-ms', ms + 'ms'); ov.style.setProperty('--fxp-c', color);
    if (cs && cs.color) ov.style.setProperty('--fxp-t', cs.color);
    var lb = document.createElement('div'); lb.className = 'fxp-label'; lb.textContent = text;
    ov.appendChild(lb); document.body.appendChild(ov);
    var sx = 0, sy = 0, sc = 0.4;
    if (el && el.getBoundingClientRect) {
      var r = el.getBoundingClientRect(), me = lb.getBoundingClientRect();
      if (r.width && me.width) { var or = ov.getBoundingClientRect(); sx = r.left + r.width / 2 - (or.left + or.width / 2); sy = r.top + r.height / 2 - (or.top + or.height / 2); sc = Math.max(0.2, Math.min(1, r.width / me.width)); }
    }
    lb.style.setProperty('--sx', Math.round(sx) + 'px'); lb.style.setProperty('--sy', Math.round(sy) + 'px'); lb.style.setProperty('--sc', sc.toFixed(3));
    try { if (window.Sfx && window.Sfx.punch) window.Sfx.punch(); } catch (e) { /* audio is optional */ }
    var mine = { el: ov, timer: setTimeout(function () { if (punch === mine) clearPunch(); }, ms) };
    ov.addEventListener('animationend', function (e) { if (e.target === ov && punch === mine) clearPunch(); });
    punch = mine;
    return text;
  }
  FX.selectPunch = function (el, label, opts) { return selectPunch(el, label, opts); };
  var wrongNow = FX.wrongFull;
  FX.wrongFull = function (opts) { opts = opts || {}; if (punch && opts.variant == null) { wrongQueue = opts; return 'queued'; } return wrongNow(opts); };
  window.FX = FX;
  window.Fx = FX;
})();
