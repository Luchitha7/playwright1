import { test, expect, Page } from '@playwright/test';
import { login, accountBtn, appearanceBtn, openCard } from './helpers';
import { requireEnv } from './env';

// ---------- small helpers used only in this file ----------

// pick a theme from the card (card closes after picking)
async function setTheme(page: Page, theme: 'Light' | 'Dark') {
  await openCard(page);
  await appearanceBtn(page).click();
  await page.getByRole('menuitem', { name: theme }).click();
}

// open the card and log out, then wait for the signed-out page
async function logout(page: Page) {
  await openCard(page);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/auth\/signed-out/);
}

const cardIsOpen = (page: Page) => page.getByText('Tenant ID:');

// =========================================================
// Group 1: card behaviour, keyboard, theme persistence
// uses the saved login, starts on Overview with the card CLOSED
// =========================================================
test.describe('Profile card extra', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/overview');
    await expect(accountBtn(page)).toBeVisible();
  });

  test('TC-457 theme persists after reload', async ({ page }) => {
    try {
      await setTheme(page, 'Dark');
      await page.reload();
      await openCard(page);
      await expect(page.getByRole('button', { name: 'Appearance Dark' })).toBeVisible();
    } finally {
      await page.keyboard.press('Escape');
      await setTheme(page, 'Light'); // always put it back
    }
  });

  test('TC-465 account button toggles the card', async ({ page }) => {
    await openCard(page);
    // while the card is open the app hides the rest of the page from
    // screen readers (aria-hidden), so look for the button with includeHidden
    const btn = page.getByRole('button', { name: /^Account:/, includeHidden: true });
    const box = await btn.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(cardIsOpen(page)).toBeHidden();
  });

  test('TC-466 card opens from every page', async ({ page }) => {
    test.setTimeout(120_000); // visits several slow pages
    for (const item of ['Live Calls', 'Call Records', 'QA Performance', 'Reports']) {
      await page.getByText(item, { exact: true }).first().click();
      await openCard(page);
      await expect(page.getByText(requireEnv('CIP_USER'))).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(cardIsOpen(page)).toBeHidden();
    }
  });

  test('TC-469 Escape closes the card', async ({ page }) => {
    await openCard(page);
    await page.keyboard.press('Escape');
    await expect(cardIsOpen(page)).toBeHidden();
  });

  test('TC-470 card opens with the keyboard', async ({ page }) => {
    await accountBtn(page).focus();
    await page.keyboard.press('Enter');
    await expect(cardIsOpen(page)).toBeVisible();
  });

  test('TC-472 focus returns to account button after closing', async ({ page }) => {
    await openCard(page);
    await page.keyboard.press('Escape');
    await expect(accountBtn(page)).toBeFocused();
  });
});

// =========================================================
// Group 2: session and security after logout
// each test logs in fresh, because logout ends the session
// =========================================================
test.describe('Session after logout', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000); // login on this site is slow
    await login(page);
  });

  test('TC-458 theme persists after logging in again', async ({ page }) => {
    try {
      await setTheme(page, 'Dark');
      await logout(page);
      await login(page);
      await openCard(page);
      await expect(page.getByRole('button', { name: 'Appearance Dark' })).toBeVisible();
    } finally {
      await page.keyboard.press('Escape');
      await setTheme(page, 'Light');
    }
  });

  test('TC-461 Back button after logout does not show the dashboard', async ({ page }) => {
    await logout(page);
    await page.goBack();
    await expect(page).toHaveURL(/auth\//, { timeout: 15_000 });
    await expect(accountBtn(page)).toBeHidden();
  });

  test('TC-462 opening /overview after logout goes to login', async ({ page }) => {
    await logout(page);
    await page.goto('/overview');
    await expect(page).toHaveURL(/auth\//, { timeout: 15_000 });
    await expect(accountBtn(page)).toBeHidden();
  });

  test('TC-463 Sign in button on the signed-out page opens login', async ({ page }) => {
    await logout(page);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/auth\/login/);
    await expect(page.getByRole('textbox', { name: 'Email Address' })).toBeVisible();
  });

  test('TC-464 logout in one tab ends the session in another tab', async ({ page, context }) => {
    const tab2 = await context.newPage();          // second tab, same browser
    await tab2.goto('/overview');
    await expect(accountBtn(tab2)).toBeVisible();  // tab 2 is logged in

    await logout(page);                            // log out in tab 1

    await tab2.reload();                           // refresh tab 2
    await expect(tab2).toHaveURL(/auth\//, { timeout: 15_000 });
    await expect(accountBtn(tab2)).toBeHidden();
  });
});
