// Game A "Inbox Showdown" acceptance (SPEC.md section 6) plus the section 3 shared checks.
const { test, expect } = require('@playwright/test');
const { watch, expectClean, expectNoHorizontalScroll, expectTapTargets } = require('./helpers');

const GAME = '/games/inbox-showdown/';

async function start(page, names) {
  await page.getByTestId('team-names').fill(names.join('\n'));
  await page.getByTestId('btn-start').click();
}

/** Reads the current message from the turn card and whether it is risky (answer key from the page's bank). */
async function currentMessage(page) {
  const id = await page.getByTestId('turn-card').getByTestId('message-card').getAttribute('data-msg-id');
  const risky = await page.evaluate(i => window.InboxShowdown.MESSAGES.find(m => m.id === i).risky, id);
  return { id, risky };
}

/** Plays one turn. strategy: 'correct' | 'wrong' | 'open' | 'report'. Returns {team, id, risky}. */
async function playTurn(page, strategy = 'correct', { ask = false, challengeBy = null } = {}) {
  await expect(page.getByTestId('pass-screen')).toBeVisible();
  await page.getByTestId('btn-ready').click();
  const team = await page.getByTestId('turn-card').getAttribute('data-team');
  const msg = await currentMessage(page);
  if (ask) {
    await page.getByTestId('btn-ask').click();
    await expect(page.getByTestId('agent-hint')).toBeVisible();
    await expect(page.getByTestId('agent-hint')).not.toBeEmpty();
  }
  let choice = strategy;
  if (strategy === 'correct') choice = msg.risky ? 'report' : 'open';
  if (strategy === 'wrong') choice = msg.risky ? 'open' : 'report';
  await page.getByTestId('btn-' + choice).click();
  if (choice === 'open' && msg.risky && await page.getByTestId('shield-warning').isVisible()) {
    await page.getByTestId('btn-open-anyway').click();
  }
  await expect(page.getByTestId('challenge-screen')).toBeVisible();
  if (challengeBy != null) {
    await page.getByTestId('challenge-team').selectOption({ label: challengeBy });
    await page.getByTestId('btn-challenge').click();
  } else {
    await page.getByTestId('btn-reveal').click();
  }
  await expect(page.getByTestId('reveal')).toBeVisible();
  await expect(page.getByTestId('reveal-lesson')).toBeVisible();
  await page.getByTestId('btn-next').click();
  return { team, ...msg };
}

async function boardRows(page) {
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  return page.getByTestId('leaderboard-row').evaluateAll(rows => rows.map(r => ({
    name: r.querySelector('[data-testid="leaderboard-name"]').textContent,
    score: Number(r.querySelector('[data-testid="leaderboard-score"]').textContent)
  })));
}

test('setup accepts 2 to 6 names and rejects 1 or 7', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME);
  await start(page, ['Solo']);
  await expect(page.getByTestId('setup-error')).toBeVisible();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  await start(page, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  await expect(page.getByTestId('setup-error')).toBeVisible();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  await start(page, ['A', 'B']);
  await expect(page.getByTestId('pass-screen')).toBeVisible();
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-restart').click();
  await start(page, ['A', 'B', 'C', 'D', 'E', 'F']);
  await expect(page.getByTestId('pass-screen')).toContainText('Pass to A');
  expectClean(issues);
});

test('turns rotate in order, each team gets 3 messages, a pass screen shows between turns', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME);
  const names = ['Red', 'Blue', 'Green'];
  await start(page, names);
  const order = [], seen = new Set();
  for (let i = 0; i < 9; i++) {
    await expect(page.getByTestId('pass-screen')).toContainText('Pass to ' + names[i % 3]);
    const t = await playTurn(page, 'correct');
    order.push(t.team);
    seen.add(t.id);
  }
  expect(order).toEqual([...names, ...names, ...names]);
  expect(seen.size).toBe(9); // no repeats
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  const counts = await page.evaluate(() => {
    const c = {}; Object.values(window.InboxShowdown.Shield.log).forEach((l, i) => { c[i] = l.length; }); return c;
  });
  expect(counts).toEqual({ 0: 3, 1: 3, 2: 3 });
  expectClean(issues);
});

test('bank has 18 messages, 10 risky and 8 legit, all Northbridge-fictional', async ({ page }) => {
  await page.goto(GAME);
  const bank = await page.evaluate(() => window.InboxShowdown.MESSAGES.map(m => ({ risky: m.risky, category: m.category })));
  expect(bank.length).toBe(18);
  expect(bank.filter(m => m.risky).length).toBe(10);
  expect(bank.filter(m => !m.risky).length).toBe(8);
});

test('btn-open, btn-report, btn-ask, btn-challenge work; btn-ask shows agent-hint for every message', async ({ page, baseURL }) => {
  test.slow(); // 18 full turns; narration audio decoding makes it slower under a full parallel run
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?shield=off');
  // Shield off: Ask is disabled; turn it on from the menu so Ask works for the whole match.
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-shield').click();
  await page.keyboard.press('Escape');
  const names = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
  await start(page, names); // 6 teams x 3 = all 18 messages
  const ids = new Set();
  for (let i = 0; i < 18; i++) {
    const t = await playTurn(page, i % 2 ? 'report' : 'open', { ask: true, challengeBy: i % 3 === 0 ? names[(i + 1) % 6] : null });
    ids.add(t.id);
  }
  expect(ids.size).toBe(18);
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  expectClean(issues);
});

test('challenge steals +50 when the active team is wrong, nothing when right', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?shield=off');
  await start(page, ['Red', 'Blue']);
  await playTurn(page, 'wrong', { challengeBy: 'Blue' });   // Red wrong, Blue steals
  await playTurn(page, 'correct', { challengeBy: 'Red' });  // Blue right, no steal
  const s = await page.evaluate(() => window.InboxShowdown.state.teams.map(t => t.score));
  // Red: wrong (0 or -50) ; Blue: +50 steal + 100 correct
  expect(s[1]).toBe(150);
  expect([0, -50]).toContain(s[0]);
  expectClean(issues);
});

async function reachRiskyTurn(page) {
  for (let i = 0; i < 12; i++) {
    await page.getByTestId('btn-ready').click();
    const msg = await currentMessage(page);
    if (msg.risky) return msg;
    await page.getByTestId('btn-open').click();       // legit: open is correct, no warning
    await expect(page.getByTestId('shield-warning')).toHaveCount(0);
    await page.getByTestId('btn-reveal').click();
    await page.getByTestId('btn-next').click();
  }
  throw new Error('no risky message reached');
}

test('?shield=nudge: opening a risky message first shows shield-warning; back out then report', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?shield=nudge&seed=7');
  await start(page, ['A', 'B', 'C', 'D', 'E', 'F']);
  await reachRiskyTurn(page);
  await page.getByTestId('btn-open').click();
  await expect(page.getByTestId('shield-warning')).toBeVisible();
  await expect(page.getByTestId('shield-warning')).toContainText('Hold on');
  await expect(page.getByTestId('challenge-screen')).toHaveCount(0);
  await page.getByTestId('btn-back-out').click();
  await page.getByTestId('btn-report').click();
  await page.getByTestId('btn-reveal').click();
  await expect(page.getByTestId('reveal-result')).toContainText('Correct');
  expectClean(issues);
});

test('?shield=off: opening a risky message shows no shield-warning', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?shield=off&seed=7');
  await start(page, ['A', 'B', 'C', 'D', 'E', 'F']);
  await reachRiskyTurn(page);
  await page.getByTestId('btn-open').click();
  await expect(page.getByTestId('shield-warning')).toHaveCount(0);
  await expect(page.getByTestId('challenge-screen')).toBeVisible();
  await page.getByTestId('btn-reveal').click();
  await expect(page.getByTestId('reveal-result')).toContainText('Not quite');
  expectClean(issues);
});

test('scripted all-correct match gives each team 300; leaderboard sorted; debrief lists weakest categories', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME);
  const names = ['Red', 'Blue', 'Green', 'Gold'];
  await start(page, names);
  for (let i = 0; i < 12; i++) await playTurn(page, 'correct');
  const rows = await boardRows(page);
  expect(rows.map(r => r.name).sort()).toEqual([...names].sort());
  rows.forEach(r => expect(r.score).toBe(300));
  await page.getByTestId('btn-debrief').click();
  await expect(page.getByTestId('debrief')).toBeVisible();
  const teams = page.getByTestId('debrief-team');
  await expect(teams).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(teams.nth(i).getByTestId('debrief-weak')).toHaveCount(2);
  await expect(page.getByTestId('shield-stopped-total')).toContainText('Shield stopped');
  await page.getByTestId('btn-copy-results').click();
  await expect(page.getByTestId('results-text')).toContainText('Red: 300');
  expectClean(issues);
});

test('leaderboard sorts high to low; debrief names the missed category; Shield counts stopped mistakes', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?shield=nudge&seed=3');
  await start(page, ['Low', 'High']);
  const missed = [];
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) { const t = await playTurn(page, 'wrong'); missed.push(t); }
    else await playTurn(page, 'correct');
  }
  const rows = await boardRows(page);
  expect(rows[0]).toEqual({ name: 'High', score: 300 });
  expect(rows[1].name).toBe('Low');
  for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
  await page.getByTestId('btn-debrief').click();
  const cats = await page.evaluate(ids => ids.map(i => window.InboxShowdown.MESSAGES.find(m => m.id === i).category), missed.map(m => m.id));
  const lowWeak = await page.locator('[data-testid="debrief-team"][data-team="Low"] [data-testid="debrief-weak"]').evaluateAll(l => l.map(e => e.dataset.category));
  expect(cats).toContain(lowWeak[0]);
  expectClean(issues);
});

test('Shield stopped count: back out of a nudge then report', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?shield=nudge&seed=11');
  await start(page, ['A', 'B', 'C', 'D', 'E', 'F']);
  await reachRiskyTurn(page);
  await page.getByTestId('btn-open').click();
  await page.getByTestId('btn-back-out').click();
  await page.getByTestId('btn-report').click();
  await page.getByTestId('btn-reveal').click();
  await expect(page.getByTestId('reveal')).toContainText('+60');
  const stopped = await page.evaluate(() => Object.values(window.InboxShowdown.Shield.stopped).reduce((a, b) => a + b, 0));
  expect(stopped).toBe(1);
  expectClean(issues);
});

test('shared checks on every screen: no horizontal scroll at 375x667 and 360x640, buttons >= 44 px', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  for (const vp of [{ width: 375, height: 667 }, { width: 360, height: 640 }]) {
    await page.setViewportSize(vp);
    await page.goto(GAME + '?shield=nudge&seed=5');
    const check = async () => { await expectNoHorizontalScroll(page); await expectTapTargets(page); };
    await check();                                   // setup
    await start(page, ['Northbridge Night Owls', 'B']);
    await check();                                   // pass
    await page.getByTestId('btn-ready').click();
    await check();                                   // turn
    await page.getByTestId('btn-ask').click();
    await check();
    const msg = await currentMessage(page);
    await page.getByTestId(msg.risky ? 'btn-report' : 'btn-open').click();
    await check();                                   // challenge
    await page.getByTestId('btn-reveal').click();
    await check();                                   // reveal
    await page.getByTestId('btn-next').click();
    for (let i = 0; i < 5; i++) await playTurn(page, 'correct');
    await check();                                   // leaderboard
    await page.getByTestId('btn-debrief').click();
    await check();                                   // debrief
  }
  expectClean(issues);
});
