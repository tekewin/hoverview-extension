const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const extensionPath = path.resolve(__dirname, 'hoverview');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.spec.js'],
  // Playwright must run headed for extensions (no --headless flag).
  // We use a persistent context so the extension loads properly.
  fullyParallel: false,
  timeout: 30_000,
  use: {
    // Extensions only work in chromium
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'chromium-with-extension',
      use: {
        // Chromium launch args to load the unpacked extension
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
          headless: false,   // extensions cannot run in headless mode
        },
      },
    },
  ],
  // Serve the fixture HTML during E2E runs
  webServer: {
    command: 'node tests/e2e/fixtures/serve.cjs',
    url: 'http://localhost:7777',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
