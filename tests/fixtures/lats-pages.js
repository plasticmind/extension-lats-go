/**
 * Synthetic LATS pages for tests.
 *
 * These approximate the LATS markup the extension depends on: input titles such as
 * "Day In Day 1 Thursday", #timesheetTable, #btnSaveTimesheet_0, the period header, the
 * holiday notice, and the TDS footer tables. TDS row labels follow the formats seen on live
 * LATS on 11/5/2026: "Labor: Agencywide Labor Category Code" and
 * "DTO_ITS_ChatNY PRE - ChatNY Engage rated product exploration". They are NOT captured from LATS. Replace them
 * with sanitized snapshots of real pages when you have them (see docs/requirements).
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

export function buildTimesheetHtml({ start = '10/08/2026', holidays = [], locked = false, status = 'Un-Submitted' } = {}) {
  const days = periodDays(start);
  const end = days[13];
  const readonly = locked ? ' readonly' : '';
  const header = days.map((d) =>
    `<th class="k-header timesheetGridHeader">${pad(d.getMonth() + 1)}/${pad(d.getDate())}<br>${WEEKDAYS[d.getDay()].slice(0, 3)}` +
    (d.getDay() === 0 || d.getDay() === 6 ? '' : ` <a onclick="return false;" href="#" id="error_${d.getDate()}"><img title="Multiple Errors" alt="warning icon" src="data:,"></a>`) + '</th>'
  ).join('');

  const textRow = (id, label, value = '') => `<tr><td id="${id}_rowLabelLeft">${label}</td>${days.map((d, i) =>
    `<td class="timesheetCell"><input type="text" class="timesheetCell" name="timesheet.Days[${i}].${id}" title="${label} Day ${i + 1} ${WEEKDAYS[d.getDay()]}" value="${value}"${readonly}></td>`
  ).join('')}</tr>`;

  const checkRow = (id, label, field) => `<tr><td id="${id}_rowLabelLeft">${label}</td>${days.map((d, i) =>
    `<td class="timesheetCell"><input type="checkbox" name="timesheet.Days[${i}].${field}" title="${label} Day ${i + 1} ${WEEKDAYS[d.getDay()]}"${locked ? ' disabled' : ''}></td>`
  ).join('')}</tr>`;

  // Live LATS: #topLeftMessages holds an empty .k-label, then one per notice.
  const holidayNotices = '<div id="topLeftMessages"><div class="k-label"> </div>' +
    holidays.map((h) => `<div class="k-label">Holiday - ${h}</div>`).join('') + '</div>';
  const save = locked ? '' : '<button id="btnSaveTimesheet_0" type="button" class="k-button">Save</button>';

  return `
    <div class="container">
      <form id="frmUpdateTimesheet">
        <div class="row">
          <div class="col-xs-12">Timesheet FY 2026 - 15 (${us(days[0])} - ${us(end)}) Status ${status}</div>
        </div>
        ${holidayNotices}
        <div class="row">
          <div class="col-xs-9"></div>
          <div class="col-xs-3">${save}</div>
        </div>
        <table id="timesheetTable">
          <tr><td class="k-header"><button id="showExtrasTop" type="button" class="k-button"><span class="k-button-text">Extras</span></button></td>${header}</tr>
          ${TIME_ROWS.map(([id, label]) => textRow(id, label)).join('')}
          ${checkRow('On-Site', 'On-Site', 'OnSite')}
          ${checkRow('Off-Site', 'Off-Site', 'OffSite')}
          ${LEAVE_ROWS.map(([id, label]) => textRow(id, label, '0')).join('')}
        </table>
      </form>
    </div>`;
}

export function buildTdsHtml({ start = '10/22/2026', rows = [], work = [] } = {}) {
  const days = periodDays(start);
  const end = days[13];
  const cells = (values) => days.map((_, i) => `<td>${values[i] ?? 0}</td>`).join('');
  const distribution = rows.map((row, r) => `
    <div class="distributionRow">
      <table class="tdsGrid">
        <tr><td colspan="15">${row.category}: ${row.category} Category Code</td></tr>
        <tr><td colspan="15">&#9656; ${row.taskCode}: Sample Task (Total Hours: 0) <a id="lnkSubTask_${100 + r}" href="javascript:tdsJS.DisplaySubTasks(${100 + r})">${row.subTask ? row.subTask + ' - Sample sub-task description' : 'sub tasks'}</a></td></tr>
        <tr><td class="leftColumn"><a class="deleteLinkHref" href="#">Delete</a></td>${days.map((_, i) =>
    `<td><input type="text" class="distributionCell" name="Distributions[${r}].Hours[${i}]" value="${(row.hours && row.hours[i]) || 0}"></td>`).join('')}</tr>
      </table>
    </div>`).join('');

  return `
    <div>Pay Period ${us(days[0])} - ${us(end)}</div>
    <div id="gridHeader"><table><tr><th></th>${days.map((d) => `<th class="timesheetGridHeader">${d.getMonth() + 1}/${d.getDate()}<br>${WEEKDAYS[d.getDay()].slice(0, 3)}</th>`).join('')}</tr></table></div>
    <div id="distributionRows">${distribution}</div>
    <div id="tdsFooter">
      <table class="tdsGrid"><tr><td class="leftColumn">TDS Totals</td>${cells([])}</tr></table>
      <table class="tdsGrid"><tr><td class="leftColumn">Work Totals</td>${cells(work)}</tr></table>
      <table class="tdsGrid"><tr><td class="leftColumn"></td>${cells(days.map((d) => d.getDate()))}</tr></table>
    </div>`;
}
