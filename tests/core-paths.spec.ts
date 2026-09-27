import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/demoAuth.ts';

/**
 * Real user-journey coverage for the four paths that must not silently
 * break (B28): add a wine, open a bottle, move it to a pocket, and consume
 * a planned occasion. Before this, Playwright only took screenshots
 * (ui-baseline.spec.ts) and checked the offline/reconnect lock screen
 * (pwa.*.spec.ts) - none of them actually drove these flows to completion.
 *
 * Every test starts a fresh demo account (see helpers/demoAuth.ts), seeded
 * with a handful of starter wines including "Château Margaux" 2015 - tests
 * never depend on each other's state or on ordering.
 *
 * Generous timeouts throughout: a fresh anonymous sign-in plus its server-
 * side seed write (5-6 wines) racing a first page render on a CI runner
 * running its own freshly-started local Supabase stack is measurably slower
 * than on a warm dev machine - the default 60s test timeout was too tight
 * for that specific combination the first time this ran in CI.
 */
test.describe('Kernwege', () => {
  test.describe.configure({ timeout: 90_000 });

  test('legt einen neuen Wein von Hand an', async ({ page }) => {
    await ensureAuthenticated(page);
    await page.goto('/#/inventory', { waitUntil: 'networkidle' });

    const addButton = page.getByRole('button', { name: /wein hinzufügen/i });
    await expect(addButton).toBeVisible({ timeout: 30_000 });
    await addButton.click();
    await page.getByRole('button', { name: /von hand eintragen/i }).click();

    const wineName = `E2E Testwein ${Date.now()}`;
    await page.getByLabel('Name *').fill(wineName);
    await page.getByRole('button', { name: /in den keller/i }).click();

    await expect(page.getByText(new RegExp(`${wineName} wurde in den Keller gelegt`))).toBeVisible({
      timeout: 20_000
    });
    await expect(page.getByRole('heading', { name: wineName, exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('öffnet eine Flasche und bucht den Bestand ab', async ({ page }) => {
    await ensureAuthenticated(page);
    await page.goto('/#/inventory', { waitUntil: 'networkidle' });

    const heading = page.getByRole('heading', { name: 'Château Margaux', exact: true });
    await expect(heading).toBeVisible({ timeout: 30_000 });
    const card = heading.locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
    await expect(card.getByText('6 Fl.')).toBeVisible({ timeout: 10_000 });

    const openButton = card.getByRole('button', { name: 'Öffnen' });
    await expect(openButton).toBeVisible();
    await openButton.click();

    const dialog = page.getByRole('dialog', { name: 'Flasche öffnen' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: /öffnen & speichern/i }).click();

    await expect(page.getByText(/Flasche gebucht/i)).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText('5 Fl.')).toBeVisible({ timeout: 10_000 });
  });

  test('legt eine Pocket an und verschiebt eine Flasche dorthin', async ({ page }) => {
    await ensureAuthenticated(page);
    await page.goto('/#/inventory', { waitUntil: 'networkidle' });

    const pocketButton = page.getByRole('button', { name: 'Pocket', exact: true });
    await expect(pocketButton).toBeVisible({ timeout: 30_000 });
    await pocketButton.click();

    const pocketName = `E2E Regal ${Date.now()}`;
    await page.getByPlaceholder('z. B. Bordeaux Collection').fill(pocketName);
    await page.getByRole('button', { name: /anlegen/i }).click();
    await expect(page.getByText(new RegExp(`Pocket "${pocketName}" wurde angelegt`))).toBeVisible({
      timeout: 20_000
    });

    const heading = page.getByRole('heading', { name: 'Château Margaux', exact: true });
    const card = heading.locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
    const moveButton = card.getByRole('button', { name: 'Verschieben' });
    await expect(moveButton).toBeVisible({ timeout: 15_000 });
    await moveButton.click();

    const dialog = page.getByRole('dialog', { name: 'In Pocket verschieben' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: pocketName, exact: true }).click();

    await expect(page.getByText(new RegExp(`liegt jetzt in ${pocketName}`))).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(pocketName)).toBeVisible({ timeout: 10_000 });
  });

  test('plant einen Anlass und konsumiert die Instanz mit Bestandsabgang', async ({ page }) => {
    await ensureAuthenticated(page);
    await page.goto('/#/genussplan', { waitUntil: 'networkidle' });

    const planButton = page.getByRole('button', { name: /serie planen/i });
    await expect(planButton).toBeVisible({ timeout: 30_000 });
    await planButton.click();
    await page.getByPlaceholder('z.B. Monatliche Raritätenprobe').fill('E2E Verkostung');

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(tomorrow); // Startdatum
    await dateInputs.nth(1).fill(tomorrow); // Enddatum

    await page.getByRole('button', { name: /termine erstellen/i }).click();

    // Saving auto-opens the wine-pool step (auto-assign by drink window) -
    // not useful here since Château Margaux's window starts in 2030. The
    // direct per-instance "Wein zuordnen" picker below assigns any wine
    // regardless of window, so the pool modal is just dismissed.
    await expect(page.getByRole('dialog', { name: /Wein-Pool/i })).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Wein-Pool/i })).not.toBeVisible();

    const assignButton = page.getByRole('button', { name: /wein zuordnen/i });
    await expect(assignButton).toBeVisible({ timeout: 10_000 });
    await assignButton.click();
    const select = page.getByRole('combobox');
    const marginauxOption = select.locator('option', { hasText: 'Château Margaux' });
    const optionValue = await marginauxOption.getAttribute('value');
    await select.selectOption(optionValue!);

    await expect(page.getByText(/Château Margaux/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /^Getrunken$/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Flasche öffnen' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: /öffnen & speichern/i }).click();

    await expect(page.getByText(/Anlass als genossen vermerkt/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Genossen$/).first()).toBeVisible({ timeout: 10_000 });
  });
});
