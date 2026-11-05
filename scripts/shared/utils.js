/**
 * LATS Go! shared utilities
 *
 * Loaded as a classic script, with no modules. The manifest injects it before content.js,
 * and popup.html and options.html load it with a <script> tag. Everything lives on one
 * global, `LatsGo`, so consumers only need one ESLint global.
 *
 * Pure functions here are also exported through `module.exports` so Vitest can test them.
 */

/* global module */

const LatsGo = (function () {
  'use strict';

  // ========== CONSTANTS ==========

  const SCHEMA_VERSION = 2;

  /** Storage keys from schema version 1 (week1/week2 presets). Removed after migration. */
  const LEGACY_KEYS = ['week1', 'week2'];

  /** Index matches Date#getDay(). */
  const WEEKDAYS = [
    { key: 'sun', short: 'Sun', long: 'Sunday' },
    { key: 'mon', short: 'Mon', long: 'Monday' },
    { key: 'tue', short: 'Tue', long: 'Tuesday' },
    { key: 'wed', short: 'Wed', long: 'Wednesday' },
    { key: 'thu', short: 'Thu', long: 'Thursday' },
    { key: 'fri', short: 'Fri', long: 'Friday' },
    { key: 'sat', short: 'Sat', long: 'Saturday' }
  ];

  /** Order used in settings screens. */
  const SCHEDULE_DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  /** A WEEKDAYS entry by its key, such as 'mon'. */
  function weekdayByKey(key) {
    return WEEKDAYS.find(function (day) { return day.key === key; });
  }

  const LOCATION_OPTIONS = [
    { value: 'onsite', text: 'On-Site' },
    { value: 'offsite', text: 'Off-Site' },
    { value: 'none', text: 'Not set' }
  ];

  /**
   * Day types for the Fill modal. `holiday` charges the banked holiday leave balance.
   * State holidays are never this type: LATS records them as "HOL - State Holiday".
   */
  const DAY_TYPE_OPTIONS = [
    { value: 'regular', text: 'Regular' },
    { value: 'vacation', text: 'Vacation' },
    { value: 'sick', text: 'Sick' },
    { value: 'sickFamily', text: 'Sick Family' },
    { value: 'personal', text: 'Personal' },
    {
      value: 'holiday',
      text: 'Holiday leave (balance)',
      help: 'Charges your banked holiday leave. LATS records state holidays for you.'
    },
    { value: 'floater', text: 'Floater' }
  ];

  /** Day type value to the LATS row name used in input titles ("Vacation Day 1 Thursday"). */
  const DAY_TYPE_MAP = {
    vacation: 'Vacation',
    sick: 'Sick',
    sickFamily: 'Sick Family',
    personal: 'Personal',
    holiday: 'Holiday',
    floater: 'Floater'
  };

  const LEAVE_ROW_NAMES = Object.keys(DAY_TYPE_MAP).map(function (key) { return DAY_TYPE_MAP[key]; });

  /** LATS time rows in the order LATS reads them (L4), minus the Extra rows. */
  const TIME_ROW_NAMES = ['Day In', 'Lunch Out', 'Lunch In', 'Day Out'];

  const LEAVE_HOURS = { min: 0.5, max: 7.5, step: 0.5, fullDay: 7.5 };

  const DEFAULT_TIMES = {
    timeIn: '8:30 AM',
    lunchOut: '12:00 PM',
    lunchIn: '12:30 PM',
    timeOut: '4:30 PM'
  };

  const DEFAULT_WORKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

  function createWeek(times, workdays) {
    const base = Object.assign({}, DEFAULT_TIMES, times || {});
    const working = workdays || DEFAULT_WORKDAYS;
    const week = {};
    WEEKDAYS.forEach(function (day) {
      week[day.key] = {
        works: working.indexOf(day.key) !== -1,
        timeIn: base.timeIn,
        lunchOut: base.lunchOut,
        lunchIn: base.lunchIn,
        timeOut: base.timeOut,
        location: 'none'
      };
    });
    return week;
  }

  /**
   * Default settings, schema version 2. Times are stored in 12-hour format ("8:30 AM").
   * `schedule.week2` is used only when `alternateSchedule` is true.
   */
  function cloneDefaults() {
    return {
      schemaVersion: SCHEMA_VERSION,
      alternateSchedule: false,
      partialLeave: 'start',
      schedule: {
        week1: createWeek(),
        week2: createWeek()
      }
    };
  }

  // ========== TIME UTILITIES ==========

  /**
   * Parse a time string into minutes after midnight.
   * Accepts "8:30 AM", "8:30AM", "08:30", and "16:30".
   * @param {string} str
   * @returns {number|null}
   */
  function parseTime(str) {
    if (!str) return null;
    const match = String(str).trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
    if (!match) return null;
    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (minute > 59) return null;
    if (match[3]) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (/p/i.test(match[3]) ? 12 : 0);
    } else if (hour > 23) {
      return null;
    }
    return hour * 60 + minute;
  }

  /** @returns {string} "8:30 AM" */
  function formatTime12(minutes) {
    if (minutes === null || minutes === undefined) return '';
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    return ((hour % 12) || 12) + ':' + String(minute).padStart(2, '0') + ' ' + (hour >= 12 ? 'PM' : 'AM');
  }

  /** @returns {string} "08:30" */
  function formatTime24(minutes) {
    if (minutes === null || minutes === undefined) return '';
    const hour = Math.floor(minutes / 60) % 24;
    return String(hour).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  }

  /** Convert "16:30" (time input value) to "4:30 PM" (storage format). */
  function to12Hour(time24) {
    return formatTime12(parseTime(time24));
  }

  /** Convert "4:30 PM" (storage format) to "16:30" (time input value). */
  function to24Hour(time12) {
    return formatTime24(parseTime(time12));
  }

  /**
   * Format decimal hours as a duration: 7.5 becomes "7h 30m", 0.25 becomes "15m".
   * @param {number} hours
   * @returns {string}
   */
  function formatDuration(hours) {
    const total = Math.round((Number(hours) || 0) * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!m) return h + 'h';
    if (!h) return m + 'm';
    return h + 'h ' + String(m).padStart(2, '0') + 'm';
  }

  /** Format hours the way LATS shows them: 7.5, 8, 0.25. */
  function formatHours(hours) {
    const rounded = Math.round((Number(hours) || 0) * 100) / 100;
    return String(rounded);
  }

  /**
   * @param {string} timeStr Time in 12-hour format.
   * @returns {boolean} True when blank or valid.
   */
  function validateTime(timeStr) {
    if (!timeStr) return true;
    return /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(?:AM|PM)$/i.test(timeStr);
  }

  /**
   * Validate leave hours: 0.5 to 7.5 in steps of 0.5.
   * @returns {boolean}
   */
  function validateLeaveHours(value) {
    const hours = Number(value);
    if (!isFinite(hours)) return false;
    if (hours < LEAVE_HOURS.min || hours > LEAVE_HOURS.max) return false;
    return Math.abs(hours / LEAVE_HOURS.step - Math.round(hours / LEAVE_HOURS.step)) < 1e-9;
  }

  /**
   * Check that a day's times are in the order LATS reads them (L4): Day In, Lunch Out,
   * Lunch In, Day Out. A time earlier than the field before it wraps to the next day in LATS.
   * Lunch is optional, but both lunch times must be set or both blank.
   * @param {{timeIn, lunchOut, lunchIn, timeOut}} times 12-hour strings.
   * @returns {string} An error message, or '' when valid.
   */
  function validateTimeOrder(times) {
    const timeIn = parseTime(times.timeIn);
    const timeOut = parseTime(times.timeOut);
    const hasLunchOut = !!times.lunchOut;
    const hasLunchIn = !!times.lunchIn;
    if (timeIn === null) return 'Enter a time in.';
    if (timeOut === null) return 'Enter a time out.';
    if (hasLunchOut !== hasLunchIn) return 'Enter both lunch times, or leave both blank.';
    if (hasLunchOut) {
      const lunchOut = parseTime(times.lunchOut);
      const lunchIn = parseTime(times.lunchIn);
      if (lunchOut === null || lunchIn === null) return 'Enter valid lunch times.';
      if (lunchOut <= timeIn) return 'Lunch out must be after time in.';
      if (lunchIn <= lunchOut) return 'Lunch in must be after lunch out.';
      if (timeOut <= lunchIn) return 'Time out must be after lunch in. Overnight shifts aren\'t supported yet.';
    } else if (timeOut <= timeIn) {
      return 'Time out must be after time in. Overnight shifts aren\'t supported yet.';
    }
    return '';
  }

  /**
   * Worked segments for a schedule entry, in minutes after midnight.
   * @returns {Array<[number, number]>|null} null when the times are invalid.
   */
  function getSegments(times) {
    if (!times || validateTimeOrder(times)) return null;
    const timeIn = parseTime(times.timeIn);
    const timeOut = parseTime(times.timeOut);
    if (!times.lunchOut) return [[timeIn, timeOut]];
    return [[timeIn, parseTime(times.lunchOut)], [parseTime(times.lunchIn), timeOut]];
  }

  function segmentMinutes(segments) {
    return segments.reduce(function (sum, seg) { return sum + (seg[1] - seg[0]); }, 0);
  }

  /** Scheduled hours for an entry, or 0 when its times are invalid. */
  function scheduledHours(times) {
    const segments = getSegments(times);
    return segments ? segmentMinutes(segments) / 60 : 0;
  }

  function segmentsToTimes(segments) {
    if (segments.length === 1) {
      return {
        timeIn: formatTime12(segments[0][0]),
        lunchOut: '',
        lunchIn: '',
        timeOut: formatTime12(segments[0][1])
      };
    }
    return {
      timeIn: formatTime12(segments[0][0]),
      lunchOut: formatTime12(segments[0][1]),
      lunchIn: formatTime12(segments[1][0]),
      timeOut: formatTime12(segments[1][1])
    };
  }

  /**
   * Plan the clock times for a day with optional leave (SCHED-5).
   *
   * Partial leave keeps the day at its scheduled length. With placement 'start', worked time
   * is kept at the end of the day, so Day In moves later and Day Out stays. With 'end', Day Out
   * moves earlier. Lunch is kept unless the leave covers a whole half of the day. Extra Out/In
   * rows are never used, because LATS wraps out-of-order times to the next day (L4).
   *
   * Example: 8:30-12:00 and 12:30-4:30 with 1 hour of sick leave at the start becomes
   * Day In 9:30 AM, Lunch 12:00-12:30, Day Out 4:30 PM, plus Sick 1.
   *
   * @param {{timeIn, lunchOut, lunchIn, timeOut}|null} times Scheduled 12-hour times.
   * @param {number} leaveHours Leave to charge; 0 for a regular day.
   * @param {'start'|'end'} placement Where the leave goes.
   * @returns {{times: Object|null, workedHours: number, leaveHours: number}}
   */
  function planDay(times, leaveHours, placement) {
    const leave = Math.max(0, Number(leaveHours) || 0);
    const segments = getSegments(times);
    if (!segments) return { times: null, workedHours: 0, leaveHours: leave };

    const scheduledMin = segmentMinutes(segments);
    const leaveMin = Math.round(leave * 60);

    if (leaveMin <= 0) {
      return { times: segmentsToTimes(segments), workedHours: scheduledMin / 60, leaveHours: 0 };
    }
    if (leaveMin >= scheduledMin) {
      return { times: null, workedHours: 0, leaveHours: leave };
    }

    const atEnd = placement === 'end';
    let remaining = scheduledMin - leaveMin;
    const ordered = atEnd ? segments.slice() : segments.slice().reverse();
    const kept = [];
    for (let i = 0; i < ordered.length && remaining > 0; i++) {
      const seg = ordered[i];
      const length = seg[1] - seg[0];
      if (length <= remaining) {
        kept.push(seg);
        remaining -= length;
      } else {
        kept.push(atEnd ? [seg[0], seg[0] + remaining] : [seg[1] - remaining, seg[1]]);
        remaining = 0;
      }
    }
    if (!atEnd) kept.reverse();

    return {
      times: segmentsToTimes(kept),
      workedHours: (scheduledMin - leaveMin) / 60,
      leaveHours: leave
    };
  }

  // ========== SETTINGS ==========

  function normalizeDay(raw, fallback) {
    const day = Object.assign({}, fallback);
    if (!raw || typeof raw !== 'object') return day;
    if (typeof raw.works === 'boolean') day.works = raw.works;
    ['timeIn', 'timeOut'].forEach(function (key) {
      if (raw[key] && validateTime(raw[key])) day[key] = raw[key];
    });
    ['lunchOut', 'lunchIn'].forEach(function (key) {
      if (raw[key] === '') day[key] = '';
      else if (raw[key] && validateTime(raw[key])) day[key] = raw[key];
    });
    if (LOCATION_OPTIONS.some(function (opt) { return opt.value === raw.location; })) {
      day.location = raw.location;
    }
    return day;
  }

  function normalizeWeek(raw, fallback) {
    const week = {};
    WEEKDAYS.forEach(function (day) {
      week[day.key] = normalizeDay(raw && raw[day.key], fallback[day.key]);
    });
    return week;
  }

  /** Fill in missing or invalid fields of a schema version 2 settings object. */
  function normalizeSettings(raw) {
    const defaults = cloneDefaults();
    const schedule = (raw && raw.schedule) || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      alternateSchedule: !!(raw && raw.alternateSchedule),
      partialLeave: raw && raw.partialLeave === 'end' ? 'end' : 'start',
      schedule: {
        week1: normalizeWeek(schedule.week1, defaults.schedule.week1),
        week2: normalizeWeek(schedule.week2, defaults.schedule.week2)
      }
    };
  }

  function legacyTimes(preset) {
    if (!preset || typeof preset !== 'object') return null;
    const times = {};
    ['timeIn', 'lunchOut', 'lunchIn', 'timeOut'].forEach(function (key) {
      if (preset[key] && validateTime(preset[key])) times[key] = preset[key];
    });
    return Object.keys(times).length ? times : null;
  }

  /**
   * Convert stored settings to schema version 2 (SCHED-1).
   * Version 1 stored `week1` and `week2` time presets that applied to Monday through Friday.
   * @param {Object} raw Everything in chrome.storage.sync.
   * @returns {{settings: Object, migrated: boolean}} `migrated` is true when the caller
   *   should write `settings` back and remove LEGACY_KEYS.
   */
  function migrateSettings(raw) {
    raw = raw || {};
    if (raw.schemaVersion >= SCHEMA_VERSION && raw.schedule) {
      return { settings: normalizeSettings(raw), migrated: false };
    }
    const hasLegacy = !!(raw.week1 || raw.week2 || typeof raw.alternateSchedule === 'boolean');
    if (!hasLegacy) {
      return { settings: cloneDefaults(), migrated: false };
    }
    const week1Times = legacyTimes(raw.week1);
    const week2Times = legacyTimes(raw.week2) || week1Times;
    const settings = cloneDefaults();
    settings.alternateSchedule = !!raw.alternateSchedule;
    settings.schedule.week1 = createWeek(week1Times);
    settings.schedule.week2 = createWeek(week2Times);
    return { settings: settings, migrated: true };
  }

  /**
   * Read settings from chrome.storage.sync, migrating version 1 data the first time.
   * @param {function(Object)} callback
   */
  function loadSettings(callback) {
    chrome.storage.sync.get(null, function (raw) {
      const result = migrateSettings(raw);
      if (result.migrated) {
        chrome.storage.sync.set(result.settings, function () {
          chrome.storage.sync.remove(LEGACY_KEYS);
        });
      }
      callback(result.settings);
    });
  }

  /**
   * @param {Object} settings
   * @param {function()} [callback]
   */
  function saveSettings(settings, callback) {
    chrome.storage.sync.set(normalizeSettings(settings), function () {
      chrome.storage.sync.remove(LEGACY_KEYS, callback || function () {});
    });
  }

  /**
   * Schedule entry for a day of the pay period. Week 1 is the period's first seven days.
   * @param {Object} settings
   * @param {number} periodIndex 0-based day of the period.
   * @param {number} weekday Date#getDay() value.
   */
  function getScheduleEntry(settings, periodIndex, weekday) {
    const weekKey = settings.alternateSchedule && periodIndex >= 7 ? 'week2' : 'week1';
    return settings.schedule[weekKey][WEEKDAYS[weekday].key];
  }

  /** "Mon–Fri", "Tue–Sat", or "Mon, Wed, Fri". */
  function formatDayList(keys) {
    const positions = keys
      .map(function (key) { return SCHEDULE_DAY_ORDER.indexOf(key); })
      .filter(function (pos) { return pos !== -1; })
      .sort(function (a, b) { return a - b; });
    const runs = [];
    positions.forEach(function (pos) {
      const last = runs[runs.length - 1];
      if (last && pos === last[last.length - 1] + 1) last.push(pos);
      else runs.push([pos]);
    });
    const label = function (pos) { return weekdayByKey(SCHEDULE_DAY_ORDER[pos]).short; };
    return runs.map(function (run) {
      if (run.length >= 3) return label(run[0]) + '–' + label(run[run.length - 1]);
      return run.map(label).join(', ');
    }).join(', ');
  }

  function describeWeek(week) {
    const days = SCHEDULE_DAY_ORDER.filter(function (key) { return week[key].works; });
    if (!days.length) return 'no workdays';
    const ranges = days
      .map(function (key) { return week[key].timeIn + '–' + week[key].timeOut; })
      .filter(function (value, index, all) { return all.indexOf(value) === index; });
    return formatDayList(days) + ', ' + (ranges.length === 1 ? ranges[0] : 'varied hours');
  }

  /** One-line schedule summary, such as "Mon–Fri, 8:30 AM–4:30 PM". */
  function summarizeSchedule(settings) {
    if (!settings.alternateSchedule) return describeWeek(settings.schedule.week1);
    return 'Week 1: ' + describeWeek(settings.schedule.week1) +
      '. Week 2: ' + describeWeek(settings.schedule.week2) + '.';
  }

  // ========== DATE UTILITIES ==========

  /** Parse "10/22/2026" into a local Date. */
  function parseUSDate(text) {
    const match = String(text || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const date = new Date(parseInt(match[3], 10), parseInt(match[1], 10) - 1, parseInt(match[2], 10));
    return isNaN(date.getTime()) ? null : date;
  }

  /** "2026-10-22" for a local Date. */
  function dateKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  /** Parse "2026-10-22" (a dateKey) into a local Date, or null. */
  function parseDateKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    return match ? new Date(+match[1], +match[2] - 1, +match[3]) : null;
  }

  /** "Oct 8" */
  function shortDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  /**
   * Find the pay period's date range in page text, such as
   * "FY 2026 - 16 (10/22/2026 - 11/04/2026)".
   * @param {string} text
   * @returns {{start: Date, end: Date}|null}
   */
  function parsePeriodRange(text) {
    const date = '(\\d{1,2}/\\d{1,2}/\\d{4})';
    const range = date + '\\s*-\\s*' + date;
    const patterns = [
      new RegExp('FY\\s*\\d{4}\\s*-\\s*\\d+\\s*\\(\\s*' + range),
      new RegExp('Pay Period[^\\n]*?' + range, 'i'),
      new RegExp(range, 'g')
    ];
    const source = String(text || '');
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(source)) !== null) {
        const start = parseUSDate(match[1]);
        const end = parseUSDate(match[2]);
        if (start && end && end >= start && (end - start) / 86400000 <= 31) {
          return { start: start, end: end };
        }
        if (!pattern.global) break;
      }
    }
    return null;
  }

  /**
   * Resolve a month and day to a full date using the pay period range, so periods that
   * span December and January get the right year.
   * @param {number} month 1-12
   * @param {number} day
   * @param {{start: Date, end: Date}|null} range
   * @param {Date} [today]
   * @returns {Date}
   */
  function inferDate(month, day, range, today) {
    if (range) {
      const years = [range.start.getFullYear(), range.end.getFullYear()];
      for (let i = 0; i < years.length; i++) {
        const candidate = new Date(years[i], month - 1, day);
        if (candidate >= range.start && candidate <= range.end) return candidate;
      }
    }
    const now = today || new Date();
    let year = now.getFullYear();
    if (month === 12 && now.getMonth() === 0) year -= 1;
    if (month === 1 && now.getMonth() === 11) year += 1;
    return new Date(year, month - 1, day);
  }

  /**
   * The date in a LATS day header, such as "10/08 Thu", with its year from the period range.
   * @returns {Date|null}
   */
  function parseHeaderDate(text, range) {
    const match = String(text || '').match(/(\d{1,2})\/(\d{1,2})/);
    return match ? inferDate(parseInt(match[1], 10), parseInt(match[2], 10), range) : null;
  }

  /**
   * Find state holiday notices, such as "Holiday - 10/12/2026" (L5, SCHED-6).
   * @param {string} text Page text.
   * @returns {string[]} Date keys ("2026-10-12").
   */
  function findStateHolidays(text) {
    const keys = [];
    const pattern = /Holiday\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/g;
    let match;
    while ((match = pattern.exec(String(text || ''))) !== null) {
      const date = parseUSDate(match[1]);
      if (date) {
        const key = dateKey(date);
        if (keys.indexOf(key) === -1) keys.push(key);
      }
    }
    return keys;
  }

  /**
   * Read the timesheet status from page text: New, Un-Submitted, Submitted, Approved,
   * Processed, or Rejected. Returns '' when it isn't found.
   */
  function findTimesheetStatus(text) {
    const match = String(text || '').match(/Status\s*:?\s*(Un-?Submitted|New|Submitted|Approved|Processed|Rejected)\b/i);
    return match ? match[1] : '';
  }

  // ========== TDS UTILITIES ==========

  /** Collapse all whitespace, including non-breaking spaces in sub-task codes (L9). */
  function normalizeSpace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function splitLabel(text, separator) {
    const normalized = normalizeSpace(text);
    const index = normalized.indexOf(separator);
    if (index === -1) return { code: normalized, label: '' };
    return { code: normalized.slice(0, index).trim(), label: normalized.slice(index + separator.length).trim() };
  }

  /**
   * LATS shows sub-task links as "{code} - {description}", such as
   * "SUB_DEMO_Alpha ONE - Sample sub-task description".
   */
  function parseSubTaskLabel(text) {
    return splitLabel(text, ' - ');
  }

  /**
   * LATS shows a row's category as "{code}: {description}", such as
   * "Direct: Sample Direct Category Code". The code matches the #Category item's CategoryCode.
   */
  function parseCategoryLabel(text) {
    return splitLabel(text, ': ');
  }

  /** Same row identity, ignoring whitespace, case, and sub-task descriptions. */
  function tdsRowKey(row) {
    return [row.taskCode || row.task, parseSubTaskLabel(row.subTask || '').code].map(function (part) {
      return normalizeSpace(part).toLowerCase();
    }).join('|');
  }

  /**
   * Search term for #subTaskCodeSearch. LATS needs at least 3 characters. The first word avoids
   * non-breaking spaces, and works whether the search matches a prefix or any part.
   */
  function subTaskSearchTerm(code) {
    const normalized = normalizeSpace(code);
    const first = normalized.split(' ')[0];
    return first.length >= 3 ? first : normalized;
  }

  /**
   * Hours left to assign per day: Work Totals minus the hours entered (TDS-2).
   * @param {number[]} workTotals
   * @param {number[]} entered
   * @returns {number[]}
   */
  function computeRemaining(workTotals, entered) {
    return workTotals.map(function (work, i) {
      return Math.round(((work || 0) - (entered[i] || 0)) * 100) / 100;
    });
  }

  // ========== DOM HELPERS ==========
  // Used by the content scripts, the popup, and the options page. They touch `document` only
  // when called, so Vitest can still load this file in Node.

  /**
   * Create an element. `attrs` takes `className`, `text`, and attributes: true sets an empty
   * attribute, and false, null, or undefined skips it. Children can be nodes or strings.
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (name) {
      const value = attrs[name];
      if (name === 'text') node.textContent = value;
      else if (name === 'className') node.className = value;
      else if (value === true) node.setAttribute(name, '');
      else if (value !== false && value !== null && value !== undefined) node.setAttribute(name, value);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  /** Set text only when it changes, so MutationObservers don't fire for nothing. */
  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  /** Set or remove a "true" flag attribute, such as data-weekend. */
  function setFlag(node, name, on) {
    if (on) node.setAttribute(name, 'true');
    else if (node.hasAttribute(name)) node.removeAttribute(name);
  }

  /** The number in a node's text, ignoring other characters; 0 when there isn't one. */
  function numberIn(node) {
    return parseFloat(String(node && node.textContent || '').replace(/[^\d.-]/g, '')) || 0;
  }

  /** True for a day header that names Saturday or Sunday, such as "10/10 Sat" or "10/10<br>Sat". */
  function isWeekendHeader(text) {
    return /(^|[^A-Za-z])(Sat|Sun)(?![A-Za-z])/.test(text || '');
  }

  /** True for an input title that ends in Saturday or Sunday, such as "Day In Day 3 Saturday". */
  function isWeekendTitle(title) {
    return /(Saturday|Sunday)\s*$/.test(title || '');
  }

  /**
   * True when a mutation only touches LATS Go!'s own elements: its target is inside
   * `ownSelector`, or every node it adds or removes is an lg- element or a <colgroup>.
   * MutationObservers use it so the extension doesn't react to its own decorations.
   */
  function isOwnMutation(mutation, ownSelector) {
    const target = mutation.target;
    if (target.nodeType === 1 && target.closest(ownSelector)) return true;
    const nodes = Array.prototype.slice.call(mutation.addedNodes).concat(Array.prototype.slice.call(mutation.removedNodes));
    return nodes.length > 0 && nodes.every(function (node) {
      return node.nodeType === 1 && /(^|\s)lg-/.test(node.className || '') || node.nodeName === 'COLGROUP';
    });
  }

  let requestCounter = 0;

  /**
   * Ask scripts/page-bridge.js to run an action in the page's main world. The bridge answers
   * with a 'latsgo:response' event that carries the same id.
   * @returns {Promise<*>} The action's result.
   */
  function callPage(action, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const id = 'lg-' + (++requestCounter) + '-' + Date.now();
      const timer = setTimeout(function () {
        document.removeEventListener('latsgo:response', onResponse);
        reject(new Error('LATS didn\'t respond in time.'));
      }, timeoutMs || 30000);

      function onResponse(event) {
        let data;
        try { data = JSON.parse(event.detail); } catch (error) { return; }
        if (!data || data.id !== id) return;
        clearTimeout(timer);
        document.removeEventListener('latsgo:response', onResponse);
        if (data.ok) resolve(data.result);
        else reject(new Error(data.error || 'Something went wrong in LATS.'));
      }

      document.addEventListener('latsgo:response', onResponse);
      document.dispatchEvent(new CustomEvent('latsgo:request', {
        detail: JSON.stringify({ id: id, action: action, payload: payload || {} })
      }));
    });
  }

  /**
   * Run `callback` once the timesheet or TDS page has rendered. LATS can render after the
   * content scripts load, so this polls for up to 10 seconds.
   */
  function whenLatsReady(callback) {
    const check = function (attempt) {
      if (document.getElementById('timesheetTable') || document.getElementById('distributionRows') ||
        document.getElementById('tdsFooter')) {
        callback();
      } else if (attempt < 20) {
        setTimeout(function () { check(attempt + 1); }, 500);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { check(0); });
    } else {
      check(0);
    }
  }

  /** LATS's TDS footer tables: TDS Totals, Work Totals, and dates. Excludes LATS Go!'s Remaining row. */
  function tdsFooterTables() {
    const footer = document.getElementById('tdsFooter');
    if (!footer) return [];
    return Array.prototype.filter.call(footer.querySelectorAll('table.tdsGrid'), function (table) {
      return !table.closest('.lg-tds-remaining');
    });
  }

  /** Day cells of a TDS table, without the label cell or LATS Go!'s Total column. */
  function tdsDayCells(table) {
    return Array.prototype.slice.call(table.querySelectorAll('tr td:not(.leftColumn):not(.lg-total-col)'));
  }

  /**
   * A TDS row's codes from LATS's hidden fields, such as Distributions_0__TaskCode. Values are
   * whitespace-normalized (L9), and null when the field is missing.
   */
  function readTdsRowFields(container) {
    const value = function (suffix) {
      const input = container && container.querySelector('input[type="hidden"][id$="__' + suffix + '"]');
      return input ? normalizeSpace(input.value) : null;
    };
    return {
      categoryCode: value('CategoryCode'),
      categoryDescription: value('CategoryDescription'),
      taskCode: value('TaskCode'),
      taskDescription: value('TaskDescription'),
      subTaskCode: value('SubTask_0__Name'),
      subTaskDescription: value('SubTask_0__Description')
    };
  }

  return {
    WEEKDAYS: WEEKDAYS,
    SCHEDULE_DAY_ORDER: SCHEDULE_DAY_ORDER,
    weekdayByKey: weekdayByKey,
    LOCATION_OPTIONS: LOCATION_OPTIONS,
    DAY_TYPE_OPTIONS: DAY_TYPE_OPTIONS,
    DAY_TYPE_MAP: DAY_TYPE_MAP,
    LEAVE_ROW_NAMES: LEAVE_ROW_NAMES,
    TIME_ROW_NAMES: TIME_ROW_NAMES,
    LEAVE_HOURS: LEAVE_HOURS,
    cloneDefaults: cloneDefaults,
    createWeek: createWeek,
    parseTime: parseTime,
    formatTime24: formatTime24,
    to12Hour: to12Hour,
    to24Hour: to24Hour,
    formatDuration: formatDuration,
    formatHours: formatHours,
    validateLeaveHours: validateLeaveHours,
    validateTimeOrder: validateTimeOrder,
    getSegments: getSegments,
    scheduledHours: scheduledHours,
    planDay: planDay,
    migrateSettings: migrateSettings,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    getScheduleEntry: getScheduleEntry,
    formatDayList: formatDayList,
    summarizeSchedule: summarizeSchedule,
    dateKey: dateKey,
    parseDateKey: parseDateKey,
    shortDate: shortDate,
    addDays: addDays,
    parsePeriodRange: parsePeriodRange,
    inferDate: inferDate,
    parseHeaderDate: parseHeaderDate,
    findStateHolidays: findStateHolidays,
    findTimesheetStatus: findTimesheetStatus,
    normalizeSpace: normalizeSpace,
    parseSubTaskLabel: parseSubTaskLabel,
    parseCategoryLabel: parseCategoryLabel,
    tdsRowKey: tdsRowKey,
    subTaskSearchTerm: subTaskSearchTerm,
    computeRemaining: computeRemaining,
    el: el,
    setText: setText,
    setFlag: setFlag,
    numberIn: numberIn,
    isWeekendHeader: isWeekendHeader,
    isWeekendTitle: isWeekendTitle,
    isOwnMutation: isOwnMutation,
    callPage: callPage,
    whenLatsReady: whenLatsReady,
    tdsFooterTables: tdsFooterTables,
    tdsDayCells: tdsDayCells,
    readTdsRowFields: readTdsRowFields
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LatsGo;
}
