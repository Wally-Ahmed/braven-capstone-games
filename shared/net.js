/* Room mode ("Play on phones") for every Northbridge game. Loaded WITHOUT defer, before the game script.
 *
 * The big screen is the HOST: it creates a room on the local game server (server/index.js, WebSocket at /ws),
 * shows the code and a QR code, and stays authoritative: every player move is checked against the controls
 * that player was offered, then fed to the game's own dispatch(move); after every dispatch the host sends each
 * phone its own small view. A phone opened at games/<slug>/?room=CODE is a PLAYER: it joins with a name and an
 * avatar and shows only its own status, prompt echo, Shield warning and controls.
 *
 * When /ws is not there (GitHub Pages, python http.server) room mode stays hidden and nothing is logged.
 *
 *   Net.init({ slug, name, kind, phase(), view(seat), start(players), dispatch(move), render(), exportState(), importState(s, pausedMs) })
 *     exportState()/importState(): the game's full serializable state; the host syncs it to the server after every
 *     change so a player can take over as host (v8 host transfer) and carry on from the same point.
 *     view(seat) -> { status: 'turn'|'wait'|'spectate'|'over', title, prompt, warning, note, score,
 *                     wrongKey, buttons: [{ label, move, kind }] }   seat null = spectator; a new wrongKey plays
 *                     the lighter FX.wrongFull on that phone
 *   Net.available()   true once the server answered the probe
 *   Net.isPlayer()    true on a phone page (?room=CODE), false again once that phone is promoted to host
 * v8 lobbies (11/11): the host's lobby screen shows the lobby name, the lobby code players type (changeable while
 * open), the players and Start; the 4-letter room code, link and QR sit under a collapsed "Show code / QR".
 *   Net.host()        open a room from the setup screen
 *   Net.changed()     the game calls this after every dispatch/render
 *   Net.button()      the setup screen's "Play on phones" button HTML ('' when unavailable)
 * All markup is built from esc()-escaped strings and parsed with DOMParser (scripts never run).
 */
(function () {
  'use strict';
  var ROOT = (function () {
    try { var src = document.currentScript && document.currentScript.src; if (src) return src.replace(/shared\/[^\/]*$/, ''); } catch (e) { /* ignore */ }
    return location.origin + '/';
  })();
  var params = new URLSearchParams(location.search);
  var ROOM_PARAM = (params.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  var KEY_PARAM = (params.get('key') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  var promoted = false; // a phone that became the host (v8 host transfer)
  var AVATARS = ['🦊', '🐙', '🦁', '🐸', '🦄', '🐯', '🐼', '🐳', '🦉', '🐝'];
  var cfg = null, avail = false, probed = false, publicOrigin = '';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setHtml(el, html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    el.replaceChildren.apply(el, Array.from(doc.body.childNodes));
  }
  function store(kind, k, v) {
    try { var s = kind === 'session' ? sessionStorage : localStorage; if (v === undefined) return s.getItem(k); s.setItem(k, v); } catch (e) { /* storage blocked */ }
    return null;
  }
  // Same origin as the page: the socket and the join links always use location.host, so the backend (/ws) and
  // the frontend are one domain wherever it is deployed. Only the path prefix comes from ROOT (subpath hosting).
  var ROOT_PATH = (function () { try { return new URL(ROOT, location.href).pathname; } catch (e) { return '/'; } })();
  var SELF_LOCAL = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  function wsUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + ROOT_PATH + 'ws'; }
  function pageBase() {
    // X-Public-Origin (a tunnel URL) is honoured only while the big screen itself is on localhost;
    // on a real deployment the join link is always this page's own origin.
    if (publicOrigin && SELF_LOCAL) return publicOrigin + ROOT_PATH;
    return location.origin + ROOT_PATH;
  }

  /* ------------------------------------------------------------------ *
   * Tiny QR code encoder (byte mode, error correction M, versions 1 to 10), after Project Nayuki's
   * reference algorithm. QR.svg(text) returns an SVG string.
   * ------------------------------------------------------------------ */
  var QR = (function () {
    var ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
    var BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
    function rawModules(ver) {
      var r = (16 * ver + 128) * ver + 64;
      if (ver >= 2) { var na = Math.floor(ver / 7) + 2; r -= (25 * na - 10) * na - 55; if (ver >= 7) r -= 36; }
      return r;
    }
    function dataCodewords(ver) { return Math.floor(rawModules(ver) / 8) - ECC_M[ver] * BLOCKS_M[ver]; }
    function gmul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
    function divisor(deg) {
      var r = []; for (var i = 0; i < deg; i++) r.push(0); r[deg - 1] = 1; var root = 1;
      for (i = 0; i < deg; i++) { for (var j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gmul(root, 2); }
      return r;
    }
    function remainder(data, div) {
      var r = div.map(function () { return 0; });
      data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); div.forEach(function (c, i) { r[i] ^= gmul(c, f); }); });
      return r;
    }
    function alignPos(ver) {
      if (ver === 1) return [];
      var na = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
      var step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2, res = [6];
      for (var pos = size - 7; res.length < na; pos -= step) res.splice(1, 0, pos);
      return res;
    }
    function encode(text) {
      var bytes = Array.from(new TextEncoder().encode(text)), ver;
      for (ver = 1; ver <= 10; ver++) {
        if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver) * 8) break;
      }
      if (ver > 10) throw new Error('text too long for the QR encoder');
      var bits = [];
      function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
      put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(function (b) { put(b, 8); });
      var cap = dataCodewords(ver) * 8;
      put(0, Math.min(4, cap - bits.length));
      put(0, (8 - bits.length % 8) % 8);
      for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
      var data = [], i, j, k;
      for (i = 0; i < bits.length; i += 8) { var v = 0; for (k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; data.push(v); }
      // error correction + interleave
      var nb = BLOCKS_M[ver], ecl = ECC_M[ver], raw = Math.floor(rawModules(ver) / 8);
      var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = divisor(ecl), blocks = [];
      for (i = 0, k = 0; i < nb; i++) {
        var dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += dat.length;
        var ecc = remainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc));
      }
      var cw = [];
      for (i = 0; i < blocks[0].length; i++) for (j = 0; j < blocks.length; j++) if (i !== shortLen - ecl || j >= nShort) cw.push(blocks[j][i]);
      // function patterns
      var size = ver * 4 + 17, mod = [], fn = [];
      for (i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
      function setF(x, y, d) { mod[y][x] = d; fn[y][x] = true; }
      for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
      [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
        for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = c[0] + dx, yy = c[1] + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
        }
      });
      var ap = alignPos(ver), na = ap.length;
      for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
        for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) setF(ap[i] + ax, ap[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
      }
      function drawFormat(mask) {
        var d = mask, rem = d; // ECC level M has format bits 00
        for (var t = 0; t < 10; t++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        var b = ((d << 10) | rem) ^ 0x5412;
        function bit(n) { return ((b >>> n) & 1) !== 0; }
        for (var q = 0; q <= 5; q++) setF(8, q, bit(q));
        setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
        for (q = 9; q < 15; q++) setF(14 - q, 8, bit(q));
        for (q = 0; q < 8; q++) setF(size - 1 - q, 8, bit(q));
        for (q = 8; q < 15; q++) setF(8, size - 15 + q, bit(q));
        setF(8, size - 8, true);
      }
      drawFormat(0);
      if (ver >= 7) {
        var vr = ver; for (i = 0; i < 12; i++) vr = (vr << 1) ^ ((vr >>> 11) * 0x1F25);
        var vb = (ver << 12) | vr;
        for (i = 0; i < 18; i++) { var bt = ((vb >>> i) & 1) !== 0, a = size - 11 + i % 3, bb = Math.floor(i / 3); setF(a, bb, bt); setF(bb, a, bt); }
      }
      // codewords in the zigzag
      var bi = 0;
      for (var right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (var vert = 0; vert < size; vert++) for (j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && bi < cw.length * 8) { mod[y][x] = ((cw[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
        }
      }
      function maskBit(m, x, y) {
        switch (m) {
          case 0: return (x + y) % 2 === 0; case 1: return y % 2 === 0; case 2: return x % 3 === 0; case 3: return (x + y) % 3 === 0;
          case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; case 5: return x * y % 2 + x * y % 3 === 0;
          case 6: return (x * y % 2 + x * y % 3) % 2 === 0; default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
      }
      function applyMask(m) { for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) if (!fn[yy][xx] && maskBit(m, xx, yy)) mod[yy][xx] = !mod[yy][xx]; }
      function penalty() { // runs, 2x2 blocks and balance (the finder-look-alike rule is skipped; any mask is valid)
        var p = 0, dark = 0, yy, xx;
        for (var a2 = 0; a2 < size; a2++) {
          var rr = 1, rc = 1;
          for (var b2 = 1; b2 < size; b2++) {
            if (mod[a2][b2] === mod[a2][b2 - 1]) { rr++; if (rr === 5) p += 3; else if (rr > 5) p++; } else rr = 1;
            if (mod[b2][a2] === mod[b2 - 1][a2]) { rc++; if (rc === 5) p += 3; else if (rc > 5) p++; } else rc = 1;
          }
        }
        for (yy = 0; yy < size; yy++) for (xx = 0; xx < size; xx++) {
          if (mod[yy][xx]) dark++;
          if (yy < size - 1 && xx < size - 1 && mod[yy][xx] === mod[yy][xx + 1] && mod[yy][xx] === mod[yy + 1][xx] && mod[yy][xx] === mod[yy + 1][xx + 1]) p += 3;
        }
        return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      }
      var best = 0, bestP = Infinity;
      for (var m = 0; m < 8; m++) { applyMask(m); drawFormat(m); var pp = penalty(); if (pp < bestP) { bestP = pp; best = m; } applyMask(m); }
      applyMask(best); drawFormat(best);
      return mod;
    }
    function svg(text) {
      var mod = encode(text), n = mod.length, q = 4, d = '';
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (mod[y][x]) d += 'M' + (x + q) + ',' + (y + q) + 'h1v1h-1z';
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q) + '" shape-rendering="crispEdges" role="img" aria-label="QR code for the join link">' +
        '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
    }
    return { encode: encode, svg: svg };
  })();

  /* ------------------------------------------------------------------ *
   * Styles (host lobby, room badge, player view)
   * ------------------------------------------------------------------ */
  var CSS = '' +
    '.nr-ov{position:fixed;inset:0;z-index:9000;background:rgba(10,8,30,.86);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}' +
    '.nr-box{background:#1e1b4b;color:#fff;border:2px solid #a78bfa;border-radius:20px;padding:20px;max-width:760px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-height:100%;overflow:auto;box-sizing:border-box}' +
    '.nr-box h2{margin:0 0 6px;font-size:1.4rem}.nr-grid{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}' +
    '.nr-qr{background:#fff;border-radius:12px;padding:6px;width:min(240px,calc(60*var(--vw,1vw)));flex:0 0 auto}.nr-qr svg{display:block;width:100%;height:auto}' +
    '.nr-info{flex:1 1 240px;min-width:0}.nr-code{font-size:3rem;font-weight:900;letter-spacing:.25em;color:#ffd23f;margin:4px 0}' +
    '.nr-url{word-break:break-all;font-size:.9rem;color:#c4b5fd}.nr-list{list-style:none;padding:0;margin:10px 0;display:flex;flex-wrap:wrap;gap:8px}' +
    '.nr-list li{background:#312e81;border-radius:999px;padding:6px 12px;font-weight:700}.nr-list li.off{opacity:.5}.nr-list li.spec{border:1px dashed #a78bfa;background:none}' +
    '.nr-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.nr-row button{min-height:44px;padding:10px 18px;border-radius:12px;border:0;font:inherit;font-weight:800;cursor:pointer;background:#334155;color:#fff}' +
    '.nr-row button.go{background:#84f06b;color:#0f172a}.nr-row button:disabled{opacity:.5;cursor:not-allowed}.nr-muted{color:#c4b5fd;font-size:.9rem}' +
    '.nr-badge{position:fixed;left:10px;bottom:10px;z-index:8000;min-height:44px;border-radius:999px;border:2px solid #a78bfa;background:#1e1b4b;color:#fff;font:inherit;font-weight:800;padding:8px 14px;cursor:pointer}' +
    '#net-player{position:fixed;inset:0;z-index:9500;overflow:auto;background:linear-gradient(160deg,#1e1b4b,#4c1d95 60%,#831843);color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom))}' +
    '#net-player .np{max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:12px}' +
    '#net-player header{display:flex;align-items:center;gap:10px;font-size:1.2rem}#net-player .np-av{font-size:2.2rem}#net-player .np-score{margin-left:auto;background:rgba(255,255,255,.15);border-radius:999px;padding:4px 12px;font-weight:800}' +
    '#net-player .np-status{border-radius:16px;padding:14px;font-size:1.5rem;font-weight:900;text-align:center;background:rgba(255,255,255,.12)}' +
    '#net-player .np-status.turn{background:#84f06b;color:#0f172a;animation:np-pulse 1.2s ease-in-out infinite alternate}#net-player .np-status.over{background:#ffd23f;color:#0f172a}' +
    '@keyframes np-pulse{to{transform:scale(1.03)}}@media (prefers-reduced-motion:reduce){#net-player .np-status.turn{animation:none}}' +
    '#net-player .np-prompt{background:rgba(0,0,0,.25);border-radius:12px;padding:12px;white-space:pre-wrap;margin:0}#net-player .np-note{margin:0;color:#e9d5ff}' +
    '#net-player .np-warn{background:#f59e0b;color:#1f1300;border-radius:12px;padding:12px;font-weight:700}' +
    '#net-player .np-btns{display:flex;flex-direction:column;gap:10px}#net-player .np-btns button{min-height:56px;border-radius:14px;border:0;font:inherit;font-size:1.15rem;font-weight:800;cursor:pointer;background:#e0e7ff;color:#1e1b4b;padding:10px 14px}' +
    '#net-player .np-btns button.primary{background:#22d3ee}#net-player .np-btns button.good{background:#84f06b}#net-player .np-btns button.bad{background:#ff4fa3;color:#fff}#net-player .np-btns button.hint{background:#ffd23f}' +
    '#net-player .np-btns button:disabled{opacity:.5}#net-player input{min-height:48px;border-radius:12px;border:0;padding:8px 12px;font:inherit;font-size:1.1rem;width:100%;box-sizing:border-box}' +
    '#net-player .np-avs{display:flex;flex-wrap:wrap;gap:8px}#net-player .np-avs button{min-width:52px;min-height:52px;font-size:1.6rem;border-radius:12px;border:3px solid transparent;background:rgba(255,255,255,.15);cursor:pointer}' +
    '.nr-name{font-size:1.6rem}.nr-hostnow{display:inline-block;background:#ffd23f;color:#1b1446;border-radius:999px;padding:4px 12px;font-weight:900;margin:0 0 8px}' +
    '.nr-key{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#312e81;border-radius:14px;padding:10px 14px;margin:8px 0}.nr-key b{font-size:2rem;letter-spacing:.15em;color:#ffd23f}' +
    '.nr-key input{min-height:44px;border-radius:10px;border:0;padding:6px 10px;font:inherit;font-size:1.2rem;text-transform:uppercase;width:12ch}.nr-key button{min-height:44px;padding:8px 14px;border-radius:10px;border:0;font:inherit;font-weight:800;cursor:pointer;background:#e0e7ff;color:#1e1b4b}' +
    '.nr-more{margin-top:12px;border-top:1px solid rgba(255,255,255,.15);padding-top:8px}.nr-more summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:800;color:#c4b5fd}' +
    '.nr-err{background:#ef4444;border-radius:10px;padding:8px 10px;margin:4px 0}' +
    '.nr-badge.nr-hn{left:auto;right:10px;background:#ffd23f;color:#1b1446;border-color:#ffd23f;cursor:default}' +
    '#net-player .np-avs button[aria-pressed="true"]{border-color:#ffd23f;background:rgba(255,210,63,.3)}#net-player .np-err{background:#ef4444;border-radius:12px;padding:10px;margin:0}';
  function injectCss() {
    if (document.getElementById('net-css')) return;
    var s = document.createElement('style'); s.id = 'net-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ *
   * Connection with automatic reconnect
   * ------------------------------------------------------------------ */
  function connect(onOpen, onMsg, onDrop) {
    var c = { ws: null, closed: false, onOpen: onOpen, onMsg: onMsg, onDrop: onDrop,
      send: function (m) { if (c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); },
      close: function () { c.closed = true; try { c.ws.close(); } catch (e) { /* ignore */ } } };
    function open() {
      var ws; try { ws = new WebSocket(wsUrl()); } catch (e) { retry(); return; }
      c.ws = ws;
      ws.onopen = function () { c.onOpen(c); };
      ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } c.onMsg(m, c); };
      ws.onclose = function () { if (c.closed) return; if (c.onDrop) c.onDrop(); retry(); };
      ws.onerror = function () { /* onclose follows */ };
    }
    function retry() { if (!c.closed) setTimeout(open, 1500); }
    open();
    return c;
  }

  /* ------------------------------------------------------------------ *
   * HOST
   * ------------------------------------------------------------------ */
  var H = { conn: null, code: null, hostKey: null, players: [], started: false, seats: 0, lastSent: {}, ov: null, badge: null, showing: false,
    name: '', key: '', editingKey: false, keyDraft: '', keyError: null, moreOpen: false, selfId: null, hostNow: null, lastSync: null, syncTimer: null };
  function joinUrl() { return pageBase() + 'games/' + cfg.slug + '/?room=' + H.code + (H.key ? '&key=' + encodeURIComponent(H.key) : ''); }
  function gameTitle() { return String(cfg.name || cfg.slug).replace(/^[^A-Za-z0-9]+/, ''); }
  function joinBase() { return pageBase().replace(/^https?:\/\//, ''); }
  function seated() { return H.players.filter(function (p) { return p.seat != null; }).sort(function (a, b) { return a.seat - b.seat; }); }
  function hostOpen() {
    if (H.conn) { showLobby(); return; }
    injectCss();
    H.conn = connect(hostOpenMsg, hostMsg);
  }
  function hostOpenMsg(c) {
    if (H.code) c.send({ t: 'resume', code: H.code, hostKey: H.hostKey });
    else c.send({ t: 'create', game: cfg.slug, title: gameTitle(), name: params.get('name') || '', key: params.get('key') || '' });
  }
  function hostMsg(m) {
    if (m.t === 'created') { H.code = m.code; H.hostKey = m.hostKey; H.name = m.name || ''; H.key = m.key || ''; showLobby(); }
    else if (m.t === 'resumed') { if (m.key) H.key = m.key; H.lastSent = {}; H.lastSync = null; changed(); }
    else if (m.t === 'key-set') { H.key = m.key; H.editingKey = false; H.keyError = null; drawLobby(); }
    else if (m.t === 'error' && m.code === 'bad-key') { H.keyError = m.msg || 'Use 4 to 12 letters or digits.'; drawLobby(); }
    else if (m.t === 'players') { H.players = m.players || []; drawLobby(); drawBadge(); changed(); }
    else if (m.t === 'move') onMove(m);
    else if (m.t === 'closed' || (m.t === 'error' && H.code)) endRoom();
  }
  function endRoom() {
    if (H.conn) { H.conn.send({ t: 'close' }); H.conn.close(); }
    H.conn = null; H.code = null; H.players = []; H.started = false; H.lastSent = {}; H.selfId = null; H.lastSync = null;
    clearTimeout(H.syncTimer);
    hideLobby(); drawBadge();
    if (cfg && cfg.render) cfg.render();
  }
  function showLobby() { H.showing = true; drawLobby(); }
  function hideLobby() { H.showing = false; if (H.ov) { H.ov.remove(); H.ov = null; } }
  function drawLobby() {
    if (!H.showing || !H.code) return;
    if (!H.ov) {
      H.ov = document.createElement('div'); H.ov.className = 'nr-ov';
      H.ov.setAttribute('data-testid', 'room-lobby'); H.ov.setAttribute('role', 'dialog'); H.ov.setAttribute('aria-label', 'Lobby');
      document.body.appendChild(H.ov); H.ov.addEventListener('click', lobbyClick);
      H.ov.addEventListener('toggle', function (e) { if (e.target.matches && e.target.matches('[data-testid="room-code-toggle"]')) H.moreOpen = e.target.open; }, true);
      H.ov.addEventListener('input', function (e) { if (e.target.matches && e.target.matches('[data-testid="room-key-input"]')) H.keyDraft = e.target.value; });
      H.ov.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-testid="room-key-input"]')) { e.preventDefault(); saveKey(); } });
    }
    var url = joinUrl(), s = seated(), spec = H.players.filter(function (p) { return p.seat == null; });
    var local = /^(localhost|127\.|\[::1\])/.test(new URL(url).hostname);
    var kind = (cfg.kind || 'Player').toLowerCase();
    var keyHtml = H.editingKey
      ? '<label for="nr-key-in">New lobby code</label><input id="nr-key-in" data-testid="room-key-input" maxlength="12" value="' + esc(H.keyDraft) + '" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
        '<button type="button" data-testid="room-key-save" data-nr="save-key">✓ Save</button><button type="button" data-nr="cancel-key">Cancel</button>'
      : '<span class="nr-muted">Lobby code</span><b data-testid="room-key">' + esc(H.key) + '</b>' +
        (H.started ? '' : '<button type="button" data-testid="room-key-edit" data-nr="edit-key">✏️ Change</button>');
    setHtml(H.ov, '<div class="nr-box">' +
      (H.selfId ? '<p class="nr-hostnow" data-testid="room-host-now-note">👑 You are the host now</p>' : '') +
      '<h2 class="nr-name">📱 <span data-testid="room-name">' + esc(H.name) + '</span></h2>' +
      '<p class="nr-muted">' + esc(gameTitle()) + ' · each phone is one ' + esc(kind) + '. Phones open <b data-testid="room-join-where">' + esc(joinBase()) + 'join/</b>, tap this lobby and type the lobby code. This screen shows the board, scores and Shield; the phones get the buttons.</p>' +
      '<div class="nr-key" data-testid="room-key-box">' + keyHtml + '</div>' +
      (H.keyError ? '<p class="nr-err" role="alert" data-testid="room-key-error">' + esc(H.keyError) + '</p>' : '') +
      '<ul class="nr-list" data-testid="room-players" aria-live="polite">' +
      (s.length ? s.map(function (p) { return '<li data-testid="room-player"' + (p.connected ? '' : ' class="off"') + '>' + esc(p.avatar) + ' ' + esc(p.name) + (p.id === H.selfId ? ' (you, host)' : p.connected ? '' : ' (offline)') + '</li>'; }).join('') : '<li class="spec">Waiting for phones…</li>') +
      spec.map(function (p) { return '<li class="spec" data-testid="room-spectator">' + esc(p.avatar) + ' ' + esc(p.name) + ' (watching)</li>'; }).join('') + '</ul>' +
      '<p class="nr-muted">' + s.length + ' of 6 joined' + (H.started ? ' · the game is on, new phones watch' : ' · 2 to 6 ' + esc(kind) + 's needed') + '</p>' +
      '<div class="nr-row">' + (H.started
        ? '<button class="go" data-testid="room-back" data-nr="back">⬅️ Back to the game</button>'
        : '<button class="go" data-testid="room-start" data-nr="start"' + (s.length >= 2 ? '' : ' disabled') + '>🚀 Start with ' + s.length + ' phone' + (s.length === 1 ? '' : 's') + '</button>') +
      '<button data-testid="room-cancel" data-nr="cancel">✖ ' + (H.started ? 'End room mode' : 'Close the lobby, play on one screen') + '</button></div>' +
      '<details class="nr-more" data-testid="room-code-toggle"' + (H.moreOpen ? ' open' : '') + '><summary data-testid="room-show-code">Show code / QR</summary>' +
      '<div class="nr-grid"><div class="nr-qr" data-testid="room-qr">' + QR.svg(url) + '</div><div class="nr-info">' +
      '<div class="nr-muted">Room code</div><div class="nr-code" data-testid="room-code">' + esc(H.code) + '</div>' +
      '<div class="nr-url" data-testid="room-url">' + esc(url) + '</div>' +
      '<div class="nr-muted" data-testid="room-join-hint">Or open <b>' + esc(joinBase()) + 'join/</b>, tap <b>Have a code?</b> and type <b>' + esc(H.code) + '</b> and the lobby code <b>' + esc(H.key) + '</b>.</div>' +
      (local ? '<p class="nr-muted">Phones cannot reach localhost: open this page through the tunnel link so the QR code works.</p>' : '') +
      '</div></div></details></div>');
    if (H.editingKey) { var inp = H.ov.querySelector('[data-testid="room-key-input"]'); if (inp && document.activeElement !== inp) inp.focus(); }
  }
  function saveKey() {
    var k = String(H.keyDraft || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(k)) { H.keyError = 'Use 4 to 12 letters or digits.'; drawLobby(); return; }
    H.keyError = null; H.conn.send({ t: 'set-key', key: k });
  }
  function lobbyClick(e) {
    var b = e.target.closest && e.target.closest('[data-nr]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-nr');
    if (a === 'start') {
      var s = seated().slice(0, 6);
      if (s.length < 2) return;
      H.started = true; H.seats = s.length; H.conn.send({ t: 'lock' });
      hideLobby(); drawBadge();
      cfg.start(s.map(function (p) { return { name: p.name, avatar: p.avatar, seat: p.seat }; }));
      changed();
    } else if (a === 'back') hideLobby();
    else if (a === 'cancel') endRoom();
    else if (a === 'edit-key') { H.editingKey = true; H.keyDraft = H.key; H.keyError = null; drawLobby(); }
    else if (a === 'cancel-key') { H.editingKey = false; H.keyError = null; drawLobby(); }
    else if (a === 'save-key') saveKey();
  }
  function drawBadge() {
    if (H.selfId && H.code) {
      if (!H.hostNow) { H.hostNow = document.createElement('div'); H.hostNow.className = 'nr-badge nr-hn'; H.hostNow.setAttribute('data-testid', 'room-host-now'); H.hostNow.setAttribute('role', 'status'); document.body.appendChild(H.hostNow); }
      H.hostNow.textContent = '👑 You are the host now';
    } else if (H.hostNow) { H.hostNow.remove(); H.hostNow = null; }
    if (!H.code || !H.started) { if (H.badge) { H.badge.remove(); H.badge = null; } return; }
    if (!H.badge) {
      H.badge = document.createElement('button'); H.badge.type = 'button'; H.badge.className = 'nr-badge';
      H.badge.setAttribute('data-testid', 'room-badge'); H.badge.addEventListener('click', showLobby); document.body.appendChild(H.badge);
    }
    var on = H.players.filter(function (p) { return p.connected; }).length;
    H.badge.textContent = '📱 Room ' + H.code + ' · ' + on + ' phone' + (on === 1 ? '' : 's');
  }
  function viewFor(p) {
    if (!H.started) return { status: 'wait', title: 'You are in!', prompt: 'Waiting for the big screen to start the game.' };
    var seat = p.seat != null && p.seat < H.seats ? p.seat : null;
    var v = cfg.view(seat) || { status: 'wait', title: 'Wait' };
    if (seat == null && v.status !== 'over') { v.status = 'spectate'; v.buttons = []; }
    return v;
  }
  var flushQueued = false;
  function changed() {
    if (!H.conn || !H.code) return;
    if (H.started && cfg.phase && cfg.phase() === 'setup') { // Play again: back to the lobby with the same phones
      H.started = false; H.conn.send({ t: 'unlock' }); drawBadge(); showLobby();
    }
    if (flushQueued) return;
    flushQueued = true;
    Promise.resolve().then(function () {
      flushQueued = false;
      if (!H.conn) return;
      sync();
      H.players.forEach(function (p) {
        if (p.id === H.selfId) return; // the promoted host plays on its own big screen
        var v = viewFor(p), json = JSON.stringify(v);
        if (H.lastSent[p.id] === json) return;
        H.lastSent[p.id] = json;
        H.conn.send({ t: 'state', for: p.id, view: v });
      });
    });
  }
  // Host transfer (v8): the full game state goes to the server (latest only), at most every 300 ms.
  function sync() {
    if (!cfg.exportState || H.syncTimer) return;
    H.syncTimer = setTimeout(function () {
      H.syncTimer = null;
      if (!H.conn || !H.code) return;
      var st; try { st = { started: H.started, seats: H.seats, game: H.started ? cfg.exportState() : null }; } catch (e) { return; }
      var json = JSON.stringify(st);
      if (json === H.lastSync) return;
      H.lastSync = json; H.conn.send({ t: 'sync', state: st });
    }, H.lastSync ? 300 : 0);
  }
  function onMove(m) {
    if (!H.started) return;
    var p = H.players.find(function (x) { return x.id === m.from; });
    if (!p) return;
    var v = viewFor(p), want = JSON.stringify(m.move);
    var ok = (v.buttons || []).some(function (b) { return JSON.stringify(b.move) === want; });
    if (ok) {
      var chosen = v.buttons.find(function (b) { return JSON.stringify(b.move) === want; });
      try { if (window.FX && window.FX.selectPunch) window.FX.selectPunch(null, (p.avatar ? p.avatar + ' ' : '') + chosen.label); } catch (x) { /* optional */ }
      cfg.dispatch(m.move);
    }
    H.lastSent[p.id] = null; // the phone disabled its buttons after the tap: always send it a fresh view
    changed();
  }

  /* ------------------------------------------------------------------ *
   * PLAYER (phone)
   * ------------------------------------------------------------------ */
  var P = { conn: null, root: null, me: null, view: null, joined: false, error: null, hostGone: false, avatar: null, sentMove: false, pendingName: null };
  function playerKey() { return 'nb-room-player:' + ROOM_PARAM; }
  // v8 host transfer: this phone becomes the host on the same socket, keeps its seat, and the game carries on here.
  function becomeHost(m) {
    promoted = true;
    var c = P.conn; P.conn = null; P.joined = false;
    if (P.root) { P.root.remove(); P.root = null; }
    document.documentElement.classList.remove('net-phone');
    H.conn = c; c.onOpen = hostOpenMsg; c.onMsg = hostMsg; c.onDrop = null;
    H.code = m.code; H.hostKey = m.hostKey; H.key = m.key || ''; H.name = m.lobby || ''; H.selfId = m.playerId; H.lastSent = {}; H.lastSync = null;
    var sy = m.sync;
    if (sy && sy.started && sy.game && cfg.importState) {
      H.started = true; H.seats = sy.seats || 0;
      try { cfg.importState(sy.game, m.pausedMs || 0); } catch (e) { /* keep the lobby if the state does not load */ H.started = false; }
    }
    if (!H.started) { H.started = false; if (m.locked) c.send({ t: 'unlock' }); if (cfg.render) cfg.render(); showLobby(); }
    else if (cfg.render) cfg.render();
    drawBadge(); changed();
  }
  function playerStart() {
    injectCss();
    document.documentElement.classList.add('net-phone');
    P.root = document.createElement('div'); P.root.id = 'net-player'; P.root.setAttribute('data-testid', 'player-view');
    document.body.appendChild(P.root);
    P.root.addEventListener('click', playerClick);
    P.root.addEventListener('submit', function (e) { e.preventDefault(); doJoin(); });
    P.avatar = store('local', 'nb-room-avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)];
    var known = store('session', playerKey());
    drawPlayer();
    probe(function () {
      if (!avail) { P.error = 'Room mode needs the local game server. Open the link shown on the big screen.'; drawPlayer(); return; }
      if (known) doJoin(known); else drawPlayer();
    });
  }
  function doJoin(playerId) {
    if (!playerId) {
      var inp = P.root.querySelector('[data-testid="join-name"]');
      var name = inp ? inp.value.trim() : '';
      if (!name) { P.error = 'Type a name first.'; drawPlayer(); return; }
      var kin = P.root.querySelector('[data-testid="join-key"]');
      P.pendingKey = kin ? kin.value.trim().toUpperCase() : KEY_PARAM;
      if (!P.pendingKey) { P.error = 'Type the lobby code from the host.'; drawPlayer(); return; }
      store('local', 'nb-room-name', name); store('local', 'nb-room-avatar', P.avatar);
      P.pendingName = name;
    }
    P.error = null;
    if (P.conn) P.conn.close();
    P.conn = connect(function (c) {
      var id = store('session', playerKey()) || playerId || null;
      c.send({ t: 'join', code: ROOM_PARAM, key: P.pendingKey || KEY_PARAM, name: P.pendingName || store('local', 'nb-room-name') || 'Player', avatar: P.avatar, playerId: id });
    }, function (m) {
      if (m.t === 'welcome') { P.me = m; P.joined = true; P.hostGone = !m.hostOnline; P.offline = false; store('session', playerKey(), m.playerId); drawPlayer(); }
      else if (m.t === 'state') {
        P.view = m.view; P.sentMove = false; drawPlayer();
        var wk = m.view && m.view.wrongKey; // this phone's own wrong answer: a lighter full-screen animation
        if (wk && wk !== P.lastWrong) { P.lastWrong = wk; try { if (window.FX && window.FX.wrongFull) window.FX.wrongFull({ lite: true }); } catch (x) { /* optional */ } }
      }
      else if (m.t === 'host-left') { P.hostGone = true; P.transferS = Math.round((m.transferMs || 20000) / 1000); drawPlayer(); }
      else if (m.t === 'host-back') { P.hostGone = false; drawPlayer(); }
      else if (m.t === 'promote') becomeHost(m);
      else if (m.t === 'host-changed') { P.hostGone = false; P.newHost = m.name; drawPlayer(); }
      else if (m.t === 'closed') { P.conn.close(); P.conn = null; P.joined = false; P.view = null; P.ended = true; P.error = 'The host ended the room. Thanks for playing!'; drawPlayer(); }
      else if (m.t === 'error') { P.conn.close(); P.conn = null; P.joined = false; P.error = m.msg; store('session', playerKey(), ''); drawPlayer(); }
    }, function () { if (P.joined) { P.offline = true; drawPlayer(); } });
    drawPlayer();
  }
  function drawPlayer() {
    var h = '<div class="np">', v = P.view, me = P.me;
    if (!P.joined) {
      var name = store('local', 'nb-room-name') || '';
      h += '<h1 style="margin:0;font-size:1.4rem">' + esc(cfg && cfg.name || 'Northbridge games') + '</h1>' +
        (P.error ? '<p class="np-err" role="alert" data-testid="player-error">' + esc(P.error) + '</p>' : '');
      if (!probed) h += '<div class="np-status">⏳ Connecting…</div>';
      else if (avail && !P.ended) {
        h += '<form data-testid="join-form" class="np" autocomplete="off"><div class="np-status">📱 Join room <span data-testid="join-code">' + esc(ROOM_PARAM) + '</span></div>' +
          (KEY_PARAM ? '' : '<label for="np-key">Lobby code (ask the host)</label><input id="np-key" data-testid="join-key" maxlength="12" autocapitalize="characters" spellcheck="false" autocomplete="off">') +
          '<label for="np-name">Your name</label><input id="np-name" data-testid="join-name" maxlength="18" value="' + esc(name) + '" enterkeyhint="go">' +
          '<div>Pick your icon</div><div class="np-avs" role="group" aria-label="Pick your icon">' +
          AVATARS.map(function (a) { return '<button type="button" data-testid="join-avatar" data-av="' + a + '" aria-pressed="' + (a === P.avatar) + '" aria-label="Icon ' + a + '">' + a + '</button>'; }).join('') + '</div>' +
          '<div class="np-btns"><button type="submit" class="primary" data-testid="join-btn">🚀 Join the game</button></div></form>';
      }
    } else {
      h += '<header><span class="np-av" data-testid="player-avatar">' + esc(me.avatar) + '</span><b data-testid="player-name">' + esc(me.name) + '</b>' +
        (v && v.score != null ? '<span class="np-score" data-testid="player-score">' + esc(v.score) + ' pts</span>' : '') + '</header>';
      if (P.hostGone) h += '<p class="np-err" data-testid="player-host-left">The host disconnected. Hang on: if they are not back in ' + (P.transferS || 20) + ' s, a player becomes the host.</p>';
      else if (P.newHost) h += '<p class="np-note" data-testid="player-host-changed">👑 ' + esc(P.newHost) + ' is the host now.</p>';
      else if (P.offline) h += '<p class="np-err">Reconnecting…</p>';
      if (!v) h += '<div class="np-status" data-testid="player-status" data-status="wait">⏳ Connecting…</div>';
      else {
        var st = v.status || 'wait';
        var icon = { turn: '🎯 ', wait: '⏳ ', spectate: '👀 ', over: '🏆 ' }[st] || '';
        var title = v.title || (st === 'turn' ? 'Your turn' : st === 'spectate' ? 'You are watching' : 'Wait');
        h += '<div class="np-status ' + esc(st) + '" data-testid="player-status" data-status="' + esc(st) + '" aria-live="polite">' + icon + esc(title) + '</div>';
        if (st === 'spectate') h += '<p class="np-note">The game started before you joined, so you are watching this round.</p>';
        if (v.prompt) h += '<p class="np-prompt" data-testid="player-prompt">' + esc(v.prompt) + '</p>';
        if (v.warning) h += '<div class="np-warn" role="alert" data-testid="player-warning">🛡️ ' + esc(v.warning) + '</div>';
        if (v.note) h += '<p class="np-note" data-testid="player-note">' + esc(v.note) + '</p>';
        if (v.buttons && v.buttons.length) {
          h += '<div class="np-btns">' + v.buttons.map(function (b, i) {
            return '<button type="button" class="' + esc(b.kind || '') + '" data-testid="player-btn" data-i="' + i + '"' + (P.sentMove ? ' disabled' : '') + '>' + esc(b.label) + '</button>';
          }).join('') + '</div>';
        }
      }
    }
    h += '</div>';
    var ae = document.activeElement, focusName = ae && ae.getAttribute && ae.getAttribute('data-testid') === 'join-name';
    var typed = focusName ? ae.value : null;
    setHtml(P.root, h);
    if (focusName) { var inp = P.root.querySelector('[data-testid="join-name"]'); if (inp) { inp.value = typed; inp.focus(); } }
  }
  function playerClick(e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-av')) {
      var inp = P.root.querySelector('[data-testid="join-name"]'); if (inp) store('local', 'nb-room-name', inp.value.trim());
      P.avatar = b.getAttribute('data-av'); drawPlayer(); return;
    }
    if (b.getAttribute('data-testid') === 'player-btn' && P.view && P.conn) {
      var btn = P.view.buttons[Number(b.getAttribute('data-i'))];
      if (!btn) return;
      try { if (navigator.vibrate) navigator.vibrate(30); } catch (x) { /* optional */ }
      try { if (window.FX && window.FX.selectPunch) window.FX.selectPunch(b, btn.label, { lite: true }); } catch (x) { /* optional */ }
      P.conn.send({ t: 'move', move: btn.move });
      P.sentMove = true; drawPlayer();
    }
  }

  /* ------------------------------------------------------------------ *
   * Probe: a HEAD request for the site root; only server/index.js answers with X-Rooms: 1.
   * ------------------------------------------------------------------ */
  var probeWaiters = [];
  function probe(cb) {
    if (probed) { cb(); return; }
    probeWaiters.push(cb);
    if (probeWaiters.length > 1) return;
    var done = function () { probed = true; var w = probeWaiters; probeWaiters = []; w.forEach(function (f) { f(); }); };
    if (!window.fetch || !window.WebSocket || location.protocol === 'file:') { done(); return; }
    fetch(ROOT, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
      avail = r.ok && r.headers.get('X-Rooms') === '1';
      publicOrigin = (r.headers.get('X-Public-Origin') || '').replace(/\/+$/, '');
      done();
    }, done);
  }

  function init(c) {
    cfg = c;
    if (ROOM_PARAM) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', playerStart); else playerStart();
      return;
    }
    probe(function () {
      if (avail && cfg.render && cfg.phase && cfg.phase() === 'setup') cfg.render();
      // the hub's "Host on this screen" links here with ?host=1: open the lobby straight away
      if (avail && params.get('host') === '1' && !H.conn) hostOpen();
    });
  }

  window.Net = {
    init: init,
    available: function () { return avail; },
    isPlayer: function () { return !!ROOM_PARAM && !promoted; },
    isPromoted: function () { return promoted; },
    active: function () { return !!H.code; },
    host: function () { if (avail) hostOpen(); },
    changed: changed,
    button: function () { return avail ? '<button class="rooms-btn" data-testid="btn-rooms" data-action="rooms">📱 Multi-screen: everyone on their own phone</button>' : ''; },
    _qr: QR
  };
})();
