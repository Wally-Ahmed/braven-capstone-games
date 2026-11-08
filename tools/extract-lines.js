#!/usr/bin/env node
// Writes shared/narration/<slug>/lines.json from each page's narrationLines() (the text the game shows),
// so the narration manifest never drifts from the game code. Usage: node tools/extract-lines.js
// A line keeps its "audio" flag only while its text is unchanged; a changed line loses it (and its old
// MP3 is deleted) so tools/generate-narration.sh voices it again.
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8797);
const PAGES = [
  { slug: 'hub', url: '/', hook: 'NorthbridgeHub' },
  { slug: 'inbox-showdown', url: '/games/inbox-showdown/', hook: 'InboxShowdown' },
  { slug: 'first-week-hunt', url: '/games/first-week-hunt/', hook: 'FirstWeekHunt' },
  { slug: 'phish-or-fine', url: '/games/phish-or-fine/', hook: 'PhishOrFine' }
];

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    for (const p of PAGES) {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${PORT}${p.url}?tutorial=0`);
      const fresh = await page.evaluate(h => window[h] && window[h].narrationLines ? window[h].narrationLines() : null, p.hook);
      await page.close();
      if (!fresh) { console.log('skip', p.slug, '(no narrationLines)'); continue; }
      const dir = path.join(ROOT, 'shared', 'narration', p.slug);
      fs.mkdirSync(path.join(dir, 'lines'), { recursive: true });
      const file = path.join(dir, 'lines.json');
      const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).lines || {} : {};
      const out = {};
      let chars = 0, changed = 0;
      for (const [id, v] of Object.entries(fresh)) {
        const o = old[id];
        out[id] = { text: v.text, priority: v.priority || 1 };
        if (o && o.audio && o.text === v.text && fs.existsSync(path.join(dir, 'lines', id + '.mp3'))) out[id].audio = true;
        else { if (o && o.text !== v.text) changed++; chars += v.text.length; }
      }
      for (const id of Object.keys(old)) {
        if (!out[id] || !out[id].audio) { const f = path.join(dir, 'lines', id + '.mp3'); if (fs.existsSync(f)) fs.unlinkSync(f); }
      }
      fs.writeFileSync(file, JSON.stringify({ slug: p.slug, lines: out }, null, 2) + '\n');
      console.log(`${p.slug}: ${Object.keys(out).length} lines, ${changed} changed, ${chars} characters without audio`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
})();
