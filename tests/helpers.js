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
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('about:')) issues.external.push(u);
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

module.exports = { watch, expectClean, expectNoHorizontalScroll, expectTapTargets };
