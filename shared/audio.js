/* Shared sound effects for every Northbridge game: WebAudio synth, no audio files.
 *   Sfx.tap() Sfx.correct() Sfx.wrong() Sfx.warning() Sfx.tick() Sfx.go() Sfx.win()
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

  var Sfx = {
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
