import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'reports', 'ui-baseline');

const ensureAuthenticated = async (page: import('@playwright/test').Page) => {
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  const demoButton = page.getByRole('button', { name: /Demo-Modus nutzen/i });
  if (await demoButton.isVisible()) {
    await demoButton.click();
    await expect(page.getByRole('heading', { name: /^Dein Keller$|Hauptkeller|Wunschliste/i })).toBeVisible({
      timeout: 30_000
    });
  }
};

test.describe('UI baseline snapshots', () => {
  test.beforeAll(async () => {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  });

  test('captures dashboard, inventory, and wine detail', async ({ page }) => {
    await ensureAuthenticated(page);

    await page.goto('/#/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard.png'), fullPage: true });

    await page.goto('/#/inventory', { waitUntil: 'networkidle' });
    await expect(page.getByPlaceholder('Kollektion durchsuchen...')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'inventory.png'), fullPage: true });

    const detailLink = page.locator('a:has-text("Details")').first();
    if (await detailLink.count()) {
      await detailLink.click();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'wine-detail.png'), fullPage: true });
    }
  });
});
