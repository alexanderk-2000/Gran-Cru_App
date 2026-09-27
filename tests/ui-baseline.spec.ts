import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/demoAuth.ts';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'reports', 'ui-baseline');

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
