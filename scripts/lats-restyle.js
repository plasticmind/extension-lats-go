/**
 * LATS Go! LATS page restyle (UI-3, UI-4, FLOW-3)
 *
 * Small, additive DOM changes that styles/content.css builds on, so LATS's own timesheet and
 * TDS pages match the extension's UI. It never renames, removes, or reorders LATS inputs.
 *
 * Timesheet page:
 * - Day headers show the weekday over a muted date, and state holidays get a tag.
 * - The right-hand column becomes a Total column: leave rows and the totals rows show their
 *   period sums, and the Total Time row shows durations ("7h 30m") under LATS's decimals.
 * - The status value becomes a labeled pill.
 * - Empty leave rows are hidden behind a "Show empty leave rows" toggle.
 *
 * TDS page:
 * - Each row shows a title (the sub-task or task description) over a muted code line, read
 *   from LATS's hidden fields, on the same line as its hours.
 * - A right-hand Total column runs through the header, rows, and footer. A <colgroup> keeps
 *   LATS's separate header, row, and footer tables aligned.
 * - The Browse/Search task picker becomes one compact row (CSS only).
 *
 * Both pages: weekend columns get data-weekend. This file is the only place that sets it.
 *
 * Loaded after utils.js and before content.js, in the same isolated world.
 */

(function () {
  'use strict';

  const LG = LatsGo;
  const { el, setText, setFlag, numberIn } = LG;
  const LEAVE_ROW_IDS = ['OTMeal', 'Vacation', 'Sick', 'SickFamily', 'Personal', 'NonComp', 'Holiday', 'Floater', 'VRWSCharge'];
  const TOTAL_ROW_LABELS = ['Time Worked', 'Charges', 'Total Time'];

  /** A totals cell's value from LATS's own text, ignoring the duration LATS Go! adds. */
  function cellValue(cell) {
    const text = Array.prototype.filter.call(cell.childNodes, function (node) { return node.nodeType === 3; })
      .map(function (node) { return node.textContent; }).join('');
    return parseFloat(text.replace(/[^\d.-]/g, '')) || 0;
  }

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

  // ========== TIMESHEET PAGE (UI-3) ==========

  function rowLabel(row) {
    return row.cells[0] ? row.cells[0].textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function sumCell(row) {
    const last = row.cells[row.cells.length - 1];
    if (!last || last === row.cells[0]) return null;
    last.classList.add('lg-total-col');
    let span = last.querySelector(':scope > .lg-rowsum');
    if (!span) {
      span = el('span', { className: 'lg-rowsum' });
      last.appendChild(span);
    }
    return span;
  }

  function updateTimesheetSums(table) {
    Array.prototype.forEach.call(table.rows, function (row) {
      const first = row.cells[0];
      if (!first) return;
      const leaveId = LEAVE_ROW_IDS.find(function (id) { return first.id === id + '_rowLabelLeft'; });
      if (leaveId) {
        const total = sumInputs(row.querySelectorAll('input[type="text"]'));
        setText(sumCell(row), total ? LG.formatHours(total) : '');
        // Empty leave rows collapse behind "Show empty leave rows".
        row.setAttribute('data-has-values', total ? 'true' : 'false');
        return;
      }
      if (TOTAL_ROW_LABELS.indexOf(rowLabel(row)) !== -1) {
        // LATS IDs these cells totalRow, totalRow_0, totalRow_1, and so on, so go by position.
        const total = dayCells(row).reduce(function (sum, cell) { return sum + cellValue(cell); }, 0);
        const span = sumCell(row);
        if (!span) return;
        span.textContent = '';
        span.appendChild(el('span', { className: 'lg-rowsum__value', text: LG.formatHours(total) }));
        if (total) span.appendChild(el('span', { className: 'lg-rowsum__duration', text: LG.formatDuration(total) }));
      }
    });
  }

  function decorateTimesheetTable(table, range, holidays) {
    table.querySelectorAll('th.timesheetGridHeader').forEach(function (th) { decorateDayHeader(th, range, holidays); });

    Array.prototype.forEach.call(table.rows, function (row) {
      const label = rowLabel(row);
      const first = row.cells[0];
      if (!first) return;

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

      if (/_rowLabelLeft$/.test(first.id)) {
        const rowId = first.id.replace(/_rowLabelLeft$/, '');
        row.setAttribute('data-lg-row', rowId);
        const right = row.querySelector('td[id$="_rowLabelRight"]');
        if (right) right.classList.add('lg-total-col');
      }

      const totalIndex = TOTAL_ROW_LABELS.indexOf(label);
      if (totalIndex !== -1) {
        row.setAttribute('data-lg-total', ['worked', 'charges', 'total'][totalIndex]);
        dayCells(row).forEach(function (cell) {
          const value = cellValue(cell);
          cell.classList.toggle('lg-zero', !value);
          let duration = cell.querySelector('.lg-duration');
          if (totalIndex === 2 && value) {
            if (!duration) {
              duration = el('span', { className: 'lg-duration' });
              cell.appendChild(duration);
            }
            setText(duration, LG.formatDuration(value));
          } else if (duration) {
            duration.remove();
          }
        });
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

  /** Elements whose contents belong to LATS Go!, for LG.isOwnMutation. */
  const OWN_SELECTOR = '.lg-rowsum, .lg-dayhead, .lg-duration, .lg-total-head, .lg-leave-button, .lg-holiday-note';

  function isOwnMutation(mutation) {
    return LG.isOwnMutation(mutation, OWN_SELECTOR);
  }

  /**
   * A "Leave" button in the grid's top-left corner, next to LATS's own Extras button, that shows
   * or hides empty leave rows. Rows with hours (from LATS or Fill Timecard) always show.
   *
   * It lives inside LATS's existing corner cell: adding rows or cells to LATS's grid breaks its
   * row-building code, which works by position.
   */
  function updateLeaveButton(table) {
    const leaveRows = LEAVE_ROW_IDS.map(function (id) {
      const label = document.getElementById(id + '_rowLabelLeft');
      return label && label.closest('tr');
    }).filter(Boolean);
    const header = headerRow(table);
    const corner = header && header.cells[0];
    if (!leaveRows.length || !corner || corner.tagName !== 'TD') return;

    let button = corner.querySelector('.lg-leave-button');
    if (!button) {
      corner.classList.add('lg-grid-corner');
      button = el('button', { type: 'button', className: 'lg-leave-button' });
      button.addEventListener('click', function () {
        document.documentElement.classList.toggle('lg-show-empty-leave');
        updateLeaveButton(table);
      });
      corner.appendChild(button);
    }

    const empty = leaveRows.filter(function (row) { return row.getAttribute('data-has-values') === 'false'; }).length;
    const expanded = document.documentElement.classList.contains('lg-show-empty-leave');
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.setAttribute('aria-label', expanded
      ? 'Hide empty leave rows'
      : 'Show ' + empty + ' empty leave rows: Vacation, Sick, Personal, and more');
    button.title = button.getAttribute('aria-label');
    setText(button, expanded ? 'Leave' : 'Leave (' + empty + ')');
    button.hidden = !empty && !expanded;
  }

  /**
   * Put Work Totals right after Balances and Earnings so LATS's two half-width columns sit side
   * by side. Neither panel holds form inputs.
   */
  function arrangePanels() {
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

  /** On a state holiday, explain where its hours come from when LATS hasn't added them yet. */
  function decorateHolidayNotice(holidays) {
    if (!holidays.length) return;
    const hasHolRow = Array.prototype.some.call(document.querySelectorAll('#timesheetTable td[id^="MiscLeave_"]'), function (cell) {
      return /\bHOL\b/.test(cell.textContent);
    });
    document.querySelectorAll('#topLeftMessages .k-label').forEach(function (label) {
      if (!/Holiday\s*-\s*\d/.test(label.textContent)) return;
      let note = label.querySelector('.lg-holiday-note');
      if (hasHolRow) {
        if (note) note.remove();
        return;
      }
      if (!note) {
        note = el('span', { className: 'lg-holiday-note' });
        label.appendChild(note);
      }
      setText(note, 'LATS adds 7.5 hours of HOL - State Holiday when you save.');
    });
  }

  /** Period range and state holidays from the page text, which LATS can fill in after load. */
  function pageContext() {
    const text = document.body.innerText;
    return { range: LG.parsePeriodRange(text), holidays: LG.findStateHolidays(text) };
  }

  function enhanceTimesheet() {
    const table = document.getElementById('timesheetTable');
    if (!table) return;
    document.documentElement.classList.add('lg-restyled');

    function decorateAll() {
      const context = pageContext();
      document.querySelectorAll('#topLeftMessages .k-label').forEach(function (label) {
        setFlag(label, 'data-lg-empty', !label.textContent.trim());
      });
      decorateTimesheetTable(table, context.range, context.holidays);
      decorateStatuses();
      // Empty summary values (Submitted Date, Approved Date) show a muted dash.
      ['submittedDate', 'approvedDate'].forEach(function (id) {
        const value = document.getElementById(id);
        if (value) setFlag(value, 'data-lg-empty', !value.textContent.trim());
      });
      decorateHolidayNotice(context.holidays);
      arrangePanels();
      refresh();
    }

    function refresh() {
      updateTimesheetSums(table);
      updateLeaveButton(table);
    }

    decorateAll();
    table.addEventListener('input', refresh);
    table.addEventListener('change', function () { setTimeout(refresh, 0); });

    // LATS rebuilds the grid's body rows after load and after some actions (such as removing
    // a Misc Leave row), and writes notices such as "Holiday - 11/11/2026" after load. Both
    // drop or outdate these decorations, so redo them.
    let timer = null;
    function schedule(mutations) {
      if (mutations && mutations.every(isOwnMutation)) return;
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
    if (!table || !dataRow || table.hasAttribute('data-lg-cols')) return null;
    table.setAttribute('data-lg-cols', 'true');
    table.classList.add('lg-cols');
    table.insertBefore(el('colgroup', {}, [
      el('col', { className: 'lg-col-label' }),
      el('col', { className: 'lg-col-day', span: String(Math.max(1, dataRow.cells.length - 1)) }),
      el('col', { className: 'lg-col-total' })
    ]), table.firstChild);
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

  function decorateTdsRow(row) {
    if (row.hasAttribute('data-lg-row')) return;
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
    const deleteLink = labelCell.querySelector('a');

    const title = data.subTaskDescription || data.taskDescription ||
      (link ? LG.parseSubTaskLabel(link.textContent).label : '') || data.taskCode || '';
    const meta = [data.taskCode, data.subTaskCode, data.categoryCode].filter(Boolean).join(' · ');

    const fullTitle = [title, data.taskDescription].filter(function (v, i, all) { return v && all.indexOf(v) === i; }).join(' — ');
    const actions = el('span', { className: 'lg-task__actions' });
    const block = el('div', { className: 'lg lg-task' }, [
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
    const range = LG.parsePeriodRange(document.body.innerText);
    document.documentElement.classList.add('lg-restyled', 'lg-restyled-tds');
    const weekend = decorateTdsHeader(range);
    document.querySelectorAll('.distributionRow').forEach(decorateTdsRow);
    decorateTdsFooter(weekend);
    decorateStatuses();
    updateTdsTotals();

    document.addEventListener('input', function (event) {
      if (event.target.matches && event.target.matches('input.distributionCell')) updateTdsTotals();
    });
    document.addEventListener('change', function (event) {
      if (event.target.matches && event.target.matches('input.distributionCell')) updateTdsTotals();
    });

    const rows = document.getElementById('distributionRows');
    if (rows) {
      let timer = null;
      new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          document.querySelectorAll('.distributionRow:not([data-lg-row])').forEach(decorateTdsRow);
          updateTdsTotals();
        }, 100);
      }).observe(rows, { childList: true });
    }
  }

  LG.whenLatsReady(function () {
    enhanceTimesheet();
    enhanceTds();
  });
})();
