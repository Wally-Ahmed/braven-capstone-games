// Room mode server for the Northbridge sample games (a demo: one process, in memory, no persistence).
//   node server/index.js            PORT (default 8080), HOST (default 127.0.0.1, or 0.0.0.0 when PORT is set,
//                                   e.g. in the Fly.io image), PUBLIC_ORIGIN (optional,
//                                   e.g. the Cloudflare tunnel URL, used for the join links and QR codes)
//   Timers (ms, for the tests): HOST_TRANSFER_MS (20000) host gone this long -> a player becomes host;
//                               EMPTY_LOBBY_MS (60000) nobody connected this long -> the lobby deletes itself.
// It serves the repo root as static files (same URLs as `python3 -m http.server`) and a WebSocket room relay
// at /ws. The HOST screen (the one that created the room) is authoritative: players send moves, the server
// relays them to the host; the host sends state views, the server relays them to one player (`for`) or all.
//
// v8 (11/11) LOBBIES: every room is a lobby with a name, listed for everyone; joining needs the lobby code the
// host set (4 to 12 letters/digits, case-insensitive). The 4-letter `code` stays the internal room id.
//
// Messages (JSON, field `t` is the type):
//   host   -> {t:'create', game, title?, name?, key?}  <- {t:'created', code, hostKey, name, key}
//             name = lobby name (1 to 24 chars after trimming; default "<title> lobby"); key = the lobby code
//             (4 to 12 letters/digits; an invalid or missing key gets a random 6-character one, sent back)
//   host   -> {t:'set-key', key}                       <- {t:'key-set', key} | {t:'error', code:'bad-key'} (open lobbies only)
//   host   -> {t:'resume', code, hostKey}             <- {t:'resumed', code, name, key} (players get {t:'host-back'})
//   player -> {t:'join', code, key, name, avatar, playerId?} <- {t:'welcome', code, game, playerId, seat, name, avatar, lobby, hostOnline}
//             a new player needs the right key: else {t:'error', code:'bad-code', msg}; a returning playerId does not
//   host   <- {t:'players', players:[{id, name, avatar, seat, connected}]} whenever the list changes
//   player -> {t:'move', move}                        host <- {t:'move', from, seat, move}
//   host   -> {t:'state', for?, view}                 player(s) <- {t:'state', view}
//   host   -> {t:'sync', state}                       the game's full serializable state (latest only, cached per room)
//   host   -> {t:'lock'} / {t:'unlock'}               seating closed, lobby 'in-game' (late joiners spectate) / open again
//   host   -> {t:'close'}                             players <- {t:'closed'}; the room and its lobby are gone
//   any    -> {t:'lobbies'}                           <- {t:'lobbies', lobbies:[{code, name, game, title, players, max,
//                                                           state, created, hostOnline}]} now and on every change
//             (create, join, start, play again, close, host leaving/back/changed, deletion) until the socket closes.
//             All lobbies are listed (state 'open' or 'in-game'); the key is never listed. Names are plain text:
//             clients HTML-escape them when they render.
//   any    <- {t:'error', msg, code?}
// Host disconnect: players get {t:'host-left'}. If the host has not resumed within HOST_TRANSFER_MS, the earliest-joined
// connected player is promoted: it gets {t:'promote', code, hostKey, key, lobby, game, sync, pausedMs} (sync = the last
// cached {state}; pausedMs = time since that sync) and becomes the host on the same socket, keeping its seat; everyone
// gets {t:'host-changed', playerId, name}. The old hostKey stops working.
// Empty lobby: when nobody (host or player) is connected for EMPTY_LOBBY_MS the room and lobby are deleted.
// Backstop: any room idle for 2 hours is deleted.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
const IDLE_MS = 2 * 60 * 60 * 1000;
const HOST_TRANSFER_MS = Number(process.env.HOST_TRANSFER_MS || 20000);
const EMPTY_LOBBY_MS = Number(process.env.EMPTY_LOBBY_MS || 60000);
const MAX_SEATS = 6;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

function log(...a) { console.log(new Date().toISOString(), ...a); }

/* ---------------- static files ---------------- */
function serveStatic(req, res) {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0].split('#')[0]); } catch (e) { res.writeHead(400); res.end('bad url'); return; }
  const file = path.normalize(path.join(ROOT, url));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
  if (/(^|[\/\\])(\.git|node_modules)([\/\\]|$)/.test(path.relative(ROOT, file))) { res.writeHead(404); res.end('not found'); return; }
  fs.stat(file, (err, st) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    if (st.isDirectory()) {
      if (!url.endsWith('/')) { res.writeHead(301, { Location: req.url.replace(/^([^?]*)/, '$1/') }); res.end(); return; }
      const idx = path.join(file, 'index.html');
      fs.stat(idx, (e2, st2) => {
        if (e2 || !st2.isFile()) { res.writeHead(404); res.end('not found'); return; }
        send(idx, st2);
      });
      return;
    }
    send(file, st);
  });
  function send(f, st) {
    const headers = { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-cache', 'X-Rooms': '1' };
    if (PUBLIC_ORIGIN) headers['X-Public-Origin'] = PUBLIC_ORIGIN;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(f).pipe(res);
  }
}

/* ---------------- rooms + lobbies ---------------- */
// code -> {code, game, title, name, key, created, hostKey, host (ws|null), hostLeftAt, hostPlayerId,
//          players: Map(id -> {id,name,avatar,seat,ws,joined}), locked, nextSeat, touched, sync, syncAt, emptyTimer, transferTimer}
const rooms = new Map();
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (they look like 1 and 0)
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const watchers = new Set(); // sockets that sent {t:'lobbies'}

function newCode() {
  for (let i = 0; i < 1000; i++) {
    let c = '';
    for (let k = 0; k < 4; k++) c += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no free room codes');
}
function randomKey() { let k = ''; for (let i = 0; i < 6; i++) k += KEY_CHARS[crypto.randomInt(KEY_CHARS.length)]; return k; }
function cleanKey(k) { const s = String(k == null ? '' : k).trim().toUpperCase(); return /^[A-Z0-9]{4,12}$/.test(s) ? s : null; }
function plain(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim(); }
function sendTo(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function open(ws) { return !!(ws && ws.readyState === 1); }
function playerList(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, seat: p.seat, connected: open(p.ws), host: p.id === room.hostPlayerId }));
}
function notifyHost(room) { sendTo(room.host, { t: 'players', players: playerList(room) }); }
function eachPlayer(room, fn) { room.players.forEach(p => fn(p)); }
function cleanName(s, room) {
  let n = String(s || '').replace(/[\u0000-\u001f<>,]/g, '').trim().slice(0, 18) || 'Player';
  const taken = new Set([...room.players.values()].map(p => p.name.toLowerCase()));
  const base = n; let k = 2;
  while (taken.has(n.toLowerCase())) n = base.slice(0, 15) + ' ' + (k++);
  return n;
}

function lobbyList() {
  return [...rooms.values()].sort((a, b) => b.created - a.created).map(r => ({
    code: r.code, name: r.name, game: r.game, title: r.title,
    players: [...r.players.values()].filter(p => p.seat != null).length, max: MAX_SEATS,
    state: r.locked ? 'in-game' : 'open', created: r.created, hostOnline: open(r.host) }));
}
let lobbiesQueued = false;
function lobbiesChanged() { // coalesce a burst of changes into one push
  if (lobbiesQueued || !watchers.size) return;
  lobbiesQueued = true;
  setImmediate(() => { lobbiesQueued = false; const msg = { t: 'lobbies', lobbies: lobbyList() }; watchers.forEach(w => sendTo(w, msg)); });
}
function deleteRoom(r, why) {
  if (rooms.get(r.code) !== r) return;
  clearTimeout(r.emptyTimer); clearTimeout(r.transferTimer);
  eachPlayer(r, p => sendTo(p.ws, { t: 'closed' }));
  if (r.host && !r.hostPlayerId) sendTo(r.host, { t: 'closed' });
  rooms.delete(r.code);
  log('room', r.code, why);
  lobbiesChanged();
}
function anyoneConnected(r) { return open(r.host) || [...r.players.values()].some(p => open(p.ws)); }
// Empty lobby: nobody connected -> delete after EMPTY_LOBBY_MS unless someone comes back.
function checkEmpty(r) {
  clearTimeout(r.emptyTimer); r.emptyTimer = null;
  if (anyoneConnected(r)) return;
  r.emptyTimer = setTimeout(() => { if (!anyoneConnected(r)) deleteRoom(r, 'deleted: empty for ' + Math.round(EMPTY_LOBBY_MS / 1000) + ' s'); }, EMPTY_LOBBY_MS);
  r.emptyTimer.unref();
}
// Host transfer: the earliest-joined connected player takes over the room on its own socket.
function promote(r) {
  if (rooms.get(r.code) !== r || open(r.host)) return false;
  const p = [...r.players.values()].filter(x => open(x.ws) && x.id !== r.hostPlayerId).sort((a, b) => a.joined - b.joined)[0]
    || [...r.players.values()].find(x => open(x.ws));
  if (!p) return false;
  r.hostKey = crypto.randomBytes(12).toString('hex');
  r.host = p.ws; r.hostPlayerId = p.id; r.hostLeftAt = 0; r.touched = Date.now();
  p.ws.role = 'host';
  sendTo(p.ws, { t: 'promote', code: r.code, hostKey: r.hostKey, key: r.key, lobby: r.name, game: r.game, playerId: p.id,
    sync: r.sync, pausedMs: r.syncAt ? Date.now() - r.syncAt : 0, locked: r.locked });
  eachPlayer(r, x => sendTo(x.ws, { t: 'host-changed', playerId: p.id, name: p.name }));
  notifyHost(r);
  log('room', r.code, 'host transferred to', p.name);
  lobbiesChanged();
  return true;
}
function hostGone(r) {
  r.host = null; r.hostLeftAt = Date.now();
  eachPlayer(r, p => sendTo(p.ws, { t: 'host-left', transferMs: HOST_TRANSFER_MS }));
  clearTimeout(r.transferTimer);
  r.transferTimer = setTimeout(() => { if (!open(r.host)) promote(r); }, HOST_TRANSFER_MS);
  r.transferTimer.unref();
  lobbiesChanged();
  checkEmpty(r);
}

function handle(ws, msg) {
  if (!msg || typeof msg.t !== 'string') return;
  const room = ws.room ? rooms.get(ws.room) : null;
  if (room) room.touched = Date.now();
  const isHost = room && ws.role === 'host' && room.host === ws;
  switch (msg.t) {
    case 'create': {
      const code = newCode();
      const game = String(msg.game || '').slice(0, 40), title = plain(msg.title, 40) || game;
      const r = { code, game, title, name: plain(msg.name, 24) || plain(title.split(/[?:]/)[0] + ' lobby', 24), key: cleanKey(msg.key) || randomKey(),
        created: Date.now(), hostKey: crypto.randomBytes(12).toString('hex'), host: ws, hostLeftAt: 0, hostPlayerId: null,
        players: new Map(), locked: false, nextSeat: 0, touched: Date.now(), sync: null, syncAt: 0, emptyTimer: null, transferTimer: null };
      rooms.set(code, r);
      ws.room = code; ws.role = 'host';
      sendTo(ws, { t: 'created', code, hostKey: r.hostKey, name: r.name, key: r.key });
      log('room', code, 'created for', r.game);
      lobbiesChanged();
      return;
    }
    case 'set-key': {
      if (!isHost) return;
      const k = cleanKey(msg.key);
      if (!k || room.locked) { sendTo(ws, { t: 'error', code: 'bad-key', msg: room.locked ? 'The game has started; the code is fixed.' : 'Use 4 to 12 letters or digits.' }); return; }
      room.key = k; sendTo(ws, { t: 'key-set', key: k });
      return;
    }
    case 'resume': {
      const r = rooms.get(String(msg.code || '').toUpperCase());
      if (!r || r.hostKey !== msg.hostKey) { sendTo(ws, { t: 'error', msg: r ? 'Another player is hosting this lobby now.' : 'That room is gone.' }); return; }
      if (r.host && r.host !== ws) { try { r.host.close(); } catch (e) { /* ignore */ } }
      r.host = ws; r.hostLeftAt = 0; r.touched = Date.now(); ws.room = r.code; ws.role = 'host';
      clearTimeout(r.transferTimer); clearTimeout(r.emptyTimer);
      if (r.hostPlayerId) { const hp = r.players.get(r.hostPlayerId); if (hp) hp.ws = ws; }
      sendTo(ws, { t: 'resumed', code: r.code, name: r.name, key: r.key });
      eachPlayer(r, p => { if (p.id !== r.hostPlayerId) sendTo(p.ws, { t: 'host-back' }); });
      notifyHost(r);
      log('room', r.code, 'host resumed');
      lobbiesChanged();
      return;
    }
    case 'join': {
      const r = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!r) { sendTo(ws, { t: 'error', code: 'no-room', msg: 'No room with that code. Check the code on the big screen.' }); return; }
      r.touched = Date.now();
      let p = msg.playerId ? r.players.get(String(msg.playerId)) : null;
      if (p && p.id === r.hostPlayerId) p = null; // the promoted host's id cannot be taken over by a join
      if (p) {
        if (p.ws && p.ws !== ws) { try { p.ws.close(); } catch (e) { /* ignore */ } }
        p.ws = ws;
      } else {
        if (cleanKey(msg.key) !== r.key) { sendTo(ws, { t: 'error', code: 'bad-code', msg: 'Wrong code, ask the host.' }); return; }
        const seat = !r.locked && r.nextSeat < MAX_SEATS ? r.nextSeat++ : null;
        p = { id: crypto.randomBytes(8).toString('hex'), name: cleanName(msg.name, r), avatar: String(msg.avatar || '🙂').slice(0, 8), seat, ws, joined: Date.now() };
        r.players.set(p.id, p);
        log('room', r.code, 'join', p.name, 'seat', seat);
      }
      ws.room = r.code; ws.role = 'player'; ws.playerId = p.id;
      clearTimeout(r.emptyTimer);
      sendTo(ws, { t: 'welcome', code: r.code, game: r.game, playerId: p.id, seat: p.seat, name: p.name, avatar: p.avatar, lobby: r.name, hostOnline: open(r.host) });
      notifyHost(r);
      // the host has been gone past the transfer window and nobody was there to take over: this player does
      if (!open(r.host) && r.hostLeftAt && Date.now() - r.hostLeftAt >= HOST_TRANSFER_MS) promote(r);
      lobbiesChanged();
      return;
    }
    case 'move': {
      if (!room || ws.role !== 'player') return;
      const p = room.players.get(ws.playerId);
      if (!p) return;
      sendTo(room.host, { t: 'move', from: p.id, seat: p.seat, move: msg.move });
      return;
    }
    case 'state': {
      if (!isHost) return;
      const out = { t: 'state', view: msg.view };
      if (msg.for) { const p = room.players.get(String(msg.for)); if (p && p.ws !== ws) sendTo(p.ws, out); }
      else eachPlayer(room, p => { if (p.ws !== ws) sendTo(p.ws, out); });
      return;
    }
    case 'sync':
      if (isHost) { room.sync = msg.state === undefined ? null : msg.state; room.syncAt = Date.now(); }
      return;
    case 'lock': case 'unlock':
      if (isHost) { room.locked = msg.t === 'lock'; lobbiesChanged(); }
      return;
    case 'close':
      if (isHost) { ws.room = null; ws.role = null; if (room.hostPlayerId) { const hp = room.players.get(room.hostPlayerId); if (hp) hp.ws = null; } deleteRoom(room, 'closed by host'); }
      return;
    case 'lobbies':
      watchers.add(ws);
      sendTo(ws, { t: 'lobbies', lobbies: lobbyList() });
      return;
    case 'ping': sendTo(ws, { t: 'pong' }); return;
  }
}

/* ---------------- server ---------------- */
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, lobbies: rooms.size, uptime: Math.round(process.uptime()) }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (!/\/ws$/.test(req.url.split('?')[0])) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', data => {
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    try { handle(ws, msg); } catch (e) { log('error', e && e.message); }
  });
  ws.on('close', () => {
    watchers.delete(ws);
    const r = ws.room ? rooms.get(ws.room) : null;
    if (!r) return;
    if (ws.role === 'host' && r.host === ws) {
      log('room', r.code, 'host disconnected');
      hostGone(r);
    } else if (ws.role === 'player') {
      notifyHost(r);
      checkEmpty(r);
    }
  });
});

// keep connections alive through proxies (Cloudflare drops idle sockets after ~100 s) and expire idle rooms
const sweep = setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.alive) { ws.terminate(); return; } ws.alive = false; try { ws.ping(); } catch (e) { /* ignore */ } });
  const t = Date.now();
  rooms.forEach(r => { if (t - r.touched > IDLE_MS) deleteRoom(r, 'expired after 2 h idle'); });
}, 30000);
sweep.unref();

server.listen(PORT, HOST, () => log('Northbridge games + rooms on http://' + HOST + ':' + server.address().port + (PUBLIC_ORIGIN ? ' (public ' + PUBLIC_ORIGIN + ')' : '')));
module.exports = { server, rooms };
