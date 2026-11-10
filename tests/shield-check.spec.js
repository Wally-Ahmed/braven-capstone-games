// Shield Check (SPEC section 4 "Standalone prototype"), built 11/10: paste a message, get a traffic light,
// reasons and Report to IT; plus the "How Shield would work" plan. Rule-based, labelled a demo.
const { test, expect } = require('@playwright/test');
const { watch, expectClean, expectNoHorizontalScroll, expectTapTargets } = require('./helpers');

test('hub links to Shield Check; samples give the right light and reasons; Report to IT; plan shown', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  await page.getByTestId('shield-link').click();
  await expect(page).toHaveURL(/\/shield\/$/);
  await expect(page.getByText('Demo, not a security tool')).toBeVisible();
  await page.getByTestId('shield-check-btn').click();
  await expect(page.getByTestId('shield-empty')).toBeVisible();
  const expectLevel = async (i, level, reasons) => {
    await page.getByTestId('shield-sample').nth(i).click();
    await expect(page.getByTestId('verdict')).toHaveAttribute('data-level', level);
    const got = await page.getByTestId('reason').evaluateAll(els => els.map(e => e.dataset.reason));
    for (const r of reasons) expect(got).toContain(r);
  };
  await expectLevel(0, 'stop', ['lookalike', 'credential']);
  await expectLevel(1, 'stop', ['lookalike', 'payment', 'secrecy']);
  await expectLevel(2, 'stop', ['shortlink', 'payment']);
  await expectLevel(3, 'safe', []);
  await expect(page.getByTestId('reason')).toHaveCount(0);
  await expect(page.getByTestId('shield-report')).toHaveCount(0);
  await expectLevel(4, 'stop', ['mfa']);
  await page.getByTestId('shield-report').click();
  await expect(page.getByTestId('shield-reported')).toContainText('nothing was sent');
  await page.getByTestId('shield-input').fill('From: alex@northbridge.co\nLunch at noon? Pizza in the kitchen today.');
  await page.getByTestId('shield-check-btn').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-level', 'careful'); // "today" alone is only a careful
  await expect(page.getByTestId('shield-plan')).toContainText('Where a real AI model plugs in');
  await expectNoHorizontalScroll(page);
  await expectTapTargets(page, 'button, a.btn, a.back');
  expectClean(issues);
});
