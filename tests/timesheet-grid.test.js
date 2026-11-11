import { describe, it, expect, beforeAll } from 'vitest';
import { buildTimesheetHtml, miscLeaveRows, timesheetRow, totalsRows, LEAVE_ROW_IDS } from './fixtures/lats-pages.js';
import { cssRules, loadPage, until, wait, RESTYLE_SCRIPTS } from './fixtures/harness.js';

// The timesheet grid restyle: the Total column, the totals rows, and the Empty rows button.
// Only utils.js and lats-restyle.js run here; the Fill Timecard tests live in content.test.js.

/**
 * The fixture timesheet shaped like live LATS: the right-hand Total column, and rows that some
 * accounts have: Earned NonComp ("0" text) and Overtime (0-valued inputs), a Misc Leave
 * section, and the totals rows. `earned`, `overtime`, and `totalTime` are one value for every
 * day or a function of the day index. Other options go to buildTimesheetHtml.
 */
function timesheetHtml({ earned = '0', overtime = '0', totalTime = '0', ...options } = {}) {
  return buildTimesheetHtml({
    totalColumn: true,
    extraRows: [
      timesheetRow('Earned NonComp', { id: 'EarnedNonComp', cells: 'text', values: earned }),
      ...miscLeaveRows(),
      ...totalsRows({ totalTime }),
      // An unknown hours row after the totals rows: the Misc Leave section ends at the totals.
      timesheetRow('Overtime', { id: 'Overtime', values: overtime })
    ],
    ...options
  });
}

function load(html) {
  return loadPage(html, { scripts: RESTYLE_SCRIPTS });
}

function rowByLabel(document, label) {
  return Array.from(document.getElementById('timesheetTable').rows)
    .find((r) => r.cells[0] && r.cells[0].textContent.replace(/\s+/g, ' ').trim().startsWith(label));
}

function emptyRowsButton(document) {
  return until(() => document.querySelector('#timesheetTable .lg-empty-rows-button'));
}

function type(window, input, value) {
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

describe('Timesheet grid: empty rows', () => {
  it('builds a fixture shaped like live LATS', () => {
    const { document } = loadPage(timesheetHtml(), { scripts: [] });
    const table = document.getElementById('timesheetTable');
    const header = table.rows[0];
    expect(header.cells).toHaveLength(16);
    expect(document.getElementById('Vacation_rowLabelRight')).not.toBeNull();
    expect(rowByLabel(document, 'Earned NonComp').cells).toHaveLength(16);
    expect(rowByLabel(document, 'Overtime').cells).toHaveLength(16);
  });

  it('hides empty rows whatever their ID, with "0" text cells or 0-valued inputs', async () => {
    const { document } = load(timesheetHtml());
    const button = await emptyRowsButton(document);

    const earned = rowByLabel(document, 'Earned NonComp');
    const overtime = rowByLabel(document, 'Overtime');
    expect(earned.querySelector('input')).toBeNull();
    expect(overtime.querySelectorAll('input')).toHaveLength(14);
    expect(earned.getAttribute('data-has-values')).toBe('false');
    expect(overtime.getAttribute('data-has-values')).toBe('false');

    // Six fixture leave rows plus Earned NonComp and Overtime.
    expect(button.textContent).toBe('Empty rows (8)');
    expect(button.title).toBe('Show 8 empty rows: Vacation, Sick, Sick Family, and more');
    expect(button.hidden).toBe(false);
  });

  it('never hides time, location, totals, header, or Misc Leave rows', async () => {
    const { document } = load(timesheetHtml());
    await emptyRowsButton(document);
    const table = document.getElementById('timesheetTable');

    const kept = ['Day In', 'Lunch Out', 'Lunch In', 'Extra Out', 'Extra In', 'Day Out', 'On-Site', 'Off-Site',
      'Misc Leave', 'HOL - State Holiday', 'Add Misc Leave', 'Time Worked', 'Charges', 'Total Time'];
    kept.forEach((label) => {
      const matches = Array.from(table.rows).filter((r) => r.cells[0] && r.cells[0].textContent.trim().startsWith(label));
      expect(matches.length, label).toBeGreaterThan(0);
      matches.forEach((r) => expect(r.hasAttribute('data-has-values'), label).toBe(false));
    });
    expect(table.rows[0].hasAttribute('data-has-values')).toBe(false);
    expect(table.querySelectorAll('tr[data-has-values]')).toHaveLength(8);
  });

  it('keeps a time row visible by its label and input titles when its ID is unfamiliar', async () => {
    const { document } = load(timesheetHtml({ rowOptions: { ExtraOut3: { id: 'Row12' } } }));
    await emptyRowsButton(document);
    expect(document.getElementById('Row12_rowLabelLeft').closest('tr').hasAttribute('data-has-values')).toBe(false);
  });

  it('shows rows that have hours, and sums them in the Total column', async () => {
    const { document } = load(timesheetHtml({
      earned: (i) => (i === 4 ? '1.5' : '0'),
      overtime: (i) => (i === 5 ? '2' : '0')
    }));
    const button = await emptyRowsButton(document);
    const earned = rowByLabel(document, 'Earned NonComp');
    const overtime = rowByLabel(document, 'Overtime');
    expect(earned.getAttribute('data-has-values')).toBe('true');
    expect(overtime.getAttribute('data-has-values')).toBe('true');
    expect(earned.querySelector('.lg-total-col .lg-rowsum').textContent).toBe('1.5');
    expect(overtime.querySelector('.lg-total-col .lg-rowsum').textContent).toBe('2');
    expect(button.textContent).toBe('Empty rows (6)');
  });

  it('keeps the count right as you type, and keeps the row you clear until you leave it', async () => {
    const { window, document } = load(timesheetHtml());
    const button = await emptyRowsButton(document);
    const overtime = rowByLabel(document, 'Overtime');
    const input = overtime.querySelector('input[title="Overtime Day 2 Friday"]');

    button.click();
    expect(document.documentElement.classList.contains('lg-show-empty-rows')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toBe('Empty rows');
    expect(button.title).toBe('Hide empty rows');
    button.click();

    input.focus();
    type(window, input, '3');
    expect(overtime.getAttribute('data-has-values')).toBe('true');
    expect(button.textContent).toBe('Empty rows (7)');

    // Clearing the value while you're still in the row doesn't hide it under you.
    type(window, input, '');
    expect(overtime.getAttribute('data-has-values')).toBe('true');

    input.blur();
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await until(() => overtime.getAttribute('data-has-values') === 'false');
    expect(button.textContent).toBe('Empty rows (8)');
  });

  it('refreshes a row you cleared once focus leaves it, even after you moved to another day', async () => {
    const { window, document } = load(timesheetHtml());
    const button = await emptyRowsButton(document);
    const overtime = rowByLabel(document, 'Overtime');
    const friday = overtime.querySelector('input[title="Overtime Day 2 Friday"]');
    const saturday = overtime.querySelector('input[title="Overtime Day 3 Saturday"]');

    friday.focus();
    type(window, friday, '3');
    type(window, friday, '');
    // Move to another day in the same row. The browser fires change on the day you left.
    friday.dispatchEvent(new window.Event('change', { bubbles: true }));
    saturday.focus();
    await wait(50);
    expect(overtime.getAttribute('data-has-values')).toBe('true');
    expect(button.textContent).toBe('Empty rows (7)');

    // Leave the row for a time row, without typing: no input or change event, only focusout.
    // Check right away: the re-decoration 1 and 3 seconds after load would also refresh it.
    rowByLabel(document, 'Day In').querySelector('input').focus();
    await wait(20);
    expect(overtime.getAttribute('data-has-values')).toBe('false');
    expect(button.textContent).toBe('Empty rows (8)');
  });

  it('always treats 1.2.0\'s leave rows as hours rows, even when they break the generic rule', async () => {
    const { window, document } = load(timesheetHtml({
      rowOptions: {
        // A button in Vacation's label cell, which the generic rule rejects.
        Vacation: { button: 'Details' },
        // Personal without its right-hand cell, so its cell count differs from the header's.
        Personal: { totalCell: false }
      }
    }));
    const button = await emptyRowsButton(document);
    const vacation = document.getElementById('Vacation_rowLabelLeft').closest('tr');
    const personal = document.getElementById('Personal_rowLabelLeft').closest('tr');
    expect(personal.cells).toHaveLength(15);

    expect(vacation.getAttribute('data-has-values')).toBe('false');
    expect(personal.getAttribute('data-has-values')).toBe('false');
    expect(button.textContent).toBe('Empty rows (8)');

    // Hours in the last day show both rows. Personal has no Total column cell, so no day cell gets a sum.
    type(window, vacation.querySelector('input[title="Vacation Day 14 Wednesday"]'), '7.5');
    type(window, personal.querySelector('input[title="Personal Day 14 Wednesday"]'), '2');
    expect(vacation.getAttribute('data-has-values')).toBe('true');
    expect(personal.getAttribute('data-has-values')).toBe('true');
    expect(vacation.querySelector('.lg-total-col .lg-rowsum').textContent).toBe('7.5');
    expect(personal.querySelector('.lg-rowsum')).toBeNull();
    expect(button.textContent).toBe('Empty rows (6)');
  });

  it('marks an unknown row again after LATS rebuilds it', async () => {
    const { document } = load(timesheetHtml());
    await emptyRowsButton(document);
    const old = rowByLabel(document, 'Earned NonComp');
    const fresh = old.cloneNode(true);
    fresh.removeAttribute('data-has-values');
    old.replaceWith(fresh);
    await until(() => fresh.getAttribute('data-has-values') === 'false');
  });

  it('hides the button when no row is empty', async () => {
    // Hours on the first day of every leave row.
    const firstDay = { values: (i) => (i === 0 ? '1' : '0') };
    const rowOptions = Object.fromEntries(LEAVE_ROW_IDS.map((id) => [id, firstDay]));
    const { document } = load(timesheetHtml({ earned: '1', overtime: '1', rowOptions }));
    const button = await emptyRowsButton(document);
    expect(document.querySelectorAll('#timesheetTable tr[data-has-values="false"]')).toHaveLength(0);
    expect(button.hidden).toBe(true);
  });
});

describe('Timesheet grid: totals rows', () => {
  it('shows LATS\'s decimals without a duration', async () => {
    const { document } = load(timesheetHtml({ totalTime: (i) => (i % 7 === 2 || i % 7 === 3 ? '0' : '7.5') }));
    const total = await until(() => document.querySelector('#timesheetTable tr[data-lg-total="total"]'));
    const sum = await until(() => total.querySelector('.lg-total-col .lg-rowsum'));
    expect(sum.textContent).toBe('75');
    expect(sum.children).toHaveLength(0);
    expect(total.cells[1].textContent).toBe('7.5');
    expect(total.cells[3].classList.contains('lg-zero')).toBe(true);
    expect(total.textContent).not.toMatch(/\dh/);
    expect(document.querySelector('.lg-duration, .lg-rowsum__duration, .lg-rowsum__value')).toBeNull();
  });
});

describe('Panels under the grid (content.css)', () => {
  const rules = cssRules('styles/content.css');
  // Panels like LATS's: a Kendo grid, a plain data table, and layout tables, one holding a
  // data table and one with no header cells. lats-restyle.js marks the data tables.
  const panels = `
    <div class="col-xs-6 IgnoreReadOnly"><div class="k-header">Work Totals</div>
      <div class="k-grid"><table id="kendo"><thead><tr><th>Week</th><th>Time Worked</th></tr></thead>
        <tbody><tr><td>Week 1</td><td>30.00</td></tr></tbody></table></div></div>
    <div class="col-xs-12 IgnoreReadOnly"><div class="k-header">Leave Usage by Day</div>
      <table id="plain"><tbody><tr><td class="k-header">Day</td><td class="k-header">Vac</td></tr>
        <tr><td>10/12</td><td>0</td></tr></tbody></table></div>
    <div class="col-xs-12 IgnoreReadOnly"><table id="layout"><tbody><tr><td>
      <div class="k-header">FMLA Usage</div>
      <table id="nested"><tbody><tr><th>Date</th><th>Hours</th></tr><tr><td>10/13</td><td>2</td></tr></tbody></table>
    </td><td>Notes</td></tr></tbody></table>
    <table id="form"><tbody><tr><td>Reason</td><td>Medical</td></tr></tbody></table></div>`;
  let document;
  beforeAll(async () => {
    ({ document } = load(timesheetHtml({ belowGrid: panels })));
    await until(() => document.querySelector('table.lg-data-table'));
  });

  /** The IDs of the tables whose cells a rule with `declaration` matches. */
  function linedTables(declaration) {
    const ids = rules.filter((rule) => rule.selector.includes('#frmUpdateTimesheet') && rule.body.includes(declaration))
      .flatMap((rule) => Array.from(document.querySelectorAll(rule.selector), (node) => node.closest('table').id));
    return [...new Set(ids)].sort();
  }

  it('draws cell lines only in data tables, not in layout tables', () => {
    expect(linedTables('border-width: 0 0 1px 1px')).toEqual(['kendo', 'nested', 'plain']);
  });

  it('gives a plain data table the same card outline as a Kendo grid', () => {
    const outline = rules.filter((rule) => rule.selector.includes('#frmUpdateTimesheet') &&
      /border: 1px solid var\(--lg-line\)/.test(rule.body) && /border-radius: 8px/.test(rule.body));
    const cards = outline.flatMap((rule) => Array.from(document.querySelectorAll(rule.selector), (node) => node.id || node.className));
    expect(cards.sort()).toEqual(['k-grid', 'nested', 'plain']);
  });
});
