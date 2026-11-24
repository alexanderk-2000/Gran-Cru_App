import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'reports', 'ui-baseline');

const ensureAuthenticated = async (page: import('@playwright/test').Page) => {
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  const demoButton = page.getByRole('button', { name: /Demo-Modus nutzen/i });
  const appHeading = page.getByRole('heading', { name: /^Portfolio$|Hauptkeller|Wunschliste/i });
  // Firebase restores a persisted session asynchronously, so wait until
  // either the login screen or the app has rendered before deciding.
  await expect(demoButton.or(appHeading).first()).toBeVisible({ timeout: 30_000 });
  if (await demoButton.isVisible()) {
    await demoButton.click();
    await expect(appHeading).toBeVisible({ timeout: 30_000 });
  }
};

test.describe('UI baseline snapshots', () => {
  test.beforeAll(async () => {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  });

  test('captures dashboard, inventory, and wine detail', async ({ page }) => {
    await ensureAuthenticated(page);

    // Firestore keeps a long-lived streaming connection open, so
    // 'networkidle' never settles - wait for rendered content instead.
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^Portfolio$/i })).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard.png'), fullPage: true });

    await page.goto('/#/inventory', { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Kollektion durchsuchen...')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'inventory.png'), fullPage: true });

    const detailLink = page.locator('a:has-text("Details")').first();
    if (await detailLink.count()) {
      await detailLink.click();
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'wine-detail.png'), fullPage: true });
    }
  });
});
