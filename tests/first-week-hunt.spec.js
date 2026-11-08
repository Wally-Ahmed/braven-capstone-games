// Game B "First Week Hunt" acceptance (SPEC.md section 6), its hub card and shared menu (section 7),
// plus the section 3 shared checks.
const { test, expect } = require('@playwright/test');
const { watch, expectClean, expectNoHorizontalScroll, expectTapTargets, setNames, expectRosterBounds } = require('./helpers');

const GAME = '/games/first-week-hunt/';
const SLUG = 'first-week-hunt';

async function start(page, names) {
  await setNames(page, names);
  await page.getByTestId('btn-start').click();
}

const banner = page => page.getByTestId('turn-banner');
const unfoundRisk = page => page.locator('[data-testid="tile"][data-risk="true"]:not([data-found]):enabled').first();
const freshDecoy = page => page.locator('[data-testid="tile"][data-risk="false"]:enabled').first();

/** Taps a tile and closes the lesson popover. */
async function tapAndClose(page, tile) {
  await tile.click();
  await expect(page.getByTestId('lesson-popover')).toBeVisible();
  await expect(page.getByTestId('lesson-text')).not.toBeEmpty();
  await page.getByTestId('btn-lesson-ok').click();
  await expect(page.getByTestId('lesson-popover')).toHaveCount(0);
}
const findOne = page => tapAndClose(page, unfoundRisk(page));
const decoyOne = page => tapAndClose(page, freshDecoy(page));

async function boardRows(page) {
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  return page.getByTestId('leaderboard-row').evaluateAll(rows => rows.map(r => ({
    name: r.querySelector('[data-testid="leaderboard-name"]').textContent,
    score: Number(r.querySelector('[data-testid="leaderboard-score"]').textContent)
  })));
}
const scores = page => page.evaluate(() => window.FirstWeekHunt.state.players.map(p => p.score));

test('office has 8 data-risk="true" and at least 6 data-risk="false" tiles, Northbridge only', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME);
  await start(page, ['A', 'B']);
  await expect(page.getByTestId('scene')).toBeVisible();
  await expect(page.locator('[data-testid="tile"][data-risk="true"]')).toHaveCount(8);
  expect(await page.locator('[data-testid="tile"][data-risk="false"]').count()).toBeGreaterThanOrEqual(6);
  const ids = await page.evaluate(() => window.FirstWeekHunt.TILES.filter(t => t.risk).map(t => t.id).sort());
  expect(ids).toEqual(['laptop', 'mfa', 'post', 'qr', 'sticky', 'tailgate', 'update', 'usb']);
  // every tile maps to one of the 8 Shield categories and has a lesson line
  const ok = await page.evaluate(() => window.FirstWeekHunt.TILES.every(t =>
    ['urgency', 'lookalike', 'credential', 'giftcard', 'attachment', 'mfa', 'oversharing', 'device'].includes(t.category) && t.flag && t.habit));
  expect(ok).toBe(true);
  expect((await page.content()).toLowerCase()).not.toContain('cognizant');
  expectClean(issues);
});

test('setup accepts 2 to 6 names and rejects 1 or 7', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME);
  await expectRosterBounds(page);
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  await start(page, ['A', 'B', 'C', 'D', 'E', 'F']);
  await expect(banner(page)).toContainText("A's turn");
  await expect(page.getByTestId('timer')).toContainText('120');
  expectClean(issues);
});

test('3 players: turn-banner changes on a decoy, not on a find; all 8 found shows 8/8 and 3 sorted rows', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?seed=4');
  await start(page, ['Ava', 'Ben', 'Cy']);
  await expect(banner(page)).toContainText("Ava's turn");
  await findOne(page);                                   // Ava 1 find
  await expect(banner(page)).toContainText("Ava's turn"); // find keeps the turn
  await decoyOne(page);
  await expect(banner(page)).toContainText("Ben's turn"); // decoy passes it
  for (let i = 0; i < 3; i++) { await findOne(page); await expect(banner(page)).toContainText("Ben's turn"); }
  await decoyOne(page);
  await expect(banner(page)).toContainText("Cy's turn");
  for (let i = 0; i < 3; i++) await findOne(page);
  await expect(page.getByTestId('found-progress')).toContainText('7/8');
  await unfoundRisk(page).click();
  await expect(page.getByTestId('btn-lesson-ok')).toContainText('See leaderboard');
  await page.getByTestId('btn-lesson-ok').click();
  await expect(page.getByTestId('found-count')).toContainText('8/8');
  const rows = await boardRows(page);
  expect(rows).toEqual([{ name: 'Cy', score: 600 }, { name: 'Ben', score: 450 }, { name: 'Ava', score: 150 }]);
  for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
  expectClean(issues);
});

test('two decoys in a row show hacked-banner and zero that player\'s score; Shield warns after the first decoy', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME);
  await start(page, ['Ava', 'Ben']);
  await findOne(page); await findOne(page);              // Ava 300
  expect(await scores(page)).toEqual([300, 0]);
  await freshDecoy(page).click();                        // Ava decoy #1
  await expect(page.getByTestId('shield-warning')).toBeVisible();
  await expect(page.getByTestId('shield-warning')).toContainText('One more wrong tap');
  await expect(page.getByTestId('hacked-banner')).toHaveCount(0);
  await page.getByTestId('btn-lesson-ok').click();
  await findOne(page);                                   // Ben 150
  await decoyOne(page);                                  // Ben decoy #1 -> back to Ava
  await expect(banner(page)).toContainText("Ava's turn");
  await freshDecoy(page).click();                        // Ava decoy #2 in a row -> hacked
  await expect(page.getByTestId('hacked-banner')).toBeVisible();
  await expect(page.getByTestId('hacked-banner')).toContainText('hacked');
  expect(await scores(page)).toEqual([0, 150]);
  await page.getByTestId('btn-lesson-ok').click();
  await expect(banner(page)).toContainText("Ben's turn");
  expectClean(issues);
});

test('a find between decoys resets the streak (no hack); Shield counts the stopped mistake', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME);
  await start(page, ['Ava', 'Ben']);
  await decoyOne(page);   // Ava decoy, warned
  await decoyOne(page);   // Ben decoy, warned
  await findOne(page);    // Ava find after warning -> streak reset, stopped 1
  await freshDecoy(page).click();
  await expect(page.getByTestId('hacked-banner')).toHaveCount(0);
  await page.getByTestId('btn-lesson-ok').click();
  expect(await page.evaluate(() => window.FirstWeekHunt.Shield.stopped[0])).toBe(1);
  expectClean(issues);
});

test('hint-btn highlights one unfound risk, once per player', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?seed=9');
  await start(page, ['Ava', 'Ben']);
  await findOne(page);
  await page.getByTestId('hint-btn').click();
  const hinted = page.locator('[data-testid="tile"][data-hinted="true"]');
  await expect(hinted).toHaveCount(1);
  await expect(hinted).toHaveAttribute('data-risk', 'true');
  await expect(hinted).not.toHaveAttribute('data-found', 'true');
  await expect(page.getByTestId('agent-hint')).toBeVisible();
  expect(await scores(page)).toEqual([100, 0]);          // 150 - 50
  await expect(page.getByTestId('hint-btn')).toBeDisabled();
  await tapAndClose(page, hinted);                       // the hinted tile is a real risk
  await expect(page.locator('[data-testid="tile"][data-hinted="true"]')).toHaveCount(0);
  await expect(page.getByTestId('hint-btn')).toBeDisabled(); // still Ava, already used
  await decoyOne(page);                                  // -> Ben
  await expect(page.getByTestId('hint-btn')).toBeEnabled();
  await page.getByTestId('hint-btn').click();
  await expect(page.locator('[data-testid="tile"][data-hinted="true"][data-risk="true"]')).toHaveCount(1);
  await expect(page.getByTestId('hint-btn')).toBeDisabled();
  await decoyOne(page);                                  // -> Ava
  await expect(banner(page)).toContainText("Ava's turn");
  await expect(page.getByTestId('hint-btn')).toBeDisabled();
  expect(await page.evaluate(() => window.FirstWeekHunt.state.players.map(p => p.hintUsed))).toEqual([true, true]);
  expectClean(issues);
});

test('?shield=off: no hint and no decoy warning', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?shield=off');
  await start(page, ['Ava', 'Ben']);
  await expect(page.getByTestId('hint-btn')).toBeDisabled();
  await freshDecoy(page).click();
  await expect(page.getByTestId('lesson-popover')).toBeVisible();
  await expect(page.getByTestId('shield-warning')).toHaveCount(0);
  expectClean(issues);
});

test('?fast=1 sets the timer to 3 s and results appear', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?fast=1');
  await start(page, ['Ava', 'Ben', 'Cy']);
  await expect(page.getByTestId('timer')).toHaveAttribute('data-seconds', '3');
  await findOne(page);
  await expect(page.getByTestId('leaderboard')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('end-reason')).toContainText('Time is up');
  await expect(page.getByTestId('found-count')).toContainText('1/8');
  const rows = await boardRows(page);
  expect(rows.length).toBe(3);
  expect(rows[0]).toEqual({ name: 'Ava', score: 150 });
  expectClean(issues);
});

test('debrief lists two weakest categories per player; copy results; play again returns to setup', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME + '?seed=2');
  await start(page, ['Ava', 'Ben']);
  const decoyCat = await freshDecoy(page).getAttribute('data-tile-id').then(id =>
    page.evaluate(i => window.FirstWeekHunt.TILES.find(t => t.id === i).category, id));
  await decoyOne(page);                                  // Ava misses decoyCat
  while (await unfoundRisk(page).count()) {
    await unfoundRisk(page).click();
    await page.getByTestId('btn-lesson-ok').click();
  }
  await expect(page.getByTestId('found-count')).toContainText('8/8');
  await page.getByTestId('btn-debrief').click();
  await expect(page.getByTestId('debrief')).toBeVisible();
  const players = page.getByTestId('debrief-player');
  await expect(players).toHaveCount(2);
  for (let i = 0; i < 2; i++) await expect(players.nth(i).getByTestId('debrief-weak')).toHaveCount(2);
  await expect(page.locator('[data-testid="debrief-player"][data-player="Ava"] [data-testid="debrief-weak"]').first()).toHaveAttribute('data-category', decoyCat);
  await expect(page.getByTestId('shield-stopped-total')).toContainText('Shield stopped');
  await page.getByTestId('btn-copy-results').click();
  await expect(page.getByTestId('results-text')).toContainText('Ben: 1200');
  await page.getByTestId('btn-play-again').click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  expectClean(issues);
});

test('shared checks on every screen: no horizontal scroll at 375x667 and 360x640, buttons >= 44 px', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  for (const vp of [{ width: 375, height: 667 }, { width: 360, height: 640 }]) {
    await page.setViewportSize(vp);
    await page.goto(GAME);
    const check = async () => { await expectNoHorizontalScroll(page); await expectTapTargets(page); };
    await check();                                               // setup
    await start(page, ['Northbridge Night Owls With A Long Name', 'B']);
    await check();                                               // scene
    await page.getByTestId('hint-btn').click();
    await check();                                               // hint
    await unfoundRisk(page).click();
    await check();                                               // lesson popover
    await page.getByTestId('btn-lesson-ok').click();
    await freshDecoy(page).click(); await page.getByTestId('btn-lesson-ok').click();
    await freshDecoy(page).click(); await page.getByTestId('btn-lesson-ok').click();
    await freshDecoy(page).click();
    await expect(page.getByTestId('hacked-banner')).toBeVisible();
    await check();                                               // hacked
    await page.getByTestId('btn-lesson-ok').click();
    while (await unfoundRisk(page).count()) { await unfoundRisk(page).click(); await page.getByTestId('btn-lesson-ok').click(); }
    await check();                                               // leaderboard
    await page.getByTestId('btn-debrief').click();
    await check();                                               // debrief
  }
  expectClean(issues);
});

test.describe('hub card and shared menu for First Week Hunt', () => {
  test('hub lists First Week Hunt as the second GAMES entry with name, pitch, players and minutes', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.goto('/');
    const games = await page.evaluate(() => GAMES);
    expect(games[1].slug).toBe(SLUG);
    const card = page.locator(`[data-testid="game-card"][data-slug="${SLUG}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('game-name')).toHaveText('First Week Hunt');
    await expect(card.getByTestId('game-pitch')).toHaveText(games[1].pitch);
    await expect(card.getByTestId('game-players')).toContainText('2 to 6');
    await expect(card.getByTestId('game-minutes')).toContainText('about 3');
    expectClean(issues);
  });

  for (const vp of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    test(`play-btn loads the game; menu-btn visible at ${vp.width}x${vp.height}, no horizontal scroll`, async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await page.setViewportSize(vp);
      await page.goto('/');
      await page.locator(`[data-testid="game-card"][data-slug="${SLUG}"]`).getByTestId('play-btn').click();
      await expect(page).toHaveURL(new RegExp(GAME + '$'));
      await expect(page.getByTestId('setup-screen')).toBeVisible();
      await expect(page.getByTestId('menu-btn')).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.getByTestId('menu-btn').click();
      await expect(page.getByTestId('menu-panel')).toBeVisible();
      await expectNoHorizontalScroll(page);
      expectClean(issues);
    });
  }

  test('menu-game-selection returns to /', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.goto(GAME);
    await page.getByTestId('menu-btn').click();
    await page.getByTestId('menu-game-selection').click();
    await expect(page).toHaveURL(baseURL + '/');
    await expect(page.getByTestId('game-card').first()).toBeVisible();
    expectClean(issues);
  });

  test('menu-restart resets the game to its setup screen', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.goto(GAME);
    await start(page, ['Ava', 'Ben']);
    await findOne(page);
    await expect(page.getByTestId('scene-screen')).toBeVisible();
    await page.getByTestId('menu-btn').click();
    await page.getByTestId('menu-restart').click();
    await expect(page.getByTestId('setup-screen')).toBeVisible();
    await expect(page.getByTestId('menu-panel')).toBeHidden();
    const s = await page.evaluate(() => ({ phase: window.FirstWeekHunt.state.phase, found: window.FirstWeekHunt.state.found.length }));
    expect(s).toEqual({ phase: 'setup', found: 0 });
    expectClean(issues);
  });

  test('menu-shield toggles Shield and its label shows the state', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.goto(GAME);
    await start(page, ['Ava', 'Ben']);
    await page.getByTestId('menu-btn').click();
    const btn = page.getByTestId('menu-shield');
    await expect(btn).toHaveText(/Shield: on/);
    await btn.click();
    await expect(btn).toHaveText(/Shield: off/);
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.FirstWeekHunt.Shield.mode)).toBe('off');
    await expect(page.getByTestId('shield-status')).toContainText('off');
    await expect(page.getByTestId('hint-btn')).toBeDisabled();
    await btn.click();
    await expect(btn).toHaveText(/Shield: on/);
    expect(await page.evaluate(() => window.FirstWeekHunt.Shield.mode)).toBe('nudge');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('hint-btn')).toBeEnabled();
    await page.goto(GAME + '?shield=off');
    await page.getByTestId('menu-btn').click();
    await expect(page.getByTestId('menu-shield')).toHaveText(/Shield: off/);
    expectClean(issues);
  });

  test('menu-howto opens rules text; Esc closes menu-panel', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.goto(GAME);
    await page.getByTestId('menu-btn').click();
    await expect(page.getByTestId('menu-howto-text')).toBeHidden();
    await page.getByTestId('menu-howto').click();
    await expect(page.getByTestId('menu-howto-text')).toBeVisible();
    await expect(page.getByTestId('menu-howto-text')).toContainText('hacked');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-panel')).toBeHidden();
    expectClean(issues);
  });

  test('menu buttons are >= 44 px tall and reachable by keyboard (Tab, Enter)', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(GAME);
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('menu-btn')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-panel')).toBeVisible();
    for (const id of ['menu-game-selection', 'menu-restart', 'menu-shield', 'menu-howto', 'menu-close']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box.height, id).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByTestId('menu-game-selection')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('menu-restart')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('menu-shield')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-shield')).toHaveText(/Shield: off/);
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('menu-fullscreen')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('menu-howto')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-howto-text')).toBeVisible();
    await expectTapTargets(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-panel')).toBeHidden();
    await expect(page.getByTestId('menu-btn')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(baseURL + '/');
    expectClean(issues);
  });
});
