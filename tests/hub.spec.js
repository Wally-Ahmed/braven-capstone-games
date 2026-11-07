// Hub and shared menu acceptance (SPEC.md section 7) plus the section 3 shared checks.
const { test, expect } = require('@playwright/test');
const { watch, expectClean, expectNoHorizontalScroll, expectTapTargets } = require('./helpers');

const GAME = '/games/inbox-showdown/';

test.describe('hub', () => {
  test('/ returns 200 and shows one game-card per GAMES entry with name, pitch, players and minutes', async ({ page, request, baseURL }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const issues = watch(page, baseURL);
    await page.goto('/');
    const games = await page.evaluate(() => GAMES);
    expect(games.length).toBeGreaterThan(0);
    expect(games[0].slug).toBe('inbox-showdown');
    const cards = page.getByTestId('game-card');
    await expect(cards).toHaveCount(games.length);
    for (let i = 0; i < games.length; i++) {
      const card = cards.nth(i);
      await expect(card.getByTestId('game-name')).toHaveText(games[i].name);
      await expect(card.getByTestId('game-pitch')).toHaveText(games[i].pitch);
      await expect(card.getByTestId('game-players')).toContainText(games[i].players);
      await expect(card.getByTestId('game-minutes')).toContainText(games[i].minutes);
      await expect(card.getByTestId('play-btn')).toBeVisible();
    }
    expectClean(issues);
  });

  test('hub is one column at 360 px with no horizontal scroll, tap targets >= 44 px', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    for (const vp of [{ width: 360, height: 640 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(vp);
      await page.goto('/');
      await expectNoHorizontalScroll(page);
      await expectTapTargets(page);
      const cols = await page.$eval('#games', el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(cols).toBe(1);
    }
    expectClean(issues);
  });

  test('no Cognizant name on the hub or in the game', async ({ page }) => {
    for (const url of ['/', GAME]) {
      await page.goto(url);
      const html = await page.content();
      expect(html.toLowerCase()).not.toContain('cognizant');
    }
  });
});

test.describe('shared menu', () => {
  for (const vp of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    test(`play-btn loads the game; menu-btn visible at ${vp.width}x${vp.height}, no horizontal scroll`, async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await page.setViewportSize(vp);
      await page.goto('/');
      await page.getByTestId('game-card').first().getByTestId('play-btn').click();
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
    await page.getByTestId('btn-start').click();
    await page.getByTestId('btn-ready').click();
    await expect(page.getByTestId('turn-card')).toBeVisible();
    await page.getByTestId('menu-btn').click();
    await page.getByTestId('menu-restart').click();
    await expect(page.getByTestId('setup-screen')).toBeVisible();
    await expect(page.getByTestId('menu-panel')).toBeHidden();
    expect(await page.evaluate(() => window.InboxShowdown.state.phase)).toBe('setup');
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
    expect(await page.evaluate(() => window.InboxShowdown.Shield.mode)).toBe('off');
    await expect(page.getByTestId('shield-status')).toContainText('off');
    await btn.click();
    await expect(btn).toHaveText(/Shield: on/);
    expect(await page.evaluate(() => window.InboxShowdown.Shield.mode)).toBe('nudge');
    // starts off when the URL says so
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
    await expect(page.getByTestId('menu-howto-text')).toContainText('Report');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-panel')).toBeHidden();
    expectClean(issues);
  });

  test('menu buttons are >= 44 px tall and reachable by keyboard (Tab, Enter)', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(GAME);
    // Tab from the top of the page reaches the menu button first.
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
    await expect(page.getByTestId('menu-howto')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-howto-text')).toBeVisible();
    await expectTapTargets(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-panel')).toBeHidden();
    await expect(page.getByTestId('menu-btn')).toBeFocused();
    // Enter on Game selection navigates home.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(baseURL + '/');
    expectClean(issues);
  });
});
