# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LATS Go! is a Chrome extension that enhances the NY State Leave and Accrual Tracking System (LATS) timesheet interface. It provides automated timecard filling, custom schedule settings, and session error recovery. Published on the [Chrome Web Store](https://chromewebstore.google.com/detail/lats-go-%F0%9F%8E%89/obdmohilnmnjkdjgkbcjfaifiilikhip).

## Commands

```bash
npm install           # Install ESLint, Vitest, and jsdom
npm run lint          # Lint scripts/ and tests/ with ESLint
npm run lint:fix      # Auto-fix lint issues
npm test              # Vitest: unit tests for utils.js, jsdom integration tests for content.js
```

No build step — files are loaded directly as an unpacked extension.

## Development

1. Load unpacked extension in Chrome at `chrome://extensions/` with Developer mode enabled
2. Point to this folder
3. Reload extension after code changes

## Architecture

Chrome Manifest V3 extension. No bundler, no framework — plain vanilla JS with DOM manipulation.

### Script Loading & Shared Code

`scripts/shared/utils.js` is loaded via the manifest as a content script before `content.js`. It defines one global, `LatsGo`, with the shared constants and pure functions: settings defaults, `migrateSettings`/`loadSettings`/`saveSettings`, time parsing and formatting, `validateTimeOrder` (L4), `planDay` (partial-day leave, SCHED-5), `parsePeriodRange`, `inferDate`, `findStateHolidays`, `findTimesheetStatus`, and TDS helpers. It also holds the DOM helpers every page shares: `el`, `setText`, `setFlag`, `callPage` (requests to page-bridge.js), `whenLatsReady`, `isOwnMutation`, and the TDS footer and hidden-field readers (`tdsFooterTables`, `tdsDayCells`, `readTdsRowFields`). Don't copy these into a script; add to `LatsGo` instead. `LatsGo` is the only ESLint global in `.eslintrc.json`. The popup and options pages load utils.js via `<script>` tags in their HTML files. utils.js also sets `module.exports` when `module` exists, so Vitest can `require` it.

**There are no ES module imports** in extension code — all cross-file sharing is via script tag ordering and global scope.

### Content Scripts (Page-Specific)
- **scripts/content.js** — Injected on `/Time*`, which covers the timesheet and `TimeDistribution` (TDS) pages. Wrapped in an IIFE with a `window.latsGoInitialized` guard.
  - Timesheet: the Fill Timecard dialog (native `<dialog>`, week table). It reads days from input titles (`{Row} Day {index} {Weekday}`), dates from the period header, and state holidays from "Holiday - MM/DD/YYYY" notices. It polls for `#btnSaveTimesheet_0`; if the Save button never appears and the time inputs are read-only, it shows the locked-period callout (FLOW-1) instead.
  - TDS: the live Remaining row and per-row totals (TDS-2), and Copy rows from last period (TDS-1). Rows from every TDS page are cached in `chrome.storage.local` under `tdsHistory`, keyed by period start date.
- **scripts/lats-restyle.js** — Injected on `/Time*` after utils.js and before content.js. Small additive DOM hooks for the LATS page restyle in `styles/content.css` (UI-3, UI-4, FLOW-3): weekday-over-date day headers, holiday tags, a Total column (timesheet sums and durations; TDS row and footer totals), status pills, the "Show empty leave rows" toggle, and TDS row titles read from LATS's hidden fields (`Distributions_N__CategoryCode`, `__TaskCode`, `__TaskDescription`, `__SubTask_0__Name`, `__SubTask_0__Description`). TDS tables get a `<colgroup>` and `table-layout: fixed` so LATS's separate header, row, and footer tables stay aligned. It's the only script that sets `data-weekend` and the empty-leave-row `data-has-values` marks on either page.
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

- `styles/ui.css` is the one stylesheet for the extension's own UI: popup, options page, Fill dialog, callouts, and toasts. All rules are scoped under `.lg` and component classes use the `lg-` prefix. Font sizes are px, not NYSDS rem tokens, because LATS uses Bootstrap 3 (root font size 10px). Resets use `:where()` so they beat Bootstrap element rules without out-ranking components.
- `styles/content.css` restyles LATS's timesheet and TDS pages to match ui.css, using the hooks from lats-restyle.js. LATS cells carry inline styles, so most rules need `!important`; LATS also forces `label { font-weight: bold !important }`, underlines `h2`, and colors every `td`/`th`. `styles/default.css` restyles the home page. All pages load `styles/nysds-tokens.css`.
- The Fill Timecard button itself uses LATS's Kendo button classes (`k-button k-button-lg k-rounded-lg k-button-solid k-button-solid-base`) so it matches Save.

### Key DOM Selectors (LATS page)
- `#timesheetTable` — Main timesheet grid
- `#printTSTable` — Header table with dates
- `#btnSaveTimesheet_0` — Save button (used as insertion point)
- Input titles follow pattern: `{Type} Day {dayIndex} {dayOfWeek}` (e.g., "Vacation Day 1 Monday", "On-Site Day 3 Saturday")
- Timesheet totals rows: day cells are IDed `totalRow` (Time Worked) and `totalRow_0`…`totalRow_13` (Charges, Total Time), so read them by position. Each day has three Extra Out/In pairs that share one title.
- TDS: `#distributionRows`, `.distributionRow`, sub-task links with `DisplaySubTasks` in the `href`, `input.distributionCell` named `Distributions[r].Hours[d]`, and `#tdsFooter` tables (TDS Totals, Work Totals, dates)

## Planning docs and skills

- `docs/requirements/next-release.md`: requirements for the next release, LATS behaviors the extension must handle, and the status of the 1.1.0 work. Read it before feature work.
- `docs/design-refs/`: UI inspiration images that the requirements reference.
- `.claude/skills/lats-catchup/`: the workflow Claude follows to fill LATS from Outlook. It's also a reference for how LATS's DOM and Kendo widgets behave. Its tested in-page snippets hold personal schedule and TDS data, so they stay local: `.gitignore` excludes `snippets/`. Never commit them.

## Manifest Permissions
- `storage` — Save user schedule preferences
- `cookies` — Clear LATS cookies for session recovery
- `host_permissions` — Limited to `*://*.lats.ny.gov/*`

## ESLint

Uses `eslint:recommended` with `browser` + `webextensions` env. Key rules: single quotes, 2-space indent, semicolons required, `no-console: warn`. `LatsGo` is declared as a readonly global for content.js, lats-restyle.js, popup.js, and options.js. Tests use the `node` env and ES modules.

## LATS gotchas (learned on live LATS, Nov 2026)

- **Never add rows or cells to `#timesheetTable`.** LATS builds grid rows by position; an inserted `<tr>` made it put a cell in the header row and shift every column. Put extension controls inside existing cells (the corner cell holds the Leave toggle) or outside the table. A test asserts every row keeps its cell count.
- **LATS renders after the extension runs.** Body rows are rebuilt after load and after actions like removing a Misc Leave row, and `#topLeftMessages` notices (such as "Holiday - 11/11/2026") appear late. `lats-restyle.js` re-decorates through MutationObservers; keep every decoration idempotent and ignore its own mutations (`LatsGo.isOwnMutation`). content.js's TDS observers use it too, so they don't react to the Total cells lats-restyle.js updates as you type.
- **Specificity fights are real.** LATS ships Bootstrap 3, Kendo's classic-opal theme, `lats.css`, `tabs.css`, and `OverridesForKendoStyles.css` (which forces `label { font-weight: bold !important }`), and many cells carry inline styles. `html body …` prefixes and `!important` in `content.css` are deliberate; don't remove them in cleanup. Our own base cell rules count too: `.lg-tds-row table.tdsGrid td` and `#tdsFooter table.tdsGrid td` set `background: transparent !important`, so state rules (weekend, mismatch, Remaining) repeat `table.tdsGrid` to out-rank them.
- **Kendo buttons use `::after` as a hover overlay** (absolute, `opacity: 0`). The period arrows draw in `::after`, so their rule resets position and opacity.
- **TDS mismatch day headers carry `k-header TdsError`.** Scope banner rules to `.TdsError:not(.k-header)`.
- **TDS rows don't line up with the header by position** when they have sub-tasks. Use each input's title ("Task Hours For Day 3 Saturday") to find its day.
- **An older LATS Go! from the Chrome Web Store** (1.0.x) conflicts with this build if both are enabled. Disable it when testing.
- **Never Save or Submit in LATS during testing.** Fill, inspect, then reload to discard.

## Testing

`tests/fixtures/lats-pages.js` builds **synthetic** LATS pages that mimic the markup the extension depends on. They aren't captures of real LATS pages, so a passing test doesn't prove a selector matches live LATS. Replace them with sanitized snapshots when you can, and do live checks without saving (see the requirements doc).
