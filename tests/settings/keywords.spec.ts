import fs from 'fs';
import { Page } from '@playwright/test';
import { test, expect, ALLOW_WRITES, WRITE_SKIP_REASON, gotoAndCapture, confirmIfAsked } from './fixtures';
import { KeywordsPage } from './pages';

type Keyword = { phrase: string; scope: string; departments: { name?: string }[] };
type KeywordsResponse = { totalElements: number; data: Keyword[] };

// Every keyword these tests create starts with this, so leftovers are easy to spot.
const PREFIX = 'pw-test-';
const unique = () => `${PREFIX}${Date.now()}`;

async function downloadCsv(page: Page, kw: KeywordsPage) {
  const [download] = await Promise.all([page.waitForEvent('download'), kw.exportButton.click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  return fs.readFileSync(await download.path(), 'utf8');
}

test.describe('Settings > Keywords', () => {
  let kw: KeywordsPage;
  let api: KeywordsResponse;

  test.beforeEach(async ({ page }) => {
    kw = new KeywordsPage(page);
    api = await gotoAndCapture<KeywordsResponse>(page, '/settings/keywords', '/api/keywords');
    await expect(kw.heading).toBeVisible();
  });

  test('TC-298 Keywords page opens', async ({ page }) => {
    await expect(page).toHaveURL(/\/settings\/keywords$/);
    await expect(page.getByText('Phrases the platform tracks across calls.', { exact: false })).toBeVisible();
  });

  test('TC-299 keyword page controls', async () => {
    for (const control of [kw.search, kw.addButton, kw.bulkButton, kw.exportButton]) {
      await expect(control).toBeVisible();
      await expect(control).toBeEnabled();
    }
  });

  test('TC-300 keyword list structure', async () => {
    await expect(kw.deleteButtons).toHaveCount(api.data.length);
    for (const k of api.data) {
      const item = kw.item(k.phrase);
      await expect(item.getByRole('button', { name: 'Edit keyword' })).toBeVisible();
      await expect(item.getByRole('button', { name: 'Delete keyword' })).toBeVisible();
    }
  });

  test('TC-301 global keywords show the Global scope', async () => {
    const globals = api.data.filter((k) => /global/i.test(k.scope));
    test.skip(globals.length === 0, 'No global keywords exist');
    for (const k of globals) await expect(kw.item(k.phrase)).toContainText('Global');
  });

  test('TC-302 team-specific keywords show their teams', async () => {
    const specific = api.data.filter((k) => !/global/i.test(k.scope));
    test.skip(specific.length === 0, 'No team-specific keywords exist');
    for (const k of specific) {
      await expect(kw.item(k.phrase)).not.toContainText('Global');
      for (const d of k.departments) if (d.name) await expect(kw.item(k.phrase)).toContainText(d.name);
    }
  });

  test('TC-303 search exact keyword', async () => {
    const phrase = api.data[0].phrase;
    await kw.search.fill(phrase);
    await expect(kw.item(phrase)).toBeVisible();
    for (const k of api.data.filter((x) => !x.phrase.toLowerCase().includes(phrase.toLowerCase()))) {
      await expect(kw.page.getByText(k.phrase, { exact: true })).toBeHidden();
    }
  });

  test('TC-304 search partial keyword', async () => {
    const part = api.data[0].phrase.slice(0, 2).toLowerCase();
    await kw.search.fill(part);
    const expected = api.data.filter((k) => k.phrase.toLowerCase().includes(part));
    await expect(kw.deleteButtons).toHaveCount(expected.length);
  });

  test('TC-305 search with no match', async () => {
    await kw.search.fill('zz-no-such-keyword-zz');
    await expect(kw.noMatch).toBeVisible();
    await expect(kw.deleteButtons).toHaveCount(0);
  });

  test('TC-306 clearing search restores the full list', async () => {
    await kw.search.fill('zz-no-such-keyword-zz');
    await expect(kw.noMatch).toBeVisible();
    await kw.search.fill('');
    await expect(kw.deleteButtons).toHaveCount(api.data.length);
  });

  test('TC-307 Add keyword dialog opens', async () => {
    await kw.addButton.click();
    await expect(kw.addDialog).toBeVisible();
  });

  test('TC-308 Add keyword dialog default state', async () => {
    await kw.addButton.click();
    await expect(kw.phrase).toHaveValue('');
    await expect(kw.addDialog.getByRole('radio', { name: 'Global (all teams)' })).toBeChecked();
    await expect(kw.addDialog.getByRole('radio', { name: 'Specific teams' })).not.toBeChecked();
    await expect(kw.create).toBeDisabled();
    await expect(kw.addDialog.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  test('TC-309 blank keyword phrase cannot be created', async () => {
    await kw.addButton.click();
    await expect(kw.create).toBeDisabled();
    await kw.phrase.fill('    ');
    await expect(kw.create).toBeDisabled();
  });

  test('TC-312 Specific teams needs a team before Create', async () => {
    await kw.addButton.click();
    await kw.phrase.fill(unique());
    await kw.addDialog.getByRole('radio', { name: 'Specific teams' }).check();
    await expect(kw.addDialog.getByRole('combobox', { name: 'Teams' })).toBeVisible();
    await expect(kw.create).toBeDisabled();
  });

  test('TC-313 Cancel closes Add keyword without saving', async () => {
    const phrase = unique();
    await kw.addButton.click();
    await kw.phrase.fill(phrase);
    await kw.addDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(kw.addDialog).toBeHidden();
    await expect(kw.page.getByText(phrase, { exact: true })).toBeHidden();
  });

  test('TC-318 Bulk add opens', async () => {
    await kw.bulkButton.click();
    await expect(kw.bulkDialog).toBeVisible();
    await expect(kw.bulkText).toBeVisible();
    await expect(kw.bulkAdd).toBeDisabled();
  });

  test('TC-323 export keyword list to CSV', async ({ page }) => {
    const csv = await downloadCsv(page, kw);
    for (const k of api.data) expect(csv).toContain(k.phrase);
  });

  test('TC-324 CSV export follows the search filter', async ({ page }) => {
    const phrase = api.data[0].phrase;
    await kw.search.fill(phrase);
    await expect(kw.item(phrase)).toBeVisible();
    const csv = await downloadCsv(page, kw);
    expect(csv).toContain(phrase);
    for (const k of api.data.filter((x) => !x.phrase.toLowerCase().includes(phrase.toLowerCase()))) {
      expect(csv).not.toContain(k.phrase);
    }
  });

  test('TC-325 keywords persist after refresh', async ({ page }) => {
    await page.reload();
    for (const k of api.data) await expect(page.getByText(k.phrase, { exact: true })).toBeVisible();
  });

});

// ---------------------------------------------------------------------------
// Tests below create keywords on production and delete them afterwards.
// ---------------------------------------------------------------------------
test.describe('Settings > Keywords (changes data)', () => {
  test.skip(!ALLOW_WRITES, WRITE_SKIP_REASON);

  let kw: KeywordsPage;
  const created: string[] = [];

  test.beforeEach(async ({ page }) => {
    kw = new KeywordsPage(page);
    await kw.goto();
  });

  test.afterEach(async () => {
    await kw.goto();
    for (const phrase of created.splice(0)) {
      const item = kw.item(phrase);
      if (await item.count()) {
        await item.getByRole('button', { name: 'Delete keyword' }).click();
        await confirmIfAsked(kw.page);
        await expect(kw.page.getByText(phrase, { exact: true })).toBeHidden();
      }
    }
  });

  async function add(phrase: string, opts: { team?: boolean } = {}) {
    await kw.addButton.click();
    await kw.phrase.fill(phrase);
    if (opts.team) {
      await kw.addDialog.getByRole('radio', { name: 'Specific teams' }).check();
      await kw.addDialog.getByRole('combobox', { name: 'Teams' }).click();
      await kw.page.getByRole('option').first().click();
      await kw.page.keyboard.press('Escape');
    }
    created.push(phrase.trim());
    await kw.create.click();
  }

  test('TC-310 create a global keyword', async () => {
    const phrase = unique();
    await add(phrase);
    await expect(kw.addDialog).toBeHidden();
    await expect(kw.item(phrase)).toContainText('Global');
  });

  test('TC-311 create a team-specific keyword', async () => {
    const phrase = unique();
    await add(phrase, { team: true });
    await expect(kw.addDialog).toBeHidden();
    await expect(kw.item(phrase)).not.toContainText('Global');
  });

  test('TC-314 duplicate keyword is prevented', async () => {
    const phrase = unique();
    await add(phrase);
    await expect(kw.item(phrase)).toBeVisible();
    await add(phrase.toUpperCase());
    created.push(phrase.toUpperCase());
    await expect(kw.page.getByText(/already exists|duplicate/i)).toBeVisible();
    await kw.page.keyboard.press('Escape');
    await kw.goto();
    await expect(kw.page.getByText(new RegExp(`^${phrase}$`, 'i'))).toHaveCount(1);
  });

  test('TC-315 leading/trailing whitespace is trimmed', async () => {
    const phrase = unique();
    await add(`   ${phrase}   `);
    await expect(kw.page.getByText(phrase, { exact: true })).toBeVisible();
    await expect(kw.page.getByText(`   ${phrase}   `, { exact: true })).toHaveCount(0);
  });

  test('TC-316 keyword length is limited', async () => {
    const long = unique() + 'x'.repeat(500);
    await kw.addButton.click();
    await kw.phrase.fill(long);
    const typed = await kw.phrase.inputValue();
    if (typed.length < long.length) return; // the input itself enforces a limit
    created.push(long);
    await kw.create.click();
    await expect(kw.page.getByText(/too long|maximum|at most|characters/i)).toBeVisible();
  });

  test('TC-317 special characters are handled', async () => {
    const phrase = `${unique()} & "quotes" 'it's' 50% ñ`;
    await add(phrase);
    await expect(kw.page.getByText(phrase, { exact: true })).toBeVisible();
  });

  test('TC-319 bulk add multiple keywords', async () => {
    const a = unique() + '-a', b = unique() + '-b';
    created.push(a, b);
    await kw.bulkButton.click();
    await kw.bulkText.fill(`${a}, ${b}`);
    await kw.bulkAdd.click();
    await expect(kw.page.getByText(a, { exact: true })).toBeVisible();
    await expect(kw.page.getByText(b, { exact: true })).toBeVisible();
  });

  test('TC-320 bulk add ignores blank lines', async () => {
    const a = unique() + '-a', b = unique() + '-b';
    created.push(a, b);
    await kw.bulkButton.click();
    await kw.bulkText.fill(`${a}\n\n\n${b}\n`);
    await kw.bulkAdd.click();
    await expect(kw.page.getByText(a, { exact: true })).toBeVisible();
    await expect(kw.page.getByText(b, { exact: true })).toBeVisible();
  });

  test('TC-321 bulk add handles duplicate entries', async () => {
    const a = unique() + '-dup';
    created.push(a);
    await kw.bulkButton.click();
    await kw.bulkText.fill(`${a}\n${a}\n${a}`);
    await kw.bulkAdd.click();
    await expect(kw.bulkDialog).toBeHidden();
    await expect(kw.page.getByText(a, { exact: true })).toHaveCount(1);
  });

  test('TC-322 bulk add rejects input with no keywords', async () => {
    const before = await kw.deleteButtons.count();
    await kw.bulkButton.click();
    await kw.bulkText.fill(' , ,\n\n , ');
    if (await kw.bulkAdd.isEnabled()) {
      await kw.bulkAdd.click();
      await expect(kw.page.getByText(/no (valid )?keywords|enter at least|required|invalid/i)).toBeVisible();
    }
    await kw.goto();
    await expect(kw.deleteButtons).toHaveCount(before);
  });

  test('TC-326 script-like input is shown as text, not run', async ({ page }) => {
    const phrase = `${unique()}<img src=x onerror="window.__pwXss=1"><script>window.__pwXss=1</script>`;
    let alerted = false;
    page.on('dialog', (d) => { alerted = true; d.dismiss(); });
    await add(phrase);
    await kw.goto();
    await expect(page.getByText(phrase, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__pwXss)).toBeUndefined();
    expect(alerted).toBe(false);
  });
});
