# cip-tests

Playwright end-to-end tests for the profile card, theme switching, and logout/session behaviour.

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

## Notes

- `tests/auth.setup.ts` logs in once and saves the session to `.auth/user.json`.
- Tests run with one worker because they share a single test account.
- Traces and screenshots from failed runs (`test-results/`, `playwright-report/`) may contain credentials.
