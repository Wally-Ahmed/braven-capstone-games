// v4 onboarding: the shared "How to play" tutorial overlay (shared/tutorial.js), narration fallback,
// the shared mute (shared/audio.js) and the hub's tutorial links. Runs with empty storage so the
// tutorial behaves like a first visit (the other specs start with it skipped, see playwright.config.js).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { watch, expectClean, expectNoHorizontalScroll, expectTapTargets } = require('./helpers');

test.use({ storageState: { cookies: [], origins: [] } });

const SLUGS = ['inbox-showdown', 'first-week-hunt', 'phish-or-fine'];
const script = slug => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'narration', slug, 'script.json'), 'utf8'));

/** Replaces speechSynthesis.speak with a recorder so narration is observable and silent. */
async function spySpeech(page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = u => { window.__spoken.push(u.text); };
    }
  });
}
const spoken = page => page.evaluate(() => window.__spoken.slice());
const sayOf = st => st.say || (st.title + '. ' + st.text);
/** Serves script.json without its MP3s, so narration takes the speech-synthesis path. */
async function noMp3(page, slug) {
  await page.route('**/shared/narration/' + slug + '/script.json', async route => {
    const data = script(slug);
    data.steps.forEach(s => { delete s.audio; });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}
const overlay = page => page.getByTestId('tutorial-overlay');

for (const slug of SLUGS) {
  const GAME = '/games/' + slug + '/';
  const steps = script(slug).steps;

  test.describe(slug + ' tutorial', () => {
    test('shows on first load: story intro, "what this game is", then 3 to 5 how-to steps; Next/Back and dots work', async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await spySpeech(page);
      await page.goto(GAME);
      await expect(overlay(page)).toBeVisible();
      expect(steps[0].intro).toBe(true);
      expect(steps[1].id).toBe('about');
      expect(steps.length - 2).toBeGreaterThanOrEqual(3);
      expect(steps.length - 2).toBeLessThanOrEqual(5);
      await expect(page.getByTestId('tutorial-step')).toHaveAttribute('data-kind', 'intro');
      // the story never mentions where it comes from
      for (const st of steps.slice(0, 2)) expect(st.text).not.toMatch(/project|class|braven|capstone|cognizant|assignment/i);
      await expect(page.getByTestId('tutorial-next')).toBeFocused();
      for (let i = 0; i < steps.length; i++) {
        await expect(page.getByTestId('tutorial-progress')).toHaveText('Step ' + (i + 1) + ' of ' + steps.length);
        await expect(page.getByTestId('tutorial-caption')).toContainText(steps[i].title);
        await expect(page.getByTestId('tutorial-caption')).toContainText(steps[i].text);
        await expect(page.getByTestId('tutorial-art').locator('.tut-emo')).toHaveCount(steps[i].art.length);
        await expect(page.getByTestId('tutorial-dots').locator('.tut-dot')).toHaveCount(steps.length);
        await expect(page.getByTestId('tutorial-dots').locator('.tut-dot.on')).toHaveCount(1);
        if (i === 0) await expect(page.getByTestId('tutorial-back')).toBeDisabled();
        else await expect(page.getByTestId('tutorial-back')).toBeEnabled();
        if (i < steps.length - 1) await page.getByTestId('tutorial-next').click();
      }
      await expect(page.getByTestId('tutorial-next')).toHaveAttribute('data-last', 'true');
      await page.getByTestId('tutorial-back').click();
      await expect(page.getByTestId('tutorial-progress')).toHaveText('Step ' + (steps.length - 1) + ' of ' + steps.length);
      await page.getByTestId('tutorial-next').click();
      await page.getByTestId('tutorial-next').click(); // "Let's play!" closes it
      await expect(overlay(page)).toBeHidden();
      await expect(page.getByTestId('setup-screen')).toBeVisible();
      expectClean(issues);
    });

    test('every step has a committed ElevenLabs MP3 and the overlay plays them in order, intro first', async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      for (const st of steps) {
        expect(st.audio, st.title).toBeTruthy();
        expect(fs.statSync(path.join(__dirname, '..', 'shared', 'narration', slug, st.audio)).size).toBeGreaterThan(10000);
      }
      const mp3s = [];
      page.on('request', r => { if (r.url().endsWith('.mp3')) mp3s.push(r.url().split('/').pop()); });
      await page.goto(GAME);
      await expect(overlay(page)).toBeVisible();
      await expect.poll(() => mp3s.includes(steps[0].audio)).toBe(true);
      await page.getByTestId('tutorial-next').click();
      await expect.poll(() => mp3s.includes(steps[1].audio)).toBe(true);
      await page.getByTestId('tutorial-skip').click();
      await expect(overlay(page)).toBeHidden();
      expectClean(issues);
    });

    test('narration reads every step (speech synthesis fallback, no MP3 listed) and the mute toggle silences it', async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await spySpeech(page);
      await noMp3(page, slug);
      await page.goto(GAME);
      await expect(overlay(page)).toBeVisible();
      await expect.poll(() => spoken(page)).toEqual([sayOf(steps[0])]);
      await page.getByTestId('tutorial-next').click();
      await expect.poll(async () => (await spoken(page)).length).toBe(2);
      expect((await spoken(page))[1]).toContain(steps[1].text);
      const mute = page.getByTestId('tutorial-mute');
      await expect(mute).toHaveAttribute('aria-pressed', 'false');
      await mute.click();
      await expect(mute).toHaveAttribute('aria-pressed', 'true');
      await expect(mute).toContainText('Voice off');
      await page.getByTestId('tutorial-next').click();
      expect((await spoken(page)).length).toBe(2); // muted: nothing new is read
      // the shared mute also covers sound effects and the top-bar toggle, and survives a reload
      expect(await page.evaluate(() => window.Sfx.muted())).toBe(true);
      await page.reload();
      await expect(overlay(page)).toBeVisible();
      await expect(page.getByTestId('tutorial-mute')).toHaveAttribute('aria-pressed', 'true');
      expect(await spoken(page)).toEqual([]);
      await page.getByTestId('tutorial-mute').click();
      await expect.poll(() => spoken(page)).toEqual([sayOf(steps[0])]);
      expectClean(issues);
    });

    test('Skip hides it; it comes back next visit unless "skip next time" is ticked, which persists', async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await page.goto(GAME);
      await expect(overlay(page)).toBeVisible();
      await page.getByTestId('tutorial-skip').click();
      await expect(overlay(page)).toBeHidden();
      await page.reload();
      await expect(overlay(page)).toBeVisible();
      await page.getByTestId('tutorial-remember').check();
      await page.getByTestId('tutorial-skip').click();
      await expect(overlay(page)).toBeHidden();
      expect(await page.evaluate(s => localStorage.getItem('nb-tutorial-skip:' + s), slug)).toBe('1');
      await page.reload();
      await expect(page.getByTestId('setup-screen')).toBeVisible();
      await page.waitForTimeout(300);
      await expect(overlay(page)).toHaveCount(0);
      // ?tutorial=1 still opens it, with the box ticked; unticking clears the flag
      await page.goto(GAME + '?tutorial=1');
      await expect(overlay(page)).toBeVisible();
      await expect(page.getByTestId('tutorial-remember')).toBeChecked();
      await page.getByTestId('tutorial-remember').uncheck();
      await page.keyboard.press('Escape');
      await expect(overlay(page)).toBeHidden();
      expect(await page.evaluate(s => localStorage.getItem('nb-tutorial-skip:' + s), slug)).toBeNull();
      expectClean(issues);
    });

    test('Menu > How to play re-opens it; the setup screen has a How to play button too', async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await page.goto(GAME + '?tutorial=0');
      await expect(page.getByTestId('setup-screen')).toBeVisible();
      await expect(overlay(page)).toHaveCount(0);
      await page.getByTestId('menu-btn').click();
      await page.getByTestId('menu-howto').click();
      await page.getByTestId('menu-tutorial').click();
      await expect(page.getByTestId('menu-panel')).toBeHidden();
      await expect(overlay(page)).toBeVisible();
      await expect(page.getByTestId('tutorial-progress')).toHaveText(/^Step 1 of/);
      await page.getByTestId('tutorial-skip').click();
      await expect(overlay(page)).toBeHidden();
      await page.getByTestId('btn-tutorial').click();
      await expect(overlay(page)).toBeVisible();
      expectClean(issues);
    });

    test('keyboard and 360 px: arrows step, Tab stays inside, Esc skips; no horizontal scroll, 44 px buttons', async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await page.setViewportSize({ width: 360, height: 640 });
      await page.goto(GAME);
      await expect(overlay(page)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectTapTargets(page, '.tut-overlay button');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('tutorial-progress')).toHaveText(/^Step 2 of/);
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByTestId('tutorial-progress')).toHaveText(/^Step 1 of/);
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement.closest('.tut-overlay'))).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(overlay(page)).toBeHidden();
      await expectNoHorizontalScroll(page);
      expectClean(issues);
    });

    test('a broken narration MP3 falls back to speech synthesis without console errors', async ({ page, baseURL }) => {
      const issues = watch(page, baseURL);
      await spySpeech(page);
      await page.route('**/shared/narration/' + slug + '/script.json', async route => {
        const data = script(slug);
        data.steps.forEach((s, i) => { s.audio = 'step' + (i + 1) + '.mp3'; });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.route('**/shared/narration/' + slug + '/*.mp3', route => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'not really audio' }));
      await page.goto(GAME);
      await expect(overlay(page)).toBeVisible();
      await page.getByTestId('tutorial-next').click(); // a user gesture, so autoplay is allowed
      await expect.poll(async () => (await spoken(page)).some(t => t.includes(steps[1].text))).toBe(true);
      expectClean(issues);
    });
  });
}

test.describe('hub and top bar', () => {
  test('hub cards show players, minutes and a "Watch the 30-second tutorial" link that opens the tutorial', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.goto('/');
    const cards = page.getByTestId('game-card');
    const n = await cards.count();
    expect(n).toBe(SLUGS.length);
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      await expect(card.getByTestId('game-players')).toContainText('players');
      await expect(card.getByTestId('game-minutes')).toContainText('minutes');
      await expect(card.getByTestId('game-goal')).not.toBeEmpty();
      await expect(card.getByTestId('tutorial-link')).toHaveText(/Watch the 30-second tutorial/);
    }
    // ticking "skip next time" first proves the link forces the tutorial anyway
    await page.evaluate(() => localStorage.setItem('nb-tutorial-skip:first-week-hunt', '1'));
    await cards.nth(1).getByTestId('tutorial-link').click();
    await expect(page).toHaveURL(/\/games\/first-week-hunt\/\?tutorial=1$/);
    await expect(overlay(page)).toBeVisible();
    expectClean(issues);
  });

  test('top-bar sound toggle flips the shared mute and remembers it', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.goto('/games/inbox-showdown/?tutorial=0');
    const btn = page.getByTestId('sound-toggle');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(btn).toHaveText('🔇');
    expect(await page.evaluate(() => localStorage.getItem('nb-muted'))).toBe('1');
    await page.goto('/games/phish-or-fine/?tutorial=0');
    await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('sound-toggle').click();
    expect(await page.evaluate(() => window.Sfx.muted())).toBe(false);
    expectClean(issues);
  });

  test('games give feedback: goal line, first-move hint, "What just happened" after a move', async ({ page, baseURL }) => {
    const issues = watch(page, baseURL);
    await page.goto('/games/inbox-showdown/?tutorial=0&seed=1');
    await expect(page.getByTestId('game-goal')).toBeVisible();
    await page.getByTestId('btn-start').click();
    await page.getByTestId('btn-ready').click();
    await expect(page.getByTestId('first-move-hint')).toBeVisible();
    await page.getByTestId('btn-report').click();
    await expect(page.getByTestId('what-happened')).toBeVisible();
    await page.getByTestId('btn-reveal').click();
    await expect(page.getByTestId('what-happened')).toContainText('What just happened');
    await page.getByTestId('btn-next').click();
    await expect(page.getByTestId('what-happened')).toContainText('Last turn');
    await page.getByTestId('btn-ready').click();
    await expect(page.getByTestId('first-move-hint')).toHaveCount(0);

    await page.goto('/games/first-week-hunt/?tutorial=0&seed=1');
    await expect(page.getByTestId('game-goal')).toBeVisible();
    await page.getByTestId('btn-start').click();
    await expect(page.getByTestId('first-move-hint')).toBeVisible();
    await page.locator('[data-testid="tile"][data-risk="true"]').first().click();
    await page.getByTestId('btn-lesson-ok').click();
    await expect(page.getByTestId('first-move-hint')).toHaveCount(0);
    await expect(page.getByTestId('what-happened')).toContainText('found a real risk');
    expectClean(issues);
  });
});
