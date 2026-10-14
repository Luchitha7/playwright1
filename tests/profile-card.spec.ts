import { test, expect, Page } from '@playwright/test';
import { login, accountBtn, appearanceBtn, openCard } from './helpers';
import { requireEnv } from './env';

const NAME = requireEnv('EXPECTED_NAME');
const INITIALS = requireEnv('EXPECTED_INITIALS');
const ROLE = requireEnv('EXPECTED_ROLE');
const EMAIL = requireEnv('CIP_USER');
const TENANT_ID = process.env.EXPECTED_TENANT_ID;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// put the theme back to Light so later tests start from a known state
async function resetTheme(page: Page) {
  await page.keyboard.press('Escape');
  await openCard(page);
  await appearanceBtn(page).click();
  await page.getByRole('menuitem', { name: 'Light' }).click();
}

test.describe('Profile card', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/overview');
    await openCard(page);
  });

  test('TC-431 profile card opens', async ({ page }) => {
    await expect(page.getByText('Tenant ID:')).toBeVisible();
  });

  test('TC-432/433 avatar shows initials', async ({ page }) => {
    await expect(page.getByText(INITIALS, { exact: true }).first()).toBeVisible();
  });

  test('TC-434/435 username matches logged in user', async ({ page }) => {
    await expect(page.getByRole('paragraph').filter({ hasText: NAME })).toBeVisible();
  });

  test('TC-436 email visible', async ({ page }) => {
    await expect(page.getByText(EMAIL)).toBeVisible();
  });

  test('TC-438 role badge displayed', async ({ page }) => {
    await expect(
      page.locator('div').filter({ hasText: new RegExp(`^${escapeRegExp(ROLE)}$`) }).first()
    ).toBeVisible();
  });

  test('TC-439 tenant ID section visible', async ({ page }) => {
    await expect(page.getByText('Tenant ID:')).toBeVisible();
  });

  test('TC-440 correct tenant ID', async ({ page }) => {
    test.skip(!TENANT_ID, 'Set EXPECTED_TENANT_ID in .env');
    await expect(page.getByText(TENANT_ID!)).toBeVisible();
  });

  test('TC-442/443 appearance shows current theme', async ({ page }) => {
    await expect(appearanceBtn(page)).toHaveAccessibleName(/Appearance (Light|Dark|System)/);
  });

  test('TC-446 appearance opens theme options', async ({ page }) => {
    await appearanceBtn(page).click();
    await expect(page.getByRole('menuitem', { name: 'Light' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Dark' })).toBeVisible();
  });

  test('TC-445 dark theme applies', async ({ page }) => {
    try {
      await appearanceBtn(page).click();
      await page.getByRole('menuitem', { name: 'Dark' }).click();
      await openCard(page);
      await expect(page.getByRole('button', { name: 'Appearance Dark' })).toBeVisible();
    } finally {
      await resetTheme(page);
    }
  });

  test('TC-444 system theme applies', async ({ page }) => {
    try {
      await appearanceBtn(page).click();
      await page.getByRole('menuitem', { name: 'System' }).click();
      await openCard(page);
      await expect(page.getByRole('button', { name: 'Appearance System' })).toBeVisible();
    } finally {
      await resetTheme(page);
    }
  });

  test('TC-447 logout option visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  });

  test('TC-453 click outside closes card', async ({ page }) => {
    await page.mouse.click(700, 400);
    await expect(page.getByText('Tenant ID:')).toBeHidden();
  });

  test('TC-454 card reopens', async ({ page }) => {
    await page.mouse.click(700, 400);
    await expect(page.getByText('Tenant ID:')).toBeHidden();
    await openCard(page);
  });

  test.fixme('TC-437 long email truncates', async () => {});
  test.fixme('TC-441 tenant icon visible', async () => {});
  test.fixme('TC-455/456 UI alignment (manual)', async () => {});
});

test.describe('Profile card logout', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await openCard(page);
  });

  test('TC-448/449 logout signs the user out', async ({ page }) => {
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/auth\/signed-out/);
    await expect(page.getByText('You have been successfully Signed out')).toBeVisible();
  });

  test('TC-450/451 logout asks for confirmation with cancel', async ({ page }) => {
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('TC-452 confirm button logs out', async ({ page }) => {
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('dialog')).toBeVisible(); // fail fast if no popup
    await page.getByRole('dialog').getByRole('button', { name: /log ?out/i }).click();
    await expect(page).toHaveURL(/auth\/login/);
  });
});
