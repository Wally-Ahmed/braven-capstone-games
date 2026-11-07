// Serves the repo root with python3 -m http.server and runs the checks in headless Chromium.
const { defineConfig, devices } = require('@playwright/test');
const PORT = Number(process.env.PORT || 8765);
const ORIGIN = `http://127.0.0.1:${PORT}`;
// Most specs test the games themselves, so they start with every game's "skip the tutorial next time"
// flag set. tests/tutorial.spec.js clears it to test the overlay.
const SKIP_TUTORIALS = {
  cookies: [],
  origins: [{ origin: ORIGIN, localStorage: ['inbox-showdown', 'first-week-hunt', 'phish-or-fine']
    .map(slug => ({ name: 'nb-tutorial-skip:' + slug, value: '1' })) }]
};

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: ORIGIN, headless: true, storageState: SKIP_TUTORIALS },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 15000,
    stdout: 'ignore',
    stderr: 'ignore'
  }
});
