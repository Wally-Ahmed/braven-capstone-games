// Game C "Phish or Fine? Buzzer Battle" acceptance (SPEC.md section 6), its hub card and shared menu
// checks (section 7), plus the section 3 shared checks. Timers run on Playwright's clock.
const { test, expect } = require('@playwright/test');
const { watch, expectClean, expectNoHorizontalScroll, expectTapTargets, setNames, expectRosterBounds } = require('./helpers');

const SLUG = 'phish-or-fine';
const GAME = '/games/' + SLUG + '/';
const T0 = new Date('2026-11-07T08:00:00');
const T1 = new Date('2026-11-07T09:00:00');

/** Loads the game with a paused fake clock so the countdown, 6 s timer and reveal auto-advance are manual. */
async function openGame(page, query = '') {
  await page.clock.install({ time: T0 });
  await page.goto(GAME + query);
  await page.clock.pauseAt(T1);
}

async function start(page, names) {
  await setNames(page, names);
  await page.getByTestId('btn-start').click();
}

const S = page => page.evaluate(() => JSON.parse(JSON.stringify(window.PhishOrFine.state)));

/** From the bracket screen: start the heat and run the 3-2-1 countdown. */
async function startHeat(page) {
  await page.getByTestId('btn-start-heat').click();
  await expect(page.getByTestId('countdown')).toHaveText('3');
  await page.clock.runFor(1000);
  await expect(page.getByTestId('countdown')).toHaveText('2');
  await page.clock.runFor(2000);
  await expect(page.getByTestId('question-screen')).toBeVisible();
}

async function currentItem(page) {
  const id = await page.getByTestId('question-screen').getAttribute('data-item-id');
  return page.evaluate(i => { const s = window.PhishOrFine.SNIPPETS.find(x => x.id === i); return { id: s.id, phish: s.phish, category: s.category }; }, id);
}

const answerFor = (item, correct) => (item.phish === correct ? 'phish' : 'fine');

async function tap(page, slot, choice) { await page.getByTestId('p' + (slot + 1) + '-' + choice).click(); }

/**
 * Plays the current heat to the end. decide(item, index) returns a list of [slot, correct] buzzes
 * (empty = let the 6 s timer run out). Returns the item ids seen.
 */
async function playHeat(page, decide = () => [[0, true]]) {
  const seen = [];
  const st = await S(page);
  for (let i = st.itemPos; i < st.perHeat; i++) {
    await expect(page.getByTestId('question-screen')).toBeVisible();
    const item = await currentItem(page);
    seen.push(item);
    const plan = decide(item, i);
    for (const [slot, correct] of plan) await tap(page, slot, answerFor(item, correct));
    if (!plan.length || plan.every(([, c]) => !c) && plan.length < 2) await page.clock.runFor(6000);
    await expect(page.getByTestId('reveal')).toBeVisible();
    await page.getByTestId('btn-next').click();
  }
  await expect(page.getByTestId('bracket')).toBeVisible();
  return seen;
}

async function playMatch(page, decide) {
  const seen = [];
  while (await page.getByTestId('btn-start-heat').count()) {
    await startHeat(page);
    seen.push(...await playHeat(page, decide));
  }
  await expect(page.getByTestId('champion')).toBeVisible();
  return seen;
}

async function boardRows(page) {
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  return page.getByTestId('leaderboard-row').evaluateAll(rows => rows.map(r => ({
    name: r.querySelector('[data-testid="leaderboard-name"]').textContent,
    score: Number(r.querySelector('[data-testid="leaderboard-score"]').textContent)
  })));
}

/* ---------------- Game C acceptance ---------------- */

test('bank of 24, each item exactly one of the 8 Shield categories, all 8 covered', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME);
  const { bank, cats } = await page.evaluate(() => ({ bank: window.PhishOrFine.SNIPPETS, cats: Object.keys(window.PhishOrFine.CATEGORIES) }));
  expect(bank.length).toBe(24);
  expect(new Set(bank.map(s => s.id)).size).toBe(24);
  expect(cats.sort()).toEqual(['attachment', 'credential', 'device', 'giftcard', 'lookalike', 'mfa', 'oversharing', 'urgency']);
  for (const s of bank) {
    expect(typeof s.category).toBe('string');
    expect(cats).toContain(s.category);
    expect(typeof s.phish).toBe('boolean');
  }
  for (const c of cats) expect(bank.filter(s => s.category === c).length).toBe(3);
  expect(bank.some(s => s.phish) && bank.some(s => !s.phish)).toBe(true);
  const text = JSON.stringify(bank).toLowerCase();
  expect(text).not.toContain('cognizant');
  expect(text).toContain('northbridge');
  expectClean(issues);
});

test('no item repeats in a 6-player match (5 heats x 4); ?seed= makes the deck deterministic', async ({ page, baseURL }) => {
  test.setTimeout(60000); // five page loads and a 20-snippet match: slow when the whole suite runs in parallel
  const issues = watch(page, baseURL);
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  await openGame(page, '?seed=5');
  await start(page, names);
  const seen = await playMatch(page, (item, i) => [[i % 2, true]]);
  expect(seen.length).toBe(20);
  expect(new Set(seen.map(s => s.id)).size).toBe(20);
  const first = (await S(page)).heats.map(h => h.items);
  expect(first.length).toBe(5);

  for (const q of ['?seed=5', '?seed=5']) {
    await page.goto(GAME + q);
    await start(page, names);
    expect((await S(page)).deck.slice(0, 12)).toEqual(first.slice(0, 3).flat());
  }
  await page.goto(GAME + '?seed=6');
  await start(page, names);
  expect((await S(page)).deck.slice(0, 12)).not.toEqual(first.slice(0, 3).flat());
  // 2 players get one 12-snippet heat
  await page.goto(GAME + '?seed=5');
  await start(page, ['X', 'Y']);
  const s2 = await S(page);
  expect(s2.heats.length).toBe(1);
  expect(s2.heats[0].items.length).toBe(12);
  expect(new Set(s2.heats[0].items).size).toBe(12);
  expectClean(issues);
});

test('keys A/S/K/L and taps on p1-phish, p1-fine, p2-phish, p2-fine all register', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await openGame(page, '?seed=3');
  await start(page, ['Ana', 'Ben']);
  await startHeat(page);
  const inputs = [
    ['key', 'a', 0, 'phish'], ['key', 's', 0, 'fine'], ['key', 'k', 1, 'phish'], ['key', 'l', 1, 'fine'],
    ['tap', 'p1-phish', 0, 'phish'], ['tap', 'p1-fine', 0, 'fine'], ['tap', 'p2-phish', 1, 'phish'], ['tap', 'p2-fine', 1, 'fine']
  ];
  for (const [how, what, slot, choice] of inputs) {
    await expect(page.getByTestId('question-screen')).toBeVisible();
    if (how === 'key') await page.keyboard.press(what);
    else await page.getByTestId(what).click();
    const st = await S(page);
    const buzzes = st.phase === 'reveal' ? st.reveal.buzzes : st.q.buzzes;
    expect(buzzes.length, how + ' ' + what).toBe(1);
    expect(buzzes[0].slot).toBe(slot);
    expect(buzzes[0].choice).toBe(choice);
    if (st.phase === 'question') {
      // wrong buzz: that zone is locked, the other may still answer
      await expect(page.getByTestId('p' + (slot + 1) + '-phish')).toBeDisabled();
      await expect(page.getByTestId('p' + (2 - slot) + '-phish')).toBeEnabled();
      await expect(page.getByTestId('buzz-status')).toContainText('buzzed wrong');
      await page.clock.runFor(6000);
    }
    await expect(page.getByTestId('reveal')).toBeVisible();
    await page.getByTestId('btn-next').click();
  }
  // upper-case keys work too
  await page.keyboard.press('Shift+K');
  const st = await S(page);
  expect((st.phase === 'reveal' ? st.reveal.buzzes : st.q.buzzes)[0]).toMatchObject({ slot: 1, choice: 'phish' });
  expectClean(issues);
});

test('scripted run where player 2 misses only urgency items shows "urgency" in p2-debrief', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await openGame(page, '?seed=42');
  await start(page, ['Pat', 'Quinn']);
  const items = (await S(page)).heats[0].items;
  expect(items.filter(i => i[0] === 'u').length).toBeGreaterThan(0); // the deck holds urgency items
  await startHeat(page);
  // Player 2 (slot 1) buzzes first every time: wrong on urgency (player 1 then steals), right on everything else.
  const seen = await playHeat(page, item => item.category === 'urgency' ? [[1, false], [0, true]] : [[1, true]]);
  expect(seen.some(s => s.category === 'urgency')).toBe(true);
  await page.getByTestId('btn-results').click();
  await page.getByTestId('btn-debrief').click();
  await expect(page.getByTestId('debrief')).toBeVisible();
  const p2 = page.getByTestId('p2-debrief');
  await expect(p2).toContainText('urgency');
  await expect(p2.getByTestId('debrief-lost')).toHaveText('Lost on: urgency');
  await expect(p2.getByTestId('debrief-weak').first()).toHaveAttribute('data-category', 'urgency');
  await expect(page.getByTestId('p1-debrief').getByTestId('debrief-lost')).toHaveText('Lost on: nothing');
  await expect(page.getByTestId('shield-recap')).toContainText('urgency');
  for (const id of ['p1-debrief', 'p2-debrief']) await expect(page.getByTestId(id).getByTestId('debrief-weak')).toHaveCount(2);
  await page.getByTestId('btn-copy-results').click();
  await expect(page.getByTestId('results-text')).toContainText('Quinn');
  await expect(page.getByTestId('results-text')).toContainText('lost on: Urgency pressure');
  expectClean(issues);
});

test('with 4 players the bracket runs 3 heats and leaderboard shows 4 sorted rows', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await openGame(page, '?seed=9');
  const names = ['Ava', 'Ben', 'Cy', 'Dee'];
  await start(page, names);
  await expect(page.getByTestId('bracket-heat')).toHaveCount(2); // round 1: Ava v Ben, Cy v Dee
  let heats = 0;
  while (await page.getByTestId('btn-start-heat').count()) {
    heats++;
    await startHeat(page);
    // slot 0 strong in heat 1, slot 1 strong in heat 2, mixed in the final: varied scores
    await playHeat(page, (item, i) => heats === 1 ? [[0, true]] : heats === 2 ? [[1, true]] : [[i % 2, i !== 1]]);
    await expect(page.getByTestId('heat-result')).toBeVisible();
  }
  expect(heats).toBe(3);
  await expect(page.getByTestId('bracket-heat')).toHaveCount(3);
  const st = await S(page);
  expect(st.heats.map(h => [h.a, h.b])).toEqual([[0, 1], [2, 3], [0, 3]]);
  await page.getByTestId('btn-results').click();
  const rows = await boardRows(page);
  expect(rows.length).toBe(4);
  expect(rows.map(r => r.name).sort()).toEqual([...names].sort());
  for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
  const totals = Object.fromEntries(st.players.map(p => [p.name, p.score]));
  rows.forEach(r => expect(r.score).toBe(totals[r.name]));
  expect(new Set(rows.map(r => r.score)).size).toBeGreaterThan(1);
  expectClean(issues);
});

test('no buzz in 6 s reveals and advances', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await openGame(page, '?seed=1');
  await start(page, ['Ana', 'Ben']);
  await startHeat(page);
  await expect(page.getByTestId('question-progress')).toContainText('snippet 1 of 12');
  const firstId = (await currentItem(page)).id;
  await page.clock.runFor(5800);
  await expect(page.getByTestId('question-screen')).toBeVisible();
  await page.clock.runFor(300);
  await expect(page.getByTestId('reveal')).toBeVisible();
  await expect(page.getByTestId('reveal-timeout')).toBeVisible();
  const st = await S(page);
  expect(st.players.map(p => p.score)).toEqual([0, 0]);
  await page.clock.runFor(3600); // reveal auto-advances
  await expect(page.getByTestId('question-screen')).toBeVisible();
  await expect(page.getByTestId('question-progress')).toContainText('snippet 2 of 12');
  expect((await currentItem(page)).id).not.toBe(firstId);
  // timeouts count as a miss for both players
  expect(await page.evaluate(() => [0, 1].map(p => window.PhishOrFine.Shield.debrief(p).misses))).toEqual([1, 1]);
  expectClean(issues);
});

test('scoring: +100 first correct buzz, -50 wrong buzz then the other may answer, 3 in a row gives x1.5', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await openGame(page, '?seed=2');
  await start(page, ['Ana', 'Ben']);
  await startHeat(page);
  const scores = async () => (await S(page)).players.map(p => p.score);
  const step = async (plan) => {
    const item = await currentItem(page);
    for (const [slot, correct] of plan) await tap(page, slot, answerFor(item, correct));
    await expect(page.getByTestId('reveal')).toBeVisible();
    const s = await scores();
    await page.getByTestId('btn-next').click();
    return s;
  };
  expect(await step([[0, true]])).toEqual([100, 0]);
  expect(await step([[0, true]])).toEqual([200, 0]);
  expect(await step([[0, true]])).toEqual([350, 0]);              // third in a row: 150
  expect(await step([[1, false], [0, true]])).toEqual([400, -50]); // Ben -50; Ana steals a flat +50
  expect(await step([[0, false], [1, false]])).toEqual([350, -100]);
  expect(await step([[0, true]])).toEqual([450, -100]);            // streak reset by the wrong buzz: plain +100
  expectClean(issues);
});

test('setup accepts 2 to 6 names and rejects 1 or 7', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await openGame(page);
  await expectRosterBounds(page);
  for (let n = 2; n <= 6; n++) {
    await page.goto(GAME);
    await start(page, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].slice(0, n));
    await expect(page.getByTestId('bracket')).toBeVisible();
    const st = await S(page);
    expect(st.perHeat).toBe(n === 2 ? 12 : 4);
    expect(st.heats.length).toBe(Math.floor(n / 2));
  }
  expectClean(issues);
});

for (const mode of ['nudge', 'off']) {
  test(`Shield ${mode}: no mid-race nudges; explain-why lesson after each reveal unless off`, async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await openGame(page, '?seed=4&shield=' + mode);
    await start(page, ['Ana', 'Ben']);
    await expect(page.getByTestId('shield-status')).toContainText(mode);
    await startHeat(page);
    const item = await currentItem(page);
    await tap(page, 0, answerFor(item, false));
    await expect(page.getByTestId('shield-warning')).toHaveCount(0);
    await tap(page, 1, answerFor(item, true));
    await expect(page.getByTestId('reveal')).toBeVisible();
    await expect(page.getByTestId('reveal-lesson')).toHaveCount(mode === 'off' ? 0 : 1);
    if (mode !== 'off') await expect(page.getByTestId('reveal-lesson')).toContainText('Red flag');
    expect(await page.evaluate(() => window.PhishOrFine.Shield.log[0].length)).toBe(1); // logged even when off
    expectClean(issues);
  });
}

test('coach mode: between heats Shield tips a player on the category they lost on', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await openGame(page, '?seed=42&shield=coach');
  await start(page, ['A', 'B', 'C']); // heat 1 A v B, C has a bye, final
  await expect(page.getByTestId('bracket-bye')).toContainText('C has a bye');
  await expect(page.getByTestId('shield-coach-tip')).toHaveCount(0);
  await startHeat(page);
  await playHeat(page, (item, i) => i === 0 ? [[0, false], [1, true]] : [[0, true]]);
  await expect(page.getByTestId('shield-coach-tip')).toContainText('you lost on');
  expectClean(issues);
});

test('split-screen: zones top/bottom at 360 px, left/right at 1280 px', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await openGame(page, '?seed=1');
  await start(page, ['Ana', 'Ben']);
  await startHeat(page);
  await page.setViewportSize({ width: 360, height: 640 });
  let a = await page.getByTestId('p1-zone').boundingBox(), b = await page.getByTestId('p2-zone').boundingBox();
  expect(b.y).toBeGreaterThan(a.y + a.height - 1);
  await page.setViewportSize({ width: 1280, height: 800 });
  a = await page.getByTestId('p1-zone').boundingBox(); b = await page.getByTestId('p2-zone').boundingBox();
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expectClean(issues);
});

for (const vp of [{ width: 375, height: 667 }, { width: 360, height: 640 }]) {
  test(`shared checks on every screen at ${vp.width}x${vp.height}: no horizontal scroll, buttons >= 44 px, zero console errors`, async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.setViewportSize(vp);
    await openGame(page, '?seed=7&shield=coach');
    const check = async () => { await expectNoHorizontalScroll(page); await expectTapTargets(page); };
    await check();                                                  // setup
    await start(page, ['Northbridge Night Owls', 'Bea', 'Cal']);
    await check();                                                  // bracket
    await page.getByTestId('btn-start-heat').click();
    await check();                                                  // countdown
    await page.clock.runFor(3000);
    await check();                                                  // question
    const item = await currentItem(page);
    await tap(page, 0, answerFor(item, false));
    await check();                                                  // question after a wrong buzz
    await page.clock.runFor(6000);
    await check();                                                  // reveal
    await page.getByTestId('btn-next').click();
    await playHeat(page, () => [[1, true]]);                        // rest of heat 1
    await check();                                                  // bracket with result + coach tip
    await playMatch(page, () => [[0, true]]);
    await check();                                                  // champion
    await page.getByTestId('btn-results').click();
    await check();                                                  // leaderboard
    await page.getByTestId('btn-debrief').click();
    await check();                                                  // debrief
    expectClean(issues);
  });
}

/* ---------------- hub card + shared menu for this game ---------------- */

test('hub shows the Phish or Fine card with name, pitch, players and minutes; it is the last GAMES entry', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto('/');
  const games = await page.evaluate(() => GAMES);
  const g = games.find(x => x.slug === SLUG);
  expect(g).toBeTruthy();
  expect(games[0].slug).toBe('inbox-showdown');
  expect(games[games.length - 1].slug).toBe(SLUG);
  expect(g.name).toBe('Phish or Fine? Buzzer Battle');
  const card = page.locator('[data-testid="game-card"][data-slug="' + SLUG + '"]');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('game-name')).toHaveText(g.name);
  await expect(card.getByTestId('game-pitch')).toHaveText(g.pitch);
  await expect(card.getByTestId('game-players')).toContainText('2 to 6');
  await expect(card.getByTestId('game-minutes')).toContainText('about 3');
  await expect(page.getByTestId('game-card')).toHaveCount(games.length);
  expect((await page.content()).toLowerCase()).not.toContain('cognizant');
  expectClean(issues);
});

for (const vp of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
  test(`play-btn loads Phish or Fine; menu-btn visible at ${vp.width}x${vp.height}, no horizontal scroll`, async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.setViewportSize(vp);
    await page.goto('/');
    await page.locator('[data-testid="game-card"][data-slug="' + SLUG + '"]').getByTestId('play-btn').click();
    await expect(page).toHaveURL(new RegExp(GAME + '$'));
    await expect(page.getByTestId('setup-screen')).toBeVisible();
    await expect(page.getByTestId('menu-btn')).toBeVisible();
    await expect(page.getByTestId('menu-title')).toContainText('Phish or Fine');
    await expectNoHorizontalScroll(page);
    await page.getByTestId('menu-btn').click();
    await expect(page.getByTestId('menu-panel')).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect((await page.content()).toLowerCase()).not.toContain('cognizant');
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

test('menu-restart mid-question resets to setup and stops the timers', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await openGame(page, '?seed=1');
  await start(page, ['Ana', 'Ben']);
  await startHeat(page);
  await page.getByTestId('menu-btn').click();
  // keys do nothing while the menu is open
  await page.keyboard.press('a');
  expect((await S(page)).q.buzzes.length).toBe(0);
  await page.getByTestId('menu-restart').click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  await expect(page.getByTestId('menu-panel')).toBeHidden();
  await page.clock.runFor(15000);
  await expect(page.getByTestId('setup-screen')).toBeVisible();
  expect((await S(page)).phase).toBe('setup');
  expectClean(issues);
});

test('menu-shield toggles Shield and its label shows the state', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto(GAME);
  await page.getByTestId('menu-btn').click();
  const btn = page.getByTestId('menu-shield');
  await expect(btn).toHaveText(/Shield: on/);
  await btn.click();
  await expect(btn).toHaveText(/Shield: off/);
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.PhishOrFine.Shield.mode)).toBe('off');
  await expect(page.getByTestId('shield-status')).toContainText('off');
  await btn.click();
  await expect(btn).toHaveText(/Shield: on/);
  expect(await page.evaluate(() => window.PhishOrFine.Shield.mode)).toBe('nudge');
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
  await expect(page.getByTestId('menu-howto-text')).toContainText('Phish means unsafe');
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
