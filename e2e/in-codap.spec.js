import { expect, test } from '@playwright/test';

// Each step uses CODAP's own interface, so the notifications are the ones a
// student's actions produce. CODAP is slow to answer plugins while it starts
// up and after creating data, hence the long timeouts.
test('senses moves made in CODAP', async ({ page }) => {
  await page.goto('https://codap3.concord.org/?di=https://localhost:8090', {
    waitUntil: 'domcontentloaded', timeout: 90_000,
  });
  const plugin = page.frameLocator('.codap-web-view-iframe');
  const feed = plugin.locator('[data-ref="feed"]');
  // CODAP reloads a plugin's frame (adding ?lang=…) once it recognizes it,
  // so wait for the reloaded frame to connect before acting.
  await expect.poll(() => page.frames().some((f) => /localhost:8090\/?\?lang=/.test(f.url())),
    { timeout: 120_000 }).toBe(true);
  await expect(plugin.getByText(/^Connected to CODAP$/)).toBeVisible({ timeout: 120_000 });

  // The first click on an unselected tile can go to CODAP (selecting the
  // tile) rather than into the plugin, so select the tile first.
  await page.getByRole('button', { name: 'Exploration Sensor' }).click();
  await plugin.getByRole('button', { name: 'Load Roller Coasters sample' }).click();
  await expect(plugin.getByRole('button', { name: 'Load Roller Coasters sample' })).toBeDisabled();
  await expect(plugin.getByText('Roller Coasters sample loaded')).toBeAttached({ timeout: 120_000 });
  await page.waitForTimeout(4000);
  await expect(feed.locator('li')).toHaveCount(0); // the plugin's own loading is not a move

  await page.getByTestId('tool-shelf-button-graph').click();
  await expect(feed).toContainText('Made a graph', { timeout: 30_000 });

  const pick = async (axis, attribute) => {
    await page.locator('.codap-graph').getByTestId('title-text').first().click({ force: true });
    await page.getByTestId(`axis-legend-attribute-button-${axis}`).click();
    await page.getByTestId(`axis-legend-attribute-menu-list-${axis}`)
      .getByText(attribute, { exact: true }).first().click();
  };
  await pick('bottom', 'Top_Speed');
  await expect(feed).toContainText('Put Top_Speed on the x axis', { timeout: 30_000 });
  await pick('left', 'Max_Height');
  await expect(feed).toContainText('Put Max_Height on the y axis', { timeout: 30_000 });

  await page.locator('.codap-graph').getByTestId('title-text').first().click({ force: true });
  await page.getByTestId('graph-display-values-button').click();
  await page.getByText(/Least Squares Line/).first().click();
  await expect(feed).toContainText('Added a least-squares line to a graph', { timeout: 30_000 });
  await page.keyboard.press('Escape');

  await page.locator('[role=gridcell]').nth(2).click();
  await expect(feed).toContainText('Selected 1 case', { timeout: 30_000 });

  await page.locator('.codap-graph').getByTestId('title-text').first().click({ force: true });
  await page.getByTestId('graph-hide-show-button').click();
  await page.getByRole('menuitem', { name: /Hide Unselected/i }).click();
  await expect(feed).toContainText(/Hid cases \(\d+ hidden\)/, { timeout: 30_000 });
});
