import { Locator, Page } from '@playwright/test';
import { test, expect, ALLOW_WRITES, WRITE_SKIP_REASON } from './fixtures';
import { AlertsPage } from './pages';
import { login, openCard } from '../helpers';
import { requireEnv } from '../env';

const SAVE_API = (url: URL) => url.pathname.startsWith('/api/alert-thresholds');

// Waits for the auto-save request that follows a change.
const saved = (page: Page) =>
  page.waitForResponse((r) => SAVE_API(new URL(r.url())) && r.request().method() !== 'GET' && r.ok());

test.describe('Settings > Sentiment & Alerts', () => {
  let alerts: AlertsPage;

  test.beforeEach(async ({ page }) => {
    alerts = new AlertsPage(page);
    await alerts.goto();
  });

  test('TC-327 Sentiment & Alerts page opens', async ({ page }) => {
    await expect(page).toHaveURL(/\/settings\/sentiment$/);
  });

  test('TC-328 explanatory text is shown', async ({ page }) => {
    await expect(page.getByText(/Set the sentiment score thresholds that flag a call as at risk/)).toBeVisible();
    await expect(page.getByText(/Select the sentiment score level that should trigger a supervisor alert/)).toBeVisible();
    await expect(page.getByText(/Select the call duration that should trigger an alert/)).toBeVisible();
  });

  test('TC-330 sentiment threshold minimum', async ({ page }) => {
    await expect(alerts.sentimentSlider).toHaveAttribute('min', '-100');
    await expect(page.getByText('-100% (High Neg)')).toBeVisible();
  });

  test('TC-331 sentiment threshold maximum', async ({ page }) => {
    await expect(alerts.sentimentSlider).toHaveAttribute('max', '100');
    await expect(page.getByText('100% (High Pos)')).toBeVisible();
  });

  test('TC-332 sentiment threshold midpoint', async ({ page }) => {
    await expect(page.getByText('0% (Neutral)')).toBeVisible();
  });

  test('TC-333 sentiment slider moves in steps of 1', async () => {
    await expect(alerts.sentimentSlider).toHaveAttribute('step', '1');
  });

  test('TC-336 call length minimum', async ({ page }) => {
    await expect(alerts.callLengthSlider).toHaveAttribute('min', '5');
    await expect(page.getByText('5m', { exact: true }).last()).toBeVisible();
  });

  test('TC-337 call length maximum', async ({ page }) => {
    await expect(alerts.callLengthSlider).toHaveAttribute('max', '120');
    await expect(page.getByText('120m', { exact: true }).last()).toBeVisible();
  });

  test('TC-338 call length midpoint', async ({ page }) => {
    await expect(page.getByText('60m', { exact: true }).last()).toBeVisible();
  });

  test('TC-339 sliders stay within their range', async () => {
    for (const slider of [alerts.sentimentSlider, alerts.callLengthSlider]) {
      const [value, min, max] = await slider.evaluate((e: HTMLInputElement) => [e.value, e.min, e.max].map(Number));
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
    }
  });

  test('TC-340 notification section is visible', async ({ page }) => {
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible();
    for (const label of ['In-App Dashboard Alert', 'Browser Push Notification', 'Email Notification']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('TC-347 disabled threshold cannot be changed', async ({ page }) => {
    // pretend the sentiment threshold is switched off (response is changed in the browser only)
    await page.route(SAVE_API, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const res = await route.fetch();
      const json = await res.json();
      json.default.sentimentEnabled = false;
      await route.fulfill({ response: res, json });
    });
    await alerts.goto();
    await expect(alerts.sentimentToggle).not.toBeChecked();
    await expect(alerts.sentimentSlider).toBeDisabled();
  });

  test('TC-348 settings persist after refresh', async ({ page }) => {
    const before = await alerts.snapshot();
    await page.reload();
    await expect(alerts.callLengthSlider).toBeVisible();
    expect(await alerts.snapshot()).toEqual(before);
  });

  test('TC-351 failed auto-save gives feedback', async ({ page }) => {
    // the save is answered with an error inside the browser; nothing reaches the server
    await page.route(SAVE_API, (route) =>
      route.request().method() === 'GET'
        ? route.fallback()
        : route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"test failure"}' }),
    );
    const before = await alerts.emailToggle.isChecked();
    await alerts.emailToggle.click({ force: true });
    const errorShown = page.getByText(/error|failed|could not|couldn't|unable|try again/i);
    await expect
      .poll(async () => (await errorShown.first().isVisible()) || (await alerts.emailToggle.isChecked()) === before, { timeout: 10_000 })
      .toBe(true);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.reload();
    await expect(alerts.emailToggle).toBeChecked({ checked: before });
  });

  test('TC-352 labels and units are shown (alignment: manual check)', async ({ page }) => {
    await expect(page.getByText('Sentiment Alert Threshold')).toBeVisible();
    await expect(page.getByText('Call Length Alert Threshold')).toBeVisible();
    await expect(page.getByText(/%\s*\(Neutral\)/)).toBeVisible();
    await expect(page.getByText('60m', { exact: true }).last()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests below change the live alert settings and put them back afterwards.
// ---------------------------------------------------------------------------
test.describe('Settings > Sentiment & Alerts (changes data)', () => {
  test.skip(!ALLOW_WRITES, WRITE_SKIP_REASON);

  let alerts: AlertsPage;
  let original: Awaited<ReturnType<AlertsPage['snapshot']>>;

  test.beforeEach(async ({ page }) => {
    alerts = new AlertsPage(page);
    await alerts.goto();
    original = await alerts.snapshot();
  });

  test.afterEach(async ({ page }) => {
    await alerts.goto();
    const now = await alerts.snapshot();
    const toggles: [keyof typeof now, Locator][] = [
      ['sentimentOn', alerts.sentimentToggle], ['callLengthOn', alerts.callLengthToggle],
      ['inApp', alerts.inAppToggle], ['browser', alerts.browserToggle], ['email', alerts.emailToggle],
    ];
    for (const [key, toggle] of toggles) {
      if (now[key] !== original[key]) await Promise.all([saved(page), toggle.click({ force: true })]);
    }
    for (const [key, slider] of [['sentiment', alerts.sentimentSlider], ['callLength', alerts.callLengthSlider]] as const) {
      if (now[key] !== original[key]) {
        // move back one step at a time with the keyboard, like a user would
        const step = Number(await slider.getAttribute('step')) || 1;
        const diff = (Number(original[key]) - Number(now[key])) / step;
        await slider.focus();
        for (let i = 0; i < Math.abs(diff); i++) await page.keyboard.press(diff > 0 ? 'ArrowRight' : 'ArrowLeft');
        await expect(slider).toHaveValue(original[key]);
        await page.waitForTimeout(2_000); // let the debounced auto-save finish
      }
    }
    await alerts.goto();
    expect(await alerts.snapshot()).toEqual(original);
  });

  async function flip(page: Page, toggle: Locator) {
    const was = await toggle.isChecked();
    await Promise.all([saved(page), toggle.click({ force: true })]);
    await expect(toggle).toBeChecked({ checked: !was });
    await Promise.all([saved(page), toggle.click({ force: true })]);
    await expect(toggle).toBeChecked({ checked: was });
  }

  test('TC-329 sentiment threshold toggle', async ({ page }) => flip(page, alerts.sentimentToggle));
  test('TC-335 call length threshold toggle', async ({ page }) => flip(page, alerts.callLengthToggle));
  test('TC-341 in-app dashboard alert toggle', async ({ page }) => flip(page, alerts.inAppToggle));
  test('TC-342 browser push notification toggle', async ({ page }) => flip(page, alerts.browserToggle));
  test('TC-343 email notification toggle', async ({ page }) => flip(page, alerts.emailToggle));

  test('TC-334 sentiment value updates when moved', async ({ page }) => {
    const before = Number(original.sentiment);
    await alerts.sentimentSlider.focus();
    await Promise.all([saved(page), page.keyboard.press(before < 100 ? 'ArrowRight' : 'ArrowLeft')]);
    await expect(alerts.sentimentSlider).toHaveValue(String(before < 100 ? before + 1 : before - 1));
  });

  test('TC-344 threshold changes auto-save', async ({ page }) => {
    const before = Number(original.callLength);
    const next = String(before < 120 ? before + 5 : before - 5);
    await alerts.callLengthSlider.focus();
    await Promise.all([saved(page), page.keyboard.press(before < 120 ? 'ArrowRight' : 'ArrowLeft')]);
    await page.reload();
    await expect(alerts.callLengthSlider).toHaveValue(next);
  });

  test('TC-345 notification changes auto-save', async ({ page }) => {
    await Promise.all([saved(page), alerts.emailToggle.click({ force: true })]);
    await page.reload();
    await expect(alerts.emailToggle).toBeChecked({ checked: !original.email });
  });

  test('TC-346 thresholds are independent', async ({ page }) => {
    const before = Number(original.sentiment);
    await alerts.sentimentSlider.focus();
    await Promise.all([saved(page), page.keyboard.press(before < 100 ? 'ArrowRight' : 'ArrowLeft')]);
    await page.reload();
    await expect(alerts.callLengthSlider).toHaveValue(original.callLength);
    await expect(alerts.callLengthToggle).toBeChecked({ checked: original.callLengthOn });
  });
});

// ---------------------------------------------------------------------------
// Tests that need their own login.
// ---------------------------------------------------------------------------
test.describe('Settings > Sentiment & Alerts with a fresh login', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.setTimeout(150_000); // logging in on this site is slow

  test('TC-349 settings persist across logout and login', async ({ page }) => {
    await login(page);
    const alerts = new AlertsPage(page);
    await alerts.goto();
    const before = await alerts.snapshot();
    await openCard(page);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/auth\//);
    await login(page);
    await alerts.goto();
    expect(await alerts.snapshot()).toEqual(before);
  });

  test('TC-350 non-admin cannot change alert settings', async ({ page }) => {
    test.skip(!process.env.SUPERVISOR_USER || !process.env.SUPERVISOR_PASS, 'Set SUPERVISOR_USER and SUPERVISOR_PASS in .env');
    await login(page, requireEnv('SUPERVISOR_USER'), requireEnv('SUPERVISOR_PASS'));
    await page.goto('/settings/sentiment');
    const alerts = new AlertsPage(page);
    // either the page is refused, or it loads with the defaults locked
    await expect
      .poll(async () => !page.url().includes('/settings/sentiment') || (await alerts.callLengthSlider.isVisible()), { timeout: 20_000 })
      .toBe(true);
    if (page.url().includes('/settings/sentiment')) {
      for (const s of await page.getByRole('switch').all()) await expect(s).toBeDisabled();
      for (const s of await page.getByRole('slider').all()) await expect(s).toBeDisabled();
    }
  });
});
