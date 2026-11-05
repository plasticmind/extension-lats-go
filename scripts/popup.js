/**
 * LATS Go! popup
 * Shows a summary of the saved schedule. Editing happens on the options page, which has
 * room for the per-weekday editor.
 */

(function () {
  'use strict';

  const LG = LatsGo;
  const el = LG.el;

  function clockedPills(day) {
    const group = el('span', { className: 'lg-pill-group' });
    const segments = LG.getSegments(day);
    if (!segments) {
      group.appendChild(el('span', { className: 'lg-pill lg-pill--muted', text: 'Check times' }));
      return group;
    }
    segments.forEach(function (segment, index) {
      if (index) group.appendChild(el('span', { className: 'lg-pill-sep', text: '·' }));
      group.appendChild(el('span', { className: 'lg-pill', text: LG.formatTime24(segment[0]) + '–' + LG.formatTime24(segment[1]) }));
    });
    return group;
  }

  function locationLabel(value) {
    const option = LG.LOCATION_OPTIONS.find(function (opt) { return opt.value === value; });
    return option && value !== 'none' ? option.text : '';
  }

  function renderWeek(week, title) {
    const wrapper = el('div', { className: 'lg-popup-week' });
    if (title) wrapper.appendChild(el('h3', { className: 'lg-hint', text: title }));

    const workdays = LG.SCHEDULE_DAY_ORDER.filter(function (key) { return week[key].works; });
    const daysOff = LG.SCHEDULE_DAY_ORDER.filter(function (key) { return !week[key].works; });

    if (!workdays.length) {
      wrapper.appendChild(el('p', { className: 'lg-muted', text: 'No workdays set.' }));
      return wrapper;
    }

    const tbody = el('tbody');
    const table = el('table', { className: 'lg-table' }, [
      el('caption', { className: 'lg-visually-hidden', text: (title || 'Weekly') + ' schedule' }),
      tbody
    ]);

    workdays.forEach(function (key) {
      const day = week[key];
      const info = LG.weekdayByKey(key);
      const location = locationLabel(day.location);
      tbody.appendChild(el('tr', {}, [
        el('th', { scope: 'row' }, [el('span', { className: 'lg-day__name', text: info.short })]),
        el('td', {}, [clockedPills(day)]),
        el('td', { className: 'lg-num' }, [location && el('span', { className: 'lg-tag lg-tag--neutral', text: location })])
      ]));
    });

    wrapper.appendChild(el('div', { className: 'lg-table-frame' }, [table]));

    if (daysOff.length) {
      wrapper.appendChild(el('p', { className: 'lg-hint', text: 'Days off: ' + LG.formatDayList(daysOff) }));
    }
    return wrapper;
  }

  function render(settings) {
    const root = document.getElementById('scheduleSummary');
    root.textContent = '';
    if (settings.alternateSchedule) {
      root.appendChild(renderWeek(settings.schedule.week1, 'Week 1'));
      root.appendChild(renderWeek(settings.schedule.week2, 'Week 2'));
    } else {
      root.appendChild(renderWeek(settings.schedule.week1));
    }
  }

  document.getElementById('editSchedule').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  LG.loadSettings(render);
})();
