import { test, expect } from '@playwright/test';

test.describe('PWA offline smoke', () => {
  test('exposes manifest link and switches to offline lock screen', async ({ page, context }) => {
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });

    const manifestLink = page.locator('link[rel="manifest"]').first();
    await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');

    await context.setOffline(true);
    await expect(page.getByRole('heading', { name: /Offline gesperrt/i })).toBeVisible({ timeout: 15_000 });

    await context.setOffline(false);
  });
});
