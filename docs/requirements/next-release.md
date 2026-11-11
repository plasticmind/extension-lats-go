# LATS Go! next release requirements

This document defines the requirements for the next LATS Go! release. It's written so you can point a fresh Claude Code session at it and build from it without extra context.

- **Released version:** 1.0.0 (Chrome Web Store).
- **Working tree:** 1.3.0 in `manifest.json`. That's the 1.2.0 work, merged to `main` on November 5, 2026, plus the team feedback round of November 11, 2026. See [Status of the 1.2.0 work](#status-of-the-120-work) and [Status of the team feedback round](#status-of-the-team-feedback-round).
- **Recommended target:** ship this release as 1.3.0 after the [live checks](#live-checks-still-owed) pass.
- **Last verified against live LATS:** November 5, 2026, on `time02.lats.ny.gov`, LATSnet 12.11.0.346. The team feedback round isn't verified on live LATS yet.

## How to use this document

1. Read [Constraints](#constraints) and [How LATS behaves](#how-lats-behaves) before changing code. LATS has some unusual behavior that the extension has to work around.
2. Work through the requirements in priority order: P1, then P2, then P3. Each one has an ID, such as `SCHED-1`, that you can cite in commits.
3. Open the images in `docs/design-refs/` before doing any UI work.
4. Resolve the [Open questions](#open-questions) with Jesse before you build the requirements that depend on them.

## Constraints

- **You don't control the LATS source code.** All changes come from content scripts and CSS on `*://*.lats.ny.gov/*`.
- **Never rename, remove, or reorder LATS form inputs.** LATS posts the form back by input `name`, such as `timesheet.Days[0].DayIn` and `Distributions[0].Hours[3]`. You can hide or restyle inputs, and you can add new elements around them.
- **LATS uses Kendo UI and jQuery.** Its dropdowns are Kendo widgets: change them through `jQuery('#Id').data('kendoDropDownList')`, not with clicks. Text inputs accept `value` plus `change` and `input` events. Checkboxes need `.click()`.
- **The extension never submits a timesheet.** Submitting requires the user's attestation. The extension can fill fields and click Save. Submit always stays a deliberate user action.
- **No bundler and no ES modules.** Shared code lives in `scripts/shared/utils.js` as globals. See `CLAUDE.md`.
- **Accessibility:** new UI meets WCAG 2.2 AA. Use real buttons and labels, give focus a visible style, and don't rely on color alone. A mismatch indicator needs an icon or text as well as red.
- **Writing style:** use the Google developer documentation style for all UI text.

## How LATS behaves

L1 through L10 were verified in live use while catching up five overdue periods. L11 comes from the team's feedback, and its details still need a live check. The extension must handle each one.

| # | Behavior | Impact on the extension |
|---|---|---|
| L1 | LATS locks periods in order. A "New Timesheet" has read-only time fields and no `#btnSaveTimesheet_0` until every earlier period is submitted. The current period is locked too while older ones are overdue. | The Fill Timecard button doesn't appear on locked periods, and users don't know why. See `FLOW-1`. |
| L2 | A new timesheet won't open by direct URL. It shows "Invalid Context." Open it through the Overdue Timesheets dialog (`OverdueTimesheetsModule.ShowDialog()`), the period arrows, or the `#pickTimesheetDate` Kendo date picker. | Navigation helpers must use those routes. See `FLOW-2`. |
| L3 | Daily totals (Time Worked, Charges, and TDS Totals) recalculate only after Save, which reloads the page. | Users see 0s after the extension fills fields. See `SCHED-7`. |
| L4 | LATS reads the time fields in this order: Day In, Lunch Out, Lunch In, Extra Out 1–3, Extra In 1–3, Day Out. A time earlier than the previous field wraps to the next day. An Extra Out of 10:00 AM after a 12:30 PM Lunch In produced 30.5 worked hours. | Validate the order before filling. This wrapping may also be how overnight shifts work. See `SCHED-2` and `SCHED-5`. |
| L5 | On a state holiday, LATS shows a "Holiday - MM/DD/YYYY" notice. On Save, it adds a Misc Leave row, "HOL - State Holiday," with 7.5 hours. The "Holiday" leave row is a separate holiday-leave balance, not the holiday itself. | The current "Holiday" day type writes to the wrong row. See `SCHED-6`. |
| L6 | The TDS (Time Distribution) page needs the TDS Totals to equal Work Totals on every worked day. Leave days need no TDS hours. A mismatch blocks clean submission and shows "Click TDS tab to assign hours." | See the `TDS-*` requirements. |
| L7 | LATS usually copies the previous period's TDS rows into a new period. It didn't for the first period that used the new task codes. | See `TDS-1`. |
| L8 | TDS codes changed with pay period 2026-15 (10/8–10/21/2026). Periods before it offer only the old codes: one legacy task with team-prefixed sub-tasks. Pay period 15 and later offer only the new categories from the "TDS Category and Task Guide" on SharePoint. LATS decides by period, not by date. | See `TDS-4`. |
| L9 | Sub-task codes can contain non-breaking spaces between words, as in the made-up "SUB_DEMO_Alpha ONE." | Normalize whitespace (`/\s+/g`) before matching. |
| L10 | The Submit button opens an in-page attestation dialog the first time in a session, and later submits may skip it. Delete actions use `kendo.confirm`, not native `confirm()`. | Never automate the attestation. |
| L11 | After a sub-task change, LATS re-renders the TDS grid (the day header, task rows, and footer) without reloading the page. It's not yet confirmed whether LATS replaces the rows or edits them in place, or whether `#topLeftMessages` re-renders too. | Decorations and the Remaining row are lost, and observers on the old nodes stop firing. Re-apply everything through `LatsGo.onLatsChange`. See `UI-4` and [live check 1](#live-checks-still-owed). |

## Status of the 1.1.0 work

These items appear in `docs/design-refs/v1.1-feature-summary.png`. This table shows their actual state in the working tree on 11/4/2026.

| Item | State | Gap |
|---|---|---|
| Day type per day | Done. The `createDayCard()` select uses `DAY_TYPE_OPTIONS`. | The "Holiday" type writes to the wrong row (`SCHED-6`). |
| Configurable leave hours, up to 7.5 | Not done. `fillSpecialDay()` always writes `7.5`. | See `SCHED-5`. |
| Smart date awareness | Partly done. `getTimesheetYear()` looks for a four-digit year in `#printTSTable` and `.timesheetGridHeader`, and falls back to the current year. | Read the period header instead, for example "FY 2026 - 16 (10/22/2026 - 11/04/2026)". Infer the year of each date so periods that span December and January work. |
| Input validation | Done. Uses `validateTime()` and `validateHours()`. | Add the order check from L4. |
| Visual refresh | Done in `content.css` and `default.css`. Weekend columns are muted, empty leave rows collapse, and TDS mismatches are highlighted. | The popup and options page still use separate inline styles. See `UI-1`. |

## Status of the 1.2.0 work

The P1 requirements were built on November 5, 2026, and `manifest.json` is now 1.2.0. The jsdom tests run the real content script against synthetic pages in `tests/fixtures/`.

Later that day, a live check on pay period 17 (11/5–11/18/2026) filled and inspected the timesheet and TDS pages without saving, then reloaded to discard. It confirmed the following:
- **Timesheet:** the day headers, the Holiday tag on 11/11, the Total column, the Leave toggle (now the Empty rows toggle), and the status pill.
- **Fill Timecard:** the dialog skipped the state holiday and filled 1 hour of partial sick leave. The progress toast, the glow, and the confetti all appeared.
- **TDS:** the row titles, the weekend shading, the mismatch colors, the live Remaining row, and the Change sub-task button.

The check also found two CSS bugs, now fixed. The TDS state colors (weekend, mismatch, and Remaining) lost to the base cell rules. The sub-tab bar style broke the Subtasks window's search hint.

| Requirement | State | Still needs |
|---|---|---|
| SCHED-1, SCHED-3, SCHED-5, SCHED-6 | Built, covered by tests, and filled live without saving on 11/5/2026. The holiday notice and the On-Site and Off-Site titles matched. | Nothing. |
| UI-1, UI-2 | Built. The popup is now a read-only summary with an Edit schedule button, because the per-weekday editor doesn't fit a popup. The Fill dialog was checked live. | A look at the popup and options page. |
| FLOW-1 | Callout built and covered by tests. | A live look on a locked period. Confirm that the Overdue Timesheets dialog's rows use "Select" links, which `page-bridge.js` clicks. |
| TDS-1 | Built. It copies from rows cached when you open a TDS page, because the previous period's TDS URL isn't known. | A live run on a period with no rows. The Kendo steps follow `lats-tds.js`. Consider fetching the previous period directly once its URL pattern is known. |
| TDS-2 | Built, covered by tests, and checked live. The Remaining row sits under TDS Totals, and each row shows a running total in the Total column. | Nothing. |
| REL-1, REL-2, REL-3 | Done: backup deleted, README rewritten with a screenshot, version bumped, and lint and tests pass. | The manual test checklist in [Testing](#testing). |

The UI-3 and UI-4 restyles, plus the FLOW-3 status pill, were also built on November 5, 2026, by previewing CSS on live LATS (pay period 17) without saving. Their DOM hooks live in `scripts/lats-restyle.js`. A live check also found two facts that the extension now handles: TDS sub-task links read "{code} - {description}", and each row carries hidden fields with clean category, task, and sub-task codes.

Open question 2 was resolved as SCHED-1 describes: one per-weekday schedule, with an optional second week.

## Status of the team feedback round

On November 11, 2026, the team reviewed 1.2.0 and asked for the following changes. Each one is built and covered by jsdom tests. None is checked on live LATS yet, because the LATS sign-in had expired. Run the [live checks](#live-checks-still-owed) before you ship.

| Item | Change |
|---|---|
| Total column (`UI-3`) | The grid no longer shows durations such as "7h 30m", in the Total Time row or the Total column. It shows LATS's decimals only. The Fill dialog and settings page still show durations. |
| Empty rows (`UI-3`) | Hours rows that are empty or zero on every day hide behind an **Empty rows (N)** toggle in the grid corner, which replaces the Leave toggle. Hours rows are the known leave rows, plus any other row that fits a structural rule, such as Earned NonComp and Overtime. Time, location, totals, header, and Misc Leave rows never hide. The toggle's tooltip names up to three hidden rows. |
| Panel tables (`UI-3`) | Work Totals, Leave Usage by Day, and Balances and Earnings get uniform 1px borders and a rule under every row. |
| Tab order (`UI-3`) | The Timesheet and TDS tabs move to the front of the top tab bar. The script moves the tabs themselves, so keyboard focus order matches. It skips in-page tab bars, such as the TDS task picker. |
| Tab style (`UI-3`) | The top tabs follow NYSDS nys-tab. The sub-tab bar (Audit, Summary, and so on) stays a quiet toolbar. |
| Summary labels (`UI-4`) | Labels use a minimum width instead of a fixed one, so long TDS labels such as "TDS Timesheet Status" no longer clip. On the TDS page, each status pill wraps under its label at narrower widths. |
| Alerts | LATS Go!'s alerts and callouts share one nys-alert style, with info and danger types. |
| Holiday alert (`UI-3`) | The Holiday badge above the grid becomes an info alert on both pages, "State holiday reminder," with a link to the Department of Civil Service holiday calendar for that year. On the timesheet, it says that LATS adds the HOL hours on Save, until LATS adds the HOL Misc Leave row. LATS's notices stay on the page, visually hidden, because Fill Timecard reads holidays from the page text. |
| Warning banners (`UI-3`) | LATS's missing-time and TDS mismatch banners look like nys-alert warnings, with space above and below. Screen readers still read LATS's own sentence once. The banners stay hidden on the TDS page. |
| TDS re-render (`UI-4`, L11) | After a sub-task change, the row titles, Total column, weekend shading, Remaining row, mismatch marks, and `tdsHistory` cache all come back. |

### Live checks still owed

Check these on a real unsubmitted period without saving, most important first:

1. **TDS sub-task change.** Change a sub-task, and don't save. The grid comes back fully styled, with one Remaining row, and `tdsHistory` updates. Note whether LATS replaces the rows or edits them in place, and whether `#topLeftMessages` re-renders (L11).
2. **Timesheet hidden rows.** Every row that hid before still hides. On an account that has them, empty Earned NonComp and Overtime rows hide. No row that should show is hidden.
3. **Fill Timecard on a holiday period.** It still skips the holiday (`SCHED-6`) now that LATS's notices are visually hidden.
4. **Top tabs.** Check the order and style on the Timesheet and TDS pages, and on a supervisor's account with Approval List. Pages outside `/Time*` keep LATS's order, which is a known gap.
5. **Warning banners.** LATS's markup for them isn't confirmed, so the CSS covers both a standalone element and a table cell. Check their markup and spacing.
6. **Panel borders and rules.** Check Work Totals, Balances and Earnings, Leave Usage by Day, and FMLA Usage.
7. **TDS status labels.** Check them at the team's usual window width.
8. **Callouts.** Check the locked-period and Copy rows callouts after the alert restyle.

## Requirements

Priority: **P1** must ship, **P2** should ship, and **P3** is nice to have.

### Scheduling and autofill

**SCHED-1: Configurable workdays, including weekends (P1)**
Users choose which days of the week they work, with separate times for each day. Saturday and Sunday are allowed.
- Replace the `week1`/`week2` presets with a schedule for each weekday. Keep the alternate biweekly option as a Week 1/Week 2 switch for each weekday. Migrate existing `chrome.storage.sync` data on first load.
- `getTimesheetDates()` stops skipping weekends. It returns every date, and the modal pre-selects only the configured workdays.
- Done when a Tuesday–Saturday schedule fills Saturday and leaves Monday blank.

**SCHED-2: Overnight shifts (P2)**
A schedule entry can clock in on one day and clock out the next, such as 10:00 PM to 6:30 AM.
- In settings, a shift whose end time is earlier than its start time shows "Ends next day."
- LATS stores time against the day the shift starts. Based on L4, entering a Day Out earlier than the Day In likely wraps to the next day. **Verify this in LATS without saving:** fill the fields, then read the hours LATS shows after saving a test entry on an unsubmitted period, and revert it. Also confirm with BSC whether hours are charged to the start day or split at midnight.
- Done when an overnight preset fills one column and LATS reports the expected hours for that day.

**SCHED-3: On-Site and Off-Site presets (P1)**
Each workday in the schedule includes a standard work location: On-Site, Off-Site, or Not set. This is the "in/out" setting Jesse asked for.
- In settings, each weekday gets a segmented On-Site/Off-Site/Not set control next to its times. When the alternate biweekly schedule is on, Week 1 and Week 2 each get their own locations.
- Fill Timecard checks `timesheet.Days[i].OnSite` or `.OffSite` with `.click()`, and unchecks the other. For a "Not set" day, it leaves both boxes as they are.
- The modal shows each day's location and lets the user change it for that day only.
- Leave days and holidays get neither box. This matches what LATS accepted in past periods.
- Done when filling a hybrid week (Off-Site Monday and Friday, On-Site Tuesday through Thursday) needs no manual clicks.

**SCHED-5: Partial-day leave (P1)**
Each day card has an hours field next to the day type, from 0.5 to 7.5 in steps of 0.5. The default is 7.5.
- When the leave is less than a full day, fill worked time plus leave so the day totals the scheduled hours. Use the user's convention: move Day In later by the leave hours, keep lunch, and leave Day Out unchanged. Example: 1 hour of sick leave becomes Day In 9:30 AM plus Sick 1.
- Offer "Leave at end of day" as an alternative, which moves Day Out earlier.
- Never use Extra Out/In before lunch for this (L4).

**SCHED-6: Correct state holiday handling (P1, bug)**
- Detect "Holiday - MM/DD/YYYY" notices on the page. In the modal, mark those dates "State holiday (LATS fills this)" and skip them. Don't write the Holiday row.
- Rename the current "Holiday" day type to "Holiday leave (balance)" and add help text explaining it's for charging banked holiday leave. A state holiday is never this type.
- Done when filling a period with 10/12/2026 leaves that column empty, and Save produces the "HOL - State Holiday" row with 7.5 hours.

**SCHED-7: Preview totals before saving (P2)**
Because LATS recalculates only on Save (L3), the modal shows worked, leave, and total hours for each day and for each week before Apply. After Apply, a banner reads "Filled. Select Save to update LATS totals," with a Save button that clicks `#btnSaveTimesheet_0`.

**SCHED-8: Named presets (P3)**
Users can save more than one named schedule, such as "Standard" and "Summer hours," and choose one in the modal.

### Workflow guidance

**FLOW-1: Explain locked periods (P1)**
When the timesheet table is present but `#btnSaveTimesheet_0` is missing and the time inputs are `readOnly`, show a callout in place of Fill Timecard. It reads: "LATS unlocks this period after you submit earlier timesheets." Include an **Open oldest overdue** button.

**FLOW-2: Overdue navigator (P2)**
On the timesheet page, turn LATS's "Overdue Timesheets (N)" link into a visible callout with the count and an **Open oldest** button. That button calls `OverdueTimesheetsModule.ShowDialog()` and selects the last row. Direct URLs fail (L2).

**FLOW-3: Status pill (P3)**
Show the timesheet status as a pill next to the period title: New, Un-Submitted, Submitted, Approved, or Processed. Use NYSDS tokens for the colors and include the text label.

### Time distribution (TDS)

**TDS-1: Copy rows from the previous period (P1)**
On a TDS page with no distribution rows, show **Copy rows from last period**. The extension reads the previous period's task and sub-task rows, then adds each one: Kendo `#Category`, then `#Task`, then `#btnAddTask`, then `tdsJS.DisplaySubTasks(id)`, then the `#subTaskCodeSearch` search, then the `#SubTask` value, then `#btnAddSubTask`. It reports any rows it couldn't recreate, such as a retired code (L8).

**TDS-2: Remaining hours for each day (P1)**
Add a "Remaining" row under TDS Totals that shows Work Totals minus TDS Totals for each day. It updates as the user types, before Save. Give each row a running total.

**TDS-3: Distribution presets (P2)**
Users save a split as percentages across their TDS rows, such as "Project A 50%, Project B 20%, Overhead 20%, Training 10%." **Distribute** fills every worked day:
- Round to 0.5 hours with the largest-remainder method so each day sums exactly to Work Totals.
- Leave days get no TDS hours.
- Partial days scale down; for example, a 6.5-hour day gets 6.5 hours of TDS.

**TDS-4: Code-change awareness (P2)**
If the category list doesn't contain any category used in the previous period's rows, show this callout: "TDS codes changed for this period. See the TDS Category and Task Guide." Link to the guide. The URL is stored in settings, because it's a SharePoint link Jesse supplies.

### UI unification and LATS restyle

The visual direction is the simplicity of `docs/design-refs/inspiration-team-timesheet.png` and `docs/design-refs/inspiration-week-detail-panel.png`:
- Lots of white space and thin dividers.
- Day columns with a weekday name over a muted date.
- Durations shown as "7h 30m." The Fill modal and settings page use them; LATS's own grid keeps its decimals (`UI-3`).
- Time ranges shown as soft gray pills, such as "08:00-12:00 - 13:30-18:00."
- Weekends shown as muted "Week-End" cells.
- A bold totals column on the right.
- Small outlined status labels.
- A compact week navigator, "< Week 24, Monday 05 June 2023 >," with a "Current week" button.

**UI-1: One design system for the extension's own UI (P1)**
The popup, options page, and Fill modal share one stylesheet built on `styles/nysds-tokens.css`.
- Remove the inline `<style>` blocks from `popup.html` and `options.html`.
- Use one name, "LATS Go!", everywhere. Today the UI shows "LATS UI Enhancer Settings," "LATS Enhancer," and "LATS GO!"
- Use one button style, one input style, and one spacing scale.

**UI-2: Fill modal as a week table (P1)**
Redesign the modal after the week-detail reference. Each row shows:
- An Include checkbox
- The date ("Thu 22")
- A day-type select with hours (`SCHED-5`)
- A location toggle (`SCHED-3`)
- A clocked-hours pill, such as "08:30–12:00 · 12:30–16:30"
- A daily total

Weekends and holidays show muted "Weekend" or "State holiday" cells. The footer shows weekly totals and the Apply and Cancel buttons. It works with the keyboard alone.

**UI-3: LATS timesheet grid restyle (P2)**
Using CSS plus small additive DOM changes:
- Make each day header two lines, with the weekday over a muted date.
- Show each row's period total in a Total column, in LATS's decimal hours. The team asked for decimals only, so don't add durations to the grid.
- Make the totals column sticky.
- Mute weekend columns. This already exists, so refine it.
- Hide hours rows that are empty or zero on every day behind an **Empty rows (N)** toggle in the grid corner. Time, location, totals, header, and Misc Leave rows always show.
- Give the panel tables under the grid (Work Totals, Leave Usage by Day, and Balances and Earnings) 1px borders and a rule under every row.
- Show LATS's missing-time and TDS mismatch banners as nys-alert warnings.
- Show a status pill (`FLOW-3`).

On the timesheet and TDS pages:
- Put the Timesheet and TDS tabs first in the top tab bar, in the NYSDS nys-tab style. Keep the sub-tab bar a quiet toolbar.
- Show LATS's holiday notices as one info alert that links to the Department of Civil Service holiday calendar.

The underlying inputs keep their names and stay editable.

**UI-4: TDS page restyle (P2)**
Follow the team-timesheet reference:
- Show each task row as a title ("Sample Project") over a muted code line ("TST-1001 · SUB_DEMO_Beta Two").
- Show day cells with "-" for zero, and add a row-total column on the right.
- Mark mismatched days with an icon plus text, not just red.
- Show the Browse and Search task picker as one compact "Add task" control.
- Fit the summary labels to the TDS page's longer status labels, such as "TDS Timesheet Status."
- Bring every decoration, the Remaining row, and the mismatch marks back after LATS re-renders the grid (L11).

**UI-5: Home page (P3)**
Refine the existing `default.js` changes, which already collapse Announcements and Tips and restyle the timesheet link. Add the overdue count and an **Open oldest overdue** action (`FLOW-2`).

### Release hygiene

**REL-1 (P1):** Delete `scripts/content.js.backup`.

**REL-2 (P1):** Update `README.md`: product name, the new features, a screenshot, and permissions. It still says "LATS Enhancer."

**REL-3 (P1):** Bump the version in `manifest.json`. Run `npm run lint`, then work through the manual test checklist in [Testing](#testing).

**REL-4 (P2):** Refresh the Chrome Web Store screenshots for the new modal and the TDS helpers.

## Testing

LATS has no sandbox, and every Save changes your real timesheet. Use the following approach.

- **DOM fixtures.** Save HTML snapshots of these LATS pages:
  - A locked new timesheet
  - An editable timesheet
  - A timesheet with a holiday
  - A TDS page with rows
  - A TDS page without rows

  Remove personal data from each snapshot before you commit it. Add Vitest with jsdom (see the `chrome-extension-development` skill) and test fill logic, order validation, holiday detection, and TDS rounding against those fixtures.
- **Live checks.** On a real unsubmitted period, fill without saving, inspect the fields, then reload to discard. Save only the user's real data. The checks still owed are in [Live checks still owed](#live-checks-still-owed).
- **Manual checklist:**
  - Hybrid week (`SCHED-3`)
  - Weekend shift (`SCHED-1`)
  - Partial sick day (`SCHED-5`)
  - Holiday week (`SCHED-6`)
  - Locked period (`FLOW-1`)
  - Empty TDS page (`TDS-1`)
  - Distribute (`TDS-3`)
  - Keyboard-only use of the modal (`UI-2`)

## Open questions

1. **Overnight shifts.** How does LATS expect overnight hours to be recorded (`SCHED-2`)? Verify in LATS or ask BSC.
2. **Biweekly alternate schedule.** Should it become per-day presets, or stay as a separate Week 1/Week 2 option?

Questions 3 through 6 are interpretations of the team's November 11 feedback. Confirm them with the team.

3. **"Lined" tables.** LATS Go! reads this as a rule under every row in the panel tables. Is that what the team meant?
4. **Holiday alert heading.** The heading is in sentence case, "State holiday reminder," not the mockup's "NYS State Holiday Reminder." Is that acceptable?
5. **Holiday alert icon.** The alert uses the nys-alert info "i" icon, not the mockup's "!" icon. Is that acceptable?
6. **Toggle name.** The empty-rows toggle is now "Empty rows" instead of "Leave." Does that name work for the team?

## Out of scope

- **Calendar-driven suggestions.** Filling leave, location, and TDS splits from Outlook would need extra host permissions plus Microsoft Graph sign-in. For now, the `lats-catchup` Claude Code skill (`.claude/skills/lats-catchup/`) covers that workflow by driving Chrome. Later, consider importing an `.ics` file. Note that it wouldn't include Outlook's work-location plan.
- **Any automated Submit or attestation.**
