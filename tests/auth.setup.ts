import { test as setup } from '@playwright/test';
import { login } from './helpers';

setup('login', async ({ page }) => {
  setup.setTimeout(90_000); // login gets 90s on slow networks
  await login(page);
  await page.context().storageState({ path: '.auth/user.json' });
});
