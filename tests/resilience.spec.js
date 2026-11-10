// 11/10 hardening (Wally: "a lot of audio mistakes and inconsistency of the voice", "sometimes the system
// voice is played instead of elevenlabs", "all games rely on a ..."):
//  - default voice policy is clips-only: the browser voice never mixes in when a page has ElevenLabs clips;
//  - clips are preloaded into memory;
//  - any one shared file failing to load leaves every game playable.
const { test, expect } = require('@playwright/test');

const GAMES = [
  { slug: 'inbox-showdown', hook: 'InboxShowdown', first: 'btn-ready' },
  { slug: 'first-week-hunt', hook: 'FirstWeekHunt', first: 'tile' },
  { slug: 'phish-or-fine', hook: 'PhishOrFine', first: 'btn-start-heat' }
];
const SHARED = ['audio.js', 'fx.js', 'menu.js', 'tutorial.js', 'narrate.js', 'roster.js', 'net.js', 'theme.css', 'menu.css', 'tutorial.css'];

for (const g of GAMES) {
  test(g.slug + ': clips-only voice: no browser voice is used, clips preload, a failing clip is skipped not spoken', async ({ page }) => {
    await page.addInitScript(() => { window.__spoken = []; try { window.speechSynthesis.speak = u => window.__spoken.push(u.text); } catch (e) { /* ignore */ } });
    let broken = 0;
    await page.route('**/lines/*.mp3', (route, req) => { if (++broken <= 2) return route.fulfill({ status: 500, body: '' }); return route.continue(); });
    await page.goto('/games/' + g.slug + '/');
    await page.waitForFunction(() => window.Narrate && Object.keys(window.Narrate.lines()).length > 0);
    expect(await page.evaluate(() => window.Narrate.voice())).toBe('clips');
    await expect.poll(() => page.evaluate(() => window.Narrate.preloaded()), { timeout: 15000 }).toBeGreaterThan(5);
    await page.getByTestId('btn-start').click();
    await page.getByTestId(g.first).first().click();
    await page.waitForTimeout(1500);
    const log = await page.evaluate(() => window.Narrate.log.slice());
    expect(log.filter(e => e.via === 'tts')).toEqual([]);
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(log.some(e => e.via === 'audio')).toBe(true);
  });

  test(g.slug + ': ?voice=mixed restores the browser voice for lines without a clip', async ({ page }) => {
    await page.goto('/games/' + g.slug + '/?voice=mixed');
    await page.waitForFunction(() => window.Narrate && Object.keys(window.Narrate.lines()).length > 0);
    expect(await page.evaluate(() => window.Narrate.voice())).toBe('mixed');
  });

  test(g.slug + ': stays playable when any one shared file fails to load', async ({ browser, baseURL }) => {
    for (const f of SHARED) {
      const ctx = await browser.newContext({ baseURL, storageState: undefined });
      await ctx.addInitScript(s => { try { localStorage.setItem('nb-tutorial-skip:' + s, '1'); } catch (e) { /* ignore */ } }, g.slug);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.route('**/shared/' + f, r => r.abort());
      await page.goto('/games/' + g.slug + '/');
      await page.getByTestId('btn-start').click();
      await page.getByTestId(g.first).first().click();
      await expect.poll(() => page.evaluate(h => window[h].state.screen || window[h].state.phase || 'x', g.hook), { message: f }).toBeTruthy();
      expect(errors, f).toEqual([]);
      await ctx.close();
    }
  });
}
