import { expect, type Page } from '@playwright/test';

/**
 * Logs into a fresh, seeded demo account (anonymous Supabase sign-in - see
 * storageService.signInAnonymously/seedIfNewUser). Each Playwright test gets
 * its own browser context, so each call here creates its own isolated
 * account with the same starter wines (Château Margaux 2015 among them) -
 * tests never see each other's state.
 */
export const ensureAuthenticated = async (page: Page): Promise<void> => {
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  const demoButton = page.getByRole('button', { name: /Demo-Modus nutzen/i });
  if (await demoButton.isVisible()) {
    await demoButton.click();
    await expect(page.getByRole('heading', { name: /^Dein Keller$|Hauptkeller|Wunschliste/i })).toBeVisible({
      timeout: 30_000
    });
  }
};
