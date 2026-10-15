import { test, expect, gotoAndCapture } from './fixtures';
import { RolesTab, UsersTab } from './pages';

type UsersResponse = { data: { name: string; email: string; role: string }[] };

// System roles and their scope, as configured in the product.
const SYSTEM_ROLES = { Admin: 'ALL', Supervisor: 'TEAM', Agent: 'SELF' } as const;

test.describe('Settings > Roles', () => {
  let roles: RolesTab;
  let users: UsersResponse['data'];

  test.beforeEach(async ({ page }) => {
    roles = new RolesTab(page);
    users = (await gotoAndCapture<UsersResponse>(page, '/settings/users', '/api/users')).data;
    await roles.goto();
  });

  const countIn = async (button: ReturnType<RolesTab['usersButton']>) => Number(await button.textContent());

  test('TC-287 Roles tab opens', async ({ page }) => {
    await new UsersTab(page).goto();
    await roles.tab.click();
    await expect(page).toHaveURL(/\/settings\/users\/roles$/);
    await expect(roles.tab).toHaveAttribute('aria-selected', 'true');
  });

  test('TC-288 Roles table headers', async () => {
    for (const name of ['Role', 'Scope', 'Type', 'Privileges', 'Users']) {
      await expect(roles.table.getByRole('columnheader', { name, exact: true })).toBeVisible();
    }
  });

  test('TC-289 configured roles are displayed', async () => {
    for (const role of Object.keys(SYSTEM_ROLES)) await expect(roles.row(role)).toHaveCount(1);
  });

  test('TC-290 role scope and type', async () => {
    for (const [role, scope] of Object.entries(SYSTEM_ROLES)) {
      const cells = roles.row(role).getByRole('gridcell');
      await expect(cells.nth(1)).toHaveText(scope);
      await expect(cells.nth(2)).toHaveText('System');
    }
  });

  test('TC-291 role privilege count is shown', async () => {
    for (const role of Object.keys(SYSTEM_ROLES)) {
      expect(await countIn(roles.privilegesButton(role))).toBeGreaterThan(0);
    }
  });

  test('TC-292 role user count matches the Users list', async () => {
    for (const role of Object.keys(SYSTEM_ROLES)) {
      expect(await countIn(roles.usersButton(role))).toBe(users.filter((u) => u.role === role).length);
    }
  });

  test('TC-293 clicking the user count opens the role users', async ({ page }) => {
    await roles.usersButton('Agent').click();
    await expect(page.getByRole('dialog', { name: /^Agent · Users/ })).toBeVisible();
  });

  test('TC-294 role users modal columns', async ({ page }) => {
    await roles.usersButton('Agent').click();
    const dialog = page.getByRole('dialog', { name: /^Agent · Users/ });
    for (const name of ['Name', 'Number', 'Extension', 'Device']) {
      await expect(dialog.getByRole('columnheader', { name, exact: true })).toBeVisible();
    }
  });

  test('TC-295 role users modal lists only that role', async ({ page }) => {
    for (const role of Object.keys(SYSTEM_ROLES)) {
      await roles.usersButton(role).click();
      const dialog = page.getByRole('dialog', { name: new RegExp(`^${role} · Users`) });
      const expected = users.filter((u) => u.role === role);
      await expect(dialog.getByRole('rowgroup').nth(1).getByRole('row')).toHaveCount(expected.length);
      for (const u of expected) await expect(dialog.getByText(u.email, { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Close' }).click();
    }
  });

  test('TC-296 role users modal closes with X', async ({ page }) => {
    await roles.usersButton('Agent').click();
    const dialog = page.getByRole('dialog', { name: /^Agent · Users/ });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  test('TC-297 privileges are listed when clicked', async ({ page }) => {
    for (const role of Object.keys(SYSTEM_ROLES)) {
      const count = await countIn(roles.privilegesButton(role));
      await roles.privilegesButton(role).click();
      const dialog = page.getByRole('dialog', { name: new RegExp(`^${role} · Privileges`) });
      await expect(dialog.getByRole('columnheader', { name: 'Privilege' })).toBeVisible();
      await expect(dialog.getByRole('columnheader', { name: 'Description' })).toBeVisible();
      // privilege rows have two cells; group heading rows have one
      await expect(dialog.getByRole('row').filter({ has: page.getByRole('cell').nth(1) })).toHaveCount(count);
      await dialog.getByRole('button', { name: 'Close' }).click();
    }
  });
});
