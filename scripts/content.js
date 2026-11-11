/**
 * LATS Go! content script
 * Injected on *://*.lats.ny.gov/Time* (the timesheet and TDS pages).
 *
 * - Timesheet page: Fill Timecard dialog (UI-2, SCHED-1, SCHED-3, SCHED-5, SCHED-6) and the
 *   locked-period callout (FLOW-1).
 * - TDS page: Copy rows from last period (TDS-1) and the live Remaining row (TDS-2).
 *
 * Content scripts can't reach LATS's jQuery, Kendo widgets, or modules. Anything that needs
 * them goes through scripts/page-bridge.js, which runs in the page's main world.
 */

if (!window.latsGoInitialized) {
  window.latsGoInitialized = true;

  (function () {
    'use strict';

    const LG = LatsGo;
    const { el, setText, numberIn, shortDate, icon } = LG;
    const TITLE_PATTERN = /^(.*\S)\s+Day\s+(\d+)\s+([A-Za-z]+)$/;
    const TDS_HISTORY_KEY = 'tdsHistory';
    const TDS_HISTORY_LIMIT = 8;

    // ========== DOM HELPERS ==========

    function sleep(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function longDate(date) {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    function formatRange(start, end) {
      if (start.getFullYear() === end.getFullYear()) {
        return shortDate(start) + ' – ' + shortDate(end) + ', ' + end.getFullYear();
      }
      return shortDate(start) + ', ' + start.getFullYear() + ' – ' + shortDate(end) + ', ' + end.getFullYear();
    }

    // ========== TOASTS ==========

    let toastRegion = null;
    let toastTimer = null;

    function showToast(message, type) {
      type = type || 'success';
      if (!toastRegion) {
        toastRegion = el('div', { className: 'lg', 'aria-live': 'polite' });
        document.body.appendChild(toastRegion);
      }
      clearTimeout(toastTimer);
      toastRegion.textContent = '';

      const close = el('button', { type: 'button', className: 'lg-icon-button', 'aria-label': 'Dismiss' }, [icon('close')]);
      const toast = el('div', {
        className: 'lg-toast lg-toast--' + type,
        role: type === 'error' ? 'alert' : null
      }, [el('p', { className: 'lg-toast__message', text: message }), close]);
      close.addEventListener('click', function () { toast.remove(); });
      toastRegion.appendChild(toast);

      if (type !== 'error') {
        toastTimer = setTimeout(function () { toast.remove(); }, 8000);
      }
    }

    // ========== TIMESHEET MODEL ==========

    /**
     * Read the timesheet's days from input titles, which follow the pattern
     * "{Row} Day {index} {Weekday}", such as "Day In Day 1 Thursday".
     * @returns {{days: Array, range: Object|null}|null}
     */
    function readTimesheet() {
      const table = document.getElementById('timesheetTable');
      if (!table) return null;

      const range = LG.parsePeriodRange(document.body.innerText);
      const holidays = LG.pageHolidays();
      const byIndex = {};

      table.querySelectorAll('input').forEach(function (input) {
        if (input.type === 'hidden') return;
        const match = TITLE_PATTERN.exec((input.title || '').trim());
        if (!match) return;
        const index = parseInt(match[2], 10);
        if (!byIndex[index]) byIndex[index] = { index: index, weekdayName: match[3], fields: {}, extras: [] };
        // LATS has three Extra Out/In pairs per day, and they all share one title
        // ("Extra Out Day 1 Thursday"), so keep every one of them.
        if (/^Extra (Out|In)\b/i.test(match[1])) byIndex[index].extras.push(input);
        else if (!byIndex[index].fields[match[1]]) byIndex[index].fields[match[1]] = input;
      });

      const headers = table.querySelectorAll('th.timesheetGridHeader');
      const printCells = document.querySelectorAll('#printTSTable tr:first-child td:not(:first-child)');

      const days = Object.keys(byIndex).map(Number).sort(function (a, b) { return a - b; }).map(function (index) {
        const day = byIndex[index];
        const matchesWeekday = function (date) {
          return date && LG.WEEKDAYS[date.getDay()].long.toLowerCase() === day.weekdayName.toLowerCase();
        };

        let date = range ? LG.addDays(range.start, index - 1) : null;
        if (!matchesWeekday(date)) date = LG.parseHeaderDate(headers[index - 1] && headers[index - 1].textContent, range);
        if (!matchesWeekday(date)) date = LG.parseHeaderDate(printCells[index - 1] && printCells[index - 1].textContent, range) || date;

        day.periodIndex = index - 1;
        day.date = date;
        day.key = date ? LG.dateKey(date) : null;
        day.weekday = date ? date.getDay() : LG.WEEKDAYS.findIndex(function (w) {
          return w.long.toLowerCase() === day.weekdayName.toLowerCase();
        });
        day.isWeekend = day.weekday === 0 || day.weekday === 6;
        day.holiday = !!(day.key && holidays.indexOf(day.key) !== -1);
        return day;
      });

      return { days: days, range: range };
    }

    function dayLabel(day) {
      return day.date ? longDate(day.date) : LG.WEEKDAYS[day.weekday].long;
    }

    /** "Thu 8", or "Thu" when the date is unknown. */
    function dayShortName(day) {
      return LG.WEEKDAYS[day.weekday].short + (day.date ? ' ' + day.date.getDate() : '');
    }

    // ========== FILLING ==========

    async function setFieldValue(input, value) {
      if (!input || input.value === value) return;
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
      await sleep(40);
    }

    async function setChecked(input, checked) {
      if (!input || input.checked === checked) return;
      input.click();
      await sleep(60);
    }

    /**
     * Fill one day. Clears the managed time and leave fields first so leftovers from an
     * earlier fill can't combine with the new values.
     */
    async function fillDay(row) {
      const day = row.day;
      const plan = row.plan;
      const fields = day.fields;
      const times = plan.times || { timeIn: '', lunchOut: '', lunchIn: '', timeOut: '' };
      const timeTargets = {
        'Day In': times.timeIn,
        'Lunch Out': times.lunchOut,
        'Lunch In': times.lunchIn,
        'Day Out': times.timeOut
      };

      for (const name of LG.TIME_ROW_NAMES) {
        await setFieldValue(fields[name], timeTargets[name]);
      }
      for (const input of day.extras) {
        await setFieldValue(input, '');
      }

      const leaveRow = row.type === 'regular' ? null : LG.DAY_TYPE_MAP[row.type];
      for (const name of LG.LEAVE_ROW_NAMES) {
        const input = fields[name];
        if (!input) continue;
        if (name === leaveRow) await setFieldValue(input, LG.formatHours(plan.leaveHours));
        else if (parseFloat(input.value)) await setFieldValue(input, '0');
      }

      // SCHED-3: leave-only days get neither box. "Not set" leaves both boxes alone.
      const onSite = fields['On-Site'];
      const offSite = fields['Off-Site'];
      if (!plan.times) {
        await setChecked(onSite, false);
        await setChecked(offSite, false);
      } else if (row.location === 'onsite') {
        await setChecked(offSite, false);
        await setChecked(onSite, true);
      } else if (row.location === 'offsite') {
        await setChecked(onSite, false);
        await setChecked(offSite, true);
      }
    }

    // ========== FILL TIMECARD DIALOG (UI-2) ==========

    let dialog = null;
    let dialogRows = [];
    let fillButton = null;

    function planFor(row) {
      return LG.planDay(row.entry, row.type === 'regular' ? 0 : Number(row.hours), row.placement);
    }

    function rowIsActive(row) {
      return row.include && !row.day.holiday;
    }

    function inactiveLabel(row) {
      if (row.day.holiday) return 'State holiday (LATS fills this)';
      if (!row.entry.works && row.day.isWeekend) return 'Weekend';
      if (!row.entry.works) return 'Not scheduled';
      return 'Skipped';
    }

    function buildPills(plan, row) {
      const group = el('span', { className: 'lg-pill-group' });
      const segments = plan.times ? LG.getSegments(plan.times) : null;
      if (segments) {
        const times = el('span', { className: 'lg-pill-times' });
        segments.forEach(function (segment, index) {
          if (index) times.appendChild(el('span', { className: 'lg-pill-sep', 'aria-hidden': 'true', text: '·' }));
          times.appendChild(el('span', {
            className: 'lg-pill',
            text: LG.formatTime24(segment[0]) + '–' + LG.formatTime24(segment[1])
          }));
        });
        group.appendChild(times);
      }
      if (row.type !== 'regular' && plan.leaveHours > 0) {
        const option = LG.DAY_TYPE_OPTIONS.find(function (opt) { return opt.value === row.type; });
        group.appendChild(el('span', {
          className: 'lg-pill lg-pill--leave',
          text: option.text.replace(/ \(balance\)$/, '') + ' ' + LG.formatDuration(plan.leaveHours)
        }));
      }
      if (!group.childNodes.length) group.appendChild(el('span', { className: 'lg-pill lg-pill--muted', text: 'No times' }));
      return group;
    }

    /** Build the persistent controls for one row. Updates change state, not elements, so focus stays put. */
    function buildRow(row) {
      const day = row.day;
      const id = 'lg-day-' + day.index;
      const label = dayLabel(day);
      const tr = el('tr', { 'data-index': String(day.index) });

      row.includeInput = el('input', {
        type: 'checkbox',
        id: id + '-include',
        'aria-label': day.holiday ? label + ', state holiday. LATS fills this day.' : 'Include ' + label
      });
      row.includeInput.checked = row.include;
      row.includeInput.disabled = day.holiday;
      tr.appendChild(el('td', { className: 'lg-col-include' }, [row.includeInput]));

      const dateCell = el('th', { scope: 'row', className: 'lg-col-date' }, [
        el('span', { className: 'lg-day', title: label }, [
          el('span', { className: 'lg-day__name', text: LG.WEEKDAYS[day.weekday].short }),
          el('span', { className: 'lg-day__date', text: day.date ? String(day.date.getDate()) : '' })
        ]),
        el('span', { className: 'lg-visually-hidden', text: ' ' + label })
      ]);
      tr.appendChild(dateCell);

      // Day type, leave hours, and placement (SCHED-5)
      row.typeSelect = el('select', { className: 'lg-select', id: id + '-type', 'aria-label': 'Day type, ' + label });
      LG.DAY_TYPE_OPTIONS.forEach(function (option) {
        row.typeSelect.appendChild(el('option', { value: option.value, text: option.text }));
      });
      row.typeSelect.value = row.type;

      row.hoursInput = el('input', {
        type: 'number',
        className: 'lg-input lg-input--hours',
        id: id + '-hours',
        min: String(LG.LEAVE_HOURS.min),
        max: String(LG.LEAVE_HOURS.max),
        step: String(LG.LEAVE_HOURS.step),
        inputmode: 'decimal',
        'aria-label': 'Leave hours, ' + label
      });
      row.hoursInput.value = String(row.hours);
      row.hoursWrap = el('span', { className: 'lg-day-type__hours' }, [row.hoursInput, el('span', { text: 'hours' })]);

      row.placementSelect = el('select', { className: 'lg-select lg-select--compact', id: id + '-placement', 'aria-label': 'When the leave happens, ' + label });
      row.placementSelect.appendChild(el('option', { value: 'start', text: 'At start of day' }));
      row.placementSelect.appendChild(el('option', { value: 'end', text: 'At end of day' }));
      row.placementSelect.value = row.placement;

      const holidayOption = LG.DAY_TYPE_OPTIONS.find(function (opt) { return opt.value === 'holiday'; });
      row.typeHint = el('p', { className: 'lg-hint', id: id + '-type-hint', text: holidayOption.help });
      row.typeSelect.setAttribute('aria-describedby', row.typeHint.id);

      row.typeCell = el('td', {}, [
        el('div', { className: 'lg-day-type' }, [row.typeSelect, row.hoursWrap, row.placementSelect, row.typeHint])
      ]);
      tr.appendChild(row.typeCell);

      // Location (SCHED-3)
      row.locationGroup = el('fieldset', { className: 'lg-segmented' }, [
        el('legend', { className: 'lg-visually-hidden', text: 'Location, ' + label })
      ]);
      LG.LOCATION_OPTIONS.forEach(function (option) {
        const radioId = id + '-loc-' + option.value;
        const radio = el('input', { type: 'radio', name: id + '-location', id: radioId, value: option.value });
        radio.checked = option.value === row.location;
        row.locationGroup.appendChild(radio);
        row.locationGroup.appendChild(el('label', { for: radioId, text: option.text }));
      });
      row.locationNone = el('span', { className: 'lg-hint', text: 'None on leave days' });
      row.locationCell = el('td', {}, [row.locationGroup, row.locationNone]);
      tr.appendChild(row.locationCell);

      row.clockedCell = el('td');
      tr.appendChild(row.clockedCell);

      row.statusPill = el('span', { className: 'lg-pill' });
      row.statusCell = el('td', { colspan: '3', className: 'lg-status-cell' }, [row.statusPill]);
      tr.appendChild(row.statusCell);

      row.totalCell = el('td', { className: 'lg-num lg-strong lg-col-total' });
      tr.appendChild(row.totalCell);

      row.tr = tr;

      row.includeInput.addEventListener('change', function () {
        row.include = row.includeInput.checked;
        updateRow(row);
      });
      row.typeSelect.addEventListener('change', function () {
        row.type = row.typeSelect.value;
        updateRow(row);
      });
      row.hoursInput.addEventListener('input', function () {
        row.hours = row.hoursInput.value;
        updateRow(row);
      });
      row.placementSelect.addEventListener('change', function () {
        row.placement = row.placementSelect.value;
        updateRow(row);
      });
      row.locationGroup.addEventListener('change', function (event) {
        row.location = event.target.value;
      });

      return tr;
    }

    function updateRow(row) {
      const active = rowIsActive(row);
      row.tr.classList.toggle('lg-row-muted', !active);
      row.typeCell.hidden = !active;
      row.locationCell.hidden = !active;
      row.clockedCell.hidden = !active;
      row.statusCell.hidden = active;

      if (!active) {
        setText(row.statusPill, inactiveLabel(row));
        setText(row.totalCell, '—');
        row.plan = null;
        updateTotals();
        return;
      }

      const isLeave = row.type !== 'regular';
      const hoursValid = !isLeave || LG.validateLeaveHours(row.hours);
      row.hoursWrap.hidden = !isLeave;
      row.hoursInput.setAttribute('aria-invalid', hoursValid ? 'false' : 'true');
      row.typeHint.hidden = row.type !== 'holiday';

      const plan = hoursValid ? planFor(row) : null;
      row.plan = plan;
      // Placement matters only for partial leave, which is when the plan keeps some worked time.
      row.placementSelect.hidden = !(isLeave && plan && plan.times);

      const leaveOnly = !!plan && !plan.times;
      row.locationGroup.hidden = leaveOnly;
      row.locationNone.hidden = !leaveOnly;

      row.clockedCell.textContent = '';
      if (plan) row.clockedCell.appendChild(buildPills(plan, row));
      else row.clockedCell.appendChild(el('span', { className: 'lg-error-text', text: 'Enter 0.5 to 7.5 hours' }));

      setText(row.totalCell, plan ? LG.formatDuration(plan.workedHours + plan.leaveHours) : '—');
      updateTotals();
    }

    function totalsFor(rows) {
      return rows.reduce(function (sum, row) {
        if (!rowIsActive(row) || !row.plan) return sum;
        sum.worked += row.plan.workedHours;
        sum.leave += row.plan.leaveHours;
        return sum;
      }, { worked: 0, leave: 0 });
    }

    function updateTotals() {
      if (!dialog) return;
      const weeks = [0, 1].map(function (week) {
        return totalsFor(dialogRows.filter(function (row) { return Math.floor(row.day.periodIndex / 7) === week; }));
      });
      weeks.forEach(function (total, week) {
        const node = dialog.querySelector('[data-week-total="' + week + '"]');
        if (node) setText(node, LG.formatDuration(total.worked + total.leave));
        const footer = dialog.querySelector('[data-footer-week="' + week + '"]');
        if (footer) setText(footer, LG.formatDuration(total.worked + total.leave));
      });
      const all = totalsFor(dialogRows);
      setText(dialog.querySelector('[data-footer-total]'), LG.formatDuration(all.worked + all.leave));
      const leaveItem = dialog.querySelector('[data-footer-leave]');
      leaveItem.hidden = all.leave <= 0;
      setText(leaveItem.querySelector('dd'), LG.formatDuration(all.leave));
      const count = dialogRows.filter(rowIsActive).length;
      setText(dialog.querySelector('[data-apply-label]'), count === 1 ? 'Fill 1 day' : 'Fill ' + count + ' days');
      dialog.querySelector('[data-action="apply"]').disabled = count === 0;
    }

    function buildDialogContent(settings, timesheet) {
      dialog.textContent = '';
      const days = timesheet.days;
      const first = days[0] && days[0].date;
      const last = days[days.length - 1] && days[days.length - 1].date;
      const periodText = timesheet.range
        ? formatRange(timesheet.range.start, timesheet.range.end)
        : (first && last ? formatRange(first, last) : 'This pay period');

      const close = el('button', { type: 'button', className: 'lg-icon-button', 'aria-label': 'Close', 'data-action': 'close' }, [icon('close')]);
      const editLink = el('button', { type: 'button', className: 'lg-link', text: 'Edit schedule' });
      editLink.addEventListener('click', function () {
        chrome.runtime.sendMessage({ action: 'openOptions' });
      });

      dialog.appendChild(el('header', { className: 'lg-dialog__header' }, [
        el('div', {}, [
          el('h2', { className: 'lg-title', id: 'lg-fill-title', text: 'Fill Timecard' }),
          el('p', { className: 'lg-dialog__meta' }, [
            el('span', { text: periodText }),
            el('span', { 'aria-hidden': 'true', text: '·' }),
            el('span', { text: 'Schedule: ' + LG.summarizeSchedule(settings) }),
            editLink
          ])
        ]),
        close
      ]));

      const alertBox = el('div', { className: 'lg-alert lg-alert--danger', role: 'alert', tabindex: '-1', hidden: true, 'data-role': 'errors' });
      const table = el('table', { className: 'lg-table lg-week-table' }, [
        el('caption', { className: 'lg-visually-hidden', text: 'Days in the pay period ' + periodText }),
        el('thead', {}, [el('tr', {}, [
          el('th', { scope: 'col', className: 'lg-col-include' }, [el('span', { className: 'lg-visually-hidden', text: 'Include' })]),
          el('th', { scope: 'col', className: 'lg-col-date', text: 'Date' }),
          el('th', { scope: 'col', text: 'Day type' }),
          el('th', { scope: 'col', text: 'Location' }),
          el('th', { scope: 'col', text: 'Clocked hours' }),
          el('th', { scope: 'col', className: 'lg-num lg-col-total', text: 'Total' })
        ])])
      ]);

      dialogRows = days.map(function (day) {
        const entry = LG.getScheduleEntry(settings, day.periodIndex, day.weekday);
        return {
          day: day,
          entry: entry,
          include: entry.works && !day.holiday,
          type: 'regular',
          hours: LG.LEAVE_HOURS.fullDay,
          placement: settings.partialLeave,
          location: entry.location
        };
      });

      [0, 1].forEach(function (week) {
        const rows = dialogRows.filter(function (row) { return Math.floor(row.day.periodIndex / 7) === week; });
        if (!rows.length) return;
        const weekStart = rows[0].day.date;
        const weekEnd = rows[rows.length - 1].day.date;
        const tbody = el('tbody', {}, [
          el('tr', { className: 'lg-week-group' }, [
            el('th', { scope: 'rowgroup', colspan: '6' }, [
              'Week ' + (week + 1) + (weekStart && weekEnd ? ' · ' + shortDate(weekStart) + ' – ' + shortDate(weekEnd) : ''),
              el('span', { className: 'lg-week-group__total', 'data-week-total': String(week) })
            ])
          ])
        ]);
        rows.forEach(function (row) { tbody.appendChild(buildRow(row)); });
        table.appendChild(tbody);
      });

      dialog.appendChild(el('div', { className: 'lg-dialog__body' }, [
        alertBox,
        el('div', { className: 'lg-table-frame' }, [table])
      ]));

      const cancel = el('button', { type: 'button', className: 'lg-button lg-button--secondary', 'data-action': 'close', text: 'Cancel' });
      const apply = el('button', { type: 'button', className: 'lg-button lg-button--primary', 'data-action': 'apply' }, [
        el('span', { 'data-apply-label': true, text: 'Fill' })
      ]);

      dialog.appendChild(el('footer', { className: 'lg-dialog__footer' }, [
        el('dl', { className: 'lg-totals' }, [
          el('div', {}, [el('dt', { text: 'Week 1' }), el('dd', { 'data-footer-week': '0' })]),
          el('div', {}, [el('dt', { text: 'Week 2' }), el('dd', { 'data-footer-week': '1' })]),
          el('div', { 'data-footer-leave': true }, [el('dt', { text: 'Leave' }), el('dd')]),
          el('div', {}, [el('dt', { text: 'Period total' }), el('dd', { 'data-footer-total': true })])
        ]),
        el('div', { className: 'lg-actions' }, [cancel, apply])
      ]));

      dialog.querySelectorAll('[data-action="close"]').forEach(function (button) {
        button.addEventListener('click', function () { dialog.close(); });
      });
      apply.addEventListener('click', handleApply);

      dialogRows.forEach(updateRow);
    }

    function ensureDialog() {
      if (dialog) return dialog;
      dialog = el('dialog', { className: 'lg lg-dialog', 'aria-labelledby': 'lg-fill-title' });
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener('close', function () {
        if (fillButton) fillButton.focus();
      });
      document.body.appendChild(dialog);

      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'sync' && dialog.open) openFillDialog();
      });
      return dialog;
    }

    function openFillDialog() {
      const timesheet = readTimesheet();
      if (!timesheet || !timesheet.days.length) {
        showToast('LATS Go! couldn\'t read this timesheet\'s days.', 'error');
        return;
      }
      ensureDialog();
      LG.loadSettings(function (settings) {
        buildDialogContent(settings, timesheet);
        if (!dialog.open) dialog.showModal();
        const firstInclude = dialog.querySelector('.lg-col-include input:not(:disabled)');
        if (firstInclude) firstInclude.focus();
      });
    }

    function validateRows(rows) {
      const errors = [];
      rows.forEach(function (row) {
        const name = dayShortName(row.day);
        const fields = row.day.fields;
        if (row.type !== 'regular' && !LG.validateLeaveHours(row.hours)) {
          errors.push(name + ': Enter leave hours from 0.5 to 7.5, in steps of 0.5.');
          return;
        }
        if (!row.plan) {
          errors.push(name + ': Check this day\'s times in your schedule settings.');
          return;
        }
        if (row.type === 'regular' && !row.plan.times) {
          errors.push(name + ': Check this day\'s times in your schedule settings.');
          return;
        }
        if (row.plan.times) {
          const orderError = LG.validateTimeOrder(row.plan.times);
          if (orderError) errors.push(name + ': ' + orderError);
          const missing = LG.TIME_ROW_NAMES.filter(function (rowName) { return !fields[rowName]; });
          if (missing.length) errors.push(name + ': LATS has no ' + missing.join(', ') + ' field for this day.');
          else if (fields['Day In'].readOnly || fields['Day In'].disabled) errors.push(name + ': LATS has locked this day.');
        }
        if (row.type !== 'regular' && !fields[LG.DAY_TYPE_MAP[row.type]]) {
          errors.push(name + ': This timesheet has no ' + LG.DAY_TYPE_MAP[row.type] + ' row.');
        }
      });
      return errors;
    }

    // ========== A LITTLE DELIGHT ==========
    // Filling a timecard should feel good: the sparkle twinkles, each day's column glows as it
    // fills, and confetti pops when it's done. With "reduce motion" on, only the toasts show.

    const CONFETTI_COLORS = [
      'var(--nys-color-theme)',
      'var(--nys-color-accent)',
      'var(--nys-color-success)',
      'var(--nys-color-info)',
      'var(--nys-color-theme-mid)'
    ];

    const CHEERS = [
      'That\u2019s a wrap on {n}.',
      '{n} filled. Time well spent.',
      '{n}, done in a blink.',
      'Look at you go: {n} filled.',
      '{n} filled. You\u2019ve earned a coffee.'
    ];

    function prefersReducedMotion() {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function cheer(count) {
      const days = count + (count === 1 ? ' day' : ' days');
      return CHEERS[Math.floor(Math.random() * CHEERS.length)].replace('{n}', days);
    }

    /** A toast with a progress bar that names each day as it fills. */
    function showProgressToast(total) {
      showToast('', 'info');
      clearTimeout(toastTimer); // stays up until the fill finishes
      const toast = toastRegion.querySelector('.lg-toast');
      // Announce the start once; per-day updates would be too chatty for screen readers.
      toast.setAttribute('aria-live', 'off');
      const message = toast.querySelector('.lg-toast__message');
      message.textContent = '';
      const label = el('span', { text: 'Filling ' + total + (total === 1 ? ' day\u2026' : ' days\u2026') });
      const bar = el('span', { className: 'lg-progress__bar' });
      const track = el('span', {
        className: 'lg-progress',
        role: 'progressbar',
        'aria-label': 'Filling your timecard',
        'aria-valuemin': '0',
        'aria-valuemax': String(total),
        'aria-valuenow': '0'
      }, [bar]);
      message.appendChild(label);
      message.appendChild(track);
      return {
        update: function (done, dayName) {
          if (dayName) label.textContent = 'Filling ' + dayName + '\u2026';
          track.setAttribute('aria-valuenow', String(done));
          bar.style.width = Math.round((done / total) * 100) + '%';
        }
      };
    }

    /** A brief golden glow on the cells of a day that just filled. */
    function glowDay(day) {
      if (prefersReducedMotion()) return;
      const inputs = Object.values(day.fields).concat(day.extras);
      const cells = inputs.map(function (input) { return input && input.closest('td'); })
        .filter(function (cell, index, all) { return cell && all.indexOf(cell) === index; });
      // Remove, reflow once, then add, so the animation restarts without a reflow per cell.
      cells.forEach(function (cell) { cell.classList.remove('lg-just-filled'); });
      void document.body.offsetWidth;
      cells.forEach(function (cell) { cell.classList.add('lg-just-filled'); });
      setTimeout(function () {
        cells.forEach(function (cell) { cell.classList.remove('lg-just-filled'); });
      }, 1200);
    }

    /** Confetti from the Fill Timecard button. Decorative, and skipped with "reduce motion". */
    function burstConfetti(origin) {
      if (prefersReducedMotion()) return;
      const rect = origin ? origin.getBoundingClientRect() : { left: window.innerWidth / 2, top: 80, width: 0, height: 0 };
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const layer = el('div', { className: 'lg lg-confetti', 'aria-hidden': 'true' });
      for (let i = 0; i < 42; i++) {
        const angle = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 1.3;
        const distance = 90 + Math.random() * 170;
        const piece = el('span', { className: 'lg-confetti__piece' + (i % 3 === 0 ? ' lg-confetti__piece--round' : '') });
        piece.style.setProperty('--x', x + 'px');
        piece.style.setProperty('--y', y + 'px');
        piece.style.setProperty('--dx', Math.round(Math.cos(angle) * distance) + 'px');
        piece.style.setProperty('--dy', Math.round(Math.sin(angle) * distance) + 'px');
        piece.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 900) + 'deg');
        piece.style.setProperty('--delay', Math.round(Math.random() * 120) + 'ms');
        piece.style.setProperty('--c', CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
        layer.appendChild(piece);
      }
      document.body.appendChild(layer);
      setTimeout(function () { layer.remove(); }, 1800);
    }

    function setFilling(busy) {
      if (!fillButton) return;
      fillButton.classList.toggle('lg-filling', busy);
      fillButton.disabled = busy;
      if (busy) fillButton.setAttribute('aria-busy', 'true');
      else fillButton.removeAttribute('aria-busy');
    }

    async function handleApply() {
      const rows = dialogRows.filter(rowIsActive);
      const errors = validateRows(rows);
      const alertBox = dialog.querySelector('[data-role="errors"]');

      if (errors.length) {
        alertBox.textContent = '';
        alertBox.appendChild(el('p', { className: 'lg-alert__heading', text: 'Fix these days, then try again:' }));
        alertBox.appendChild(el('ul', {}, errors.map(function (message) { return el('li', { text: message }); })));
        alertBox.hidden = false;
        alertBox.focus();
        return;
      }

      // Close first: a modal dialog makes the rest of the page inert while it's open.
      dialog.close();
      setFilling(true);
      const progress = showProgressToast(rows.length);

      const failures = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const shortName = LG.WEEKDAYS[row.day.weekday].short + (row.day.date ? ', ' + shortDate(row.day.date) : '');
        progress.update(i, shortName);
        try {
          await fillDay(row);
          glowDay(row.day);
        } catch (error) {
          failures.push(dayShortName(row.day));
        }
        progress.update(i + 1);
      }
      setFilling(false);

      if (failures.length) {
        showToast('Couldn\'t fill ' + failures.join(', ') + '. Check those days, then select Save.', 'error');
      } else {
        burstConfetti(fillButton);
        showToast('\uD83C\uDF89 ' + cheer(rows.length) + ' Select Save to update LATS totals.', 'success');
      }
    }

    function insertFillButton(saveButton) {
      if (document.querySelector('.lg-fill-controls')) return;
      const container = saveButton.closest('.col-xs-3') || saveButton.parentElement;

      fillButton = el('button', {
        type: 'button',
        id: 'fillTimecard',
        className: 'k-button k-button-lg k-rounded-lg k-button-solid k-button-solid-base',
        'aria-haspopup': 'dialog'
      }, [el('span', { className: 'k-button-text' }, [
        // Decorative: screen readers announce "Fill Timecard".
        el('span', { className: 'lg-sparkle', 'aria-hidden': 'true', text: '\u2728' }),
        'Fill Timecard'
      ])]);
      fillButton.addEventListener('click', openFillDialog);

      const controls = el('div', { className: 'lg-fill-controls' }, [fillButton]);
      container.insertBefore(controls, saveButton.parentElement === container ? saveButton : container.firstChild);
    }

    // ========== LOCKED PERIOD (FLOW-1) ==========

    function isLockedPeriod() {
      if (document.getElementById('btnSaveTimesheet_0')) return false;
      const dayIn = document.querySelector('#timesheetTable input[title^="Day In Day "]');
      if (!dayIn || !(dayIn.readOnly || dayIn.disabled)) return false;
      const status = LG.findTimesheetStatus(document.body.innerText);
      return !/^(Submitted|Approved|Processed)$/i.test(status);
    }

    function insertLockedCallout() {
      if (document.querySelector('.lg-locked-callout')) return;
      const table = document.getElementById('timesheetTable');
      const anchor = table.closest('#frmUpdateTimesheet > *') || table;

      const button = el('button', { type: 'button', className: 'lg-button lg-button--primary', text: 'Open oldest overdue' });
      const status = el('p', { className: 'lg-hint', role: 'status', 'aria-live': 'polite' });

      button.addEventListener('click', async function () {
        button.disabled = true;
        setText(status, 'Opening the overdue list…');
        try {
          const result = await LG.callPage('openOldestOverdue', {}, 15000);
          setText(status, result && result.selected
            ? 'Opening the oldest overdue period…'
            : 'Choose a period in the Overdue Timesheets list.');
        } catch (error) {
          setText(status, 'Couldn\'t open the overdue list. Select Overdue Timesheets in LATS instead.');
        } finally {
          button.disabled = false;
        }
      });

      const callout = LG.alert({
        type: 'info',
        icon: 'lock',
        heading: 'This period is locked',
        className: 'lg-callout lg-locked-callout',
        action: button
      }, [
        el('p', { text: 'LATS unlocks this period after you submit earlier timesheets.' }),
        status
      ]);
      anchor.parentNode.insertBefore(callout, anchor);
    }

    function watchTimesheetControls(attempt) {
      if (document.querySelector('.lg-fill-controls, .lg-locked-callout')) return;
      const saveButton = document.getElementById('btnSaveTimesheet_0');
      if (saveButton) {
        insertFillButton(saveButton);
        return;
      }
      // Give LATS a moment to render the Save button before deciding the period is locked.
      if (attempt >= 6 && isLockedPeriod()) {
        insertLockedCallout();
        return;
      }
      if (attempt < 40) setTimeout(function () { watchTimesheetControls(attempt + 1); }, 250);
    }

    // Weekend marks, the Empty rows button, and Total columns on both pages come from
    // scripts/lats-restyle.js.

    function initTimesheetPage() {
      watchTimesheetControls(0);
    }

    // ========== TDS PAGE ==========

    function subTaskLinks() {
      return Array.prototype.slice.call(document.querySelectorAll('a[href*="DisplaySubTasks"], a[id^="lnkSubTask_"]'));
    }

    /**
     * Read the TDS rows: category, task code, and sub-task. A row without a sub-task shows the
     * link text "sub tasks".
     */
    function readTdsRows() {
      return subTaskLinks().map(function (link) {
        const container = link.closest('.distributionRow') || link.closest('table');
        // LATS keeps each row's codes in hidden fields. Prefer them over the visible text.
        const fields = LG.readTdsRowFields(container);
        if (fields.categoryCode !== null && fields.taskCode) {
          return {
            category: fields.categoryCode,
            categoryLabel: fields.categoryDescription || '',
            taskCode: fields.taskCode,
            task: fields.taskDescription ? fields.taskCode + ': ' + fields.taskDescription : fields.taskCode,
            subTask: fields.subTaskCode || '',
            subTaskLabel: fields.subTaskDescription || '',
            link: link
          };
        }
        const spanCells = container ? Array.prototype.slice.call(container.querySelectorAll('td[colspan]')) : [];
        const categoryCell = spanCells.find(function (cell) { return !cell.contains(link); });
        const taskText = LG.normalizeSpace(link.parentElement ? link.parentElement.textContent : '');
        const codeSource = taskText + ' ' + spanCells.map(function (cell) { return cell.textContent; }).join(' ');
        const codeMatch = codeSource.match(/\b[A-Z]{2,}-\d+\b/);
        const taskLine = taskText.match(/\b[A-Z]{2,}-\d+:[^(]*/);
        const linkText = LG.normalizeSpace(link.textContent);
        const subTask = /^sub[\s-]?tasks?$/i.test(linkText) ? { code: '', label: '' } : LG.parseSubTaskLabel(linkText);
        const category = LG.parseCategoryLabel(categoryCell ? categoryCell.textContent : '');
        return {
          category: category.code,
          categoryLabel: category.label,
          taskCode: codeMatch ? codeMatch[0] : '',
          task: taskLine ? taskLine[0].trim() : taskText,
          subTask: subTask.code,
          subTaskLabel: subTask.label,
          link: link
        };
      });
    }

    /** The period's start date, once the page shows it. A re-render doesn't change the period. */
    let periodStart = null;

    function tdsPeriodKey() {
      if (periodStart) return periodStart;
      const range = LG.parsePeriodRange(document.body.innerText);
      if (range) return (periodStart = LG.dateKey(range.start));
      const id = new URLSearchParams(location.search).get('tshdrid');
      return id ? 'id:' + id : null;
    }

    function storedRow(row) {
      return {
        category: row.category,
        categoryLabel: row.categoryLabel || '',
        taskCode: row.taskCode,
        task: row.task,
        subTask: row.subTask,
        subTaskLabel: row.subTaskLabel || ''
      };
    }

    /** The period key and rows that cacheTdsRows last wrote, serialized. */
    let lastCachedRows = '';

    /** Remember this period's rows so a later period can copy them (TDS-1). */
    function cacheTdsRows(key, rows) {
      if (!key || !rows.length) return;
      const stored = rows.map(storedRow);
      const serialized = JSON.stringify([key, stored]);
      if (serialized === lastCachedRows) return;
      lastCachedRows = serialized;
      chrome.storage.local.get(TDS_HISTORY_KEY, function (data) {
        const history = data[TDS_HISTORY_KEY] || {};
        history[key] = { savedAt: Date.now(), rows: stored };
        const keys = Object.keys(history).sort(function (a, b) { return history[b].savedAt - history[a].savedAt; });
        keys.slice(TDS_HISTORY_LIMIT).forEach(function (old) { delete history[old]; });
        const update = {};
        update[TDS_HISTORY_KEY] = history;
        chrome.storage.local.set(update);
      });
    }

    function findPreviousPeriod(history, currentKey) {
      const isDate = function (key) { return !!LG.parseDateKey(key); };
      const keys = Object.keys(history).filter(function (key) { return key !== currentKey && history[key].rows.length; });
      if (isDate(currentKey || '')) {
        const earlier = keys.filter(function (key) { return isDate(key) && key < currentKey; }).sort();
        if (earlier.length) return earlier[earlier.length - 1];
      }
      keys.sort(function (a, b) { return history[b].savedAt - history[a].savedAt; });
      return keys[0] || null;
    }

    /**
     * What page-bridge.js needs to add a row. It runs in the page's world without LatsGo, so
     * strip descriptions here, including from rows cached by older builds.
     */
    function bridgeRow(row) {
      const subTaskCode = LG.parseSubTaskLabel(row.subTask || '').code;
      return {
        categoryCode: LG.parseCategoryLabel(row.category || '').code,
        taskCode: row.taskCode,
        task: row.task,
        subTaskCode: subTaskCode,
        searchTerm: LG.subTaskSearchTerm(subTaskCode)
      };
    }

    function describeRow(row) {
      return [row.taskCode || row.task, row.subTask].filter(Boolean).join(' · ');
    }

    let copyCallout = null;

    /** Put the Copy rows callout above the rows, again if LATS re-rendered the grid around it. */
    function placeCopyCallout() {
      const anchor = document.getElementById('distributionRows');
      if (!copyCallout || copyCallout.isConnected || !anchor) return;
      anchor.parentNode.insertBefore(copyCallout, anchor);
    }

    function insertCopyRowsCallout(currentKey) {
      if (copyCallout || !document.getElementById('distributionRows')) return;

      const source = el('p', { className: 'lg-hint' });
      const status = el('p', { className: 'lg-hint', role: 'status', 'aria-live': 'polite' });
      const results = el('ul', { className: 'lg-callout__list', hidden: true });
      const button = el('button', { type: 'button', className: 'lg-button lg-button--primary' }, [
        icon('copy'),
        el('span', { text: 'Copy rows from last period' })
      ]);

      copyCallout = LG.alert({
        type: 'info',
        icon: 'info',
        heading: 'No task rows yet',
        className: 'lg-callout lg-tds-copy',
        action: button
      }, [
        el('p', { text: 'Copy the task and sub-task rows from your last pay period. You still enter the hours.' }),
        source,
        status,
        results
      ]);
      placeCopyCallout();

      chrome.storage.local.get(TDS_HISTORY_KEY, function (data) {
        const history = data[TDS_HISTORY_KEY] || {};
        const previousKey = findPreviousPeriod(history, currentKey);
        if (!previousKey) {
          setText(source, 'LATS Go! hasn\'t seen an earlier TDS page yet. Open last period\'s TDS tab, then come back to this one.');
          button.disabled = true;
          return;
        }
        const rows = history[previousKey].rows;
        const start = LG.parseDateKey(previousKey);
        const label = start ? 'the period starting ' + shortDate(start) : 'your last TDS page';
        setText(source, rows.length + (rows.length === 1 ? ' row' : ' rows') + ' from ' + label + '.');

        button.addEventListener('click', function () {
          copyRows(rows, button, status, results);
        });
      });
    }

    async function copyRows(rows, button, status, results) {
      // Keep the callout while rows arrive, so its progress and results stay visible.
      button.closest('.lg-tds-copy').dataset.used = 'true';
      button.disabled = true;
      results.hidden = true;
      results.textContent = '';

      const existing = readTdsRows().map(LG.tdsRowKey);
      const queue = rows.filter(function (row, index) {
        const key = LG.tdsRowKey(row);
        const firstIndex = rows.findIndex(function (other) { return LG.tdsRowKey(other) === key; });
        return firstIndex === index && existing.indexOf(key) === -1;
      });

      const problems = [];
      let added = 0;
      for (let i = 0; i < queue.length; i++) {
        const row = queue[i];
        setText(status, 'Adding row ' + (i + 1) + ' of ' + queue.length + ': ' + describeRow(row) + '…');
        try {
          const result = await LG.callPage('addTdsRow', bridgeRow(row), 60000);
          if (result.status === 'added') added++;
          else if (result.status === 'partial') {
            added++;
            problems.push(describeRow(row) + ': added the task, but ' + result.message);
          } else {
            problems.push(describeRow(row) + ': ' + result.message);
          }
        } catch (error) {
          problems.push(describeRow(row) + ': ' + error.message);
        }
      }

      const skipped = rows.length - queue.length;
      let summary = 'Added ' + added + ' of ' + queue.length + (queue.length === 1 ? ' row.' : ' rows.');
      if (skipped) summary += ' ' + skipped + ' already on this page.';
      summary += problems.length ? ' Some rows need attention.' : ' Enter the hours, then select Save.';
      setText(status, summary);

      if (problems.length) {
        problems.forEach(function (message) { results.appendChild(el('li', { text: message })); });
        results.hidden = false;
        button.disabled = false;
        button.querySelector('span').textContent = 'Try again';
      } else {
        button.hidden = true;
      }
      syncTdsRows();
    }

    function ensureRemainingRow(tdsTable) {
      let wrapper = document.querySelector('.lg-tds-remaining');
      // Reuse the row while it still sits under this TDS Totals table and matches its columns.
      // After LATS re-renders the footer, build it again from the new table.
      const hasTotal = function (node) { return !!node.querySelector('td.lg-total-col'); };
      if (wrapper && wrapper.previousElementSibling === tdsTable && hasTotal(wrapper) === hasTotal(tdsTable)) return wrapper;
      if (wrapper) wrapper.remove();
      const clone = tdsTable.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(function (node) { node.removeAttribute('id'); });
      clone.querySelectorAll('[data-mismatch], [data-match]').forEach(function (node) {
        node.removeAttribute('data-mismatch');
        node.removeAttribute('data-match');
      });
      const labelCell = clone.querySelector('td.leftColumn');
      if (labelCell) {
        labelCell.textContent = '';
        labelCell.appendChild(el('span', { className: 'lg-tds-remaining__label', text: 'Remaining' }));
        labelCell.title = 'Work Totals minus the hours entered. Updates as you type.';
      }
      LG.tdsDayCells(clone).forEach(function (cell) { cell.textContent = ''; });
      const totalCell = clone.querySelector('td.lg-total-col');
      if (totalCell) totalCell.setAttribute('data-role', 'summary');
      wrapper = el('div', { className: 'lg-tds-remaining' }, [clone]);
      tdsTable.parentNode.insertBefore(wrapper, tdsTable.nextSibling);
      return wrapper;
    }

    /** TDS-2: live Remaining row and a running total for each row. */
    function updateTdsRemaining() {
      const tables = LG.tdsFooterTables();
      if (tables.length < 2) return;
      const work = LG.tdsDayCells(tables[1]).map(numberIn);
      const entered = work.map(function () { return 0; });

      document.querySelectorAll('input.distributionCell').forEach(function (input) {
        const match = input.name.match(/Hours\[(\d+)\]/);
        if (match && parseInt(match[1], 10) < entered.length) {
          entered[parseInt(match[1], 10)] += parseFloat(input.value) || 0;
        }
      });

      const remaining = LG.computeRemaining(work, entered);
      const wrapper = ensureRemainingRow(tables[0]);
      const cells = LG.tdsDayCells(wrapper.querySelector('table'));
      let left = 0;
      let over = 0;

      remaining.forEach(function (value, i) {
        const cell = cells[i];
        if (!cell) return;
        let state;
        let main;
        let note;
        if (!work[i] && !entered[i]) {
          state = 'none'; main = '–'; note = '';
        } else if (value === 0) {
          state = 'done'; main = '✓'; note = 'done';
        } else if (value > 0) {
          state = 'left'; main = LG.formatHours(value); note = 'left';
          left += value;
        } else {
          state = 'over'; main = LG.formatHours(-value); note = 'over';
          over -= value;
        }
        const signature = state + main;
        if (cell.dataset.signature === signature) return;
        cell.dataset.signature = signature;
        cell.dataset.state = state;
        cell.textContent = '';
        cell.appendChild(el('span', { className: 'lg-tds-remaining__value', text: main }));
        if (note) cell.appendChild(el('span', { className: 'lg-tds-remaining__note', text: note }));
      });

      let summary = wrapper.querySelector('[data-role="summary"]');
      if (!summary) {
        // No Total column yet (lats-restyle.js adds it): show the summary under the label.
        const label = wrapper.querySelector('td.leftColumn');
        summary = label && el('span', { className: 'lg-tds-remaining__summary', 'data-role': 'summary' });
        if (summary) label.appendChild(summary);
      }
      if (summary) {
        const parts = [];
        if (left) parts.push(LG.formatHours(left) + ' left');
        if (over) parts.push(LG.formatHours(over) + ' over');
        setText(summary, parts.length ? parts.join(', ') : 'All set');
      }
    }

    /** Compare the saved TDS Totals with Work Totals and mark each footer cell. */
    function highlightTdsMismatches() {
      const tables = LG.tdsFooterTables();
      if (tables.length < 2) return;
      const tdsCells = LG.tdsDayCells(tables[0]);
      const workCells = LG.tdsDayCells(tables[1]);
      for (let i = 0; i < Math.min(tdsCells.length, workCells.length); i++) {
        const tdsValue = numberIn(tdsCells[i]);
        const workValue = numberIn(workCells[i]);
        [tdsCells[i], workCells[i]].forEach(function (cell) {
          LG.setFlag(cell, 'data-mismatch', workValue > 0 && tdsValue !== workValue);
          LG.setFlag(cell, 'data-match', workValue > 0 && tdsValue === workValue);
        });
      }
    }

    /**
     * Cache this period's rows (TDS-1). Once there are rows, drop the Copy rows callout unless
     * you've used it; otherwise keep it above the rows.
     */
    function syncTdsRows() {
      const rows = readTdsRows();
      if (rows.length) {
        cacheTdsRows(tdsPeriodKey(), rows);
        if (copyCallout && !copyCallout.dataset.used) {
          copyCallout.remove();
          copyCallout = null;
        }
      }
      placeCopyCallout();
    }

    /** Bring the footer marks, the Remaining row, and the rows cache in step with the grid. */
    function refreshTds() {
      highlightTdsMismatches();
      updateTdsRemaining();
      syncTdsRows();
    }

    function initTdsPage() {
      highlightTdsMismatches();
      updateTdsRemaining();

      const rows = readTdsRows();
      const key = tdsPeriodKey();
      if (rows.length) cacheTdsRows(key, rows);
      else insertCopyRowsCallout(key);

      // Listen on the document, so the listeners outlive grid nodes that LATS replaces.
      document.addEventListener('input', function (event) {
        if (event.target.matches && event.target.matches('input.distributionCell')) updateTdsRemaining();
      });
      document.addEventListener('change', function (event) {
        if (event.target.matches && event.target.matches('input.distributionCell')) {
          updateTdsRemaining();
          highlightTdsMismatches();
        }
      });

      // Runs after lats-restyle.js has decorated the new nodes.
      LG.onLatsChange(LG.TDS_GRID, refreshTds, { tdsRowFields: true });
    }

    // ========== INITIALIZATION ==========

    LG.whenLatsReady(function () {
      if (document.getElementById('timesheetTable')) initTimesheetPage();
      if (document.getElementById('distributionRows') || document.getElementById('tdsFooter')) initTdsPage();
    });
  })();
}
