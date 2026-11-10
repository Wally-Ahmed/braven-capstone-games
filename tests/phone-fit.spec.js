// 11/10 phone play-through fixes: everything a player must tap is on screen on small phones.
const { test, expect } = require('@playwright/test');
const { setNames } = require('./helpers');

const inView = loc => loc.evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.height > 0; });

for (const vp of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test(`Phish or Fine at ${vp.width}x${vp.height}: both players' buzzers are on screen during a question`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.clock.install();
    await page.goto('/games/phish-or-fine/?seed=4');
    await setNames(page, ['Ana', 'Bo']);
    await page.getByTestId('btn-start').click();
    await page.getByTestId('btn-start-heat').click();
    await page.clock.runFor(3500);
    await expect(page.getByTestId('question-screen')).toBeVisible();
    for (const id of ['p1-phish', 'p1-fine', 'p2-phish', 'p2-fine', 'timer']) expect(await inView(page.getByTestId(id)), id).toBe(true);
  });

  test(`Inbox Showdown at ${vp.width}x${vp.height}: Open, Report and Ask Shield are on screen on the turn card`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/games/inbox-showdown/?seed=2');
    await setNames(page, ['Red', 'Blue']);
    await page.getByTestId('btn-start').click();
    await page.getByTestId('btn-ready').click();
    for (const id of ['btn-open', 'btn-report', 'btn-ask']) expect(await inView(page.getByTestId(id)), id).toBe(true);
  });
}

test('Replay on light message cards is readable (not white on white)', async ({ page }) => {
  await page.goto('/games/inbox-showdown/?seed=2');
  await setNames(page, ['Red', 'Blue']);
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-ready').click();
  const color = await page.getByTestId('message-card').locator(':scope > .nr-bar .nr-replay').evaluate(e => getComputedStyle(e).color);
  expect(color).not.toBe('rgb(255, 255, 255)');
});
