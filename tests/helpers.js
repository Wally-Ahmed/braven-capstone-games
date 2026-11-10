// Shared checks used by every spec (SPEC.md section 3 "Every game's checklist also includes").
const { expect } = require('@playwright/test');

/** Collects console errors, page errors and any request that leaves the local site. */
function watch(page, baseURL) {
  const issues = { consoleErrors: [], external: [] };
  const origin = new URL(baseURL).origin;
  page.on('console', m => { if (m.type() === 'error') issues.consoleErrors.push(m.text()); });
  page.on('pageerror', e => issues.consoleErrors.push(String(e)));
  page.on('request', r => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) issues.external.push(u);
  });
  return issues;
}

function expectClean(issues) {
  expect(issues.consoleErrors, 'console errors').toEqual([]);
  expect(issues.external, 'requests outside the site').toEqual([]);
}

async function expectNoHorizontalScroll(page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, 'horizontal scroll').toBeLessThanOrEqual(cw);
}

/** Every visible button (and link styled as a button) is at least 44 px tall. */
async function expectTapTargets(page, selector = 'button, a.play-btn') {
  const small = await page.$$eval(selector, els => els
    .filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; })
    .map(e => ({ id: e.getAttribute('data-testid') || e.textContent.trim(), h: e.getBoundingClientRect().height }))
    .filter(x => x.h < 44));
  expect(small, 'buttons under 44 px').toEqual([]);
}

/** Sets up the teams or players with the setup screen's picker (shared/roster.js): count chip, then tap-to-rename. */
async function setNames(page, names) {
  if (names.length < 2 || names.length > 6) throw new Error('the picker only offers 2 to 6');
  await page.getByTestId('roster-count-' + names.length).click();
  await expect(page.getByTestId('roster-card')).toHaveCount(names.length);
  for (let i = 0; i < names.length; i++) {
    await page.getByTestId('roster-rename').nth(i).click();
    const input = page.getByTestId('roster-name-input');
    await input.fill(names[i]);
    await input.press('Enter');
    await expect(input).toHaveCount(0);
  }
}

/** The picker only allows 2 to 6 (no 1 or 7), and duplicate names are refused at Start. */
async function expectRosterBounds(page) {
  await expect(page.getByTestId('roster-count-1')).toHaveCount(0);
  await expect(page.getByTestId('roster-count-7')).toHaveCount(0);
  await page.getByTestId('roster-count-2').click();
  await expect(page.getByTestId('roster-minus')).toBeDisabled();
  await expect(page.getByTestId('roster-card')).toHaveCount(2);
  await page.getByTestId('roster-count-6').click();
  await expect(page.getByTestId('roster-plus')).toBeDisabled();
  await expect(page.getByTestId('roster-card')).toHaveCount(6);
  await page.getByTestId('roster-minus').click();
  await expect(page.getByTestId('roster-card')).toHaveCount(5);
  // tapping an avatar changes it, and every card keeps a distinct one
  const av = page.getByTestId('roster-avatar').first();
  const before = await av.textContent();
  await av.click();
  await expect(page.getByTestId('roster-avatar').first()).not.toHaveText(before);
  const all = await page.getByTestId('roster-avatar').allTextContents();
  expect(new Set(all).size).toBe(all.length);
  await setNames(page, ['Same', 'same']);
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('setup-error')).toBeVisible();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
}

module.exports = { watch, expectClean, expectNoHorizontalScroll, expectTapTargets, setNames, expectRosterBounds };
