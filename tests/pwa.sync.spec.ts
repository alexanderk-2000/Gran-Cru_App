import { test, expect } from '@playwright/test';

test.describe('PWA reconnect smoke', () => {
  test('returns from offline lock to auth screen after reconnect', async ({ page, context }) => {
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });

    await context.setOffline(true);
    await expect(page.getByRole('heading', { name: /Offline gesperrt/i })).toBeVisible({ timeout: 15_000 });

    await context.setOffline(false);
    await expect(page.getByRole('heading', { name: /Grand Cru Vault/i })).toBeVisible({ timeout: 15_000 });
  });
});
