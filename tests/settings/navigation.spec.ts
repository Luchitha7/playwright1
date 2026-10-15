import { test, expect } from './fixtures';
import { SettingsHome, UsersTab } from './pages';
import { accountBtn } from '../helpers';

test.describe('Settings navigation', () => {
  test('TC-234 Settings landing page opens', async ({ page }) => {
    await page.goto('/overview');
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(new SettingsHome(page).heading).toBeVisible();
  });

  test('TC-235 User Management card is visible and clickable', async ({ page }) => {
    const home = new SettingsHome(page);
    await home.goto();
    await expect(home.userManagementCard).toBeVisible();
    await home.userManagementCard.click();
    await expect(page).toHaveURL(/\/settings\/users$/);
  });

  test('TC-236 Keywords card is visible and clickable', async ({ page }) => {
    const home = new SettingsHome(page);
    await home.goto();
    await expect(home.keywordsCard).toBeVisible();
    await home.keywordsCard.click();
    await expect(page).toHaveURL(/\/settings\/keywords$/);
  });

  test('TC-237 cards respond only in their intended area (Users, Teams, Roles)', async ({ page }) => {
    const home = new SettingsHome(page);
    for (const [link, url] of [
      [home.usersLink, /\/settings\/users$/],
      [home.teamsLink, /\/settings\/users\/teams$/],
      [home.rolesLink, /\/settings\/users\/roles$/],
    ] as const) {
      await home.goto();
      await link.click();
      await expect(page).toHaveURL(url);
    }

    // clicking the page heading (not a card) goes nowhere
    await home.goto();
    await home.heading.click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('TC-238 direct URL opens the right Settings module', async ({ page }) => {
    await page.goto('/settings/users/roles');
    await expect(page.getByRole('tab', { name: 'Roles' })).toHaveAttribute('aria-selected', 'true');
    await page.goto('/settings/keywords');
    await expect(page.getByRole('heading', { name: 'Keywords', level: 1 })).toBeVisible();
  });

  test('TC-239 invalid Settings URL is handled', async ({ page }) => {
    await page.goto('/settings/this-page-does-not-exist');
    await expect(page).toHaveURL(/\/settings$/);
    await expect(new SettingsHome(page).heading).toBeVisible();
  });

  test('TC-240 browser Back returns to the previous page', async ({ page }) => {
    const home = new SettingsHome(page);
    await home.goto();
    await home.keywordsCard.click();
    await expect(page).toHaveURL(/\/settings\/keywords$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(home.heading).toBeVisible();
  });

  test('TC-241 browser Forward opens the next page', async ({ page }) => {
    const home = new SettingsHome(page);
    await home.goto();
    await home.keywordsCard.click();
    await expect(page).toHaveURL(/\/settings\/keywords$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/settings\/keywords$/);
  });

  test('TC-242 session stays active while navigating Settings', async ({ page }) => {
    for (const url of ['/settings', '/settings/users', '/settings/users/teams', '/settings/users/roles', '/settings/keywords', '/settings/sentiment']) {
      await page.goto(url);
      await expect(page).not.toHaveURL(/\/auth\//);
      await expect(accountBtn(page)).toBeVisible();
    }
  });

  test('TC-243 Users tab is active when User Management opens', async ({ page }) => {
    const home = new SettingsHome(page);
    await home.goto();
    await home.userManagementCard.click();
    await expect(new UsersTab(page).tab).toHaveAttribute('aria-selected', 'true');
  });
});
