# cip-tests

Playwright end-to-end tests for the profile card, theme switching, logout/session behaviour, and the Settings area.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # then fill in the values
```

All URLs, credentials, and expected account values come from `.env`.

## Running

```bash
npm test          # headless run
npm run test:ui   # Playwright UI mode
npm run report    # open the last HTML report
```

On Windows you can also double-click `run-tests.bat`.

Run one area only:

```bash
npx playwright test tests/settings
```

```bash
npx playwright test tests/settings/keywords.spec.ts
```

## Settings tests and production data

The Settings tests (`tests/settings/`) run against production, so by default they only look:

- Any request that would change data is blocked in the browser. Only login/logout and your own saved search/filter preferences go through.
- Tests that need to change data (role changes, keywords, alert settings) are skipped. To run them on purpose, set `ALLOW_WRITES=true` in `.env`. They put everything back afterwards, and keywords they create start with `pw-test-`.
- Tests for users without permission need `AGENT_USER`/`AGENT_PASS` and `SUPERVISOR_USER`/`SUPERVISOR_PASS`. They're skipped if those are empty.

Selectors for the Settings pages live in `tests/settings/pages.ts`.

## Notes

- `tests/auth.setup.ts` logs in once and saves the session to `.auth/user.json`.
- Tests run with one worker because they share a single test account.
- Traces and screenshots from failed runs (`test-results/`, `playwright-report/`) may contain credentials.
