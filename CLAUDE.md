# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LATS Go! is a Chrome extension that enhances the NY State Leave and Accrual Tracking System (LATS) timesheet interface. It provides automated timecard filling, custom schedule settings, and session error recovery. Published on the [Chrome Web Store](https://chromewebstore.google.com/detail/lats-go-%F0%9F%8E%89/obdmohilnmnjkdjgkbcjfaifiilikhip).

## Commands

```bash
npm install           # Install ESLint, Vitest, and jsdom
npm run lint          # Lint scripts/ and tests/ with ESLint
npm run lint:fix      # Auto-fix lint issues
npm test              # Vitest: unit tests for utils.js, jsdom integration tests for the content scripts
```

No build step — files are loaded directly as an unpacked extension.

## Development

1. Load unpacked extension in Chrome at `chrome://extensions/` with Developer mode enabled
2. Point to this folder
3. Reload extension after code changes

## Architecture

Chrome Manifest V3 extension. No bundler, no framework — plain vanilla JS with DOM manipulation.

### Script Loading & Shared Code

`scripts/shared/utils.js` is loaded via the manifest as a content script before `lats-restyle.js` and `content.js`. It defines one global, `LatsGo`, with the shared constants and pure functions: settings defaults, `migrateSettings`/`loadSettings`/`saveSettings`, time parsing and formatting, `validateTimeOrder` (L4), `planDay` (partial-day leave, SCHED-5), `parsePeriodRange`, `inferDate`, `findStateHolidays`, `findTimesheetStatus`, `formatList`, `formatHolidayList`, `holidayCalendarUrl`, and TDS helpers. It also holds the DOM helpers every page shares: `el`, `icon`, `alert`, `setText`, `setFlag`, `callPage` (requests to page-bridge.js), `whenLatsReady`, `isOwnMutation`, `onLatsChange` and its `TDS_GRID` selector, `pageHolidays`, and the TDS footer and hidden-field readers (`tdsFooterTables`, `tdsDayCells`, `readTdsRowFields`). Don't copy these into a script; add to `LatsGo` instead. `LatsGo` is the only ESLint global in `.eslintrc.json`. The popup and options pages load utils.js via `<script>` tags in their HTML files. utils.js also sets `module.exports` when `module` exists, so Vitest can `require` it.

**There are no ES module imports** in extension code — all cross-file sharing is via script tag ordering and global scope.

### Own nodes and LATS re-renders

- **Build every node LATS Go! adds to a LATS page with `LatsGo.el()`, `LatsGo.icon()`, or `LatsGo.alert()`.** Never use `createElement` or `innerHTML` for them. `el()` and `icon()` stamp `data-lg` on each node they create, and `alert()` builds with them.
- **`LatsGo.isOwnMutation(mutation)` reads that stamp.** A mutation is LATS Go!'s own when its target is inside a stamped node, when every node it adds or removes is stamped, or when it moves LATS nodes into a stamped node (such as a day's warning link). A LATS node that only carries an `lg-` class doesn't count.
- **`LatsGo.onLatsChange(regions, callback, { tdsRowFields })` runs `callback` after LATS changes part of the page.** One `MutationObserver` on `document.body` serves every subscriber. Each subscriber has its own `regions` selector, and they share one debounce that waits for a burst of changes to settle. Callbacks run in the order they subscribed, so lats-restyle.js decorates before content.js reads the grid. LATS Go!'s own changes don't count.
  - `LatsGo.TDS_GRID` selects the TDS header, rows, and footer (`#gridHeader, #distributionRows, #tdsFooter`).
  - With `tdsRowFields: true`, a new value in a TDS row's hidden fields also counts. utils.js keeps that field list in `TDS_ROW_FIELDS`, which isn't exported; `readTdsRowFields` reads the same list.
- **Make every decoration safe to run again** on any mix of new and decorated nodes. Check for the decoration itself, such as `colgroup.lg-colgroup`, not a marker attribute, because LATS can rewrite a node's contents and keep the node.

### Content Scripts (Page-Specific)
- **scripts/content.js** — Injected on `/Time*`, which covers the timesheet and `TimeDistribution` (TDS) pages. Wrapped in an IIFE with a `window.latsGoInitialized` guard.
  - Timesheet: the Fill Timecard dialog (native `<dialog>`, week table). It reads days from input titles (`{Row} Day {index} {Weekday}`), dates from the period header, and state holidays from "Holiday - MM/DD/YYYY" notices (`LatsGo.pageHolidays()`). It polls for `#btnSaveTimesheet_0`; if the Save button never appears and the time inputs are read-only, it shows the locked-period callout (FLOW-1) instead.
  - TDS: the live Remaining row and the footer's mismatch marks (TDS-2), and Copy rows from last period (TDS-1). Rows from every TDS page are cached in `chrome.storage.local` under `tdsHistory`, keyed by period start date. `refreshTds()` re-applies all of these through `LatsGo.onLatsChange(LatsGo.TDS_GRID, …)` after LATS re-renders the grid, and puts the Copy rows callout back above the rows.
- **scripts/lats-restyle.js** — Injected on `/Time*` after utils.js and before content.js. Small additive DOM hooks for the LATS page restyle in `styles/content.css` (UI-3, UI-4, FLOW-3). It's the only script that sets `data-weekend` on either page, and the `data-has-values` marks on timesheet hours rows.
  - Both pages: weekday-over-date day headers, holiday tags, and status pills. `orderTopTabs()` moves the Timesheet and TDS tabs to the front of the top `.nav-tabs`. It moves the `<li>` elements, so focus order matches the visual order, and it skips in-page tab bars such as the TDS task picker.
  - Holiday alert: LATS's "Holiday - MM/DD/YYYY" notices become one info alert (`.lg-holiday-alert`) right after `#topLeftMessages`, with a link to each year's Department of Civil Service holiday calendar (`LatsGo.holidayCalendarUrl`). On the timesheet, it also says that LATS adds HOL - State Holiday on Save, until the HOL Misc Leave row appears. LATS's notices stay rendered but visually hidden (`.lg-visually-hidden`, `aria-hidden`). The alert updates through `LatsGo.onLatsChange('#topLeftMessages, #timesheetTable', …)`.
  - Timesheet: a Total column with each hours row's and totals row's period sum, in LATS's decimals. Hours rows that are empty or zero on every day hide behind an "Empty rows (N)" toggle in the grid corner (`.lg-empty-rows-button`, which toggles `html.lg-show-empty-rows`). Its `title` names up to three hidden rows.
  - `hoursRows()` decides which rows can hide. The leave rows in `LEAVE_ROW_IDS` always count. Any other row counts when it has a label, has the header's cell count, and holds no button, select, checkbox, or radio button, such as Earned NonComp and Overtime. Header, time, location, totals, and Misc Leave rows never hide.
  - `arrangePanels()` marks plain data tables in the panels under the grid with `lg-data-table`, and puts Work Totals beside Balances and Earnings.
  - The timesheet grid doesn't use `onLatsChange`. It keeps its own MutationObservers on `#timesheetTable` and `#topLeftMessages`, and re-decorates 1 second and 3 seconds after load.
  - TDS: row titles read from LATS's hidden fields (`Distributions_N__CategoryCode`, `__TaskCode`, `__TaskDescription`, `__SubTask_0__Name`, `__SubTask_0__Description`). Each title block keeps a signature of the hidden fields and the sub-task link text, and rebuilds when it changes. A Total column runs through the header, rows, and footer. TDS tables get a `<colgroup>` and `table-layout: fixed` so LATS's separate header, row, and footer tables stay aligned. Every TDS decoration re-applies through `LatsGo.onLatsChange(LatsGo.TDS_GRID, …)`.
- **scripts/page-bridge.js** — Injected on `/Time*` with `"world": "MAIN"`. Content scripts can't see LATS's jQuery, Kendo widgets, `OverdueTimesheetsModule`, or `tdsJS`, so content.js sends `latsgo:request` CustomEvents (JSON string detail) and the bridge answers with `latsgo:response`. Only whitelisted actions run: `openOldestOverdue`, `addTdsRow`, and `showSubTasks`.
- **scripts/default.js** — Injected on `/Default*`. Restyling the timesheet link.
- **scripts/error.js** — Injected on `/error.aspx*`. "Reboot LATS" button that clears cookies via message to background.

### Background & UI
- **scripts/background.js** — Service worker. Handles `clearCookies` and `openOptions` message actions. Validates sender origin against `lats.ny.gov` pattern.
- **scripts/options.js** — Options page: per-weekday schedule editor with a Week 1/Week 2 switch, locations, and partial-leave placement.
- **scripts/popup.js** — Toolbar popup: read-only schedule summary and an Edit schedule button.

### Message Passing

Content scripts and popup communicate with the background service worker via `chrome.runtime.sendMessage`. Actions are whitelisted in `ALLOWED_ACTIONS`. The background script validates that messages originate from the extension itself or from `lats.ny.gov`.

### Time Format Convention

Settings are **stored** in `chrome.storage.sync` in **12-hour format** (e.g., "8:30 AM"). HTML `<input type="time">` elements use **24-hour format**. `LatsGo.to12Hour()`/`LatsGo.to24Hour()` convert at the options page boundary. The Fill dialog shows time ranges in 24-hour pills ("08:30–12:00").

### Storage Schema (version 2)
```javascript
// chrome.storage.sync
{
  schemaVersion: 2,
  alternateSchedule: boolean,   // Use schedule.week2 for days 8–14 of the pay period
  partialLeave: 'start' | 'end', // Default placement for partial-day leave
  schedule: {
    week1: { sun: Day, mon: Day, ..., sat: Day },
    week2: { sun: Day, mon: Day, ..., sat: Day }
  }
}
// Day = { works: boolean, timeIn, lunchOut, lunchIn, timeOut, location: 'onsite' | 'offsite' | 'none' }
// Lunch times may both be ''.

// chrome.storage.local
{ tdsHistory: { '2026-10-22': { savedAt, rows: [{ category, taskCode, task, subTask }] } } }
```
Version 1 stored `week1`/`week2` time presets for Monday–Friday. Always read settings through `LatsGo.loadSettings()`, which migrates version 1 data and removes the old keys.

### Styling

- `styles/ui.css` is the one stylesheet for the extension's own UI: popup, options page, Fill dialog, alerts and callouts, and toasts. All rules are scoped under `.lg` and component classes use the `lg-` prefix. Font sizes are px, not NYSDS rem tokens, because LATS uses Bootstrap 3 (root font size 10px). Resets use `:where()` so they beat Bootstrap element rules without out-ranking components.
- Alerts follow nys-alert: `.lg-alert` with a `--info` or `--danger` modifier (neutral without one), holding `.lg-alert__icon` and `.lg-alert__body`. `.lg-callout` is a modifier for alerts with an action button, such as the locked-period and Copy rows callouts. Build them with `LatsGo.alert()`.
- `styles/content.css` restyles LATS's timesheet and TDS pages to match ui.css, using the hooks from lats-restyle.js. LATS cells carry inline styles, so most rules need `!important`; LATS also forces `label { font-weight: bold !important }`, underlines `h2`, and colors every `td`/`th`. `styles/default.css` restyles the home page. All pages load `styles/nysds-tokens.css`.
  - The top tabs follow NYSDS nys-tab, scoped with `.nav-tabs:not(#tdsTasks *)` so the TDS task picker keeps its compact rules. The sub-tab bar (Audit, Summary, and so on) stays a quiet toolbar.
  - Summary labels use a `min-width` per column, not a fixed width. On the TDS page, the status column lets each pill wrap under its label at narrower widths.
  - Kendo grids and `table.lg-data-table` in the panels under the grid (Work Totals, Leave Usage by Day, and Balances and Earnings) get 1px borders and a rule under every row.
  - LATS's `.MissingTimeError` and `.TdsError` banners look like nys-alert warnings. Their new copy is drawn in `::before` and `::after` with empty alt text (`content: "…" / ""`), and LATS's own text is shrunk to nothing, so screen readers read LATS's sentence once. They're hidden on the TDS page itself, where the Remaining row shows the same thing.
- The Fill Timecard button itself uses LATS's Kendo button classes (`k-button k-button-lg k-rounded-lg k-button-solid k-button-solid-base`) so it matches Save.

### Key DOM Selectors (LATS page)
- `#timesheetTable` — Main timesheet grid
- `#printTSTable` — Header table with dates
- `#btnSaveTimesheet_0` — Save button (used as insertion point)
- Input titles follow pattern: `{Type} Day {dayIndex} {dayOfWeek}` (e.g., "Vacation Day 1 Monday", "On-Site Day 3 Saturday")
- Timesheet totals rows: day cells are IDed `totalRow` (Time Worked) and `totalRow_0`…`totalRow_13` (Charges, Total Time), so read them by position. Each day has three Extra Out/In pairs that share one title.
- `#topLeftMessages` — Notices such as "Holiday - 11/11/2026", one `.k-label` each, after an empty one
- TDS: `#gridHeader`, `#distributionRows`, `.distributionRow`, sub-task links with `DisplaySubTasks` in the `href`, `input.distributionCell` named `Distributions[r].Hours[d]`, `#tdsFooter` tables (TDS Totals, Work Totals, dates), and the `#tdsTasks` task picker

## Planning docs and skills

- `docs/requirements/next-release.md`: requirements for the next release, LATS behaviors the extension must handle, the status of each round of work, and the live checks still owed. Read it before feature work.
- `docs/design-refs/`: UI inspiration images that the requirements reference.
- `.claude/skills/lats-catchup/`: the workflow Claude follows to fill LATS from Outlook. It's also a reference for how LATS's DOM and Kendo widgets behave. Its tested in-page snippets hold personal schedule and TDS data, so they stay local: `.gitignore` excludes `snippets/`. Never commit them.

## Manifest Permissions
- `storage` — Save user schedule preferences
- `cookies` — Clear LATS cookies for session recovery
- `host_permissions` — Limited to `*://*.lats.ny.gov/*`

## ESLint

Uses `eslint:recommended` with `browser` + `webextensions` env. Key rules: single quotes, 2-space indent, semicolons required, `no-console: warn`. `LatsGo` is declared as a readonly global for content.js, lats-restyle.js, popup.js, and options.js. Tests use the `node` env and ES modules.

## LATS gotchas (learned on live LATS, Nov 2026)

- **Never add rows or cells to `#timesheetTable`.** LATS builds grid rows by position; an inserted `<tr>` made it put a cell in the header row and shift every column. Put extension controls inside existing cells (the corner cell holds the Empty rows toggle) or outside the table. A test asserts every row keeps its cell count.
- **LATS renders after the extension runs.** Body rows are rebuilt after load and after actions like removing a Misc Leave row, and `#topLeftMessages` notices (such as "Holiday - 11/11/2026") appear late. Both scripts re-decorate through MutationObservers; keep every decoration idempotent and ignore LATS Go!'s own mutations (`LatsGo.isOwnMutation`), so they don't react to the Total cells lats-restyle.js updates as you type.
- **A sub-task change re-renders the TDS grid in place.** LATS rebuilds the header, rows, and footer without reloading the page, so an observer on `#distributionRows` or `#tdsFooter` ends up on removed nodes. Use `LatsGo.onLatsChange`, and have each decoration check for the decoration itself, not a marker attribute.
- **Never set LATS's holiday notices to `display: none`.** `LatsGo.pageHolidays()` reads them from `document.body.innerText`, which skips hidden elements. Hide them visually with `.lg-visually-hidden` instead.
- **Hidden fields change attributes; typed text doesn't.** Setting a hidden input's value, as jQuery's `.val()` does, changes its `value` attribute, so a MutationObserver sees it. Typing in a text input doesn't, so listen for `input` and `change` events there.
- **The TDS task picker (Browse and Search) also uses `.nav-tabs`.** Scope top-tab rules and scripts so they skip it.
- **TDS-page status labels are longer** ("TDS Timesheet Status") than the timesheet's, so don't give summary labels a fixed width.
- **Specificity fights are real.** LATS ships Bootstrap 3, Kendo's classic-opal theme, `lats.css`, `tabs.css`, and `OverridesForKendoStyles.css` (which forces `label { font-weight: bold !important }`), and many cells carry inline styles. `html body …` prefixes and `!important` in `content.css` are deliberate; don't remove them in cleanup. Our own base cell rules count too: `.lg-tds-row table.tdsGrid td` and `#tdsFooter table.tdsGrid td` set `background: transparent !important`, so state rules (weekend, mismatch, Remaining) repeat `table.tdsGrid` to out-rank them.
- **Kendo buttons use `::after` as a hover overlay** (absolute, `opacity: 0`). The period arrows draw in `::after`, so their rule resets position and opacity.
- **TDS mismatch day headers carry `k-header TdsError`.** Scope banner rules to `.TdsError:not(.k-header)`.
- **TDS rows don't line up with the header by position** when they have sub-tasks. Use each input's title ("Task Hours For Day 3 Saturday") to find its day.
- **An older LATS Go! from the Chrome Web Store** (1.0.x) conflicts with this build if both are enabled. Disable it when testing.
- **Never Save or Submit in LATS during testing.** Fill, inspect, then reload to discard.

## Testing

`tests/fixtures/lats-pages.js` builds **synthetic** LATS pages that mimic the markup the extension depends on. They aren't captures of real LATS pages, so a passing test doesn't prove a selector matches live LATS. Replace them with sanitized snapshots when you can, and do live checks without saving (see the requirements doc, which lists the checks still owed).

`tests/fixtures/harness.js` is the shared test harness. The test files:

- `utils.test.js`: the pure helpers in utils.js.
- `content.test.js`: Fill Timecard, locked periods, the TDS helpers, and the LATS page restyle.
- `timesheet-grid.test.js`: the Total column, the totals rows, the Empty rows toggle, and the panel tables.
- `tabs-and-status.test.js`: the top tab order and the summary status labels.
- `alerts.test.js`: the holiday helpers, the holiday alert, and the shared alert style.
- `tds-rerender.test.js`: every TDS decoration and feature after LATS re-renders the grid.
