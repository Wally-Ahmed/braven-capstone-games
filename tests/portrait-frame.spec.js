// Desktop portrait frame (his 11/7 9:00 PM ask, "for desktop we should lock it to mobile portait view"):
// wider than 600 px every page is a centred <= 430 px full-height column and full-screen overlays stay inside it;
// at phone width nothing changes.
const { test, expect } = require('@playwright/test');
const { watch, expectClean } = require('./helpers');

const PAGES = ['/', '/games/inbox-showdown/', '/games/first-week-hunt/', '/games/phish-or-fine/'];
const frame = page => page.evaluate(() => { const r = document.body.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; });
const inside = (b, f) => {
  expect(b.x).toBeGreaterThanOrEqual(f.x - 1);
  expect(b.x + b.width).toBeLessThanOrEqual(f.x + f.w + 1);
  expect(b.y).toBeGreaterThanOrEqual(f.y - 1);
  expect(b.y + b.height).toBeLessThanOrEqual(f.y + f.h + 1);
};

for (const url of PAGES) {
  test(`portrait frame at 1280x800: ${url} is <= 430 px, centred, full height`, async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    const f = await frame(page);
    expect(f.w).toBeLessThanOrEqual(430);
    expect(f.w).toBeGreaterThan(300);
    expect(Math.abs(f.x - (1280 - f.w) / 2)).toBeLessThanOrEqual(2);
    expect(f.y).toBe(0);
    expect(f.h).toBeGreaterThanOrEqual(799);
    const root = page.locator(url === '/' ? 'main#games' : '#app');
    const rb = await root.boundingBox();
    expect(rb.width).toBeLessThanOrEqual(430);
    expectClean(issues);
  });

  test(`no frame at 360x640: ${url} fills the phone width`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(url);
    const f = await frame(page);
    expect(f.x).toBe(0);
    expect(f.w).toBe(360);
    expect(await page.evaluate(() => getComputedStyle(document.body).borderTopLeftRadius)).toBe('0px');
  });
}

test('overlays render inside the frame at 1280x800 (menu, tutorial, wrong FX, punch, lobby, player view)', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/games/inbox-showdown/?tutorial=1');
  const f = await frame(page);
  await expect(page.getByTestId('tutorial-overlay')).toBeVisible();
  inside(await page.getByTestId('tutorial-overlay').boundingBox(), f);
  await page.getByTestId('tutorial-skip').click();
  await page.getByTestId('menu-btn').click();
  await expect(page.getByTestId('menu-panel')).toBeVisible();
  inside(await page.getByTestId('menu-panel').boundingBox(), f);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.FX.wrongFull({ variant: 0 }));
  inside(await page.getByTestId('fx-wrong').boundingBox(), f);
  await page.evaluate(() => window.FX.selectPunch(document.querySelector('[data-testid="menu-btn"]'), 'Phish'));
  inside(await page.getByTestId('fx-punch').boundingBox(), f);
  await page.evaluate(() => window.FX.confetti());
  inside(await page.getByTestId('fx-layer').boundingBox(), f);
  // room lobby / player view classes (net.js) and the first-week-hunt lesson overlay use the same frame inset
  const boxes = await page.evaluate(() => ['nr-ov', 'pop-overlay', 'net-player'].map(c => {
    if (!document.getElementById('pf-test-css')) { const st = document.createElement('style'); st.id = 'pf-test-css'; st.textContent = '.nr-ov,.pop-overlay,#net-player{position:fixed;inset:0}'; document.head.appendChild(st); }
    const d = document.createElement('div');
    if (c === 'net-player') d.id = c; else d.className = c;
    document.body.appendChild(d);
    const r = d.getBoundingClientRect(); d.remove();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }));
  for (const b of boxes) { expect(b.width).toBeLessThanOrEqual(431); inside(b, f); }
  expectClean(issues);
});
