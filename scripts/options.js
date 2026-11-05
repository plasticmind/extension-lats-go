/**
 * LATS Go! options page
 * Per-weekday schedule editor (SCHED-1), work locations (SCHED-3), and the default
 * placement for partial-day leave (SCHED-5).
 */

(function () {
  'use strict';

  const LG = LatsGo;
  const el = LG.el;
  const TIME_FIELDS = [
    { key: 'timeIn', label: 'Time in' },
    { key: 'lunchOut', label: 'Lunch out' },
    { key: 'lunchIn', label: 'Lunch in' },
    { key: 'timeOut', label: 'Time out' }
  ];

  let settings = LG.cloneDefaults();
  let activeWeek = 'week1';

  const form = document.getElementById('settingsForm');
  const tablesRoot = document.getElementById('scheduleTables');
  const alternateInput = document.getElementById('alternateSchedule');
  const weekSwitch = document.getElementById('weekSwitch');
  const copyButton = document.getElementById('copyTimes');
  const saveStatus = document.getElementById('saveStatus');

  // ---------- Rendering ----------

  function buildLocationControl(weekKey, dayKey, dayLabel) {
    const name = weekKey + '-' + dayKey + '-location';
    const fieldset = el('fieldset', { className: 'lg-segmented' }, [
      el('legend', { className: 'lg-visually-hidden', text: dayLabel + ' location' })
    ]);
    LG.LOCATION_OPTIONS.forEach(function (option) {
      const id = name + '-' + option.value;
      fieldset.appendChild(el('input', {
        type: 'radio', name: name, id: id, value: option.value, 'data-field': 'location'
      }));
      fieldset.appendChild(el('label', { for: id, text: option.text }));
    });
    return fieldset;
  }

  function buildWeekTable(weekKey) {
    const weekLabel = weekKey === 'week1' ? 'Week 1' : 'Week 2';
    const frame = el('div', { className: 'lg-table-frame', 'data-week': weekKey });
    const table = el('table', { className: 'lg-table lg-schedule-table' });
    table.appendChild(el('caption', { className: 'lg-visually-hidden', text: weekLabel + ' schedule' }));

    const headRow = el('tr', {}, [
      el('th', { scope: 'col', className: 'lg-col-day', text: 'Day' })
    ]);
    TIME_FIELDS.forEach(function (field) {
      headRow.appendChild(el('th', { scope: 'col', text: field.label }));
    });
    headRow.appendChild(el('th', { scope: 'col', className: 'lg-num lg-col-hours', text: 'Hours' }));
    headRow.appendChild(el('th', { scope: 'col', text: 'Location' }));
    table.appendChild(el('thead', {}, [headRow]));

    const tbody = el('tbody');
    LG.SCHEDULE_DAY_ORDER.forEach(function (dayKey) {
      const info = LG.weekdayByKey(dayKey);
      const prefix = weekKey + '-' + dayKey;
      const errorId = prefix + '-error';
      const row = el('tr', { className: 'lg-schedule-row', 'data-day': dayKey });

      const worksId = prefix + '-works';
      row.appendChild(el('th', { scope: 'row' }, [
        el('span', { className: 'lg-check' }, [
          el('input', { type: 'checkbox', id: worksId, 'data-field': 'works' }),
          el('label', { for: worksId, text: info.long })
        ])
      ]));

      TIME_FIELDS.forEach(function (field) {
        row.appendChild(el('td', {}, [
          el('input', {
            type: 'time',
            className: 'lg-input lg-input--time',
            'data-field': field.key,
            'aria-label': info.long + ' ' + field.label.toLowerCase(),
            'aria-describedby': errorId
          })
        ]));
      });

      row.appendChild(el('td', { className: 'lg-num', 'data-role': 'hours' }));
      row.appendChild(el('td', {}, [buildLocationControl(weekKey, dayKey, info.long)]));
      tbody.appendChild(row);

      tbody.appendChild(el('tr', { className: 'lg-schedule-error', 'data-error-for': dayKey, hidden: true }, [
        el('td', { colspan: '7' }, [el('p', { className: 'lg-error-text', id: errorId })])
      ]));
    });
    table.appendChild(tbody);
    frame.appendChild(table);
    return frame;
  }

  function populateWeek(weekKey) {
    const frame = tablesRoot.querySelector('[data-week="' + weekKey + '"]');
    const week = settings.schedule[weekKey];
    frame.querySelectorAll('.lg-schedule-row').forEach(function (row) {
      const day = week[row.dataset.day];
      row.querySelector('[data-field="works"]').checked = day.works;
      TIME_FIELDS.forEach(function (field) {
        row.querySelector('[data-field="' + field.key + '"]').value = LG.to24Hour(day[field.key]);
      });
      row.querySelectorAll('[data-field="location"]').forEach(function (radio) {
        radio.checked = radio.value === day.location;
      });
      refreshRow(weekKey, row);
    });
  }

  /** Update one row's enabled state, hours, and error message from `settings`. */
  function refreshRow(weekKey, row, showErrors) {
    const dayKey = row.dataset.day;
    const day = settings.schedule[weekKey][dayKey];
    const frame = row.closest('[data-week]');
    const errorRow = frame.querySelector('[data-error-for="' + dayKey + '"]');
    const error = day.works ? LG.validateTimeOrder(day) : '';

    row.classList.toggle('lg-schedule-row--off', !day.works);
    row.querySelectorAll('input[type="time"], [data-field="location"]').forEach(function (input) {
      input.disabled = !day.works;
    });

    row.querySelector('[data-role="hours"]').textContent = day.works && !error
      ? LG.formatDuration(LG.scheduledHours(day))
      : '—';

    const visible = !!error && (showErrors || !errorRow.hidden);
    errorRow.hidden = !visible;
    row.classList.toggle('lg-schedule-row--error', visible);
    errorRow.querySelector('.lg-error-text').textContent = visible ? error : '';
    row.querySelectorAll('input[type="time"]').forEach(function (input) {
      input.setAttribute('aria-invalid', visible ? 'true' : 'false');
    });
    return error;
  }

  function showWeek(weekKey) {
    activeWeek = weekKey;
    tablesRoot.querySelectorAll('[data-week]').forEach(function (frame) {
      frame.hidden = frame.dataset.week !== weekKey;
    });
    document.getElementById(weekKey === 'week1' ? 'weekSwitch1' : 'weekSwitch2').checked = true;
    updateCopyButton();
  }

  function updateCopyButton() {
    const week = settings.schedule[activeWeek];
    const first = LG.SCHEDULE_DAY_ORDER.find(function (key) { return week[key].works; });
    copyButton.hidden = !first;
    if (first) {
      copyButton.textContent = 'Copy ' + LG.weekdayByKey(first).long + '’s times to all workdays';
      copyButton.dataset.source = first;
    }
  }

  function render() {
    tablesRoot.textContent = '';
    tablesRoot.appendChild(buildWeekTable('week1'));
    tablesRoot.appendChild(buildWeekTable('week2'));
    populateWeek('week1');
    populateWeek('week2');

    alternateInput.checked = settings.alternateSchedule;
    weekSwitch.hidden = !settings.alternateSchedule;
    document.getElementById(settings.partialLeave === 'end' ? 'partialLeaveEnd' : 'partialLeaveStart').checked = true;
    showWeek(settings.alternateSchedule ? activeWeek : 'week1');
  }

  // ---------- Events ----------

  function setStatus(message, type) {
    saveStatus.textContent = message;
    saveStatus.className = 'lg-status' + (type ? ' lg-status--' + type : '');
  }

  tablesRoot.addEventListener('change', function (event) {
    const input = event.target;
    const row = input.closest('.lg-schedule-row');
    if (!row) return;
    const weekKey = row.closest('[data-week]').dataset.week;
    const day = settings.schedule[weekKey][row.dataset.day];
    const field = input.dataset.field;

    if (field === 'works') day.works = input.checked;
    else if (field === 'location') day.location = input.value;
    else if (field) day[field] = LG.to12Hour(input.value);

    refreshRow(weekKey, row, true);
    updateCopyButton();
    setStatus('');
  });

  alternateInput.addEventListener('change', function () {
    settings.alternateSchedule = alternateInput.checked;
    weekSwitch.hidden = !alternateInput.checked;
    if (alternateInput.checked) {
      // Start week 2 as a copy of week 1 when it hasn't been customized yet.
      const untouched = JSON.stringify(settings.schedule.week2) === JSON.stringify(LG.createWeek());
      if (untouched) {
        settings.schedule.week2 = JSON.parse(JSON.stringify(settings.schedule.week1));
        populateWeek('week2');
      }
    } else {
      showWeek('week1');
    }
    setStatus('');
  });

  weekSwitch.addEventListener('change', function (event) {
    if (event.target.name === 'weekSwitch') showWeek(event.target.value);
  });

  copyButton.addEventListener('click', function () {
    const week = settings.schedule[activeWeek];
    const source = week[copyButton.dataset.source];
    LG.SCHEDULE_DAY_ORDER.forEach(function (key) {
      if (!week[key].works) return;
      TIME_FIELDS.forEach(function (field) { week[key][field.key] = source[field.key]; });
    });
    populateWeek(activeWeek);
    setStatus('Copied times to every workday. Select Save settings to keep them.');
  });

  form.addEventListener('change', function (event) {
    if (event.target.name === 'partialLeave') {
      settings.partialLeave = event.target.value;
      setStatus('');
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const weeks = settings.alternateSchedule ? ['week1', 'week2'] : ['week1'];
    let firstInvalid = null;

    weeks.forEach(function (weekKey) {
      tablesRoot.querySelectorAll('[data-week="' + weekKey + '"] .lg-schedule-row').forEach(function (row) {
        const error = refreshRow(weekKey, row, true);
        if (error && !firstInvalid) firstInvalid = { weekKey: weekKey, row: row };
      });
    });

    if (firstInvalid) {
      showWeek(firstInvalid.weekKey);
      setStatus('Fix the highlighted days, then save again.', 'error');
      firstInvalid.row.querySelector('input[type="time"]:not(:disabled)').focus();
      return;
    }

    LG.saveSettings(settings, function () {
      setStatus('Settings saved.', 'success');
    });
  });

  LG.loadSettings(function (loaded) {
    settings = loaded;
    render();
  });
})();
