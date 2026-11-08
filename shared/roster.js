/* Shared team / player picker for every Northbridge game's setup screen (no text box).
 * A count picker (− / + and 2..6 chips), one card per team with a default name, a tappable emoji avatar
 * that cycles colours, and tap-to-rename inline. Loaded WITHOUT defer, before the game script, because
 * the games render their first screen while parsing.
 *
 *   const roster = Roster.create({ kind: 'Team', names: ['Red Team', 'Blue Team'], pool: [...] })
 *   Roster.view(roster)              HTML for the setup screen (every control has data-action="roster")
 *   Roster.handle(roster, dataset)   apply a tap (the game re-renders, then calls Roster.afterRender)
 *   Roster.input(roster, el)         live rename while typing (no re-render)
 *   Roster.names(roster)             the names to start with (blank names fall back to the default)
 *   Roster.afterRender(root, roster) focus the rename box when one is open
 *   Roster.bind(root, roster, render) wire taps, typing and Enter/Escape (re-renders through the game)
 */
(function () {
  'use strict';
  var AVATARS = [['🦊', '#ff4fa3'], ['🐙', '#22d3ee'], ['🦁', '#ffd23f'], ['🐸', '#84f06b'], ['🦄', '#a78bfa'], ['🐯', '#ff8a3d'],
    ['🐼', '#cbd5e1'], ['🐳', '#3b82f6'], ['🦉', '#f472b6'], ['🐝', '#facc15']];
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function create(o) {
    var r = { kind: o.kind || 'Team', min: o.min || 2, max: o.max || 6, pool: (o.pool || []).slice(), list: [], editing: -1 };
    (o.names || []).forEach(function (n) { add(r, n); });
    while (r.list.length < r.min) add(r);
    return r;
  }
  function defaultName(r, i) { return r.pool[i] || (r.kind + ' ' + (i + 1)); }
  function add(r, name) {
    var used = r.list.map(function (p) { return p.av; }), av = 0;
    while (used.indexOf(av) >= 0 && av < AVATARS.length - 1) av++;
    var i = r.list.length;
    var taken = r.list.map(function (p) { return p.name.toLowerCase(); });
    var n = name;
    if (!n) { n = defaultName(r, i); var k = 0; while (taken.indexOf(n.toLowerCase()) >= 0) n = r.kind + ' ' + (i + 1 + (++k)); }
    r.list.push({ name: n, av: av });
  }
  function setCount(r, n) {
    n = Math.max(r.min, Math.min(r.max, n));
    while (r.list.length < n) add(r);
    if (r.list.length > n) r.list.length = n;
    if (r.editing >= n) r.editing = -1;
  }
  function handle(r, d) {
    var i = Number(d.i);
    switch (d.op) {
      case 'minus': setCount(r, r.list.length - 1); break;
      case 'plus': setCount(r, r.list.length + 1); break;
      case 'count': setCount(r, Number(d.n)); break;
      case 'avatar': {
        var used = r.list.map(function (p) { return p.av; }), av = r.list[i].av;
        for (var step = 1; step <= AVATARS.length; step++) {
          var next = (av + step) % AVATARS.length;
          if (used.indexOf(next) < 0) { r.list[i].av = next; break; }
        }
        break;
      }
      case 'edit': r.editing = i; break;
      case 'done': r.editing = -1; break;
    }
  }
  function input(r, el) {
    var i = Number(el.getAttribute('data-roster-i'));
    if (r.list[i]) r.list[i].name = el.value.slice(0, 24);
  }
  function names(r) {
    return r.list.map(function (p, i) { return p.name.trim() || defaultName(r, i); });
  }
  function view(r) {
    var kind = r.kind, kinds = kind.toLowerCase() + 's', n = r.list.length, h = '';
    h += '<div class="roster" data-testid="roster">';
    h += '<div class="roster-count" role="group" aria-label="How many ' + kinds + '">' +
      '<button type="button" class="roster-step" data-action="roster" data-op="minus" data-testid="roster-minus" aria-label="One fewer ' + kind.toLowerCase() + '"' + (n <= r.min ? ' disabled' : '') + '>−</button>' +
      '<span class="roster-n" data-testid="roster-count" aria-live="polite">' + n + ' ' + (n === 1 ? kind.toLowerCase() : kinds) + '</span>' +
      '<button type="button" class="roster-step" data-action="roster" data-op="plus" data-testid="roster-plus" aria-label="One more ' + kind.toLowerCase() + '"' + (n >= r.max ? ' disabled' : '') + '>+</button>' +
      '</div><div class="roster-chips" role="group" aria-label="Pick a number">';
    for (var k = r.min; k <= r.max; k++) {
      h += '<button type="button" class="roster-chip' + (k === n ? ' on' : '') + '" data-action="roster" data-op="count" data-n="' + k + '" data-testid="roster-count-' + k + '" aria-pressed="' + (k === n) + '" aria-label="' + k + ' ' + kinds + '">' + k + '</button>';
    }
    h += '</div><ol class="roster-cards">';
    r.list.forEach(function (p, i) {
      var a = AVATARS[p.av];
      h += '<li class="roster-card" data-testid="roster-card" style="--av:' + a[1] + '">' +
        '<button type="button" class="roster-av" data-action="roster" data-op="avatar" data-i="' + i + '" data-testid="roster-avatar" aria-label="Change the icon for ' + esc(p.name || defaultName(r, i)) + '">' + a[0] + '</button>';
      if (r.editing === i) {
        h += '<input class="roster-input" data-testid="roster-name-input" data-roster-i="' + i + '" value="' + esc(p.name) + '" maxlength="24" aria-label="' + kind + ' ' + (i + 1) + ' name" autocomplete="off" enterkeyhint="done">' +
          '<button type="button" class="roster-done" data-action="roster" data-op="done" data-testid="roster-done" aria-label="Done renaming">✓</button>';
      } else {
        h += '<button type="button" class="roster-name" data-action="roster" data-op="edit" data-i="' + i + '" data-testid="roster-rename" aria-label="Rename ' + esc(p.name || defaultName(r, i)) + '">' +
          '<span data-testid="roster-name">' + esc(p.name || defaultName(r, i)) + '</span><span class="roster-pen" aria-hidden="true">✏️</span></button>';
      }
      h += '</li>';
    });
    h += '</ol><p class="roster-help muted small">Tap an icon to change it, tap a name to rename it.</p></div>';
    return h;
  }
  function afterRender(root, r) {
    if (r.editing < 0) return;
    var inp = root.querySelector('[data-testid="roster-name-input"]');
    if (inp && document.activeElement !== inp) { inp.focus(); try { inp.select(); } catch (e) { /* ignore */ } }
  }
  /* Wires the picker inside a game's root: taps, live typing, Enter/Escape to finish renaming. */
  function bind(root, r, rerender) {
    function redraw() { rerender(); afterRender(root, r); }
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-action="roster"]');
      if (!b || b.disabled) return;
      handle(r, b.dataset); redraw();
    });
    root.addEventListener('input', function (e) { if (e.target.matches && e.target.matches('.roster-input')) input(r, e.target); });
    root.addEventListener('keydown', function (e) {
      if (!(e.target.matches && e.target.matches('.roster-input'))) return;
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); input(r, e.target); r.editing = -1; redraw(); }
    });
  }
  window.Roster = { bind: bind, create: create, view: view, handle: handle, input: input, names: names, afterRender: afterRender, setCount: setCount };
})();
