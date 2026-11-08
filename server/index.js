// Room mode server for the Northbridge sample games (a demo: one process, in memory, no persistence).
//   node server/index.js            PORT (default 8080), HOST (default 127.0.0.1), PUBLIC_ORIGIN (optional,
//                                   e.g. the Cloudflare tunnel URL, used for the join links and QR codes)
// It serves the repo root as static files (same URLs as `python3 -m http.server`) and a WebSocket room relay
// at /ws. The HOST screen (the one that created the room) is authoritative: players send moves, the server
// relays them to the host; the host sends state views, the server relays them to one player (`for`) or all.
//
// Messages (JSON, field `t` is the type):
//   host   -> {t:'create', game}                      <- {t:'created', code, hostKey}
//   host   -> {t:'resume', code, hostKey}             <- {t:'resumed', code} (players get {t:'host-back'})
//   player -> {t:'join', code, name, avatar, playerId?} <- {t:'welcome', code, game, playerId, seat, name, avatar}
//   host   <- {t:'players', players:[{id, name, avatar, seat, connected}]} whenever the list changes
//   player -> {t:'move', move}                        host <- {t:'move', from, seat, move}
//   host   -> {t:'state', for?, view}                 player(s) <- {t:'state', view}
//   host   -> {t:'lock'} / {t:'unlock'}               seating closed (late joiners spectate, seat null) / open
//   host   -> {t:'close'}                             players <- {t:'closed'}; the room is gone
//   any    <- {t:'error', msg}
// Host disconnect: players get {t:'host-left'}; the room stays until it is idle for 2 hours.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
const IDLE_MS = 2 * 60 * 60 * 1000;
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

/* ---------------- rooms ---------------- */
const rooms = new Map(); // code -> {code, game, hostKey, host (ws|null), players: Map(id -> {id,name,avatar,seat,ws}), locked, nextSeat, touched}
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (they look like 1 and 0)

function newCode() {
  for (let i = 0; i < 1000; i++) {
    let c = '';
    for (let k = 0; k < 4; k++) c += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no free room codes');
}
function sendTo(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function playerList(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, seat: p.seat, connected: !!(p.ws && p.ws.readyState === 1) }));
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

function handle(ws, msg) {
  if (!msg || typeof msg.t !== 'string') return;
  const room = ws.room ? rooms.get(ws.room) : null;
  if (room) room.touched = Date.now();
  switch (msg.t) {
    case 'create': {
      const code = newCode();
      const r = { code, game: String(msg.game || '').slice(0, 40), hostKey: crypto.randomBytes(12).toString('hex'), host: ws,
        players: new Map(), locked: false, nextSeat: 0, touched: Date.now() };
      rooms.set(code, r);
      ws.room = code; ws.role = 'host';
      sendTo(ws, { t: 'created', code, hostKey: r.hostKey });
      log('room', code, 'created for', r.game);
      return;
    }
    case 'resume': {
      const r = rooms.get(String(msg.code || '').toUpperCase());
      if (!r || r.hostKey !== msg.hostKey) { sendTo(ws, { t: 'error', msg: 'That room is gone.' }); return; }
      if (r.host && r.host !== ws) { try { r.host.close(); } catch (e) { /* ignore */ } }
      r.host = ws; r.touched = Date.now(); ws.room = r.code; ws.role = 'host';
      sendTo(ws, { t: 'resumed', code: r.code });
      eachPlayer(r, p => sendTo(p.ws, { t: 'host-back' }));
      notifyHost(r);
      log('room', r.code, 'host resumed');
      return;
    }
    case 'join': {
      const r = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!r) { sendTo(ws, { t: 'error', msg: 'No room with that code. Check the code on the big screen.' }); return; }
      r.touched = Date.now();
      let p = msg.playerId ? r.players.get(String(msg.playerId)) : null;
      if (p) {
        if (p.ws && p.ws !== ws) { try { p.ws.close(); } catch (e) { /* ignore */ } }
        p.ws = ws;
      } else {
        const seat = !r.locked && r.nextSeat < MAX_SEATS ? r.nextSeat++ : null;
        p = { id: crypto.randomBytes(8).toString('hex'), name: cleanName(msg.name, r), avatar: String(msg.avatar || '🙂').slice(0, 8), seat, ws };
        r.players.set(p.id, p);
        log('room', r.code, 'join', p.name, 'seat', seat);
      }
      ws.room = r.code; ws.role = 'player'; ws.playerId = p.id;
      sendTo(ws, { t: 'welcome', code: r.code, game: r.game, playerId: p.id, seat: p.seat, name: p.name, avatar: p.avatar, hostOnline: !!(r.host && r.host.readyState === 1) });
      notifyHost(r);
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
      if (!room || ws.role !== 'host') return;
      const out = { t: 'state', view: msg.view };
      if (msg.for) { const p = room.players.get(String(msg.for)); if (p) sendTo(p.ws, out); }
      else eachPlayer(room, p => sendTo(p.ws, out));
      return;
    }
    case 'lock': case 'unlock':
      if (room && ws.role === 'host') room.locked = msg.t === 'lock';
      return;
    case 'close':
      if (room && ws.role === 'host') {
        eachPlayer(room, p => sendTo(p.ws, { t: 'closed' }));
        rooms.delete(room.code); ws.room = null;
        log('room', room.code, 'closed by host');
      }
      return;
    case 'ping': sendTo(ws, { t: 'pong' }); return;
  }
}

/* ---------------- server ---------------- */
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) }));
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
    const r = ws.room ? rooms.get(ws.room) : null;
    if (!r) return;
    if (ws.role === 'host' && r.host === ws) {
      r.host = null;
      eachPlayer(r, p => sendTo(p.ws, { t: 'host-left' }));
      log('room', r.code, 'host disconnected');
    } else if (ws.role === 'player') {
      notifyHost(r);
    }
  });
});

// keep connections alive through proxies (Cloudflare drops idle sockets after ~100 s) and expire idle rooms
const sweep = setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.alive) { ws.terminate(); return; } ws.alive = false; try { ws.ping(); } catch (e) { /* ignore */ } });
  const t = Date.now();
  rooms.forEach((r, code) => {
    if (t - r.touched > IDLE_MS) {
      eachPlayer(r, p => sendTo(p.ws, { t: 'closed' }));
      sendTo(r.host, { t: 'closed' });
      rooms.delete(code);
      log('room', code, 'expired after 2 h idle');
    }
  });
}, 30000);
sweep.unref();

server.listen(PORT, HOST, () => log('Northbridge games + rooms on http://' + HOST + ':' + server.address().port + (PUBLIC_ORIGIN ? ' (public ' + PUBLIC_ORIGIN + ')' : '')));
module.exports = { server, rooms };
