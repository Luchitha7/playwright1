import { test, expect, gotoAndCapture, mockGet, waitForPrefSave } from './fixtures';
import { TeamsTab, UsersTab, escapeRegExp } from './pages';

type Team = { name: string; supervisor_name: string; member_count: number };
type TeamsResponse = { totalElements: number; data: Team[] };

test.describe('Settings > Teams', () => {
  let teams: TeamsTab;
  let api: TeamsResponse;

  test.beforeEach(async ({ page }) => {
    teams = new TeamsTab(page);
    api = await gotoAndCapture<TeamsResponse>(page, '/settings/users/teams', '/api/teams');
    await expect(teams.rows.first()).toBeVisible();
  });

  const rowOf = (team: string) =>
    teams.rows.filter({ has: teams.page.getByRole('gridcell').first().getByText(team, { exact: true }) });

  test('TC-275 Teams tab opens', async ({ page }) => {
    const users = new UsersTab(page);
    await users.goto();
    await teams.tab.click();
    await expect(page).toHaveURL(/\/settings\/users\/teams$/);
    await expect(teams.tab).toHaveAttribute('aria-selected', 'true');
    await expect(teams.table).toBeVisible();
  });

  test('TC-276 Teams table headers', async () => {
    for (const name of ['Team Name', 'Supervisor', 'Members']) {
      await expect(teams.table.getByRole('columnheader', { name, exact: true })).toBeVisible();
    }
  });

  test('TC-277 team names display correctly', async () => {
    await expect(teams.rows).toHaveCount(api.data.length);
    for (const t of api.data) await expect(rowOf(t.name)).toHaveCount(1);
  });

  test('TC-278 supervisor per team', async () => {
    for (const t of api.data) {
      await expect(rowOf(t.name).getByRole('gridcell').nth(1)).toContainText(t.supervisor_name || '---');
    }
  });

  test('TC-279 team member count', async () => {
    for (const t of api.data) await expect(teams.membersButton(t.name)).toHaveText(String(t.member_count));
  });

  test('TC-280 clicking the member count shows the team members', async ({ page }) => {
    const t = api.data.find((x) => x.member_count > 0);
    test.skip(!t, 'No team has members');
    await teams.membersButton(t!.name).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(`^${escapeRegExp(t!.name)} · Members`) });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('rowgroup').nth(1).getByRole('row')).toHaveCount(t!.member_count);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  test('TC-281 empty Teams list shows an empty state', async ({ page }) => {
    await mockGet(page, '/api/teams', { totalElements: 0, data: [] });
    await page.reload();
    await expect(teams.table).toBeVisible();
    await expect(teams.rows.filter({ has: page.getByRole('button', { name: /^View \d+ member/ }) })).toHaveCount(0);
    await expect(page.getByText(/no (records|teams|results)/i)).toBeVisible();
  });

  test.describe('search', () => {
    test.afterEach(async () => {
      await teams.clearSearch(); // saved to your preferences
    });

    test('TC-282 team search shows matching teams', async () => {
      const name = api.data[0].name;
      const part = name.slice(0, 4).toLowerCase();
      await teams.search.fill(part);
      await expect
        .poll(async () => (await teams.rows.allTextContents()).every((r) => r.toLowerCase().includes(part)))
        .toBe(true);
      await expect(rowOf(name)).toBeVisible();
    });
  });

  test('TC-283 team data is unchanged after refresh', async ({ page }) => {
    const before = await teams.rows.allTextContents();
    await page.reload();
    await expect(teams.rows.first()).toBeVisible();
    expect(await teams.rows.allTextContents()).toEqual(before);
  });

  test.describe('filter', () => {
    test.afterEach(async ({ page }) => {
      // the filter is saved to your preferences: untick everything and apply
      await page.keyboard.press('Escape');
      await teams.goto();
      await teams.filters.open();
      if (await teams.filters.untickAll()) await waitForPrefSave(page, 'teams_filters', () => teams.filters.apply.click());
      else await teams.filters.cancel.click();
    });

    test('TC-284 filter Apply saves and Cancel discards', async () => {
      const f = teams.filters;
      const supervisor = api.data[0].supervisor_name;
      const expected = api.data.filter((t) => t.supervisor_name === supervisor).length;

      await f.open();
      await f.panel.getByRole('checkbox', { name: supervisor }).check();
      await f.cancel.click();
      await expect(f.apply).toBeHidden();
      await expect(teams.rows).toHaveCount(api.data.length);

      await f.open();
      await f.panel.getByRole('checkbox', { name: supervisor }).check();
      await f.apply.click();
      await expect(teams.rows).toHaveCount(expected);
    });

    test('TC-285 filter back button returns to the page', async () => {
      const f = teams.filters;
      await f.open();
      await f.back.click();
      await expect(f.apply).toBeHidden();
      await expect(teams.table).toBeVisible();
    });

    test('TC-286 checkboxes can be ticked, unticked and applied', async () => {
      const f = teams.filters;
      await f.open();
      const box = f.checkboxes.first();
      await box.check();
      await expect(box).toBeChecked();
      await box.uncheck();
      await expect(box).not.toBeChecked();
      await box.check();
      await f.apply.click();
      await expect(teams.rows.first()).toBeVisible();
    });
  });
});
