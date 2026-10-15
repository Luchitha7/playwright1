import { test as base, expect, Page, Response } from '@playwright/test';

// Settings tests run against production. Anything that saves data is
// skipped unless ALLOW_WRITES=true is set on purpose.
export const ALLOW_WRITES = process.env.ALLOW_WRITES === 'true';
export const WRITE_SKIP_REASON = 'Changes production data; run with ALLOW_WRITES=true';

// Read-only safety net: while ALLOW_WRITES is off, block every request that
// could change data. Login/logout and the user's own UI preferences
// (saved search/filter state) are still allowed.
const ALLOWED_WRITE_PATHS = /^\/api\/(auth\/|users\/me\/preferences\/)/;

export const test = base.extend<{ writeGuard: void }>({
  writeGuard: [
    async ({ context }, use) => {
      if (!ALLOW_WRITES) {
        await context.route('**/api/**', (route) => {
          const req = route.request();
          const path = new URL(req.url()).pathname;
          if (req.method() === 'GET' || ALLOWED_WRITE_PATHS.test(path)) return route.fallback();
          return route.abort('blockedbyclient');
        });
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };

// Navigates and returns the parsed JSON of the first GET to `apiPath`.
export async function gotoAndCapture<T = any>(page: Page, url: string, apiPath: string): Promise<T> {
  const isApi = (r: Response) =>
    r.request().method() === 'GET' && new URL(r.url()).pathname === apiPath && r.ok();
  // leave the current page first so a response from it can't be picked up
  await page.goto('about:blank');
  const [res] = await Promise.all([page.waitForResponse(isApi), page.goto(url)]);
  return res.json();
}

// Replaces the JSON body of GET `apiPath` for this page only.
export async function mockGet(page: Page, apiPath: string, body: unknown) {
  await page.route(
    (url) => url.pathname === apiPath,
    (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        : route.fallback(),
  );
}

// Initials the app shows in avatars: first letter of the first and last
// word, or the first two letters of a single word.
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  const raw = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
  return raw.toUpperCase();
}

// Some actions may ask for confirmation first; accept it if it appears.
export async function confirmIfAsked(page: Page) {
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'));
  const confirm = dialog.getByRole('button', { name: /^(confirm|yes|delete|save|ok|continue)/i });
  const asked = await confirm.first().waitFor({ timeout: 2_000 }).then(() => true, () => false);
  if (asked) {
    await confirm.first().click();
  }
}

// Search boxes and filters are saved to the user's preferences on the server.
// Runs `action` and waits for that save, so the next test starts clean.
export async function waitForPrefSave(page: Page, pref: string, action: () => Promise<unknown>) {
  const saved = page
    .waitForResponse((r) => r.url().includes(`/preferences/${pref}`) && r.request().method() === 'PUT', { timeout: 10_000 })
    .catch(() => null);
  await action();
  await saved;
}
