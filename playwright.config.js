import { defineConfig } from '@playwright/test';

// Drives the plugin inside hosted CODAP. Needs `npm run dev` running and
// Google Chrome installed. Headed, because hosted CODAP stalled in headless
// Chrome when this was written (2026-10-13). Not run in CI.
export default defineConfig({
  testDir: 'e2e',
  timeout: 600_000, // CODAP stalls for tens of seconds after loading data
  workers: 1,
  use: {
    channel: 'chrome',
    headless: false,
    ignoreHTTPSErrors: true,
    viewport: { width: 1500, height: 950 },
    launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] },
  },
});
