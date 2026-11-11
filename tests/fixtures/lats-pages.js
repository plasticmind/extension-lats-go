/**
 * Synthetic LATS pages for tests.
 *
 * These approximate the LATS markup the extension depends on: input titles such as
 * "Day In Day 1 Thursday", #timesheetTable, #btnSaveTimesheet_0, the period header, the
 * holiday notice, and the TDS footer tables. TDS row labels follow the formats seen on live
 * LATS on 11/5/2026: "Direct: Sample Direct Category Code" and
 * "SUB_DEMO_Alpha ONE - Sample sub-task description". They are NOT captured from LATS. Replace them
 * with sanitized snapshots of real pages when you have them (see docs/requirements).
 *
 * Options add what live LATS has on some pages or accounts: the timesheet's right-hand Total
 * column, more rows, the Misc Leave section, and the totals rows; and the TDS page's holiday
 * notices. Input titles ("Day 3 Saturday") come from each fixture's own pay period.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Live LATS (11/5/2026) has three Extra Out/In pairs per day, all titled "Extra Out Day N Weekday".
const TIME_ROWS = [
  ['DayIn', 'Day In'],
  ['LunchOut', 'Lunch Out'],
  ['LunchIn', 'Lunch In'],
  ['ExtraOut1', 'Extra Out'],
  ['ExtraIn1', 'Extra In'],
  ['ExtraOut2', 'Extra Out'],
  ['ExtraIn2', 'Extra In'],
  ['ExtraOut3', 'Extra Out'],
  ['ExtraIn3', 'Extra In'],
  ['DayOut', 'Day Out']
];
const LEAVE_ROWS = [
  ['Vacation', 'Vacation'],
  ['Sick', 'Sick'],
  ['SickFamily', 'Sick Family'],
  ['Personal', 'Personal'],
  ['Holiday', 'Holiday'],
  ['Floater', 'Floater']
];

/** The IDs of the timesheet's leave rows, such as "Vacation" for "Vacation_rowLabelLeft". */
export const LEAVE_ROW_IDS = LEAVE_ROWS.map(([id]) => id);

function pad(n) {
  return String(n).padStart(2, '0');
}

function periodDays(start) {
  const [m, d, y] = start.split('/').map(Number);
  return Array.from({ length: 14 }, (_, i) => new Date(y, m - 1, d + i));
}

function us(date) {
  return pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + '/' + date.getFullYear();
}

/** How LATS titles a day's inputs after the row name: "Day 3 Saturday". */
function dayTitle(days, index) {
  return `Day ${index + 1} ${WEEKDAYS[days[index].getDay()]}`;
}

/** A day's value: the same value for every day, or a function of the day index (0–13). */
function dayValue(values, index) {
  return typeof values === 'function' ? values(index) : values;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One of LATS's notices in #topLeftMessages, such as "Holiday - 10/12/2026". */
export function holidayNotice(date) {
  return `<div class="k-label">Holiday - ${date}</div>`;
}

/**
 * What LATS writes in #topLeftMessages: an empty notice, then one per holiday (MM/DD/YYYY).
 * Live LATS always has the empty one.
 */
export function noticeLabels(holidays = []) {
  return '<div class="k-label"> </div>' + holidays.map(holidayNotice).join('');
}

function holidayNotices(holidays) {
  return `<div id="topLeftMessages">${noticeLabels(holidays)}</div>`;
}

// ========== TIMESHEET ==========

/**
 * The right-hand cell of a row that isn't an hours row. Live LATS has one in every row once
 * the grid has the Total column.
 */
function emptyTotalCell({ totalColumn }) {
  return totalColumn ? '<td></td>' : '';
}

/**
 * A timesheet grid row, for buildTimesheetHtml's `extraRows`: a label cell, a cell per day, and,
 * when the grid has the Total column, a right-hand label cell.
 * @param {string} label The row's name. Its inputs are titled "{label} Day 3 Saturday".
 * @param {Object} [options]
 * @param {string} [options.id] The row ID, as in "Vacation_rowLabelLeft" and "Vacation_rowLabelRight".
 *   Rows that only some accounts have can carry IDs the extension doesn't know, so it's optional.
 * @param {'input'|'checkbox'|'text'} [options.cells] What each day cell holds: a text input,
 *   a checkbox, or LATS's own text, such as "0".
 * @param {string|Function} [options.values] The days' values: one for every day, or a function
 *   of the day index (0–13).
 * @param {string} [options.button] The text of a LATS button in the label cell.
 * @param {boolean} [options.totalCell] False leaves out the right-hand label cell.
 * @param {string} [options.field] The field in the inputs' names. Defaults to the ID.
 */
export function timesheetRow(label, { id, cells = 'input', values = '0', button, totalCell = true, field = id } = {}) {
  return ({ days, locked, totalColumn }) => {
    const attrs = (i) => (field ? ` name="timesheet.Days[${i}].${field}"` : '') + ` title="${label} ${dayTitle(days, i)}"`;
    const content = {
      input: (i) => `<input type="text" class="timesheetCell"${attrs(i)} value="${dayValue(values, i)}"${locked ? ' readonly' : ''}>`,
      checkbox: (i) => `<input type="checkbox"${attrs(i)}${locked ? ' disabled' : ''}>`,
      text: (i) => dayValue(values, i)
    }[cells];
    const left = `<td${id ? ` id="${id}_rowLabelLeft"` : ''}>${label}` +
      (button ? ` <button type="button" class="k-button">${button}</button>` : '') + '</td>';
    const right = totalColumn && totalCell ? `<td${id ? ` id="${id}_rowLabelRight"` : ''}>${label}</td>` : '';
    return `<tr>${left}${days.map((_, i) => `<td class="timesheetCell">${content(i)}</td>`).join('')}${right}</tr>`;
  };
}

/**
 * LATS's Misc Leave section, with the "HOL - State Holiday" row that LATS adds on Save: the
 * section heading, the row's label (MiscLeave_0, with a Remove button), its hours, and the
 * Add Misc Leave list.
 * @param {Object} [options]
 * @param {string|Function} [options.values] The HOL hours: one value for every day, or a function of the day index.
 */
export function miscLeaveRows({ values = '0' } = {}) {
  return [
    (grid) => `<tr><td id="StartSectionMiscLeave" colspan="${grid.days.length + (grid.totalColumn ? 2 : 1)}">Misc Leave</td></tr>`,
    (grid) => '<tr><td id="MiscLeave_0">HOL - State Holiday <button type="button" class="k-button">Remove</button></td>' +
      grid.days.map(() => '<td class="timesheetCell"></td>').join('') + emptyTotalCell(grid) + '</tr>',
    timesheetRow('HOL - State Holiday', { values }),
    (grid) => `<tr><td>Add Misc Leave</td><td colspan="${grid.days.length}"><select><option>JUR - Jury Duty</option></select></td>` +
      emptyTotalCell(grid) + '</tr>'
  ];
}

/**
 * LATS's totals rows: Time Worked, Charges, and Total Time, whose day cells are IDed
 * totalRow_0 to totalRow_13.
 * @param {Object} [options]
 * @param {string|Function} [options.totalTime] Total Time per day: one value for every day, or a function of the day index.
 */
export function totalsRows({ totalTime = '0' } = {}) {
  const row = (label, cell) => (grid) =>
    `<tr><td>${label}</td>${grid.days.map((_, i) => cell(i)).join('')}${emptyTotalCell(grid)}</tr>`;
  return [
    row('Time Worked', () => '<td class="timesheetCell">0</td>'),
    row('Charges', () => '<td class="timesheetCell">0</td>'),
    row('Total Time', (i) => `<td id="totalRow_${i}">${dayValue(totalTime, i)}</td>`)
  ];
}

/**
 * A timesheet page: the period header, LATS's notices, the Save button, and the grid's time,
 * location, and leave rows.
 * @param {Object} [options]
 * @param {string} [options.start] The period's first day, MM/DD/YYYY.
 * @param {string[]} [options.holidays] State holidays for LATS's notices, MM/DD/YYYY.
 * @param {boolean} [options.locked] A period LATS won't let you edit: read-only inputs, no Save.
 * @param {string} [options.status] The timesheet status in the header.
 * @param {boolean} [options.totalColumn] Live LATS's right-hand column, which LATS Go! makes
 *   the Total column: a right-hand label cell in each row, and an empty cell in the header.
 * @param {Object} [options.rowOptions] Changes to built-in rows, by row ID, such as
 *   { Vacation: { values: '1' }, ExtraOut3: { id: 'Row12' } }. Takes timesheetRow's options.
 * @param {Function[]} [options.extraRows] Rows after the leave rows, from timesheetRow,
 *   miscLeaveRows, and totalsRows, in order.
 * @param {string} [options.belowGrid] HTML after the grid in the form, such as LATS's panels.
 */
export function buildTimesheetHtml({
  start = '10/08/2026',
  holidays = [],
  locked = false,
  status = 'Un-Submitted',
  totalColumn = false,
  rowOptions = {},
  extraRows = [],
  belowGrid = ''
} = {}) {
  const days = periodDays(start);
  const end = days[13];
  const grid = { days, locked, totalColumn };
  const header = days.map((d) =>
    `<th class="k-header timesheetGridHeader">${pad(d.getMonth() + 1)}/${pad(d.getDate())}<br>${WEEKDAYS[d.getDay()].slice(0, 3)}` +
    (d.getDay() === 0 || d.getDay() === 6 ? '' : ` <a onclick="return false;" href="#" id="error_${d.getDate()}"><img title="Multiple Errors" alt="warning icon" src="data:,"></a>`) + '</th>'
  ).join('');
  const builtIn = (label, options) => timesheetRow(label, { ...options, ...rowOptions[options.id] });
  const render = (rows) => rows.map((row) => row(grid)).join('');

  const save = locked ? '' : '<button id="btnSaveTimesheet_0" type="button" class="k-button">Save</button>';

  return `
    <div class="container">
      <form id="frmUpdateTimesheet">
        <div class="row">
          <div class="col-xs-12">Timesheet FY 2026 - 15 (${us(days[0])} - ${us(end)}) Status ${status}</div>
        </div>
        ${holidayNotices(holidays)}
        <div class="row">
          <div class="col-xs-9"></div>
          <div class="col-xs-3">${save}</div>
        </div>
        <table id="timesheetTable">
          <tr><td class="k-header"><button id="showExtrasTop" type="button" class="k-button"><span class="k-button-text">Extras</span></button></td>${header}${emptyTotalCell(grid)}</tr>
          ${render(TIME_ROWS.map(([id, label]) => builtIn(label, { id, values: '' })))}
          ${render([builtIn('On-Site', { id: 'On-Site', cells: 'checkbox', field: 'OnSite' })])}
          ${render([builtIn('Off-Site', { id: 'Off-Site', cells: 'checkbox', field: 'OffSite' })])}
          ${render(LEAVE_ROWS.map(([id, label]) => builtIn(label, { id })))}${render(extraRows)}
        </table>
      ${belowGrid}</form>
    </div>`;
}

// ========== TDS ==========

/**
 * A TDS row's contents: LATS's hidden fields with the row's codes, then its table. buildTdsHtml
 * wraps each row in <div class="distributionRow">, which LATS keeps when it rewrites a row in place.
 * @param {Object} row
 * @param {string} row.category The category code, such as "Direct".
 * @param {string} row.taskCode Such as "TST-1001".
 * @param {string} [row.description] The task's description. Defaults to "Sample Task".
 * @param {string} [row.subTask] The sub-task code. Rows without one link to "sub tasks".
 * @param {string} [row.subTaskDescription] Defaults to "Sample sub-task description".
 * @param {number[]} [row.hours] Hours per day.
 * @param {boolean} [row.hiddenCell] A hidden cell before the day cells, as some rows with
 *   sub-tasks have on live LATS, so the day cells don't line up with the header.
 * @param {number} index The row's position, for the input names and hidden field IDs.
 * @param {Object} [options] `start`, `titles`, and `hiddenFields`, as for buildTdsHtml.
 */
export function buildTdsRowHtml(row, index, { start = '10/22/2026', titles = true, hiddenFields = true } = {}) {
  const days = periodDays(start);
  const description = row.description || 'Sample Task';
  const subTaskDescription = row.subTaskDescription || 'Sample sub-task description';
  const fields = !hiddenFields ? '' : [
    ['CategoryCode', row.category],
    ['TaskCode', row.taskCode],
    ['TaskDescription', description],
    ['SubTask_0__Name', row.subTask],
    ['SubTask_0__Description', row.subTask ? subTaskDescription : '']
  ].filter(([, value]) => value)
    .map(([name, value]) => `<input type="hidden" id="Distributions_${index}__${name}" value="${escapeHtml(value)}">`).join('');
  const link = row.subTask ? escapeHtml(row.subTask + ' - ' + subTaskDescription) : 'sub tasks';
  const title = (i) => (titles ? ` title="Task Hours For ${dayTitle(days, i)}"` : '');
  const hours = (row.hiddenCell ? '<td style="display:none"></td>' : '') + days.map((_, i) =>
    `<td><input type="text" class="distributionCell" name="Distributions[${index}].Hours[${i}]"${title(i)} value="${(row.hours && row.hours[i]) || 0}"></td>`).join('');
  return `${fields}
      <table class="tdsGrid">
        <tr><td colspan="15">${escapeHtml(row.category)}: ${escapeHtml(row.category)} Category Code</td></tr>
        <tr><td colspan="15">&#9656; ${escapeHtml(row.taskCode)}: ${escapeHtml(description)} (Total Hours: 0) <a id="lnkSubTask_${100 + index}" href="javascript:tdsJS.DisplaySubTasks(${100 + index})">${link}</a></td></tr>
        <tr><td class="leftColumn"><a class="deleteLinkHref" href="#">Delete</a></td>${hours}</tr>
      </table>
    `;
}

/**
 * A TDS page: the pay period, the day header, the rows, and the footer's TDS Totals, Work
 * Totals, and dates.
 * @param {Object} [options]
 * @param {string} [options.start] The period's first day, MM/DD/YYYY.
 * @param {Object[]} [options.rows] The task rows. See buildTdsRowHtml.
 * @param {number[]} [options.work] Work Totals per day.
 * @param {string[]} [options.holidays] State holidays for a #topLeftMessages before the grid,
 *   MM/DD/YYYY. Without any, the page has no notices.
 * @param {boolean} [options.titles] Title the hour inputs as LATS does: "Task Hours For Day 3 Saturday".
 * @param {boolean} [options.hiddenFields] Give each row LATS's hidden fields with its codes,
 *   such as Distributions_0__TaskCode. Without them, LATS Go! reads the row's visible text.
 */
export function buildTdsHtml({ start = '10/22/2026', rows = [], work = [], holidays = [], titles = true, hiddenFields = true } = {}) {
  const days = periodDays(start);
  const end = days[13];
  const cells = (values) => days.map((_, i) => `<td>${values[i] ?? 0}</td>`).join('');
  const distribution = rows.map((row, r) => `
    <div class="distributionRow">${buildTdsRowHtml(row, r, { start, titles, hiddenFields })}</div>`).join('');

  return `${holidays.length ? holidayNotices(holidays) : ''}
    <div>Pay Period ${us(days[0])} - ${us(end)}</div>
    <div id="gridHeader"><table><tr><th></th>${days.map((d) => `<th class="timesheetGridHeader">${d.getMonth() + 1}/${d.getDate()}<br>${WEEKDAYS[d.getDay()].slice(0, 3)}</th>`).join('')}</tr></table></div>
    <div id="distributionRows">${distribution}</div>
    <div id="tdsFooter">
      <table class="tdsGrid"><tr><td class="leftColumn">TDS Totals</td>${cells([])}</tr></table>
      <table class="tdsGrid"><tr><td class="leftColumn">Work Totals</td>${cells(work)}</tr></table>
      <table class="tdsGrid"><tr><td class="leftColumn"></td>${cells(days.map((d) => d.getDate()))}</tr></table>
    </div>`;
}
