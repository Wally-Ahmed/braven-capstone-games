// In-game narration (shared/narrate.js): every block a player reads is voiced, shows a pulsing 🔊 indicator
// while it plays and keeps a Replay button; Replay re-reads it, the shared mute silences it, and every
// line in each lines.json matches the game's own text and has its MP3 when it is flagged as voiced.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { watch, expectClean, expectTapTargets, expectNoHorizontalScroll } = require('./helpers');

const NARR = path.join(__dirname, '..', 'shared', 'narration');
const manifest = slug => JSON.parse(fs.readFileSync(path.join(NARR, slug, 'lines.json'), 'utf8')).lines;
const PAGES = [
  { slug: 'hub', url: '/', hook: 'NorthbridgeHub' },
  { slug: 'inbox-showdown', url: '/games/inbox-showdown/', hook: 'InboxShowdown', names: 'team-names', start: ['Red', 'Blue'], first: 'pass-screen' },
  { slug: 'first-week-hunt', url: '/games/first-week-hunt/', hook: 'FirstWeekHunt', names: 'player-names', start: ['Ava', 'Ben'], first: 'scene-screen' },
  { slug: 'phish-or-fine', url: '/games/phish-or-fine/', hook: 'PhishOrFine', names: 'player-names', start: ['Ana', 'Bo'], first: 'bracket' }
];
const log = page => page.evaluate(() => (window.Narrate ? window.Narrate.log.slice() : []));
/** Keeps simulated (test-browser) speech on screen long enough to observe the indicator. */
const slowSpeech = page => page.addInitScript(() => { window.__narrateSimMs = 4000; });

async function startGame(page, p) {
  await page.getByTestId(p.names).fill(p.start.join('\n'));
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId(p.first)).toBeVisible();
}

for (const p of PAGES) {
  test.describe(p.slug + ' narration', () => {
    test('lines.json matches the page text, and every voiced line has its MP3', async ({ page }) => {
      await page.goto(p.url);
      const fresh = await page.evaluate(h => window[h].narrationLines(), p.hook);
      const lines = manifest(p.slug);
      expect(Object.keys(lines).sort()).toEqual(Object.keys(fresh).sort());
      for (const [id, v] of Object.entries(lines)) {
        expect(v.text, id).toBe(fresh[id].text);
        if (v.audio) expect(fs.statSync(path.join(NARR, p.slug, 'lines', id + '.mp3')).size, id).toBeGreaterThan(2000);
      }
    });
  });
  if (!p.names) continue;

  test.describe(p.slug + ' narration in play', () => {
    test('blocks read on appear with a pulsing indicator, all have Replay, Replay re-reads, no console errors', async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await slowSpeech(page);
      await page.goto(p.url);
      // setup intro: autoplay before any tap is blocked by the browser, so its Replay pulses; a tap reads it
      const intro = page.getByTestId('setup-intro');
      await expect(intro).toHaveClass(/nr-blocked/);
      await intro.getByTestId('narrate-replay').click();
      await expect(intro).toHaveAttribute('data-narrating', 'true');
      await expect(intro.getByTestId('narrate-indicator')).toBeVisible();
      await expect(intro.getByTestId('narrate-replay')).toBeVisible();
      await startGame(page, p);
      await expect(page.locator('[data-narrating="true"]')).toHaveCount(1);
      // every narrated block on screen carries exactly one Replay button
      const counts = await page.evaluate(() => Array.from(document.querySelectorAll('[data-narrate]'))
        .map(el => el.querySelectorAll(':scope > .nr-bar [data-testid="narrate-replay"]').length));
      expect(counts.length).toBeGreaterThan(0);
      counts.forEach(n => expect(n).toBe(1));
      // Replay restarts that block from its first line
      const block = page.locator('[data-narrate]').first();
      const before = (await log(page)).length;
      await block.locator(':scope > .nr-bar [data-testid="narrate-replay"]').click();
      await expect(block).toHaveAttribute('data-narrating', 'true');
      await expect.poll(async () => (await log(page)).length).toBeGreaterThan(before);
      const entry = (await log(page))[before];
      const ids = (await block.getAttribute('data-narrate')).split(/\s+/);
      if (ids[0] !== '_') expect(entry.id).toBe(ids[0]);
      if (entry.via === 'audio') {
        expect(await page.evaluate(() => document.querySelectorAll('audio').length)).toBe(0); // one detached player, no DOM audio
      }
      await expectTapTargets(page);
      expectClean(issues);
    });

    test('the shared mute silences narration; Replay unmutes and reads', async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await page.addInitScript(() => { try { localStorage.setItem('nb-muted', '1'); } catch (e) { /* ignore */ } });
      await slowSpeech(page);
      await page.goto(p.url);
      await startGame(page, p);
      await page.waitForTimeout(600);
      expect(await log(page)).toEqual([]);
      await expect(page.locator('[data-narrating="true"]')).toHaveCount(0);
      await page.locator('[data-testid="narrate-replay"]').first().click();
      await expect.poll(async () => (await log(page)).length).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.Sfx.muted())).toBe(false);
      // muting mid-line stops it
      await page.getByTestId('sound-toggle').click();
      await expect(page.locator('[data-narrating="true"]')).toHaveCount(0);
      expectClean(issues);
    });
  });
}

test('inbox: the message, Shield warning and reveal are each read; the warning interrupts', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto('/games/inbox-showdown/?seed=3&shield=nudge');
  await page.getByTestId('team-names').fill('Red\nBlue');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-ready').click();
  const card = page.getByTestId('message-card');
  const id = await card.getAttribute('data-msg-id');
  await expect.poll(async () => (await log(page)).map(e => e.id), { timeout: 20000 }).toContain('msg-' + id);
  const risky = await page.evaluate(i => window.InboxShowdown.MESSAGES.find(m => m.id === i).risky, id);
  if (risky) {
    await page.getByTestId('btn-open').click();
    await expect(page.getByTestId('shield-warning')).toHaveAttribute('data-narrating', 'true');
    await expect.poll(async () => (await log(page)).map(e => e.id), { timeout: 20000 }).toContain('hint-' + id);
    await page.getByTestId('btn-back-out').click();
  }
  await page.getByTestId('btn-report').click();
  await page.getByTestId('btn-reveal').click();
  await expect.poll(async () => (await log(page)).map(e => e.id), { timeout: 20000 }).toContain('flag-' + id); // after the result line and the browser-voice recap
  expectClean(issues);
});

test('hub: focusing or tapping a card reads its pitch; every card has Replay', async ({ page, baseURL }) => {
  const issues = watch(page, baseURL);
  await page.goto('/');
  const cards = page.getByTestId('game-card');
  const n = await cards.count();
  for (let i = 0; i < n; i++) await expect(cards.nth(i).getByTestId('narrate-replay')).toBeVisible();
  await page.waitForFunction(() => window.Narrate && Object.keys(window.Narrate.lines()).length > 0);
  await cards.nth(1).getByTestId('play-btn').focus();
  await expect.poll(async () => (await log(page)).map(e => e.id), { timeout: 20000 }).toContain('card-first-week-hunt');
  await cards.nth(2).getByTestId('game-pitch').click();
  await expect.poll(async () => (await log(page)).map(e => e.id), { timeout: 20000 }).toContain('card-phish-or-fine');
  for (const vp of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(vp);
    await expectNoHorizontalScroll(page);
  }
  await expectTapTargets(page);
  expectClean(issues);
});
