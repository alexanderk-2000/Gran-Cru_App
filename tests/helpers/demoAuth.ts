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
  const loggedInHeading = page.getByRole('heading', { name: /^Dein Keller$|Hauptkeller|Wunschliste/i });

  // domcontentloaded fires before React has necessarily hydrated the auth
  // screen, so an immediate isVisible() check here raced the app's own
  // mount and intermittently found neither element - not "slow", just
  // checked before either state existed yet. Wait for whichever of the two
  // known states actually shows up instead of sampling once.
  await Promise.race([
    demoButton.waitFor({ state: 'visible', timeout: 30_000 }),
    loggedInHeading.waitFor({ state: 'visible', timeout: 30_000 })
  ]);

  if (await demoButton.isVisible()) {
    await demoButton.click();
    await expect(loggedInHeading).toBeVisible({ timeout: 30_000 });
  }
};
