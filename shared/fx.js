/* Shared visual effects (CSS/JS only, no library). Styles live in shared/theme.css.
 *   FX.confetti(target?, count?)  burst of colored particles from an element (or the screen centre)
 *   FX.pop(el)    score pop      FX.shake(el)  red shake      FX.pulse(el)  green pulse
 *   FX.glow(el)   amber glow (Shield warning)
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
      var l = getLayer(), w = window.innerWidth, h = window.innerHeight, x = w / 2, y = h / 3;
      if (target && target.getBoundingClientRect) {
        var r = target.getBoundingClientRect();
        x = r.left + r.width / 2; y = r.top + Math.min(r.height / 2, 60);
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
    reduced: function () { return reduced; }
  };
  window.FX = FX;
})();
