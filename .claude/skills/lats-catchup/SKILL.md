---
name: lats-catchup
description: Fill or catch up NY State LATS timesheets and TDS (time distribution) from the user's Outlook calendar, using Claude in Chrome. Use when the user asks to complete, fill, or catch up LATS, timesheets, or TDS, mentions overdue timesheets or pay periods, or wants hours split across TDS task codes. Covers LATS quirks (in-order period unlocking, totals that refresh only on save, holiday rows, TDS code changes) and ships tested JavaScript snippets.
---

# LATS catch-up

Fill LATS timesheets and TDS from Outlook in a Chrome tab group the user is already signed in to. The extension project (LATS Go!) lives in this repo. This skill is the manual, Claude-driven version of that workflow.

**Before you start, read the user's project memory note `lats-timesheet-workflow`.** It holds their schedule, leave rules, TDS codes, and allocation preferences. This file holds only the generic workflow.

## Rules

- **Never submit a timesheet without the user's explicit OK in chat, given for that specific period.** Jesse usually submits himself. Fill, Save, verify, and then hand off with a summary.
- **Never accept the attestation for the user** unless they've just approved submitting that period. The attestation is a certification of accuracy.
- **Ask before charging leave.** Short Outlook OOO blocks are not leave unless the user says so. Doctor's appointments are sick time. Confirm all-day OOO events.
- **The user signs in to LATS and Outlook.** Never type credentials.
- **When you're done:** run `__latsClear()` on the Outlook tab and close the tabs you opened.

## Setup

1. Load the Claude in Chrome tools with one ToolSearch call, including `javascript_tool`, `find`, and `browser_batch`. Then call `tabs_context_mcp`.
2. Open LATS (`https://time02.lats.ny.gov/`) and the Outlook calendar (`https://outlook.office.com/calendar/`), and have the user sign in.
3. Open the overdue list. On the timesheet page, run `OverdueTimesheetsModule.ShowDialog()` and read its rows. That gives you the periods and their status: New, Un-Submitted, and so on.

## Workflow

1. **Read the calendar.** On the Outlook tab, switch to Work week view, use the mini-calendar to go to the first week you need, and paste `snippets/outlook-collect.js`. Then run `await __latsCollectWeeks(<weeks>)`.
2. **Review leave and location.**
   - `__latsOdd([...dayKeys])` lists all-day events, OOO blocks, and doctor visits. Ask the user about anything that might be leave, all in one question.
   - `__latsPlans([...dayKeys])` returns each day's location (Office or Remote), which becomes On-Site or Off-Site.
   - Holidays come from LATS. Each holiday shows a "Holiday - MM/DD/YYYY" notice on its period.
3. **Split the hours.** Paste `snippets/outlook-allocate.js` and run `__latsAllocate(keys, {dayKey: workedHours})` for each period. Show the user the period totals and the meetings that matched no project. Adjust `__latsRules` if they correct anything.
4. **Fill the timesheet.** Open the period from the overdue dialog or with the period arrows. Paste `snippets/lats-timesheet.js` and run `await __latsFillTimesheet({col: spec})`. Save in a separate call, wait about 6 seconds, paste the snippet again, and run `__latsTimesheetCheck()`.
5. **Fill the TDS.** Select the TDS tab. Paste `snippets/lats-tds.js`, then run `__latsTdsRows()`.
   - If rows are missing, add them with `__latsTdsAddRow`.
   - Check the category list first: the available codes depend on the period.
   - Run `await __latsTdsFill(alloc)`, where `alloc` uses 0-based day indexes. Save, paste again, and run `__latsTdsCheck()`. TDS Totals must equal Work Totals on every day.
6. **Hand off.** Summarize the time, leave, location, and TDS split, and flag anything you guessed. If the user approves, submit; otherwise they submit. LATS doesn't unlock the next period until this one is submitted.

## Gotchas

| Problem | Fix |
|---|---|
| A period has read-only fields and no Save button | LATS unlocks periods only in order. Submit the earlier period first. |
| "Invalid Context" | New periods don't open by URL. Use the overdue dialog's Select link, the period arrows, or `jQuery('#pickTimesheetDate').data('kendoDatePicker')` with a `change` trigger. |
| Totals still show 0 after filling | Normal. LATS recalculates only on Save. |
| Worked hours are huge (for example, 30.5) | Time fields must be in order: Day In, Lunch Out, Lunch In, Extra Out/In, Day Out. Don't put an Extra Out/In before lunch. For partial leave, move Day In later instead. |
| A Kendo dropdown doesn't respond to clicks | Use `jQuery('#Id').data('kendoDropDownList')`, then `.value(...)` and `.trigger('change')`. |
| A sub-task regex doesn't match | Codes contain non-breaking spaces. Normalize with `/\s+/g`. Search with at least 3 characters in `#subTaskCodeSearch`. |
| The wrong sub-task was added | `tdsJS.DeleteSubTask(id)` opens a `kendo.confirm` dialog; select its OK button. It's in-page, not a native dialog. |
| The TDS page has no rows | LATS didn't copy them, which happens when codes change. Add them with `__latsTdsAddRow`. |
| The old category isn't listed | TDS codes changed for this period. The new guide is "TDS Category and Task Guide.xlsx" on SharePoint. |
| JavaScript output shows `[TRUNCATED]` or `[BLOCKED: Cookie/query string data]` | Output caps at about 1,000 characters, and URL-like characters trigger the filter. Strip `?&=` and similar characters, return compact strings, and slice the result. |
| "Inspected target navigated" | You clicked Save inside a long-running script. Use `setTimeout(() => btn.click(), 50)` and check in the next call. |
| The extension disconnects | Call `tabs_context_mcp` again. If it fails 2–3 times, ask the user to check the extension. |
| Outlook dates don't match | Outlook zero-pads some dates ("November 02"). The snippets normalize everything to `M/D`. |
