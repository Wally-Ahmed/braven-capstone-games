// Serves the repo root with python3 -m http.server and runs the checks in headless Chromium.
const { defineConfig, devices } = require('@playwright/test');
const PORT = Number(process.env.PORT || 8765);

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, headless: true },
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
