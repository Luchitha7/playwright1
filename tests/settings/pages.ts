import { Page, Locator, expect } from '@playwright/test';
import { waitForPrefSave } from './fixtures';

// Page objects for the Settings area. Selectors live here so specs stay readable.

export class SettingsHome {
  constructor(readonly page: Page) {}
  get heading() { return this.page.getByRole('heading', { name: 'Settings', level: 1 }); }
  get userManagementCard() { return this.page.getByRole('link', { name: /^User Management / }); }
  get keywordsCard() { return this.page.getByRole('link', { name: /^Keywords / }); }
  get sentimentCard() { return this.page.getByRole('link', { name: /^Sentiment & Alerts / }); }
  get usersLink() { return this.page.getByRole('main').getByRole('link', { name: 'Users', exact: true }); }
  get teamsLink() { return this.page.getByRole('main').getByRole('link', { name: 'Teams', exact: true }); }
  get rolesLink() { return this.page.getByRole('main').getByRole('link', { name: 'Roles', exact: true }); }

  async goto() {
    await this.page.goto('/settings');
    await expect(this.heading).toBeVisible();
  }
}

// Filter popover shared by the Users and Teams tables.
export class FilterPanel {
  constructor(readonly page: Page) {}
  get openButton() { return this.page.getByRole('button', { name: 'Open filters' }); }
  get panel() {
    return this.page
      .locator('[role=presentation]')
      .filter({ has: this.page.getByRole('button', { name: 'Apply' }) })
      .last();
  }
  get apply() { return this.panel.getByRole('button', { name: 'Apply' }); }
  get cancel() { return this.panel.getByRole('button', { name: 'Cancel' }); }
  get back() { return this.panel.getByRole('button').first(); }
  get checkboxes() { return this.panel.getByRole('checkbox'); }
  // most sections use checkboxes; Enable Login uses radio buttons
  get options() { return this.panel.getByRole('checkbox').or(this.panel.getByRole('radio')); }

  async open() {
    await this.openButton.click();
    await expect(this.apply).toBeVisible();
  }

  section(name: string) {
    return this.panel.getByText(name, { exact: true });
  }

  async openSection(name: string) {
    await this.section(name).click();
    await expect(this.options.first()).toBeVisible();
  }

  // Users filter: inside a section, Apply only confirms that section and goes
  // back to the section list; a second Apply applies the filters to the table.
  async confirmSection() {
    await this.apply.click();
    await expect(this.section('Team')).toBeVisible();
  }

  async applyFilters() {
    await this.apply.click();
    await expect(this.apply).toBeHidden();
  }

  // Untick everything in the open panel. Returns true if anything changed.
  async untickAll() {
    let changed = false;
    for (const box of await this.checkboxes.all()) {
      if (await box.isChecked()) { await box.uncheck(); changed = true; }
    }
    const all = this.panel.getByRole('radio', { name: 'All' });
    if ((await all.count()) && !(await all.isChecked())) { await all.check(); changed = true; }
    return changed;
  }
}

export class UsersTab {
  constructor(readonly page: Page) {}
  get tab() { return this.page.getByRole('tab', { name: 'Users' }); }
  get table() { return this.page.getByRole('grid', { name: 'Users table' }); }
  get rows() { return this.table.getByRole('rowgroup').getByRole('row'); }
  get search() { return this.page.getByRole('textbox', { name: 'Search users' }); }
  get summary() { return this.page.getByText(/^Showing \d+-\d+ of \d+$/); }
  get prev() { return this.page.getByRole('button', { name: 'Go to previous page' }); }
  get next() { return this.page.getByRole('button', { name: 'Go to next page' }); }
  get pageSize() { return this.page.getByText(/^\d+ per page$/); }
  get filters() { return new FilterPanel(this.page); }

  async goto() {
    await this.page.goto('/settings/users');
    await expect(this.table).toBeVisible();
  }

  rowFor(email: string): Locator {
    return this.rows.filter({ hasText: email });
  }

  // "Showing 1-6 of 6" -> { from: 1, to: 6, total: 6 }
  async counts() {
    const text = (await this.summary.textContent()) ?? '';
    const [, from, to, total] = text.match(/Showing (\d+)-(\d+) of (\d+)/)!.map(Number);
    return { from, to, total };
  }

  // Search and filters are saved to the user's preferences, so always reset them.
  async clearSearch() {
    if (await this.search.inputValue()) {
      await waitForPrefSave(this.page, 'users_search', () => this.search.fill(''));
    }
  }

  // "Clear all" chip shown above the table while any filter is active.
  // Only its x icon clears the filters; clicking the label does nothing.
  get clearAllFilters() {
    return this.page.locator('.MuiChip-root').filter({ hasText: /^Clear all$/ });
  }

  async resetFilters() {
    await expect(this.rows.first().or(this.page.getByText('No records found'))).toBeVisible();
    if (await this.clearAllFilters.isVisible()) {
      await waitForPrefSave(this.page, 'users_filters', () =>
        this.clearAllFilters.locator('.MuiChip-deleteIcon').click(),
      );
      await expect(this.clearAllFilters).toBeHidden();
    }
  }
}

export class TeamsTab {
  constructor(readonly page: Page) {}
  get tab() { return this.page.getByRole('tab', { name: 'Teams' }); }
  get table() { return this.page.getByRole('grid', { name: 'Teams table' }); }
  get rows() { return this.table.getByRole('rowgroup').getByRole('row'); }
  get search() { return this.page.getByRole('textbox', { name: 'Search teams' }); }
  get filters() { return new FilterPanel(this.page); }

  async goto() {
    await this.page.goto('/settings/users/teams');
    await expect(this.rows.first()).toBeVisible();
  }

  async clearSearch() {
    if (await this.search.inputValue()) {
      await waitForPrefSave(this.page, 'teams_search', () => this.search.fill(''));
    }
  }

  membersButton(team: string) {
    return this.table.getByRole('button', { name: new RegExp(`^View \\d+ members? of ${escapeRegExp(team)}$`) });
  }
}

export class RolesTab {
  constructor(readonly page: Page) {}
  get tab() { return this.page.getByRole('tab', { name: 'Roles' }); }
  get table() { return this.page.getByRole('grid', { name: 'Roles table' }); }
  get rows() { return this.table.getByRole('rowgroup').getByRole('row'); }

  async goto() {
    await this.page.goto('/settings/users/roles');
    await expect(this.table).toBeVisible();
  }

  row(role: string) {
    return this.rows.filter({ has: this.page.getByRole('paragraph').getByText(role, { exact: true }) });
  }

  usersButton(role: string) {
    return this.table.getByRole('button', { name: new RegExp(`^View \\d+ users? with role ${escapeRegExp(role)}$`) });
  }

  privilegesButton(role: string) {
    return this.table.getByRole('button', { name: new RegExp(`^View \\d+ privileges? of ${escapeRegExp(role)}$`) });
  }
}

export class KeywordsPage {
  constructor(readonly page: Page) {}
  get heading() { return this.page.getByRole('heading', { name: 'Keywords', level: 1 }); }
  get search() { return this.page.getByRole('textbox', { name: 'Search keywords…' }); }
  get addButton() { return this.page.getByRole('button', { name: 'Add keyword' }); }
  get bulkButton() { return this.page.getByRole('button', { name: 'Bulk add' }); }
  get exportButton() { return this.page.getByRole('button', { name: 'Export CSV' }); }
  get deleteButtons() { return this.page.getByRole('button', { name: 'Delete keyword' }); }
  get noMatch() { return this.page.getByText('No keywords match your search.'); }

  get addDialog() { return this.page.getByRole('dialog', { name: 'Add keyword' }); }
  get phrase() { return this.addDialog.getByRole('textbox', { name: 'Keyword phrase' }); }
  get create() { return this.addDialog.getByRole('button', { name: 'Create' }); }

  get bulkDialog() { return this.page.getByRole('dialog', { name: 'Bulk add keywords' }); }
  get bulkText() { return this.bulkDialog.getByRole('textbox', { name: /^Keywords \(comma/ }); }
  get bulkAdd() { return this.bulkDialog.getByRole('button', { name: 'Add', exact: true }); }

  async goto() {
    await this.page.goto('/settings/keywords');
    await expect(this.heading).toBeVisible();
  }

  // The keyword's card: the outermost block around the phrase that still
  // holds only one Delete button.
  item(phrase: string): Locator {
    return this.page
      .getByRole('main')
      .getByText(phrase, { exact: true })
      .first()
      .locator('xpath=ancestor::div[count(.//button[@aria-label="Delete keyword" or @title="Delete keyword" or normalize-space()="Delete keyword"])=1][last()]');
  }
}

export class AlertsPage {
  constructor(readonly page: Page) {}
  get heading() { return this.page.getByRole('heading', { name: 'Sentiment & Alerts', level: 1 }); }
  // The switches and sliders have no accessible names, so they're found by order on the page.
  get sentimentToggle() { return this.page.getByRole('switch').nth(0); }
  get callLengthToggle() { return this.page.getByRole('switch').nth(1); }
  get inAppToggle() { return this.page.getByRole('switch').nth(2); }
  get browserToggle() { return this.page.getByRole('switch').nth(3); }
  get emailToggle() { return this.page.getByRole('switch').nth(4); }
  get sentimentSlider() { return this.page.getByRole('slider').nth(0); }
  get callLengthSlider() { return this.page.getByRole('slider').nth(1); }

  async goto() {
    await this.page.goto('/settings/sentiment');
    await expect(this.heading).toBeVisible();
    await expect(this.callLengthSlider).toBeVisible();
  }

  async snapshot() {
    return {
      sentimentOn: await this.sentimentToggle.isChecked(),
      callLengthOn: await this.callLengthToggle.isChecked(),
      inApp: await this.inAppToggle.isChecked(),
      browser: await this.browserToggle.isChecked(),
      email: await this.emailToggle.isChecked(),
      sentiment: await this.sentimentSlider.inputValue(),
      callLength: await this.callLengthSlider.inputValue(),
    };
  }
}

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
