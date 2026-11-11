// v8 lobbies (Wally 11/11): "multi player mode should be lobbies rather than qr codes" and "to join all lobbies
// should be viewable globally but need a code set by the current host, if the host leaves the lobby ownership should
// transfer to someone else and if its empty it should delete itself".
// Starts its own server/index.js with short timers: HOST_TRANSFER_MS=1500 and EMPTY_LOBBY_MS=1500.
const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const net = require('net');
const http = require('http');
const path = require('path');
const { watch, expectClean, expectTapTargets, expectNoHorizontalScroll } = require('./helpers');

let proc, origin;
const SKIP = ['inbox-showdown', 'first-week-hunt', 'phish-or-fine'];
const PHONE = { width: 360, height: 640 };

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.unref(); s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
function get(p) {
  return new Promise((resolve, reject) => {
    const u = new URL(origin);
    http.get({ host: u.hostname, port: u.port, path: p }, res => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', reject);
  });
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  const port = await freePort();
  origin = 'http://127.0.0.1:' + port;
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')],
    { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', HOST_TRANSFER_MS: '1500', EMPTY_LOBBY_MS: '1500' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await get('/healthz')).status === 200) return; } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
test.afterAll(() => { if (proc) proc.kill(); });

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 800 } });
  await ctx.addInitScript(slugs => { try { slugs.forEach(s => localStorage.setItem('nb-tutorial-skip:' + s, '1')); } catch (e) { /* ignore */ } }, SKIP);
  return { ctx, page: await ctx.newPage() };
}
/** Host creates a lobby from the hub's Create a lobby form. */
async function createFromHub(browser, name, slug, key) {
  const host = await newPage(browser);
  const issues = watch(host.page, origin);
  await host.page.goto(origin + '/');
  await expect(host.page.getByTestId('hub-lobby')).toBeVisible();
  await host.page.getByTestId('hub-lobby-name').fill(name);
  await host.page.getByTestId('hub-lobby-game').selectOption(slug);
  await host.page.getByTestId('hub-lobby-key').fill(key);
  await host.page.getByTestId('hub-create-lobby').click();
  await expect(host.page.getByTestId('room-lobby')).toBeVisible();
  const code = (await host.page.getByTestId('room-code').textContent()).trim();
  return { ...host, issues, code };
}
/** A phone joins from the /join/ lobby list. */
async function joinFromList(page, lobbyName, key, name, opts = {}) {
  if (!opts.stay) await page.goto(origin + '/join/');
  const item = page.getByTestId('lobby-item').filter({ hasText: lobbyName });
  await expect(item).toHaveCount(1, { timeout: 2000 });
  await item.getByTestId('lobby-join').click();
  await expect(page.getByTestId('join-target')).toContainText(lobbyName);
  await page.getByTestId('code-key').fill(key);
  await page.getByTestId('code-name').fill(name);
  await page.getByTestId('code-avatar').nth(1).click();
  await page.getByTestId('code-join-btn').click();
}
async function seat(browser, lobbyName, key, name) {
  const p = await newPage(browser, PHONE);
  await joinFromList(p.page, lobbyName, key, name);
  await expect(p.page.getByTestId('player-name')).toHaveText(name);
  return p;
}

test('a lobby created on the hub shows up in every other page\'s list within 2 s; names are text, never HTML', async ({ browser }) => {
  const watcher = await newPage(browser, PHONE);
  const hub2 = await newPage(browser);
  await watcher.page.goto(origin + '/join/');
  await hub2.page.goto(origin + '/');
  await expect(watcher.page.getByTestId('lobby-empty')).toHaveText('No open lobbies, create one');
  await expect(hub2.page.getByTestId('hub-lobby-empty')).toHaveText('No open lobbies, create one');
  await expectNoHorizontalScroll(watcher.page);
  const h = await createFromHub(browser, '<img src=x onerror=alert(1)> Room 4B lobby name', 'first-week-hunt', 'team42');
  expect(h.page.url()).toContain('/games/first-week-hunt/?host=1');
  await expect(h.page.getByTestId('room-name')).toHaveText('<img src=x onerror=alert'); // trimmed to 24 chars, shown as text
  await expect(h.page.getByTestId('room-key')).toHaveText('TEAM42');
  await expect(h.page.getByTestId('room-qr')).toBeHidden(); // QR only under "Show code / QR"
  const t0 = Date.now();
  const item = watcher.page.getByTestId('lobby-item').filter({ hasText: 'onerror' }).first();
  await expect(watcher.page.getByTestId('lobby-item')).toHaveCount(1, { timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(2000);
  await expect(item.getByTestId('lobby-name')).toHaveText('<img src=x onerror=alert');
  await expect(item.getByTestId('lobby-game')).toContainText('First Week Hunt');
  await expect(item.getByTestId('lobby-count')).toHaveText('👥 0/6');
  await expect(item.getByTestId('lobby-state')).toContainText('open');
  await expect(watcher.page.locator('.lobbies img')).toHaveCount(0);
  await expect(hub2.page.getByTestId('hub-lobby-item')).toHaveCount(1, { timeout: 2000 });
  await expect(hub2.page.getByTestId('hub-lobby-item-meta')).toContainText('👥 0/6');
  await expectTapTargets(watcher.page);
  // the host closes the lobby: it leaves every list
  await h.page.getByTestId('room-cancel').click();
  await expect(watcher.page.getByTestId('lobby-item')).toHaveCount(0, { timeout: 2000 });
  await expect(hub2.page.getByTestId('hub-lobby-item')).toHaveCount(0, { timeout: 2000 });
  expectClean(h.issues);
  await h.ctx.close(); await watcher.ctx.close(); await hub2.ctx.close();
});

test('gated join: the host\'s code seats the player in the right game; a wrong code is refused; the host can change it', async ({ browser }) => {
  const h = await createFromHub(browser, 'Gate test', 'inbox-showdown', 'OPEN99');
  const a = await newPage(browser, PHONE);
  const pIssues = watch(a.page, origin);
  await joinFromList(a.page, 'Gate test', 'WRONG1', 'Ana');
  await expect(a.page.getByTestId('code-error')).toHaveText('Wrong code, ask the host.');
  await expect(h.page.getByTestId('room-player')).toHaveCount(0);
  // right code (case does not matter): seated in Inbox Showdown with the right name
  await a.page.getByTestId('code-key').fill('open99');
  await a.page.getByTestId('code-join-btn').click();
  await expect(a.page.getByTestId('player-name')).toHaveText('Ana');
  const code = h.code;
  expect(a.page.url()).toBe(origin + '/games/inbox-showdown/?room=' + code);
  await expect(h.page.getByTestId('room-player')).toHaveCount(1);
  await expect(h.page.getByTestId('room-players')).toContainText('Ana');
  // the host changes the code: the old one stops working, the new one works
  await h.page.getByTestId('room-key-edit').click();
  await h.page.getByTestId('room-key-input').fill('x');
  await h.page.getByTestId('room-key-save').click();
  await expect(h.page.getByTestId('room-key-error')).toBeVisible();
  await h.page.getByTestId('room-key-input').fill('newkey7');
  await h.page.getByTestId('room-key-save').click();
  await expect(h.page.getByTestId('room-key')).toHaveText('NEWKEY7');
  const b = await newPage(browser, PHONE);
  await joinFromList(b.page, 'Gate test', 'OPEN99', 'Ben');
  await expect(b.page.getByTestId('code-error')).toHaveText('Wrong code, ask the host.');
  await b.page.getByTestId('code-key').fill('NEWKEY7');
  await b.page.getByTestId('code-join-btn').click();
  await expect(b.page.getByTestId('player-name')).toHaveText('Ben');
  // the "Have a code?" fallback still works (room code + lobby code)
  const c = await newPage(browser, PHONE);
  await c.page.goto(origin + '/join/');
  await expect(c.page.getByTestId('code-input')).toBeHidden();
  await c.page.getByTestId('have-code').click();
  await c.page.getByTestId('code-input').fill(code);
  await c.page.getByTestId('code-key').fill('NEWKEY7');
  await c.page.getByTestId('code-name').fill('Cy');
  await c.page.getByTestId('code-join-btn').click();
  await expect(c.page.getByTestId('player-name')).toHaveText('Cy');
  await expect(h.page.getByTestId('room-player')).toHaveCount(3);
  // the list is global: the lobby shows 3/6, and goes 'in game' (still listed) when the game starts
  const w = await newPage(browser, PHONE);
  await w.page.goto(origin + '/join/');
  const item = w.page.getByTestId('lobby-item').filter({ hasText: 'Gate test' });
  await expect(item.getByTestId('lobby-count')).toHaveText('👥 3/6');
  await h.page.getByTestId('room-start').click();
  await expect(item.getByTestId('lobby-state')).toContainText('in game', { timeout: 2000 });
  await expect(item.getByTestId('lobby-join')).toHaveText('👀 Watch');
  await expect(h.page.getByTestId('room-badge')).toContainText(code);
  expectClean(h.issues); expectClean(pIssues);
  for (const p of [h, a, b, c, w]) await p.ctx.close();
});

test('the hub list\'s Join opens /join/ with that lobby already picked', async ({ browser }) => {
  const h = await createFromHub(browser, 'Hub pick', 'phish-or-fine', 'HUB777');
  const p = await newPage(browser, { width: 390, height: 844 });
  await p.page.goto(origin + '/');
  const item = p.page.getByTestId('hub-lobby-item').filter({ hasText: 'Hub pick' });
  await expect(item.getByTestId('hub-lobby-item-meta')).toContainText('Phish or Fine');
  await expectNoHorizontalScroll(p.page);
  await item.getByTestId('hub-lobby-join').click();
  await expect(p.page).toHaveURL(origin + '/join/?lobby=' + h.code);
  await expect(p.page.getByTestId('join-target')).toContainText('Hub pick');
  await p.page.getByTestId('code-key').fill('HUB777');
  await p.page.getByTestId('code-name').fill('Dee');
  await p.page.getByTestId('code-join-btn').click();
  await expect(p.page.getByTestId('player-name')).toHaveText('Dee');
  expect(p.page.url()).toBe(origin + '/games/phish-or-fine/?room=' + h.code);
  await h.ctx.close(); await p.ctx.close();
});

test('host transfer before the game: the earliest phone gets the lobby, the code and Start; the game runs from it', async ({ browser }) => {
  const h = await createFromHub(browser, 'Transfer pre', 'phish-or-fine', 'PRE123');
  const a = await seat(browser, 'Transfer pre', 'PRE123', 'Ana');
  const b = await seat(browser, 'Transfer pre', 'PRE123', 'Ben');
  const aIssues = watch(a.page, origin);
  await expect(h.page.getByTestId('room-player')).toHaveCount(2);
  await h.ctx.close(); // the host leaves
  await expect(b.page.getByTestId('player-host-left')).toBeVisible();
  // after HOST_TRANSFER_MS Ana (joined first) is promoted
  await expect(a.page.getByTestId('room-lobby')).toBeVisible({ timeout: 5000 });
  await expect(a.page.getByTestId('player-view')).toHaveCount(0);
  await expect(a.page.getByTestId('room-host-now')).toHaveText('👑 You are the host now');
  await expect(a.page.getByTestId('room-name')).toHaveText('Transfer pre');
  await expect(a.page.getByTestId('room-key')).toHaveText('PRE123');
  await expect(b.page.getByTestId('player-host-changed')).toContainText('Ana is the host now');
  await expect(a.page.getByTestId('room-players')).toContainText('Ana');
  await expect(a.page.getByTestId('room-players')).toContainText('Ben');
  // the new host owns the code and Start; it keeps its own seat
  await a.page.getByTestId('room-key-edit').click();
  await a.page.getByTestId('room-key-input').fill('ANA777');
  await a.page.getByTestId('room-key-save').click();
  await expect(a.page.getByTestId('room-key')).toHaveText('ANA777');
  await a.page.getByTestId('room-start').click();
  const S = () => a.page.evaluate(() => JSON.parse(JSON.stringify(window.PhishOrFine.state)));
  await expect.poll(async () => (await S()).players.map(p => p.name)).toEqual(['Ana', 'Ben']);
  await expect(a.page.getByTestId('bracket')).toBeVisible();
  // a move from Ben's phone is accepted by the new host
  await b.page.getByTestId('player-btn').filter({ hasText: 'Start the heat' }).click();
  await expect.poll(async () => (await S()).phase).toBe('countdown');
  expectClean(aIssues);
  await a.ctx.close(); await b.ctx.close();
});

// In-game transfer: each game exports its whole state; the promoted phone imports it and carries on.
const IN_GAME = {
  'inbox-showdown': {
    hook: 'InboxShowdown',
    async before(r) { // Ana reports, so Ben's phone gets the Challenge choice
      await r.a.page.getByTestId('player-btn').filter({ hasText: 'ready' }).click();
      await expect.poll(async () => (await r.S(r.h.page)).phase).toBe('turn');
      await r.a.page.getByTestId('player-btn').filter({ hasText: 'Report' }).click();
      await expect.poll(async () => (await r.S(r.h.page)).phase).toBe('challenge');
    },
    async after(r) {
      await r.b.page.getByTestId('player-btn').filter({ hasText: 'Agree' }).click();
      await expect.poll(async () => (await r.S(r.a.page)).phase).toBe('reveal');
    }
  },
  'first-week-hunt': {
    hook: 'FirstWeekHunt',
    async before(r) { // Ana taps a decoy and passes the turn to Ben
      const id = await r.h.page.evaluate(() => window.FirstWeekHunt.state.layout.find(x => !window.FirstWeekHunt.TILES.find(t => t.id === x).risk));
      const label = await r.h.page.evaluate(i => window.FirstWeekHunt.TILES.find(t => t.id === i).label, id);
      await r.a.page.getByTestId('player-btn').filter({ hasText: label }).click();
      await r.a.page.getByTestId('player-btn').filter({ hasText: 'Pass to Ben' }).click();
      await expect.poll(async () => (await r.S(r.h.page)).current).toBe(1);
    },
    async after(r) {
      const risk = await r.a.page.evaluate(() => window.FirstWeekHunt.state.layout.find(x => window.FirstWeekHunt.TILES.find(t => t.id === x).risk && !window.FirstWeekHunt.state.found.includes(x)));
      const label = await r.a.page.evaluate(i => window.FirstWeekHunt.TILES.find(t => t.id === i).label, risk);
      await r.b.page.getByTestId('player-btn').filter({ hasText: label }).click();
      await expect.poll(async () => { const s = await r.S(r.a.page); return s.popover && s.popover.tile; }).toBe(risk);
      await expect.poll(async () => (await r.S(r.a.page)).players[1].score).toBeGreaterThan(0);
    }
  },
  'phish-or-fine': {
    hook: 'PhishOrFine',
    async before() { /* on the bracket screen */ },
    async after(r) {
      await r.b.page.getByTestId('player-btn').filter({ hasText: 'Start the heat' }).click();
      await expect.poll(async () => (await r.S(r.a.page)).phase).toBe('countdown');
      await expect.poll(async () => (await r.S(r.a.page)).phase, { timeout: 8000 }).toBe('question');
    }
  }
};
for (const [slug, g] of Object.entries(IN_GAME)) {
  test(`host transfer mid-game (${slug}): the promoted phone loads the synced state, keeps its seat, and accepts the next move`, async ({ browser }) => {
    const name = 'Mid ' + slug.slice(0, 10);
    const h = await createFromHub(browser, name, slug, 'MID456');
    const a = await seat(browser, name, 'MID456', 'Ana');
    const b = await seat(browser, name, 'MID456', 'Ben');
    const aIssues = watch(a.page, origin);
    await h.page.getByTestId('room-start').click();
    const S = p => p.evaluate(hook => JSON.parse(JSON.stringify(window[hook].state)), g.hook);
    const r = { h, a, b, S };
    await g.before(r);
    await h.page.waitForTimeout(700); // let the last sync reach the server
    const snap = await S(h.page);
    await h.ctx.close();
    await expect(a.page.getByTestId('room-host-now')).toBeVisible({ timeout: 5000 });
    await expect(a.page.getByTestId('player-view')).toHaveCount(0);
    await expect(a.page.getByTestId('room-lobby')).toHaveCount(0); // straight back into the game
    await expect(a.page.getByTestId('room-badge')).toContainText(h.code);
    await expect(b.page.getByTestId('player-host-changed')).toContainText('Ana is the host now');
    const now = await S(a.page);
    expect(now.phase).toBe(snap.phase);
    expect(JSON.stringify((now.players || now.teams).map(p => [p.name, p.score]))).toBe(JSON.stringify((snap.players || snap.teams).map(p => [p.name, p.score])));
    await g.after(r);
    expectClean(aIssues);
    await a.ctx.close(); await b.ctx.close();
  });
}

test('an empty lobby deletes itself; one with a player left in it stays and gets a new host', async ({ browser }) => {
  const w = await newPage(browser, PHONE);
  await w.page.goto(origin + '/join/');
  const h = await createFromHub(browser, 'Empty test', 'inbox-showdown', 'EMPTY1');
  const a = await seat(browser, 'Empty test', 'EMPTY1', 'Ana');
  const item = w.page.getByTestId('lobby-item').filter({ hasText: 'Empty test' });
  await expect(item).toHaveCount(1);
  await h.ctx.close();
  await expect(a.page.getByTestId('room-host-now')).toBeVisible({ timeout: 5000 });
  await w.page.waitForTimeout(2500); // past EMPTY_LOBBY_MS: still listed, Ana is connected
  await expect(item).toHaveCount(1);
  await a.ctx.close(); // now nobody is connected
  await expect(item).toHaveCount(0, { timeout: 4000 });
  await expect.poll(async () => JSON.parse((await get('/healthz')).body).rooms, { timeout: 5000 }).toBe(0);
  await expect(w.page.getByTestId('lobby-empty')).toHaveText('No open lobbies, create one');
  await w.ctx.close();
});
