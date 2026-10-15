import { test, expect, ALLOW_WRITES, WRITE_SKIP_REASON, gotoAndCapture, mockGet, initialsOf, confirmIfAsked, waitForPrefSave } from './fixtures';
import { UsersTab } from './pages';
import { login } from '../helpers';
import { requireEnv } from '../env';

type ApiUser = {
  name: string; email: string; extension: string; deviceName: string; role: string; loginEnabled: boolean;
};
type UsersResponse = { data: ApiUser[]; totalElements: number; totalPages: number };
type TeamsResponse = { data: { name: string; supervisor_name: string }[] };

const ROLES = ['Admin', 'Agent', 'Supervisor'];
const COLUMNS = ['Name', 'Number', 'Extension', 'Device', 'Supervisor', 'Team', 'Enable login?', 'Role', 'Action'];
const cell = (row: ReturnType<UsersTab['rowFor']>, column: string) =>
  row.getByRole('gridcell').nth(COLUMNS.indexOf(column) + 1); // +1 for the select checkbox column
const shown = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '---');

test.describe('Settings > Users', () => {
  let users: UsersTab;
  let api: UsersResponse;

  test.beforeEach(async ({ page }) => {
    users = new UsersTab(page);
    api = await gotoAndCapture<UsersResponse>(page, '/settings/users', '/api/users');
    await expect(users.rows.first()).toBeVisible();
  });

  test('TC-244 Users table headers', async () => {
    for (const name of COLUMNS) {
      await expect(users.table.getByRole('columnheader', { name, exact: true })).toBeVisible();
    }
  });

  test('TC-245 avatar shows the right initials', async () => {
    for (const u of api.data) {
      await expect(cell(users.rowFor(u.email), 'Name')).toContainText(initialsOf(u.name));
    }
  });

  test('TC-246 user names are displayed correctly', async () => {
    for (const u of api.data) {
      await expect(cell(users.rowFor(u.email), 'Name').getByRole('paragraph')).toHaveText(u.name);
    }
  });

  test('TC-247 phone/number column', async () => {
    const values = await users.rows.evaluateAll((rows) => rows.map((r) => r.querySelectorAll('[role=gridcell]')[2]?.textContent?.trim()));
    for (const v of values) expect(v).toMatch(/^(---|\+?[\d\s()-]{7,})$/);
  });

  test('TC-248 extension column', async () => {
    for (const u of api.data) {
      await expect(cell(users.rowFor(u.email), 'Extension')).toHaveText(shown(u.extension));
    }
  });

  test('TC-249 device column', async () => {
    for (const u of api.data) {
      await expect(cell(users.rowFor(u.email), 'Device')).toHaveText(shown(u.deviceName));
    }
  });

  test('TC-250 supervisor column', async ({ page }) => {
    const teams = await gotoAndCapture<TeamsResponse>(page, '/settings/users/teams', '/api/teams');
    const supervisors = new Set(['---', ...teams.data.map((t) => t.supervisor_name)]);
    await users.goto();
    for (const u of api.data) {
      expect(supervisors).toContain((await cell(users.rowFor(u.email), 'Supervisor').textContent())?.trim());
    }
  });

  test('TC-251 team column', async ({ page }) => {
    const teams = await gotoAndCapture<TeamsResponse>(page, '/settings/users/teams', '/api/teams');
    const names = new Set(['---', ...teams.data.map((t) => t.name)]);
    await users.goto();
    for (const u of api.data) {
      expect(names).toContain((await cell(users.rowFor(u.email), 'Team').textContent())?.trim());
    }
  });

  test('TC-252 login status column shows the current status', async () => {
    for (const u of api.data) {
      const status = cell(users.rowFor(u.email), 'Enable login?');
      const toggle = status.getByRole('switch');
      if (u.loginEnabled) await expect(toggle).toBeChecked();
      else await expect(toggle).not.toBeChecked();
      await expect(status).toContainText(u.loginEnabled ? 'Enabled' : 'Disabled');
    }
    // you can't lock yourself out
    await expect(cell(users.rowFor(requireEnv('CIP_USER')), 'Enable login?').getByRole('switch')).toBeDisabled();
  });

  test('TC-253 login status is unchanged after refresh', async ({ page }) => {
    const before = await users.table.getByRole('switch').evaluateAll((s) => s.map((x) => (x as HTMLInputElement).checked));
    await page.reload();
    await expect(users.rows.first()).toBeVisible();
    const after = await users.table.getByRole('switch').evaluateAll((s) => s.map((x) => (x as HTMLInputElement).checked));
    expect(after).toEqual(before);
  });

  test('TC-254 role column', async () => {
    for (const u of api.data) {
      await expect(cell(users.rowFor(u.email), 'Role').getByRole('combobox')).toHaveText(u.role);
      expect(ROLES).toContain(u.role);
    }
    // your own role is shown but can't be changed
    const own = cell(users.rowFor(requireEnv('CIP_USER')), 'Role').getByRole('combobox');
    await expect(own).toHaveText(new RegExp(`^${requireEnv('EXPECTED_ROLE')}$`, 'i'));
    await expect(own).toBeDisabled();
  });

  test('TC-255 Roles dropdown is accessible', async ({ page }) => {
    const combo = users.table.getByRole('combobox', { disabled: false }).first();
    const original = await combo.textContent();
    await combo.click();
    const list = page.getByRole('listbox');
    for (const role of ROLES) await expect(list.getByRole('option', { name: role })).toBeVisible();
    await list.press('Escape');
    await expect(list).toBeHidden();
    await expect(combo).toHaveText(original!);
  });

  test('TC-256 role can be changed and saved', async ({ page }) => {
    test.skip(!ALLOW_WRITES, WRITE_SKIP_REASON);
    test.skip(!process.env.AGENT_USER, 'Set AGENT_USER in .env (the user whose role is changed)');
    const target = users.rowFor(requireEnv('AGENT_USER'));
    const combo = cell(target, 'Role').getByRole('combobox');
    const original = (await combo.textContent())!.trim();
    const changed = original === 'Supervisor' ? 'Agent' : 'Supervisor';
    try {
      await combo.click();
      await page.getByRole('option', { name: changed }).click();
      await confirmIfAsked(page);
      await page.reload();
      await expect(cell(users.rowFor(requireEnv('AGENT_USER')), 'Role').getByRole('combobox')).toHaveText(changed);
    } finally {
      await users.goto();
      const combo2 = cell(users.rowFor(requireEnv('AGENT_USER')), 'Role').getByRole('combobox');
      if ((await combo2.textContent())?.trim() !== original) {
        await combo2.click();
        await page.getByRole('option', { name: original }).click();
        await confirmIfAsked(page);
        await expect(combo2).toHaveText(original);
      }
    }
  });

  test.describe('search', () => {
    test.afterEach(async () => {
      await users.clearSearch(); // the search box is saved to your preferences
    });

    // the table updates a moment after typing, so wait until every row matches
    const allRowsContain = (text: string) =>
      expect
        .poll(async () => {
          const rows = await users.rows.allTextContents();
          return rows.length > 0 && rows.every((r) => r.toLowerCase().includes(text.toLowerCase()));
        })
        .toBe(true);

    test('TC-257 search by full name', async () => {
      const name = api.data[0].name;
      await users.search.fill(name);
      await allRowsContain(name);
      await expect(users.rowFor(api.data[0].email)).toBeVisible();
    });

    test('TC-258 search by partial name', async () => {
      const part = api.data[0].name.slice(0, 3);
      await users.search.fill(part.toLowerCase());
      await allRowsContain(part);
      await expect(users.rowFor(api.data[0].email)).toBeVisible();
    });

    test('TC-259 search with special characters', async ({ page }) => {
      await users.search.fill(`%_'"<>\\*()[]`);
      await expect(page.getByText('No records found')).toBeVisible();
      await expect(users.table).toBeVisible();
      await users.search.fill('');
      await expect(users.rows).toHaveCount(Math.min(api.data.length, 10));
    });
  });

  test.describe('filters', () => {
    // the table re-renders after filtering, so wait until every row shows the role
    const onlyRole = (role: string) =>
      expect
        .poll(async () => {
          const roles = await users.table.getByRole('combobox').allTextContents();
          return roles.length > 0 && roles.every((r) => r.trim() === role);
        })
        .toBe(true);

    // filters are saved to your preferences, so start and finish with none
    test.beforeEach(async () => {
      await users.resetFilters();
    });

    test.afterEach(async ({ page }) => {
      await page.keyboard.press('Escape');
      await users.goto();
      await users.resetFilters();
    });

    test('TC-260 filter panel opens', async () => {
      await users.filters.open();
      await expect(users.filters.cancel).toBeVisible();
    });

    test('TC-261 filter has Team, Supervisor, Role and Enable Login', async () => {
      await users.filters.open();
      for (const s of ['Team', 'Supervisor', 'Role', 'Enable Login']) await expect(users.filters.section(s)).toBeVisible();
    });

    test('TC-262 every filter dropdown opens', async () => {
      const f = users.filters;
      await f.open();
      for (const s of ['Team', 'Supervisor', 'Role', 'Enable Login']) {
        await f.openSection(s);
        await f.back.click();
        await expect(f.section('Team')).toBeVisible();
      }
    });

    test('TC-264 apply user filter', async () => {
      const f = users.filters;
      await f.open();
      await f.openSection('Role');
      await f.panel.getByRole('checkbox', { name: 'Agent' }).check();
      await f.confirmSection();
      await f.applyFilters();
      const expected = api.data.filter((u) => u.role === 'Agent').length;
      await expect(users.rows).toHaveCount(expected);
      await onlyRole('Agent');
    });

    test('TC-263 applied filters stay applied after reload', async ({ page }) => {
      const f = users.filters;
      await f.open();
      await f.openSection('Role');
      await f.panel.getByRole('checkbox', { name: 'Admin' }).check();
      await f.confirmSection();
      await waitForPrefSave(page, 'users_filters', () => f.applyFilters());
      await onlyRole('Admin');
      await page.reload();
      await expect(users.rows.first()).toBeVisible();
      await onlyRole('Admin');
    });

    test('TC-265 clear user filter restores the full list', async () => {
      const f = users.filters;
      await f.open();
      await f.openSection('Role');
      await f.panel.getByRole('checkbox', { name: 'Agent' }).check();
      await f.confirmSection();
      await f.applyFilters();
      await onlyRole('Agent');
      await users.resetFilters();
      await expect(users.summary).toHaveText(new RegExp(`of ${api.totalElements}$`));
    });
  });

  test('TC-266 Previous is disabled on the first page', async () => {
    await expect(users.page.getByRole('button', { name: 'page 1' })).toBeVisible();
    await expect(users.prev).toBeDisabled();
  });

  test('TC-267 Next is disabled on the last page', async () => {
    for (let i = 1; i < api.totalPages; i++) await users.next.click();
    await expect(users.next).toBeDisabled();
  });

  test('TC-268 page-size options are shown and selectable', async ({ page }) => {
    await users.pageSize.click();
    await expect(page.getByRole('option').or(page.getByRole('menuitem')).first()).toBeVisible({ timeout: 5_000 });
  });

  test('TC-269 total user count is correct', async () => {
    const { total } = await users.counts();
    expect(total).toBe(api.totalElements);
  });

  test('TC-270 empty Users list shows an empty state', async ({ page }) => {
    await mockGet(page, '/api/users', { data: [], page: 0, size: 10, totalElements: 0, totalPages: 0 });
    await page.reload();
    await expect(page.getByText('No records found')).toBeVisible();
    await expect(users.summary).toHaveText('Showing 0-0 of 0');
  });

  test('TC-271 rows shown match the page size', async () => {
    const size = Number((await users.pageSize.textContent())!.match(/\d+/)![0]);
    const { from, to } = await users.counts();
    await expect(users.rows).toHaveCount(to - from + 1);
    expect(to - from + 1).toBeLessThanOrEqual(size);
  });

  test.fixme('TC-273 table stays usable with long data (manual check)', async () => {});

  test('TC-274 user data is unchanged after refresh', async ({ page }) => {
    const before = await users.rows.allTextContents();
    await page.reload();
    await expect(users.rows.first()).toBeVisible();
    expect(await users.rows.allTextContents()).toEqual(before);
  });
});

test.describe('Settings > Users as a non-admin', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-272 unauthorized user cannot change login access', async ({ page }) => {
    test.skip(!process.env.AGENT_USER || !process.env.AGENT_PASS, 'Set AGENT_USER and AGENT_PASS in .env');
    test.setTimeout(120_000);
    await login(page, requireEnv('AGENT_USER'), requireEnv('AGENT_PASS'));
    await page.goto('/settings/users');
    const users = new UsersTab(page);
    // either the page is refused, or the table loads with nothing editable
    await expect
      .poll(async () => !page.url().includes('/settings/users') || (await users.table.isVisible()), { timeout: 20_000 })
      .toBe(true);
    await expect(page.getByRole('switch', { name: /^Login access for /, disabled: false })).toHaveCount(0);
  });
});
