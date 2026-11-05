import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LG = require('../scripts/shared/utils.js');

const STANDARD = { timeIn: '8:30 AM', lunchOut: '12:00 PM', lunchIn: '12:30 PM', timeOut: '4:30 PM' };

describe('time parsing and formatting', () => {
  it('parses 12- and 24-hour times', () => {
    expect(LG.parseTime('8:30 AM')).toBe(510);
    expect(LG.parseTime('12:00 PM')).toBe(720);
    expect(LG.parseTime('12:15 AM')).toBe(15);
    expect(LG.parseTime('16:30')).toBe(990);
    expect(LG.parseTime('4:30PM')).toBe(990);
    expect(LG.parseTime('13:00 PM')).toBeNull();
    expect(LG.parseTime('')).toBeNull();
  });

  it('converts between storage and input formats', () => {
    expect(LG.to24Hour('8:30 AM')).toBe('08:30');
    expect(LG.to12Hour('16:30')).toBe('4:30 PM');
    expect(LG.to12Hour('')).toBe('');
  });

  it('formats durations', () => {
    expect(LG.formatDuration(7.5)).toBe('7h 30m');
    expect(LG.formatDuration(8)).toBe('8h');
    expect(LG.formatDuration(0.25)).toBe('15m');
    expect(LG.formatDuration(37.5)).toBe('37h 30m');
  });
});

describe('validateTimeOrder (L4)', () => {
  it('accepts the standard day and a day without lunch', () => {
    expect(LG.validateTimeOrder(STANDARD)).toBe('');
    expect(LG.validateTimeOrder({ timeIn: '9:00 AM', lunchOut: '', lunchIn: '', timeOut: '1:00 PM' })).toBe('');
  });

  it('rejects out-of-order times', () => {
    expect(LG.validateTimeOrder({ ...STANDARD, lunchOut: '8:00 AM' })).toMatch(/Lunch out/);
    expect(LG.validateTimeOrder({ ...STANDARD, lunchIn: '11:00 AM' })).toMatch(/Lunch in/);
    expect(LG.validateTimeOrder({ ...STANDARD, timeOut: '12:15 PM' })).toMatch(/Time out/);
    expect(LG.validateTimeOrder({ ...STANDARD, lunchIn: '' })).toMatch(/both lunch times/);
  });
});

describe('planDay (SCHED-5)', () => {
  it('fills a regular day', () => {
    const plan = LG.planDay(STANDARD, 0, 'start');
    expect(plan.times).toEqual(STANDARD);
    expect(plan.workedHours).toBe(7.5);
    expect(plan.leaveHours).toBe(0);
  });

  it('moves Day In later for leave at the start of the day', () => {
    const plan = LG.planDay(STANDARD, 1, 'start');
    expect(plan.times).toEqual({ ...STANDARD, timeIn: '9:30 AM' });
    expect(plan.workedHours).toBe(6.5);
    expect(plan.leaveHours).toBe(1);
  });

  it('moves Day Out earlier for leave at the end of the day', () => {
    const plan = LG.planDay(STANDARD, 1, 'end');
    expect(plan.times).toEqual({ ...STANDARD, timeOut: '3:30 PM' });
  });

  it('drops lunch when the leave covers the morning', () => {
    const plan = LG.planDay(STANDARD, 4, 'start');
    expect(plan.times).toEqual({ timeIn: '1:00 PM', lunchOut: '', lunchIn: '', timeOut: '4:30 PM' });
    expect(plan.workedHours).toBe(3.5);
  });

  it('drops lunch when the leave covers the afternoon', () => {
    const plan = LG.planDay(STANDARD, 4, 'end');
    expect(plan.times).toEqual({ timeIn: '8:30 AM', lunchOut: '', lunchIn: '', timeOut: '12:00 PM' });
  });

  it('treats leave of a full day or more as a leave-only day', () => {
    const plan = LG.planDay(STANDARD, 7.5, 'start');
    expect(plan.times).toBeNull();
    expect(plan.workedHours).toBe(0);
    expect(plan.leaveHours).toBe(7.5);
  });

  it('never produces times out of order', () => {
    for (let h = 0.5; h < 7.5; h += 0.5) {
      for (const placement of ['start', 'end']) {
        const plan = LG.planDay(STANDARD, h, placement);
        expect(LG.validateTimeOrder(plan.times)).toBe('');
        expect(plan.workedHours + plan.leaveHours).toBeCloseTo(7.5);
        expect(LG.scheduledHours(plan.times)).toBeCloseTo(plan.workedHours);
      }
    }
  });
});

describe('validateLeaveHours', () => {
  it('allows 0.5 to 7.5 in steps of 0.5', () => {
    expect(LG.validateLeaveHours(0.5)).toBe(true);
    expect(LG.validateLeaveHours('7.5')).toBe(true);
    expect(LG.validateLeaveHours(3)).toBe(true);
    expect(LG.validateLeaveHours(0)).toBe(false);
    expect(LG.validateLeaveHours(8)).toBe(false);
    expect(LG.validateLeaveHours(1.25)).toBe(false);
    expect(LG.validateLeaveHours('abc')).toBe(false);
  });
});

describe('settings migration (SCHED-1)', () => {
  it('returns defaults when nothing is stored', () => {
    const { settings, migrated } = LG.migrateSettings({});
    expect(migrated).toBe(false);
    expect(settings.schedule.week1.mon.works).toBe(true);
    expect(settings.schedule.week1.sat.works).toBe(false);
  });

  it('converts version 1 presets to a per-weekday schedule', () => {
    const { settings, migrated } = LG.migrateSettings({
      alternateSchedule: true,
      week1: { timeIn: '7:00 AM', lunchOut: '11:30 AM', lunchIn: '12:00 PM', timeOut: '3:00 PM' },
      week2: { timeIn: '9:00 AM', lunchOut: '12:30 PM', lunchIn: '1:00 PM', timeOut: '5:00 PM' }
    });
    expect(migrated).toBe(true);
    expect(settings.schemaVersion).toBe(2);
    expect(settings.alternateSchedule).toBe(true);
    expect(settings.schedule.week1.fri.timeIn).toBe('7:00 AM');
    expect(settings.schedule.week1.fri.works).toBe(true);
    expect(settings.schedule.week1.sun.works).toBe(false);
    expect(settings.schedule.week2.tue.timeOut).toBe('5:00 PM');
    expect(settings.schedule.week2.tue.location).toBe('none');
  });

  it('keeps version 2 settings and repairs bad fields', () => {
    const stored = LG.cloneDefaults();
    stored.schedule.week1.sat.works = true;
    stored.schedule.week1.sat.location = 'onsite';
    stored.schedule.week1.mon.timeIn = 'not a time';
    const { settings, migrated } = LG.migrateSettings(stored);
    expect(migrated).toBe(false);
    expect(settings.schedule.week1.sat.works).toBe(true);
    expect(settings.schedule.week1.sat.location).toBe('onsite');
    expect(settings.schedule.week1.mon.timeIn).toBe('8:30 AM');
  });

  it('picks the week 2 entry only with an alternate schedule', () => {
    const settings = LG.cloneDefaults();
    settings.schedule.week2.thu.timeIn = '10:00 AM';
    expect(LG.getScheduleEntry(settings, 8, 4).timeIn).toBe('8:30 AM');
    settings.alternateSchedule = true;
    expect(LG.getScheduleEntry(settings, 8, 4).timeIn).toBe('10:00 AM');
    expect(LG.getScheduleEntry(settings, 1, 4).timeIn).toBe('8:30 AM');
  });
});

describe('schedule summary', () => {
  it('describes day ranges', () => {
    expect(LG.formatDayList(['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('Mon–Fri');
    expect(LG.formatDayList(['tue', 'wed', 'thu', 'fri', 'sat'])).toBe('Tue–Sat');
    expect(LG.formatDayList(['mon', 'wed', 'fri'])).toBe('Mon, Wed, Fri');
    expect(LG.summarizeSchedule(LG.cloneDefaults())).toBe('Mon–Fri, 8:30 AM–4:30 PM');
  });
});

describe('page text parsing', () => {
  it('finds the pay period range', () => {
    const range = LG.parsePeriodRange('Timesheet FY 2026 - 16 (10/22/2026 - 11/04/2026) Status New');
    expect(LG.dateKey(range.start)).toBe('2026-10-22');
    expect(LG.dateKey(range.end)).toBe('2026-11-04');
  });

  it('infers the year for periods that span December and January', () => {
    const range = LG.parsePeriodRange('FY 2026 - 22 (12/24/2026 - 01/06/2027)');
    expect(LG.dateKey(LG.inferDate(12, 31, range))).toBe('2026-12-31');
    expect(LG.dateKey(LG.inferDate(1, 2, range))).toBe('2027-01-02');
  });

  it('finds state holiday notices (SCHED-6)', () => {
    const text = 'Holiday - 10/12/2026\nHoliday\t0\t0\nHoliday - 11/11/2026 Holiday - 10/12/2026';
    expect(LG.findStateHolidays(text)).toEqual(['2026-10-12', '2026-11-11']);
  });

  it('reads the timesheet status', () => {
    expect(LG.findTimesheetStatus('Status: Un-Submitted')).toBe('Un-Submitted');
    expect(LG.findTimesheetStatus('Status New Timesheet')).toBe('New');
    expect(LG.findTimesheetStatus('Status Approved')).toBe('Approved');
    expect(LG.findTimesheetStatus('nothing here')).toBe('');
  });
});

describe('TDS helpers', () => {
  it('normalizes non-breaking spaces (L9)', () => {
    expect(LG.normalizeSpace('DTO_ITS_ChatNY PRE ')).toBe('DTO_ITS_ChatNY PRE');
    expect(LG.tdsRowKey({ taskCode: 'ITS-3886', subTask: 'DTO_ITS_ChatNY PRE' }))
      .toBe(LG.tdsRowKey({ taskCode: 'ITS-3886', subTask: 'DTO_ITS_ChatNY PRE' }));
  });

  it('splits LATS labels into codes and descriptions', () => {
    expect(LG.parseSubTaskLabel('DTO_ITS_ChatNY\u00a0PRE - ChatNY Engage rated product exploration'))
      .toEqual({ code: 'DTO_ITS_ChatNY PRE', label: 'ChatNY Engage rated product exploration' });
    expect(LG.parseCategoryLabel('Labor: Agencywide Labor Category Code'))
      .toEqual({ code: 'Labor', label: 'Agencywide Labor Category Code' });
    expect(LG.parseCategoryLabel('Overhead')).toEqual({ code: 'Overhead', label: '' });
    expect(LG.tdsRowKey({ taskCode: 'ITS-3886', subTask: 'DTO_ITS_ChatNY PRE - ChatNY Engage' }))
      .toBe(LG.tdsRowKey({ taskCode: 'ITS-3886', subTask: 'DTO_ITS_ChatNY PRE' }));
  });

  it('builds a sub-task search term of at least 3 characters', () => {
    expect(LG.subTaskSearchTerm('DTO_ITS_Click to Ren')).toBe('DTO_ITS_Click');
    expect(LG.subTaskSearchTerm('AB CD')).toBe('AB CD');
  });

  it('computes remaining hours per day (TDS-2)', () => {
    expect(LG.computeRemaining([7.5, 7.5, 0], [7.5, 6, 0])).toEqual([0, 1.5, 0]);
    expect(LG.computeRemaining([7.5], [8])).toEqual([-0.5]);
  });
});
