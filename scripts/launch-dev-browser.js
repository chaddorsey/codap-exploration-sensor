// Opens a visible Chrome window with CODAP and the local plugin
// (npm run dev must be running). Uses a scratch profile with Chrome's Local
// Network Access check disabled, which otherwise blocks a public site
// (codap3.concord.org) from embedding https://localhost. Dev convenience only.
import { chromium } from '@playwright/test';

const url = 'https://codap3.concord.org/?di=https://localhost:8090/';
const context = await chromium.launchPersistentContext('/tmp/exploration-sensor-dev-profile', {
  channel: 'chrome', headless: false, viewport: null, ignoreHTTPSErrors: true,
  args: ['--disable-features=LocalNetworkAccessChecks', '--window-size=1500,950'],
});
const page = context.pages()[0] ?? (await context.newPage());
// CODAP's full `load` event can take longer than Playwright's 30 s default.
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
console.log(`Dev browser open at ${url} — close the window to end this process.`);
await new Promise((resolve) => context.on('close', resolve));
