import { Page, expect } from '@playwright/test';
import { requireEnv } from './env';

export const accountBtn = (page: Page) =>
  page.getByRole('button', { name: /^Account:/ });

export const appearanceBtn = (page: Page) =>
  page.getByRole('button', { name: /^Appearance/ });

export async function login(page: Page) {
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });

  const email = page.getByRole('textbox', { name: 'Email Address' });
  await email.click();                       // unlocks the box
  await expect(email).toBeEditable();
  await email.fill(requireEnv('CIP_USER'));

  const password = page.getByRole('textbox', { name: 'Password' });
  await password.click();                    // same lock on password
  await expect(password).toBeEditable();
  await password.fill(requireEnv('CIP_PASS'));

  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(accountBtn(page)).toBeVisible({ timeout: 30_000 });
}

export async function openCard(page: Page) {
  await accountBtn(page).click();
  await expect(page.getByText('Tenant ID:')).toBeVisible();
}
