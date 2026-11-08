// v4 onboarding with the browser's autoplay policy forced to "user gesture required": the tutorial
// still opens on load, narration waits for a tap (or shows "Tap to hear"), and nothing logs an error.
const { test, expect } = require('@playwright/test');
const { watch, expectClean } = require('./helpers');

test.use({ storageState: { cookies: [], origins: [] }, launchOptions: { args: ['--autoplay-policy=user-gesture-required'] } });

const SLUGS = ['inbox-showdown', 'first-week-hunt', 'phish-or-fine'];
const overlay = page => page.getByTestId('tutorial-overlay');

for (const slug of SLUGS) {
  test(slug + ': tutorial opens and narrates with no console errors when autoplay is blocked', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.goto('/games/' + slug + '/');
    await expect(overlay(page)).toBeVisible();
    await page.waitForTimeout(500);
    await page.getByTestId('tutorial-next').click();
    await page.getByTestId('tutorial-next').click();
    await page.waitForTimeout(300);
    await page.getByTestId('tutorial-skip').click();
    await expect(overlay(page)).toBeHidden();
    // sound effects after a gesture do not throw either
    await page.evaluate(() => ['tap', 'correct', 'wrong', 'warning', 'tick', 'go', 'win'].forEach(n => window.Sfx[n]()));
    await page.waitForTimeout(200);
    expectClean(issues);
  });
}
