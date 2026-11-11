/**
 * LATS Go! LATS page restyle (UI-3, UI-4, FLOW-3)
 *
 * Small, additive DOM changes that styles/content.css builds on, so LATS's own timesheet and
 * TDS pages match the extension's UI. It never renames, removes, or reorders LATS inputs.
 *
 * Timesheet page:
 * - Day headers show the weekday over a muted date, and state holidays get a tag.
 * - The right-hand column becomes a Total column: hours rows (leave and charges) and the
 *   totals rows show their period sums.
 * - The status value becomes a labeled pill.
 * - Hours rows that are empty or zero on every day, whatever LATS calls them, hide behind an
 *   "Empty rows" toggle.
 *
 * TDS page:
 * - Each row shows a title (the sub-task or task description) over a muted code line, read
 *   from LATS's hidden fields, on the same line as its hours.
 * - A right-hand Total column runs through the header, rows, and footer. A <colgroup> keeps
 *   LATS's separate header, row, and footer tables aligned.
 * - The Browse/Search task picker becomes one compact row (CSS only).
 * - Every decoration comes back when LATS re-renders the grid (LatsGo.onLatsChange).
 *
 * Both pages: weekend columns get data-weekend. This file is the only place that sets it.
 * The Timesheet and TDS tabs move to the front of LATS's top tab bar.
 * LATS's "Holiday - 11/11/2026" notices become one info alert with a link to the state's
 * holiday calendar.
 *
 * Loaded after utils.js and before content.js, in the same isolated world.
 */

(function () {
  'use strict';

  const LG = LatsGo;
  const { el, setText, setFlag, numberIn } = LG;
  const TOTAL_ROW_LABELS = ['Time Worked', 'Charges', 'Total Time'];
  // Leave rows, by their row ID ("Vacation" for "Vacation_rowLabelLeft"). They're always hours
  // rows, whatever their contents or cell count. hoursRows() adds rows that aren't on this list.
  const LEAVE_ROW_IDS = ['OTMeal', 'Vacation', 'Sick', 'SickFamily', 'Personal', 'NonComp', 'Holiday', 'Floater', 'VRWSCharge'];
  // Time and location rows always show. Match them by label, input title ("Extra Out Day 3
  // Saturday"), or row ID, so a change to one of the three doesn't hide them.
  const FIXED_ROW_LABEL = new RegExp('^(' + LG.TIME_ROW_NAMES.concat('Extra Out', 'Extra In', 'On-?Site', 'Off-?Site').join('|') + ')\\b', 'i');
  const FIXED_ROW_ID = /^(DayIn|DayOut|LunchOut|LunchIn|Extra|On-?Site|Off-?Site)/i;
  // Blank, "0", "0.0", or ".00".
  const ZERO = /^0*\.?0*$/;

  /** Day cells of a timesheet row: everything between the left label and the Total column. */
  function dayCells(row) {
    return Array.prototype.slice.call(row.cells, 1, -1);
  }

  /** The row of a table that holds LATS's day headers. */
  function headerRow(table) {
    return Array.prototype.find.call(table.rows, function (row) { return row.querySelector('th.timesheetGridHeader'); });
  }

  function sumInputs(inputs) {
    return Array.prototype.reduce.call(inputs, function (sum, input) {
      return sum + (parseFloat(input.value) || 0);
    }, 0);
  }

  // ========== SHARED ==========

  /** Move LATS's per-day warning link ("Multiple Errors") next to the day name. */
  function placeErrorIcon(th) {
    const link = th.querySelector(':scope > a[id^="error_"]');
    const name = th.querySelector('.lg-dayhead__name');
    if (link && name) name.appendChild(link);
  }

  /**
   * Replace "11/05 Thu" with a weekday over a muted date. LATS's text stays in the DOM. Safe to
   * run again: LATS can add holiday notices after load, so the Holiday tag stays in sync.
   */
  function decorateDayHeader(th, range, holidays) {
    let head = th.querySelector('.lg-dayhead');
    if (!head) {
      const text = th.textContent.replace(/\s+/g, ' ');
      const date = LG.parseHeaderDate(text, range);
      if (!date) return;
      const weekdayMatch = text.match(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/);
      head = el('span', { className: 'lg-dayhead', 'data-date': LG.dateKey(date) }, [
        el('span', { className: 'lg-dayhead__name', text: weekdayMatch ? weekdayMatch[1] : LG.WEEKDAYS[date.getDay()].short }),
        el('span', { className: 'lg-dayhead__date', text: LG.shortDate(date) })
      ]);
      th.classList.add('lg-has-dayhead');
      th.insertBefore(head, th.firstChild);
    }
    const isHoliday = holidays.indexOf(head.getAttribute('data-date')) !== -1;
    const tag = head.querySelector('.lg-dayhead__tag');
    if (isHoliday && !tag) head.appendChild(el('span', { className: 'lg-dayhead__tag', text: 'Holiday' }));
    else if (!isHoliday && tag) tag.remove();
    setFlag(th, 'data-holiday', isHoliday);
    placeErrorIcon(th);
  }

  /** Turn status values ("Un-Submitted") that follow a "...Status" label into pills (FLOW-3). */
  function decorateStatuses() {
    document.querySelectorAll('label.k-label').forEach(function (label) {
      if (!/Status\s*$/.test(label.textContent.trim())) return;
      let node = label.nextSibling;
      while (node && node.nodeType === 3 && !node.textContent.trim()) node = node.nextSibling;
      if (!node) return;
      let value;
      if (node.nodeType === 3) {
        value = node.textContent.trim();
        const pill = el('span', { className: 'lg-status-pill', text: value });
        node.parentNode.replaceChild(pill, node);
        node = pill;
      } else if (node.classList && node.classList.contains('lg-status-pill')) {
        value = node.textContent.trim();
      } else if (node.nodeType === 1 && node.children.length === 0 && node.textContent.trim()) {
        value = node.textContent.trim();
        node.classList.add('lg-status-pill');
      } else {
        return;
      }
      node.setAttribute('data-status', value.toLowerCase().replace(/[^a-z]/g, ''));
    });
  }

  // ========== TOP TABS ==========

  /**
   * The tabs that go first in LATS's top tab bar, in order. Each matches a tab by its link
   * text, or else by the page its link opens.
   */
  const PRIMARY_TABS = [
    { text: /^Timesheets?$/i, href: /(^|\/)Timesheet(\/Index)?\/?([?#]|$)/i },
    { text: /^(TDS|Time Distribution)$/i, href: /(^|\/)TimeDistribution([/?#]|$)/i }
  ];

  /**
   * True for a tab bar that switches panels in place, such as the TDS task picker's Browse
   * and Search tabs. Widgets like these can depend on each tab's position.
   */
  function isInPageTabBar(list) {
    if (list.closest('.k-tabstrip, [data-role="tabstrip"]')) return true;
    return Array.prototype.some.call(list.querySelectorAll('a'), function (link) {
      const toggle = link.getAttribute('data-toggle') || link.getAttribute('data-bs-toggle') || '';
      return /^(tab|pill)$/.test(toggle) || /^#./.test(link.getAttribute('href') || '');
    });
  }

  /** The first tab in `items` that matches `tab` by text, then by href, skipping `taken`. */
  function findTab(items, tab, taken) {
    const links = items.filter(function (li) { return taken.indexOf(li) === -1; })
      .map(function (li) { return { li: li, link: li.querySelector('a') }; })
      .filter(function (entry) { return entry.link; });
    const match = links.find(function (entry) { return tab.text.test(LG.normalizeSpace(entry.link.textContent)); }) ||
      links.find(function (entry) { return tab.href.test(entry.link.getAttribute('href') || ''); });
    return match ? match.li : null;
  }

  /**
   * Put the Timesheet and TDS tabs first in LATS's top tab bar. Other tabs, such as a
   * supervisor's Approval List, keep their order after them.
   *
   * LATS's top tabs are links to separate pages (/Timesheet and /TimeDistribution), so LATS
   * doesn't depend on their position. Moving the <li> elements, instead of using CSS `order`,
   * keeps keyboard focus order and screen reader order the same as the visual order. Bars
   * that switch panels in place are left alone. Safe to run again: it only moves tabs that
   * are out of order.
   */
  function orderTopTabs() {
    document.querySelectorAll('ul.nav-tabs').forEach(function (list) {
      if (isInPageTabBar(list)) return;
      const items = Array.prototype.filter.call(list.children, function (child) { return child.tagName === 'LI'; });
      const primary = [];
      PRIMARY_TABS.forEach(function (tab) {
        const li = findTab(items, tab, primary);
        if (li) primary.push(li);
      });
      if (!primary.length) return;
      const others = items.filter(function (li) { return primary.indexOf(li) === -1; });
      const inOrder = primary.concat(others).every(function (li, index) { return items[index] === li; });
      if (inOrder) return;
      const before = others[0] || null;
      primary.forEach(function (li) { list.insertBefore(li, before); });
    });
  }

  // The tab bar doesn't depend on the grid, and a /Time* page without a grid never reaches
  // whenLatsReady, so run now. Run again on load in case LATS adds tabs late.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', orderTopTabs);
  else orderTopTabs();
  window.addEventListener('load', orderTopTabs);

  // ========== TIMESHEET PAGE (UI-3) ==========

  function rowLabel(row) {
    return row.cells[0] ? row.cells[0].textContent.replace(/\s+/g, ' ').trim() : '';
  }

  /** A row's ID from its label cell: "Vacation" for "Vacation_rowLabelLeft", or '' without one. */
  function rowId(row) {
    const match = row.cells[0] && /^(.+)_rowLabelLeft$/.exec(row.cells[0].id);
    return match ? match[1] : '';
  }

  /** A row's last cell, unless that's its label cell. */
  function lastCell(row) {
    const last = row.cells[row.cells.length - 1];
    return last && last !== row.cells[0] ? last : null;
  }

  /** The sum in a Total column cell, added on first use. */
  function sumCell(cell) {
    if (!cell) return null;
    cell.classList.add('lg-total-col');
    let span = cell.querySelector(':scope > .lg-rowsum');
    if (!span) {
      span = el('span', { className: 'lg-rowsum' });
      cell.appendChild(span);
    }
    return span;
  }

  /**
   * An hours row's Total column cell: LATS's right-hand label cell ("Vacation_rowLabelRight"),
   * or else the last cell when the row has as many cells as the header. Null otherwise, so a
   * row that doesn't line up never gets a sum in one of its day cells.
   */
  function hoursTotalCell(row, header) {
    const last = lastCell(row);
    return last && (/_rowLabelRight$/.test(last.id) || row.cells.length === header.cells.length) ? last : null;
  }

  /** True for a leave row in LEAVE_ROW_IDS, such as Vacation or Sick. */
  function isKnownLeaveRow(row) {
    return LEAVE_ROW_IDS.indexOf(rowId(row)) !== -1;
  }

  /** True for the Time Worked, Charges, and Total Time rows. */
  function isTotalsRow(row) {
    return TOTAL_ROW_LABELS.indexOf(rowLabel(row)) !== -1 || !!row.querySelector('[id^="totalRow"]');
  }

  /** True for a time row (Day In, Lunch Out, Extra In, and so on) or a location row (On-Site, Off-Site). */
  function isFixedRow(row) {
    return FIXED_ROW_LABEL.test(rowLabel(row)) || FIXED_ROW_ID.test(rowId(row)) ||
      Array.prototype.some.call(row.querySelectorAll('input[title]'), function (input) {
        return FIXED_ROW_LABEL.test(input.title);
      });
  }

  /**
   * The rows that hold hours per day: leave and charge rows such as Vacation, Earned NonComp,
   * and Overtime. The leave rows in LEAVE_ROW_IDS always count. Other rows count when they
   * look like hours rows, whatever LATS calls them. Header, time, location, totals, and section
   * heading rows don't, and neither does the Misc Leave section, from its heading to the totals
   * rows. Nor does any row with a button, list, or checkbox, or with a different number of
   * cells than the header.
   */
  function hoursRows(table) {
    const header = headerRow(table);
    if (!header) return [];
    let inMiscLeave = false;
    return Array.prototype.filter.call(table.rows, function (row) {
      if (isKnownLeaveRow(row)) return true;
      if (row.querySelector('th')) return false;
      if (row.querySelector('[id^="StartSectionMisc"], [id^="MiscLeave"]')) inMiscLeave = true;
      if (isTotalsRow(row)) {
        inMiscLeave = false;
        return false;
      }
      return !inMiscLeave && row.cells.length === header.cells.length && !!rowLabel(row) &&
        !row.querySelector('[id^="StartSection"], button, select, input[type="checkbox"], input[type="radio"]') &&
        !isFixedRow(row);
    });
  }

  /**
   * The grid's header row, hours rows, and totals rows, for refreshes until LATS rebuilds the
   * grid. Rows that are no longer hours rows lose their data-has-values mark.
   */
  function classifyRows(table) {
    const hours = hoursRows(table);
    Array.prototype.forEach.call(table.rows, function (row) {
      if (hours.indexOf(row) === -1 && row.hasAttribute('data-has-values')) row.removeAttribute('data-has-values');
    });
    return { header: headerRow(table), hours: hours, totals: Array.prototype.filter.call(table.rows, isTotalsRow) };
  }

  /**
   * A day cell's hours, and whether it holds any. Hours come from the cell's inputs or, in rows
   * that LATS fills in itself, its text. The cell holds hours when an input has anything but
   * blanks and zeros or, without inputs, when its number isn't zero. Label text, such as a
   * right-hand label in a row that doesn't line up with the header, doesn't count.
   */
  function readCell(cell) {
    const inputs = cell.querySelectorAll('input:not([type="hidden"])');
    if (!inputs.length) {
      const hours = numberIn(cell);
      return { hours: hours, filled: hours !== 0 };
    }
    return {
      hours: sumInputs(inputs),
      filled: Array.prototype.some.call(inputs, function (input) { return !ZERO.test(input.value.trim()); })
    };
  }

  /**
   * Sum an hours row in its Total column cell, and mark it with data-has-values, which hides
   * empty rows behind the Empty rows button. Every cell after the label counts, except the
   * Total column, so a row with more or fewer cells than the header still counts all its days.
   */
  function updateHoursRow(row, header) {
    const totalCell = hoursTotalCell(row, header);
    let total = 0;
    // A row you're typing in stays visible until you leave it, even when you clear it.
    let filled = row.contains(document.activeElement);
    Array.prototype.forEach.call(row.cells, function (cell, index) {
      if (index === 0 || cell === totalCell) return;
      const value = readCell(cell);
      total += value.hours;
      filled = filled || value.filled;
    });
    if (totalCell) setText(sumCell(totalCell), total ? LG.formatHours(total) : '');
    row.setAttribute('data-has-values', filled ? 'true' : 'false');
  }

  /** Sum a totals row (Time Worked, Charges, or Total Time) in its Total column cell. */
  function updateTotalsRow(row) {
    // LATS IDs these cells totalRow, totalRow_0, totalRow_1, and so on, so go by position.
    const span = sumCell(lastCell(row));
    const total = dayCells(row).reduce(function (sum, cell) { return sum + numberIn(cell); }, 0);
    if (span) setText(span, LG.formatHours(total));
  }

  function decorateTimesheetTable(table, range, holidays) {
    table.querySelectorAll('th.timesheetGridHeader').forEach(function (th) { decorateDayHeader(th, range, holidays); });

    Array.prototype.forEach.call(table.rows, function (row) {
      // Header rows: label the Total column.
      if (row.querySelector('th.timesheetGridHeader')) {
        row.classList.add('lg-grid-head');
        const last = row.cells[row.cells.length - 1];
        if (last && last.tagName === 'TD' && !last.querySelector('.lg-total-head')) {
          last.classList.add('lg-total-col');
          last.appendChild(el('span', { className: 'lg-total-head', text: 'Total' }));
        }
        return;
      }

      const id = rowId(row);
      if (id) {
        row.setAttribute('data-lg-row', id);
        const right = row.querySelector('td[id$="_rowLabelRight"]');
        if (right) right.classList.add('lg-total-col');
      }

      if (isTotalsRow(row)) {
        row.setAttribute('data-lg-total', ['worked', 'charges', 'total'][TOTAL_ROW_LABELS.indexOf(rowLabel(row))] || '');
        dayCells(row).forEach(function (cell) { cell.classList.toggle('lg-zero', !numberIn(cell)); });
      }
    });

    markColumns(table);
  }

  /**
   * Mark weekend and state holiday columns. Cells with an input go by the input's title
   * ("Day In Day 3 Saturday"); other cells go by the header row's column, in rows that have
   * the same number of cells as the header.
   */
  function markColumns(table) {
    const header = headerRow(table);
    if (!header) return;
    const weekend = [];
    const holiday = [];
    Array.prototype.forEach.call(header.cells, function (cell, index) {
      if (LG.isWeekendHeader(cell.textContent)) weekend.push(index);
      if (cell.getAttribute('data-holiday') === 'true') holiday.push(index);
    });
    Array.prototype.forEach.call(table.rows, function (row) {
      if (row.cells.length !== header.cells.length) return;
      Array.prototype.forEach.call(row.cells, function (cell, index) {
        const input = cell.querySelector('input[title]');
        setFlag(cell, 'data-weekend', input ? LG.isWeekendTitle(input.title) : weekend.indexOf(index) !== -1);
        if (holiday.indexOf(index) !== -1) cell.setAttribute('data-holiday', 'true');
        else if (cell.tagName === 'TD' && cell.hasAttribute('data-holiday')) cell.removeAttribute('data-holiday');
      });
    });
  }

  /** "Vacation", "Vacation and Sick", "Vacation, Sick, and Personal", or "Vacation, Sick, Personal, and more". */
  function listNames(names) {
    return LG.formatList(names.length > 3 ? names.slice(0, 3).concat('more') : names);
  }

  /**
   * An "Empty rows" button in the grid's top-left corner, next to LATS's own Extras button, that
   * shows or hides hours rows that are empty or zero on every day. Rows with hours (from LATS or
   * Fill Timecard) always show. It reads the rows' data-has-values marks.
   *
   * It lives inside LATS's existing corner cell: adding rows or cells to LATS's grid breaks its
   * row-building code, which works by position.
   */
  function updateEmptyRowsButton(table) {
    const header = headerRow(table);
    const corner = header && header.cells[0];
    if (!corner || corner.tagName !== 'TD') return;

    let button = corner.querySelector('.lg-empty-rows-button');
    if (!button && !table.querySelector('tr[data-has-values]')) return;
    if (!button) {
      corner.classList.add('lg-grid-corner');
      button = el('button', { type: 'button', className: 'lg-empty-rows-button' });
      button.addEventListener('click', function () {
        document.documentElement.classList.toggle('lg-show-empty-rows');
        updateEmptyRowsButton(table);
      });
      corner.appendChild(button);
    }

    const empty = Array.prototype.map.call(table.querySelectorAll('tr[data-has-values="false"]'), rowLabel);
    const expanded = document.documentElement.classList.contains('lg-show-empty-rows');
    // The visible text is the button's name; the title lists the rows it shows.
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.title = expanded
      ? 'Hide empty rows'
      : 'Show ' + empty.length + ' empty ' + (empty.length === 1 ? 'row' : 'rows') +
        (empty.length ? ': ' + listNames(empty) : '');
    setText(button, expanded ? 'Empty rows' : 'Empty rows (' + empty.length + ')');
    button.hidden = !empty.length && !expanded;
  }

  /**
   * Mark the panel data tables under the grid with lg-data-table, for content.css: plain tables
   * with header cells and no tables inside them, outside Kendo grids. Layout tables stay
   * unmarked. Then put Work Totals right after Balances and Earnings so LATS's two half-width
   * columns sit side by side. Neither panel holds form inputs.
   */
  function arrangePanels() {
    document.querySelectorAll('#frmUpdateTimesheet .IgnoreReadOnly table').forEach(function (table) {
      table.classList.toggle('lg-data-table', !table.closest('.k-grid') && !table.querySelector('table') &&
        !!table.querySelector('th, td.k-header, tr.k-header'));
    });
    const balances = document.getElementById('TimesheetBalancesGrid');
    const balancesCol = balances && balances.closest('.col-xs-6');
    if (!balancesCol) return;
    const workCol = Array.prototype.find.call(balancesCol.parentElement.children, function (col) {
      return col !== balancesCol && col.classList.contains('col-xs-6') && !col.querySelector('input:not([type="hidden"])') &&
        Array.prototype.some.call(col.querySelectorAll('.k-header'), function (h) { return /Work Totals/.test(h.textContent); });
    });
    balancesCol.classList.add('lg-panel');
    if (!workCol) return;
    workCol.classList.add('lg-panel');
    if (balancesCol.nextElementSibling !== workCol) balancesCol.parentElement.insertBefore(workCol, balancesCol.nextElementSibling);
  }

  /** True when LATS has added the HOL - State Holiday row, which it does on Save. */
  function hasHolRow(table) {
    return Array.prototype.some.call(table.querySelectorAll('td[id^="MiscLeave_"]'), function (cell) {
      return /\bHOL\b/.test(cell.textContent);
    });
  }

  function buildHolidayAlert() {
    return LG.alert({
      type: 'info',
      icon: 'info',
      heading: 'State holiday reminder',
      className: 'lg-holiday-alert',
      // nys-alert's info type: a polite status region, so the reminder doesn't interrupt.
      body: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }
    }, [
      el('p', { 'data-role': 'dates' }),
      el('p', { 'data-role': 'note' }),
      el('p', { className: 'lg-alert__actions', 'data-role': 'links' })
    ]);
  }

  /**
   * Show LATS's "Holiday - 11/11/2026" notices as one info alert, right after #topLeftMessages.
   * It names the period's state holidays and links to each year's holiday calendar. On the
   * timesheet page, until LATS adds the HOL Misc Leave row, it says where the hours come from.
   *
   * LATS's notices stay rendered, only visually hidden, because LG.pageHolidays() reads them
   * from document.body.innerText. Safe to run again.
   */
  function updateHolidayAlert() {
    const notices = document.getElementById('topLeftMessages');
    if (!notices) return;
    notices.querySelectorAll('.k-label').forEach(function (label) {
      // LATS writes an empty .k-label before its notices.
      setFlag(label, 'data-lg-empty', !label.textContent.trim());
      const isHoliday = LG.findStateHolidays(label.textContent).length > 0;
      setFlag(label, 'data-lg-holiday', isHoliday);
      // The alert repeats the notice, so hide LATS's copy, from screen readers too.
      label.classList.toggle('lg-visually-hidden', isHoliday);
      setFlag(label, 'aria-hidden', isHoliday);
    });

    const holidays = LG.findStateHolidays(notices.textContent);
    let alert = document.querySelector('.lg-holiday-alert');
    if (!holidays.length) {
      if (alert) alert.remove();
      return;
    }
    // Fill a new alert before it goes in, so screen readers don't announce it on every load.
    if (!alert) alert = buildHolidayAlert();

    const many = holidays.length > 1;
    setText(alert.querySelector('[data-role="dates"]'), LG.formatHolidayList(holidays) +
      (many ? ' are observed New York State holidays.' : ' is an observed New York State holiday.'));

    const table = document.getElementById('timesheetTable');
    const note = alert.querySelector('[data-role="note"]');
    note.hidden = !table || hasHolRow(table);
    setText(note, note.hidden ? '' : 'LATS adds 7.5 hours of HOL - State Holiday' + (many ? ' to each one' : '') + ' when you save.');

    const years = holidays.map(function (key) { return key.slice(0, 4); })
      .filter(function (year, index, all) { return all.indexOf(year) === index; });
    const links = alert.querySelector('[data-role="links"]');
    if (links.getAttribute('data-years') !== years.join(' ')) {
      links.setAttribute('data-years', years.join(' '));
      links.textContent = '';
      years.forEach(function (year) {
        links.appendChild(el('a', { className: 'lg-alert__link', href: LG.holidayCalendarUrl(year), target: '_blank', rel: 'noopener' }, [
          'View the ' + year + ' State holiday calendar',
          el('span', { className: 'lg-visually-hidden', text: ' (opens in a new tab)' })
        ]));
      });
    }

    if (notices.nextElementSibling !== alert) notices.insertAdjacentElement('afterend', alert);
  }

  /** Period range and state holidays from the page text, which LATS can fill in after load. */
  function pageContext() {
    return { range: LG.parsePeriodRange(document.body.innerText), holidays: LG.pageHolidays() };
  }

  function enhanceTimesheet() {
    const table = document.getElementById('timesheetTable');
    if (!table) return;
    document.documentElement.classList.add('lg-restyled');
    // The grid's rows, classified once per decorateAll(). LATS rebuilding the grid reruns it.
    let grid = { header: null, hours: [], totals: [] };

    function decorateAll() {
      const context = pageContext();
      decorateTimesheetTable(table, context.range, context.holidays);
      decorateStatuses();
      // Empty summary values (Submitted Date, Approved Date) show a muted dash.
      ['submittedDate', 'approvedDate'].forEach(function (id) {
        const value = document.getElementById(id);
        if (value) setFlag(value, 'data-lg-empty', !value.textContent.trim());
      });
      arrangePanels();
      grid = classifyRows(table);
      refresh();
    }

    function refresh() {
      grid.hours.forEach(function (row) { updateHoursRow(row, grid.header); });
      grid.totals.forEach(updateTotalsRow);
      updateEmptyRowsButton(table);
    }

    // Fill Timecard fires change, input, and blur on every field it sets, so one refresh
    // covers all three.
    let refreshTimer = null;
    function scheduleRefresh() {
      if (refreshTimer !== null) return;
      refreshTimer = setTimeout(function () {
        refreshTimer = null;
        refresh();
      }, 0);
    }

    decorateAll();
    // Typing changes only its own row. LATS rewrites the totals rows itself, which wakes the
    // table observer, and the change and focusout refreshes cover the rest.
    table.addEventListener('input', function (event) {
      const row = event.target.closest && event.target.closest('tr');
      if (grid.hours.indexOf(row) === -1) return;
      updateHoursRow(row, grid.header);
      updateEmptyRowsButton(table);
    });
    table.addEventListener('change', scheduleRefresh);
    // A row you cleared stays visible while you're in it, even after you move to another day.
    // When focus leaves the row, refresh so it hides and the button's count is right.
    table.addEventListener('focusout', function (event) {
      const row = event.target.closest && event.target.closest('tr');
      if (row && !(event.relatedTarget && row.contains(event.relatedTarget))) scheduleRefresh();
    });

    // Redo the decorations when LATS rebuilds the grid's rows or writes its notices, which
    // LatsGo.onLatsChange describes.
    let timer = null;
    function schedule(mutations) {
      if (mutations && mutations.every(LG.isOwnMutation)) return;
      clearTimeout(timer);
      timer = setTimeout(decorateAll, 60);
    }
    new MutationObserver(schedule).observe(table, { childList: true, subtree: true });
    const notices = document.getElementById('topLeftMessages');
    if (notices) new MutationObserver(schedule).observe(notices, { childList: true, subtree: true, characterData: true });
    setTimeout(schedule, 1000);
    setTimeout(schedule, 3000);
  }

  // ========== TDS PAGE (UI-4) ==========

  /**
   * Give a TDS table a fixed column layout: a wide label column, 14 day columns, and a Total
   * column. `dataRow` is the row that holds the label cell and 14 day cells.
   */
  function addColumns(table, dataRow, totalTag) {
    if (!table || !dataRow) return null;
    table.classList.add('lg-cols');
    // Look for the parts themselves, not a marker: LATS can rewrite a table's contents in place.
    if (!table.querySelector(':scope > colgroup.lg-colgroup')) {
      const days = Array.prototype.filter.call(dataRow.cells, function (cell) { return !cell.classList.contains('lg-total-col'); }).length - 1;
      table.insertBefore(el('colgroup', { className: 'lg-colgroup' }, [
        el('col', { className: 'lg-col-label' }),
        el('col', { className: 'lg-col-day', span: String(Math.max(1, days)) }),
        el('col', { className: 'lg-col-total' })
      ]), table.firstChild);
    }
    if (dataRow.querySelector(':scope > .lg-total-col')) return null;
    const total = el(totalTag || 'td', { className: 'lg-total-col' });
    dataRow.appendChild(total);
    return total;
  }

  /** Decorate #gridHeader's day headers. Returns the weekend columns as 0-based day indexes. */
  function decorateTdsHeader(range) {
    const header = document.getElementById('gridHeader');
    if (!header) return [];
    const weekend = [];
    header.querySelectorAll('th.timesheetGridHeader').forEach(function (th, index) {
      decorateDayHeader(th, range, []);
      if (LG.isWeekendHeader(th.textContent)) {
        th.setAttribute('data-weekend', 'true');
        weekend.push(index);
      }
    });
    const table = header.tagName === 'TABLE' ? header : header.querySelector('table');
    const row = table && headerRow(table);
    const total = addColumns(table, row, 'th');
    if (total) total.appendChild(el('span', { className: 'lg-total-head', text: 'Total' }));
    return weekend;
  }

  /**
   * Safe to run again: it fills in only what's missing, so a row LATS rewrote gets it all back.
   * LATS can also update a row in place, rewriting its sub-task link or hidden fields. The
   * title block keeps a signature of what it was built from, and is rebuilt when that changes.
   */
  function decorateTdsRow(row) {
    const table = row.querySelector('table.tdsGrid') || row.querySelector('table');
    if (!table) return;
    const inputRow = Array.prototype.find.call(table.rows, function (r) { return r.querySelector('input.distributionCell'); });
    if (!inputRow) return;
    row.setAttribute('data-lg-row', 'true');
    row.classList.add('lg-tds-row');
    addColumns(table, inputRow);
    markTdsWeekends(row);

    const data = LG.readTdsRowFields(row);
    const labelCell = inputRow.cells[0];
    const link = row.querySelector('a[href*="DisplaySubTasks"]');
    const signature = JSON.stringify([data, link ? LG.normalizeSpace(link.textContent) : null]);
    const old = row.querySelector('.lg-task');
    if (old && old.getAttribute('data-lg-signature') === signature) return;
    // After the first pass, LATS's delete link lives in the old block's actions. Carry it over.
    const deleteLink = (old && old.querySelector('.lg-task__delete')) || labelCell.querySelector('a');
    if (old) old.remove();

    const title = data.subTaskDescription || data.taskDescription ||
      (link ? LG.parseSubTaskLabel(link.textContent).label : '') || data.taskCode || '';
    const meta = [data.taskCode, data.subTaskCode, data.categoryCode].filter(Boolean).join(' · ');

    const fullTitle = [title, data.taskDescription].filter(function (v, i, all) { return v && all.indexOf(v) === i; }).join(' — ');
    const actions = el('span', { className: 'lg-task__actions' });
    const block = el('div', { className: 'lg lg-task', 'data-lg-signature': signature }, [
      el('span', { className: 'lg-task__title', title: fullTitle, text: title }),
      el('span', { className: 'lg-task__meta', text: meta }),
      actions
    ]);

    if (link) {
      const id = (link.getAttribute('href') || '').replace(/\D/g, '');
      const subTask = el('button', {
        type: 'button',
        className: 'lg-link lg-task__action',
        'aria-label': (data.subTaskCode ? 'Change sub-task for ' : 'Add a sub-task to ') + title,
        text: data.subTaskCode ? 'Change sub-task' : 'Add sub-task'
      });
      subTask.addEventListener('click', function () {
        LG.callPage('showSubTasks', { id: parseInt(id, 10) }).catch(function () {});
      });
      actions.appendChild(subTask);
    }
    if (deleteLink) {
      deleteLink.classList.add('lg-task__action', 'lg-task__delete');
      deleteLink.setAttribute('aria-label', 'Delete ' + title);
      actions.appendChild(deleteLink);
    }
    labelCell.insertBefore(block, labelCell.firstChild);
  }

  /**
   * Mark weekend cells in a TDS row by each input's title ("Task Hours For Day 3 Saturday").
   * Rows with sub-tasks don't line up with the header by position, so titles are safer.
   */
  function markTdsWeekends(row) {
    row.querySelectorAll('input.distributionCell').forEach(function (input) {
      const cell = input.closest('td');
      if (cell) setFlag(cell, 'data-weekend', LG.isWeekendTitle(input.title));
    });
  }

  /**
   * TDS Totals, Work Totals, and the date row. Other footer tables (Approve) aren't day grids.
   * `weekend` holds the header's weekend columns, which mark the two totals tables.
   */
  function decorateTdsFooter(weekend) {
    LG.tdsFooterTables().slice(0, 3).forEach(function (table, index) {
      if (index < 2) {
        // Day cells follow the label cell.
        const cells = table.querySelectorAll('tr td');
        weekend.forEach(function (day) {
          if (cells[day + 1]) cells[day + 1].setAttribute('data-weekend', 'true');
        });
      }
      const row = table.rows[0];
      if (!row || row.cells.length < 8) return;
      table.classList.add(['lg-tds-totals', 'lg-work-totals', 'lg-tds-dates'][index]);
      addColumns(table, row);
    });
  }

  function updateTdsTotals() {
    document.querySelectorAll('.distributionRow[data-lg-row]').forEach(function (row) {
      const inputs = row.querySelectorAll('input.distributionCell');
      inputs.forEach(function (input) { input.classList.toggle('lg-zero', !parseFloat(input.value)); });
      const cell = row.querySelector('td.lg-total-col');
      if (!cell) return;
      const total = sumInputs(inputs);
      setText(cell, total ? LG.formatHours(total) : '–');
    });
    LG.tdsFooterTables().slice(0, 2).forEach(function (table) {
      const cell = table.querySelector('td.lg-total-col');
      if (!cell) return;
      const total = LG.tdsDayCells(table).reduce(function (sum, c) { return sum + numberIn(c); }, 0);
      setText(cell, LG.formatHours(total));
    });
  }

  function enhanceTds() {
    if (!document.getElementById('distributionRows') && !document.getElementById('tdsFooter')) return;
    let range = null;
    document.documentElement.classList.add('lg-restyled', 'lg-restyled-tds');

    // Every step skips what's already decorated, so this runs again whenever LATS changes the grid.
    function decorateTds() {
      range = range || LG.parsePeriodRange(document.body.innerText);
      const weekend = decorateTdsHeader(range);
      document.querySelectorAll('.distributionRow').forEach(decorateTdsRow);
      decorateTdsFooter(weekend);
      decorateStatuses();
      updateTdsTotals();
    }

    decorateTds();

    // Listen on the document, so the listeners outlive grid nodes that LATS replaces.
    document.addEventListener('input', function (event) {
      if (event.target.matches && event.target.matches('input.distributionCell')) updateTdsTotals();
    });
    document.addEventListener('change', function (event) {
      if (event.target.matches && event.target.matches('input.distributionCell')) updateTdsTotals();
    });

    LG.onLatsChange(LG.TDS_GRID, decorateTds, { tdsRowFields: true });
  }

  LG.whenLatsReady(function () {
    enhanceTimesheet();
    enhanceTds();
    // Both pages. The timesheet grid counts too, so the HOL note goes once LATS adds the HOL row.
    updateHolidayAlert();
    LG.onLatsChange('#topLeftMessages, #timesheetTable', updateHolidayAlert);
  });
})();
