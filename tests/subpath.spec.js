// GitHub Pages serves this repo as a project site under /braven-capstone-games/, not the domain root.
// This serves the folder under that prefix (anything outside it is a 404) and checks the hub, a game,
// its narration manifests and an MP3 all load with relative paths and no 404s.
const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PREFIX = '/braven-capstone-games/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
let server, origin;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (!url.startsWith(PREFIX)) { res.writeHead(404); res.end('outside the project path'); return; }
    let file = path.join(ROOT, url.slice(PREFIX.length));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(() => new Promise(r => server.close(r)));

test('hub, a game, its manifests and an MP3 load under /braven-capstone-games/ with no 404s', async ({ page }) => {
  const bad = [], ok = [];
  page.on('response', r => { if (r.url().endsWith('/favicon.ico')) return; if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); else ok.push(r.url()); });
  await page.goto(origin + PREFIX);
  await expect(page.getByTestId('game-card')).toHaveCount(3);
  await expect.poll(() => ok.some(u => u.endsWith(PREFIX + 'shared/narration/hub/lines.json'))).toBe(true);
  await page.getByTestId('game-card').first().getByTestId('tutorial-link').click();
  await expect(page).toHaveURL(origin + PREFIX + 'games/inbox-showdown/?tutorial=1');
  await expect(page.getByTestId('menu-btn')).toBeVisible();
  await expect(page.getByTestId('tutorial-overlay')).toBeVisible();
  await expect.poll(() => ok.some(u => u.includes(PREFIX + 'shared/narration/inbox-showdown/') && u.endsWith('.mp3'))).toBe(true);
  await expect.poll(() => ok.some(u => u.endsWith(PREFIX + 'shared/narration/inbox-showdown/lines.json'))).toBe(true);
  await page.getByTestId('tutorial-skip').click();
  // Menu > Game selection goes back to the hub inside the project path
  await page.getByTestId('menu-btn').click();
  await page.getByTestId('menu-game-selection').click();
  await expect(page).toHaveURL(origin + PREFIX);
  expect(bad).toEqual([]);
});
