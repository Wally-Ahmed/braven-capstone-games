// Room mode: server/index.js (static site + WebSocket relay at /ws) started on a free port for this file.
// A host screen opens a room in each game, two phones join by URL, the host sees them, a phone move
// changes the host's state and the host's state reaches the phones; late joiners spectate.
// Also /healthz, static serving, and the fallback (no "Play on phones" on a plain static server).
const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const net = require('net');
const http = require('http');
const path = require('path');
const { watch, expectClean, expectTapTargets } = require('./helpers');

let proc, origin;
const SKIP = ['inbox-showdown', 'first-week-hunt', 'phish-or-fine'];

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.unref(); s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
function get(p, method = 'GET') {
  return new Promise((resolve, reject) => {
    const u = new URL(origin);
    const req = http.request({ host: u.hostname, port: u.port, path: p, method }, res => {
      let body = ''; res.on('data', d => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  const port = await freePort();
  origin = 'http://127.0.0.1:' + port;
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { const r = await get('/healthz'); if (r.status === 200) return; } catch (e) { /* not up yet */ }
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

async function joinAs(page, url, name) {
  await page.goto(url);
  await expect(page.getByTestId('join-form')).toBeVisible();
  await page.getByTestId('join-name').fill(name);
  await page.getByTestId('join-avatar').nth(2).click();
  await page.getByTestId('join-btn').click();
  await expect(page.getByTestId('player-name')).toHaveText(name);
}

/** Host opens a room in `slug`, phones A and B join, host starts. Returns the pages. */
async function setupRoom(browser, slug) {
  const host = await newPage(browser);
  const issues = watch(host.page, origin);
  await host.page.goto(origin + '/games/' + slug + '/');
  await expect(host.page.getByTestId('btn-start')).toBeVisible();
  await host.page.getByTestId('btn-rooms').click();
  await expect(host.page.getByTestId('room-lobby')).toBeVisible();
  const code = (await host.page.getByTestId('room-code').textContent()).trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  const url = (await host.page.getByTestId('room-url').textContent()).trim();
  expect(url).toBe(origin + '/games/' + slug + '/?room=' + code);
  await expect(host.page.locator('[data-testid="room-qr"] svg')).toBeVisible();
  await expect(host.page.getByTestId('room-start')).toBeDisabled();

  const a = await newPage(browser, { width: 360, height: 640 });
  const b = await newPage(browser, { width: 360, height: 640 });
  const pIssues = watch(a.page, origin);
  await joinAs(a.page, url, 'Ana');
  await expect(host.page.getByTestId('room-player')).toHaveCount(1);
  await joinAs(b.page, url, 'Ben');
  await expect(host.page.getByTestId('room-player')).toHaveCount(2);
  await expect(host.page.getByTestId('room-players')).toContainText('Ana');
  await expect(host.page.getByTestId('room-players')).toContainText('Ben');
  await expect(a.page.getByTestId('player-status')).toHaveAttribute('data-status', 'wait');
  await expect(host.page.getByTestId('room-start')).toBeEnabled();
  await host.page.getByTestId('room-start').click();
  await expect(host.page.getByTestId('room-lobby')).toHaveCount(0);
  await expect(host.page.getByTestId('room-badge')).toContainText(code);
  return { host, a, b, url, code, issues, pIssues };
}

async function done(r) {
  expectClean(r.issues); expectClean(r.pIssues);
  await r.host.ctx.close(); await r.a.ctx.close(); await r.b.ctx.close();
}

test('/healthz, static serving and the X-Rooms probe header', async () => {
  const h = await get('/healthz');
  expect(h.status).toBe(200);
  expect(JSON.parse(h.body).ok).toBe(true);
  const root = await get('/');
  expect(root.status).toBe(200);
  expect(root.body).toContain('game-card');
  expect(root.headers['x-rooms']).toBe('1');
  const head = await get('/games/inbox-showdown/', 'HEAD');
  expect(head.status).toBe(200);
  expect(head.body).toBe('');
  const redir = await get('/games/inbox-showdown');
  expect(redir.status).toBe(301);
  expect(redir.headers.location).toBe('/games/inbox-showdown/');
  expect((await get('/shared/net.js')).headers['content-type']).toContain('javascript');
  expect((await get('/shared/narration/hub/lines.json')).status).toBe(200);
  expect((await get('/nope.html')).status).toBe(404);
  expect([403, 404]).toContain((await get('/%2e%2e/%2e%2e/etc/passwd')).status);
  expect((await get('/node_modules/ws/package.json')).status).toBe(404);
});

test('a plain static server hides room mode (same-screen stays the default)', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto('/games/inbox-showdown/');
  await expect(page.getByTestId('btn-start')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('btn-rooms')).toHaveCount(0);
  expectClean(issues);
});

test('Inbox Showdown: phones join, Ready/Report from a phone drive the host, Challenge goes to the other phone, late joiner spectates', async ({ browser }) => {
  const r = await setupRoom(browser, 'inbox-showdown');
  const S = () => r.host.page.evaluate(() => JSON.parse(JSON.stringify(window.InboxShowdown.state)));
  expect((await S()).teams.map(t => t.name)).toEqual(['Ana', 'Ben']);
  await expect(r.host.page.getByTestId('pass-screen')).toBeVisible();
  // host state reaches the phones: Ana's turn, Ben waits
  await expect(r.a.page.getByTestId('player-status')).toHaveAttribute('data-status', 'turn');
  await expect(r.b.page.getByTestId('player-status')).toHaveAttribute('data-status', 'wait');
  await expect(r.b.page.getByTestId('player-btn')).toHaveCount(0);
  await r.a.page.getByTestId('player-btn').filter({ hasText: 'ready' }).click();
  await expect.poll(async () => (await S()).phase).toBe('turn');
  await expect(r.host.page.getByTestId('turn-card')).toBeVisible();
  await expect(r.a.page.getByTestId('player-prompt')).toContainText('from');
  await expect(r.a.page.getByTestId('player-btn')).toHaveCount(3);
  await expectTapTargets(r.a.page);
  await r.a.page.getByTestId('player-btn').filter({ hasText: 'Report' }).click();
  await expect.poll(async () => (await S()).phase).toBe('challenge');
  await expect(r.host.page.getByTestId('fx-punch')).toContainText('Report'); // the choice punches in on the big screen...
  await expect(r.a.page.getByTestId('fx-punch')).toHaveClass(/lite/); // ...and, lighter, on the phone that chose
  await expect(r.b.page.getByTestId('player-btn').filter({ hasText: 'Challenge' })).toBeVisible();
  await expect(r.a.page.getByTestId('player-btn')).toHaveCount(0);
  await r.b.page.getByTestId('player-btn').filter({ hasText: 'Agree' }).click();
  await expect.poll(async () => (await S()).phase).toBe('reveal');
  await expect(r.a.page.getByTestId('player-btn').filter({ hasText: 'Next team' })).toBeVisible();
  const score = (await S()).teams[0].score;
  await expect(r.a.page.getByTestId('player-score')).toHaveText(score + ' pts');
  // late joiner watches
  const c = await newPage(browser, { width: 360, height: 640 });
  await joinAs(c.page, r.url, 'Cal');
  await expect(c.page.getByTestId('player-status')).toHaveAttribute('data-status', 'spectate');
  await expect(r.host.page.getByTestId('room-badge')).toContainText('3 phones');
  await c.ctx.close();
  await done(r);
});

test('First Week Hunt: the turn player taps office spots on the phone; the lesson closes from the phone', async ({ browser }) => {
  const r = await setupRoom(browser, 'first-week-hunt');
  const S = () => r.host.page.evaluate(() => JSON.parse(JSON.stringify(window.FirstWeekHunt.state)));
  await expect(r.host.page.getByTestId('scene-screen')).toBeVisible();
  await expect(r.a.page.getByTestId('player-status')).toHaveAttribute('data-status', 'turn');
  await expect(r.b.page.getByTestId('player-status')).toHaveAttribute('data-status', 'wait');
  const tiles = (await S()).layout.length;
  await expect(r.a.page.getByTestId('player-btn')).toHaveCount(tiles + 1); // every spot + the Shield hint
  const id = await r.host.page.evaluate(() => window.FirstWeekHunt.state.layout.find(x => !window.FirstWeekHunt.TILES.find(t => t.id === x).risk));
  const label = await r.host.page.evaluate(i => window.FirstWeekHunt.TILES.find(t => t.id === i).label, id);
  await r.a.page.getByTestId('player-btn').filter({ hasText: label }).click();
  await expect.poll(async () => { const s = await S(); return s.popover && s.popover.tile; }).toBe(id);
  await expect(r.host.page.getByTestId('lesson-popover')).toBeVisible();
  await expect(r.a.page.getByTestId('player-warning')).toContainText('decoy');
  await expect(r.host.page.getByTestId('fx-wrong')).toHaveCount(1); // host plays the full animation...
  await expect(r.a.page.getByTestId('fx-wrong')).toHaveClass(/lite/); // ...and the phone that tapped plays the lighter one
  await expect(r.b.page.getByTestId('fx-wrong')).toHaveCount(0);
  await r.a.page.getByTestId('player-btn').filter({ hasText: 'Pass to Ben' }).click();
  await expect.poll(async () => (await S()).current).toBe(1);
  await expect(r.b.page.getByTestId('player-status')).toHaveAttribute('data-status', 'turn');
  await expect(r.a.page.getByTestId('player-status')).toHaveAttribute('data-status', 'wait');
  await done(r);
});

test('Phish or Fine: a phone starts the heat and buzzes; the buzz scores on the host', async ({ browser }) => {
  const r = await setupRoom(browser, 'phish-or-fine');
  const S = () => r.host.page.evaluate(() => JSON.parse(JSON.stringify(window.PhishOrFine.state)));
  await expect(r.host.page.getByTestId('bracket')).toBeVisible();
  await r.b.page.getByTestId('player-btn').filter({ hasText: 'Start the heat' }).click();
  await expect.poll(async () => (await S()).phase).toBe('countdown');
  await expect(r.a.page.getByTestId('player-status')).toContainText('Get ready');
  await expect.poll(async () => (await S()).phase, { timeout: 8000 }).toBe('question');
  await expect(r.a.page.getByTestId('player-btn')).toHaveCount(2);
  await expect(r.a.page.getByTestId('player-prompt')).toContainText('from');
  const phish = await r.host.page.evaluate(() => { const s = window.PhishOrFine.state; return window.PhishOrFine.SNIPPETS.find(x => x.id === s.q.item).phish; });
  await r.a.page.getByTestId('player-btn').filter({ hasText: phish ? 'Phish' : 'Fine' }).click();
  await expect.poll(async () => (await S()).phase).toBe('reveal');
  const s = await S();
  expect(s.players[0].score).toBe(100);
  await expect(r.a.page.getByTestId('player-score')).toHaveText('100 pts');
  await expect(r.a.page.getByTestId('player-status')).toContainText(phish ? 'Phish' : 'Fine');
  await done(r);
});

// 11/10 lobby (Wally: "I want to have a multi screen experience with lobbys anyway can make it join"):
// the hub hosts and joins; phones join by typing the code at /join/ and land in the right game.
async function joinByCode(page, code, name) {
  await page.goto(origin + '/join/');
  await page.getByTestId('code-input').fill(code.toLowerCase());
  await expect(page.getByTestId('code-input')).toHaveValue(code);
  await page.getByTestId('code-name').fill(name);
  await page.getByTestId('code-avatar').nth(3).click();
  await page.getByTestId('code-join-btn').click();
  await expect(page.getByTestId('player-name')).toHaveText(name);
  await expect(page.getByTestId('join-form')).toHaveCount(0); // no second name form: the join page already seated it
}

test('Lobby: hub "Host multi-screen" opens the room; two phones join by code at /join/ and play Phish or Fine end to end', async ({ browser }) => {
  const host = await newPage(browser, { width: 390, height: 844 });
  const issues = watch(host.page, origin);
  await host.page.goto(origin + '/');
  await expect(host.page.getByTestId('hub-lobby')).toBeVisible();
  await expect(host.page.getByTestId('host-btn')).toHaveCount(3);
  await host.page.locator('[data-slug="phish-or-fine"] [data-testid="host-btn"]').click();
  await expect(host.page.getByTestId('room-lobby')).toBeVisible();
  const code = (await host.page.getByTestId('room-code').textContent()).trim();
  await expect(host.page.getByTestId('room-join-hint')).toContainText(code);

  const a = await newPage(browser, { width: 360, height: 640 });
  const b = await newPage(browser, { width: 360, height: 640 });
  const pIssues = watch(a.page, origin);
  await joinByCode(a.page, code, 'Ana');
  expect(a.page.url()).toBe(origin + '/games/phish-or-fine/?room=' + code);
  await joinByCode(b.page, code, 'Ben');
  await expect(host.page.getByTestId('room-player')).toHaveCount(2);
  await host.page.getByTestId('room-start').click();
  const S = () => host.page.evaluate(() => JSON.parse(JSON.stringify(window.PhishOrFine.state)));
  expect((await S()).players.map(p => p.name)).toEqual(['Ana', 'Ben']);
  // phone A starts the heat, both phones buzz on their own screens across the whole 12-snippet heat
  await a.page.getByTestId('player-btn').filter({ hasText: 'Start the heat' }).click();
  for (let i = 0; i < 12; i++) {
    await expect.poll(async () => (await S()).phase, { timeout: 9000 }).toBe('question');
    const phish = await host.page.evaluate(() => { const s = window.PhishOrFine.state; return window.PhishOrFine.SNIPPETS.find(x => x.id === s.q.item).phish; });
    const who = i % 2 ? b : a;
    await who.page.getByTestId('player-btn').filter({ hasText: phish ? 'Phish' : 'Fine' }).click();
    await expect.poll(async () => (await S()).phase).not.toBe('question');
    if ((await S()).phase === 'reveal') await host.page.getByTestId('btn-next').click();
  }
  await expect(host.page.getByTestId('heat-result')).toBeVisible({ timeout: 10000 });
  await host.page.getByTestId('btn-results').click();
  await expect(host.page.getByTestId('leaderboard')).toBeVisible();
  const s = await S();
  expect(s.players[0].score).toBeGreaterThan(0);
  expect(s.players[1].score).toBeGreaterThan(0);
  await expect(a.page.getByTestId('player-status')).toHaveAttribute('data-status', 'over');
  await expect(a.page.getByTestId('player-score')).toHaveText(s.players[0].score + ' pts');
  await expectTapTargets(a.page);
  expectClean(issues); expectClean(pIssues);
  await host.ctx.close(); await a.ctx.close(); await b.ctx.close();
});

test('Lobby: a wrong code shows a clear error on /join/; the hub hides multi-screen on a plain static server', async ({ browser, baseURL }) => {
  const p = await newPage(browser, { width: 360, height: 640 });
  await p.page.goto(origin + '/join/?code=zzzz');
  await expect(p.page.getByTestId('code-input')).toHaveValue('ZZZZ');
  await p.page.getByTestId('code-name').fill('Ana');
  await p.page.getByTestId('code-join-btn').click();
  await expect(p.page.getByTestId('code-error')).toContainText('No room');
  await p.page.goto(baseURL + '/');
  await p.page.waitForTimeout(500);
  await expect(p.page.getByTestId('hub-lobby')).toBeHidden();
  await expect(p.page.getByTestId('host-btn').first()).toBeHidden();
  await p.ctx.close();
});
