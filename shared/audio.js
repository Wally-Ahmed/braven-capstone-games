/* Shared sound effects for every Northbridge game: WebAudio synth, no audio files.
 *   Sfx.tap() Sfx.correct() Sfx.wrong() Sfx.warning() Sfx.tick() Sfx.go() Sfx.win()
 *   Sfx.wrongVariant(name)  the sound for one full-screen wrong-answer variant (alarm glass stamp glitch nope lock)
 *   Sfx.muted()            true when the global mute is on (localStorage "nb-muted")
 *   Sfx.setMuted(bool)     set the global mute (sound effects AND tutorial narration)
 *   Sfx.toggle()           flip it; returns the new muted state
 *   Sfx.onChange(fn)       fn(muted) runs whenever the mute changes
 * The AudioContext is created on the first tap or key press, so nothing plays (or warns)
 * before the player interacts. Every button click plays a soft tap unless the button has
 * data-sfx="none".
 */
(function () {
  'use strict';
  var KEY = 'nb-muted';
  var ctx = null, master = null, listeners = [];
  var muted = false;
  try { muted = window.localStorage.getItem(KEY) === '1'; } catch (e) { muted = false; }

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } } return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  /* One synth note: oscillator type, start frequency, optional slide target, start offset and length (s). */
  function note(type, freq, at, len, opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    try {
      var t0 = ctx.currentTime + (at || 0);
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + len);
      var peak = opts.vol != null ? opts.vol : 0.3;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, len / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + len + 0.05);
    } catch (e) { /* audio is optional */ }
  }

  /* A filtered white-noise burst (glass, slams, glitches). */
  function noise(at, len, vol, freq, type) {
    if (!ctx || muted) return;
    try {
      var t0 = ctx.currentTime + (at || 0), n = Math.max(1, Math.floor(ctx.sampleRate * len));
      var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf; f.type = type || 'highpass'; f.frequency.value = freq || 2000; g.gain.value = vol != null ? vol : 0.3;
      src.connect(f); f.connect(g); g.connect(master); src.start(t0);
    } catch (e) { /* audio is optional */ }
  }
  /* One sound per full-screen wrong-answer variant (shared/fx.js FX.wrongFull). */
  var WRONG_SOUNDS = {
    alarm: function () { for (var i = 0; i < 3; i++) { note('sawtooth', 180, i * 0.2, 0.16, { vol: 0.2 }); note('square', 120, i * 0.2, 0.16, { vol: 0.12 }); } },
    glass: function () { noise(0, 0.35, 0.35, 3000); [2600, 3400, 2200, 4100].forEach(function (fq, i) { note('sine', fq, 0.03 + i * 0.05, 0.12, { vol: 0.1 }); }); },
    stamp: function () { noise(0, 0.18, 0.5, 400, 'lowpass'); note('sine', 90, 0, 0.3, { vol: 0.45, to: 45 }); },
    glitch: function () { for (var i = 0; i < 9; i++) note('square', 200 + Math.random() * 1800, i * 0.045, 0.04, { vol: 0.1 }); noise(0.42, 0.12, 0.2, 1200, 'bandpass'); },
    nope: function () { note('sine', 300, 0, 0.35, { vol: 0.3, to: 90 }); note('triangle', 600, 0.75, 0.08, { vol: 0.25, to: 1400 }); noise(0.75, 0.1, 0.2, 2500); },
    lock: function () { note('square', 1800, 0.35, 0.03, { vol: 0.2 }); noise(0.35, 0.05, 0.3, 3000); note('square', 900, 0.42, 0.04, { vol: 0.18 }); note('sine', 140, 0.5, 0.25, { vol: 0.25, to: 80 }); }
  };

  var Sfx = {
    wrongVariant: function (name) { (WRONG_SOUNDS[name] || Sfx.wrong)(); },
    tap: function () { note('triangle', 660, 0, 0.07, { vol: 0.15 }); },
    correct: function () { note('sine', 660, 0, 0.12, { vol: 0.3 }); note('sine', 880, 0.1, 0.12, { vol: 0.3 }); note('sine', 1320, 0.2, 0.22, { vol: 0.25 }); },
    wrong: function () { note('sawtooth', 220, 0, 0.18, { vol: 0.18, to: 150 }); note('square', 140, 0.16, 0.26, { vol: 0.14, to: 90 }); },
    warning: function () { note('square', 520, 0, 0.12, { vol: 0.14 }); note('square', 520, 0.2, 0.12, { vol: 0.14 }); note('triangle', 390, 0.4, 0.2, { vol: 0.18 }); },
    tick: function () { note('square', 1000, 0, 0.05, { vol: 0.12 }); },
    go: function () { note('square', 1400, 0, 0.18, { vol: 0.16 }); },
    win: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { note('triangle', f, i * 0.12, 0.18, { vol: 0.28 }); });
      note('sine', 1047, 0.5, 0.5, { vol: 0.25 }); note('sine', 1319, 0.5, 0.5, { vol: 0.18 }); note('sine', 1568, 0.5, 0.6, { vol: 0.14 });
    },
    muted: function () { return muted; },
    setMuted: function (on) {
      muted = !!on;
      try { window.localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* private mode: keep it in memory */ }
      listeners.slice().forEach(function (fn) { try { fn(muted); } catch (e) { /* ignore */ } });
    },
    toggle: function () { Sfx.setMuted(!muted); return muted; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && !b.disabled && b.getAttribute('data-sfx') !== 'none') Sfx.tap();
  }, true);

  window.Sfx = Sfx;
})();
