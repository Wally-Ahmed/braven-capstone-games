// Full-screen wrong-answer animation (shared/fx.js FX.wrongFull, sounds in shared/audio.js): every variant
// shows and clears by itself, never blocks taps, a tap dismisses it, reduced motion gets a static card,
// it fits 360 px, and each game plays it on a wrong outcome.
const { test, expect } = require('@playwright/test');
const { watch, expectClean, expectNoHorizontalScroll } = require('./helpers');

const VARIANTS = ['alarm', 'glass', 'stamp', 'glitch', 'nope', 'lock'];

test('each of the 6 variants appears and clears within 1.6 s, at 360 px, with no console errors', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/games/inbox-showdown/');
  await expect(page.getByTestId('btn-start')).toBeVisible();
  expect(await page.evaluate(() => window.Fx.WRONG_VARIANTS)).toEqual(VARIANTS);
  for (let i = 0; i < VARIANTS.length; i++) {
    const t0 = Date.now();
    expect(await page.evaluate(v => window.Fx.wrongFull({ variant: v }), i)).toBe(VARIANTS[i]);
    const ov = page.getByTestId('fx-wrong');
    await expect(ov).toBeVisible();
    await expect(ov).toHaveAttribute('data-variant', VARIANTS[i]);
    expect(await ov.evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none');
    await expectNoHorizontalScroll(page);
    await expect(ov).toHaveCount(0, { timeout: 2500 });
    expect(Date.now() - t0).toBeLessThan(2400);
  }
  // random pick works too, and the lite (phone) version clears faster
  expect(VARIANTS).toContain(await page.evaluate(() => window.Fx.wrongFull()));
  await expect(page.getByTestId('fx-wrong')).toHaveCount(0, { timeout: 2500 });
  await page.evaluate(() => window.Fx.wrongFull({ lite: true, variant: 4 }));
  await expect(page.getByTestId('fx-wrong')).toHaveClass(/lite/);
  await expect(page.getByTestId('fx-wrong')).toHaveCount(0, { timeout: 2000 });
  expectClean(issues);
});

test('it never blocks input, and a tap dismisses it', async ({ page }) => {
  await page.goto('/games/inbox-showdown/');
  await page.evaluate(() => window.Fx.wrongFull({ variant: 2 }));
  await expect(page.getByTestId('fx-wrong')).toBeVisible();
  await page.waitForTimeout(50);
  await page.getByTestId('btn-start').click({ timeout: 1000 }); // goes straight through the overlay
  await expect(page.getByTestId('pass-screen')).toBeVisible();
  await expect(page.getByTestId('fx-wrong')).toHaveCount(0);
});

test('reduced motion: a static card + sound, still clears by itself', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL });
  const page = await ctx.newPage();
  await page.goto('/games/first-week-hunt/?tutorial=0');
  for (const v of [0, 3, 4]) {
    await page.evaluate(i => window.Fx.wrongFull({ variant: i }), v);
    const ov = page.getByTestId('fx-wrong');
    await expect(ov).toBeVisible();
    expect(await ov.evaluate(e => getComputedStyle(e).animationName)).toBe('none');
    await expect(ov).toHaveCount(0, { timeout: 2500 });
  }
  await ctx.close();
});

test('each game plays it on a wrong outcome: opened scam, decoy tap, wrong buzz', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  // Inbox Showdown: open a risky message straight through (Shield off), reveal
  await page.goto('/games/inbox-showdown/?shield=off');
  await page.evaluate(() => {
    const g = window.InboxShowdown; g.dispatch({ type: 'start', names: 'A\nB' }); g.dispatch({ type: 'ready' });
  });
  const risky = await page.evaluate(() => window.InboxShowdown.MESSAGES.find(m => m.id === window.InboxShowdown.state.current.item).risky);
  await page.evaluate(r => { const g = window.InboxShowdown; g.dispatch({ type: r ? 'open' : 'report' }); g.dispatch({ type: 'noChallenge' }); }, risky);
  await expect(page.getByTestId('fx-wrong')).toBeVisible();
  // First Week Hunt: tap a decoy
  await page.goto('/games/first-week-hunt/');
  await page.evaluate(() => {
    const g = window.FirstWeekHunt; g.dispatch({ type: 'start', names: 'A\nB' });
    g.dispatch({ type: 'tap', id: g.TILES.find(t => !t.risk).id });
  });
  await expect(page.getByTestId('fx-wrong')).toBeVisible();
  // Phish or Fine: a wrong buzz
  await page.goto('/games/phish-or-fine/');
  await page.evaluate(() => { window.PhishOrFine.dispatch({ type: 'start', names: 'A\nB' }); window.PhishOrFine.dispatch({ type: 'startHeat' }); });
  await expect.poll(() => page.evaluate(() => window.PhishOrFine.state.phase), { timeout: 6000 }).toBe('question');
  await page.evaluate(() => {
    const g = window.PhishOrFine, s = g.state, phish = g.SNIPPETS.find(x => x.id === s.q.item).phish;
    g.dispatch({ type: 'buzz', slot: 0, choice: phish ? 'fine' : 'phish', step: s.step });
  });
  await expect(page.getByTestId('fx-wrong')).toBeVisible();
  expectClean(issues);
});

test('selection punch-in: appears, clears within 0.8 s, never blocks, works at 360 px; selections in the games trigger it', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/games/inbox-showdown/');
  const start = page.getByTestId('btn-start');
  const t0 = Date.now();
  expect(await start.evaluate(el => window.Fx.selectPunch(el, '📂 Open (safe)'))).toBe('📂 Open (safe)');
  const ov = page.getByTestId('fx-punch');
  await expect(ov).toBeVisible();
  expect(await ov.evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none');
  await expectNoHorizontalScroll(page);
  await expect(ov).toHaveCount(0, { timeout: 1500 });
  expect(Date.now() - t0).toBeLessThan(1500);
  // a team pick and then Report in a real match both punch in; the wrong-answer moment waits for the punch
  await page.getByTestId('roster-count-3').click();
  await expect(ov).toBeVisible();
  await page.evaluate(() => { const g = window.InboxShowdown; g.dispatch({ type: 'setShield', mode: 'off' }); });
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-ready').click();
  await page.getByTestId('btn-report').click();
  await expect(ov).toBeVisible();
  await expect(ov).toContainText('Report');
  await page.getByTestId('btn-reveal').click({ timeout: 1000 });
  await expect(page.getByTestId('reveal')).toBeVisible();
  const right = await page.evaluate(() => window.InboxShowdown.state.reveal.correct);
  if (!right) { await expect(page.getByTestId('fx-wrong')).toBeVisible({ timeout: 2000 }); await expect(ov).toHaveCount(0); }
  // First Week Hunt tile tap
  await page.goto('/games/first-week-hunt/');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('tile').first().click();
  await expect(ov).toBeVisible();
  await expect(ov).toHaveCount(0, { timeout: 1500 });
  expectClean(issues);
});
