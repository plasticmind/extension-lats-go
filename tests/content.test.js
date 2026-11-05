import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildTimesheetHtml, buildTdsHtml } from './fixtures/lats-pages.js';

const root = fileURLToPath(new URL('..', import.meta.url));
// Same order as the manifest: utils.js, lats-restyle.js, then content.js.
const SCRIPT = ['scripts/shared/utils.js', 'scripts/lats-restyle.js', 'scripts/content.js']
  .map((file) => readFileSync(root + file, 'utf8')).join('\n');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function chromeStub(sync = {}, local = {}) {
  const areas = { sync: clone(sync), local: clone(local) };
  const listeners = [];
  const area = (name) => ({
    get(keys, callback) {
      let result = {};
      if (keys === null || keys === undefined) result = clone(areas[name]);
      else (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        if (areas[name][key] !== undefined) result[key] = clone(areas[name][key]);
      });
      setTimeout(() => callback(result), 0);
    },
    set(items, callback) {
      Object.assign(areas[name], clone(items));
      listeners.forEach((listener) => listener({}, name));
      if (callback) setTimeout(callback, 0);
    },
    remove(keys, callback) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => { delete areas[name][key]; });
      if (callback) setTimeout(callback, 0);
    }
  });
  return {
    areas,
    storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: (fn) => listeners.push(fn) } },
    runtime: { sendMessage: vi.fn(), openOptionsPage: vi.fn() }
  };
}

function load(html, { sync, local, url = 'https://time02.lats.ny.gov/Timesheet' } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent; },
    configurable: true
  });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new window.Event('close'));
  };
  Object.defineProperty(window.HTMLDialogElement.prototype, 'open', {
    get() { return this.hasAttribute('open'); },
    configurable: true
  });
  const chrome = chromeStub(sync, local);
  window.chrome = chrome;
  window.eval(SCRIPT);
  return { window, document: window.document, chrome };
}

async function until(check, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}

function field(document, title) {
  const input = Array.from(document.querySelectorAll('#timesheetTable input')).find((el) => el.title === title);
  if (!input) throw new Error('No field ' + title);
  return input;
}

const LG = createRequire(import.meta.url)('../scripts/shared/utils.js');

function settingsWith(mutate) {
  const settings = LG.cloneDefaults();
  mutate(settings);
  return settings;
}

async function openDialog(document) {
  const button = await until(() => document.getElementById('fillTimecard'));
  button.click();
  return until(() => {
    const dialog = document.querySelector('dialog.lg-dialog');
    return dialog && dialog.open && dialog.querySelectorAll('tr[data-index]').length ? dialog : null;
  });
}

function rowFor(dialog, index) {
  return dialog.querySelector(`tr[data-index="${index}"]`);
}

async function applyAndWait(document, dialog) {
  dialog.querySelector('[data-action="apply"]').click();
  await until(() => /Select Save to update LATS totals/.test(document.querySelector('.lg-toast')?.textContent || ''));
}

describe('Fill Timecard', () => {
  it('labels the button "Fill Timecard" with a decorative sparkle', async () => {
    const { document } = load(buildTimesheetHtml());
    const button = await until(() => document.getElementById('fillTimecard'));
    expect(button.textContent).toBe('\u2728Fill Timecard');
    expect(button.querySelector('.lg-sparkle').getAttribute('aria-hidden')).toBe('true');
  });

  it('fills a hybrid week, skips the state holiday, and handles partial sick leave', async () => {
    const sync = settingsWith((s) => {
      const week = s.schedule.week1;
      week.mon.location = 'offsite';
      week.fri.location = 'offsite';
      week.tue.location = 'onsite';
      week.wed.location = 'onsite';
      week.thu.location = 'onsite';
    });
    const { window, document } = load(buildTimesheetHtml({ holidays: ['10/12/2026'] }), { sync });
    const dialog = await openDialog(document);

    expect(dialog.querySelectorAll('tr[data-index]')).toHaveLength(14);
    expect(rowFor(dialog, 3).textContent).toContain('Weekend');
    expect(rowFor(dialog, 5).textContent).toContain('State holiday (LATS fills this)');
    expect(rowFor(dialog, 5).querySelector('input[type="checkbox"]').disabled).toBe(true);
    expect(dialog.querySelector('[data-apply-label]').textContent).toBe('Fill 9 days');

    // Tuesday 10/13: 1 hour of sick leave at the start of the day.
    const tuesday = rowFor(dialog, 6);
    const type = tuesday.querySelector('select');
    type.value = 'sick';
    type.dispatchEvent(new window.Event('change', { bubbles: true }));
    const hours = tuesday.querySelector('input[type="number"]');
    hours.value = '1';
    hours.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(tuesday.textContent).toContain('09:30–12:00');
    expect(tuesday.querySelector('.lg-col-total').textContent).toBe('7h 30m');

    await applyAndWait(document, dialog);

    expect(field(document, 'Day In Day 1 Thursday').value).toBe('8:30 AM');
    expect(field(document, 'Lunch Out Day 1 Thursday').value).toBe('12:00 PM');
    expect(field(document, 'Lunch In Day 1 Thursday').value).toBe('12:30 PM');
    expect(field(document, 'Day Out Day 1 Thursday').value).toBe('4:30 PM');
    expect(field(document, 'On-Site Day 1 Thursday').checked).toBe(true);
    expect(field(document, 'Off-Site Day 1 Thursday').checked).toBe(false);
    expect(field(document, 'Off-Site Day 2 Friday').checked).toBe(true);
    expect(field(document, 'On-Site Day 2 Friday').checked).toBe(false);

    // State holiday: untouched, and the Holiday leave row stays empty.
    expect(field(document, 'Day In Day 5 Monday').value).toBe('');
    expect(field(document, 'Holiday Day 5 Monday').value).toBe('0');

    // Weekend: untouched.
    expect(field(document, 'Day In Day 3 Saturday').value).toBe('');

    expect(field(document, 'Day In Day 6 Tuesday').value).toBe('9:30 AM');
    expect(field(document, 'Day Out Day 6 Tuesday').value).toBe('4:30 PM');
    expect(field(document, 'Sick Day 6 Tuesday').value).toBe('1');
    expect(field(document, 'On-Site Day 6 Tuesday').checked).toBe(true);
  }, 30000);

  it('shows progress while filling, then celebrates (and skips confetti with reduced motion)', async () => {
    const { document } = load(buildTimesheetHtml());
    const dialog = await openDialog(document);
    dialog.querySelector('[data-action="apply"]').click();
    const bar = await until(() => document.querySelector('.lg-toast [role="progressbar"]'));
    expect(bar.getAttribute('aria-valuemax')).toBe('10');
    expect(document.getElementById('fillTimecard').getAttribute('aria-busy')).toBe('true');
    await until(() => /Select Save to update LATS totals/.test(document.querySelector('.lg-toast').textContent));
    expect(document.querySelector('.lg-toast').textContent).toMatch(/10 days/);
    expect(document.querySelectorAll('.lg-confetti .lg-confetti__piece').length).toBeGreaterThan(20);
    expect(document.getElementById('fillTimecard').disabled).toBe(false);

    const calm = load(buildTimesheetHtml());
    calm.window.matchMedia = () => ({ matches: true });
    const calmDialog = await openDialog(calm.document);
    await applyAndWait(calm.document, calmDialog);
    expect(calm.document.querySelector('.lg-confetti')).toBeNull();
  }, 30000);

  it('fills Saturday and leaves Monday blank for a Tuesday–Saturday schedule', async () => {
    const sync = settingsWith((s) => {
      const week = s.schedule.week1;
      week.mon.works = false;
      week.sat.works = true;
    });
    const { document } = load(buildTimesheetHtml(), { sync });
    const dialog = await openDialog(document);
    await applyAndWait(document, dialog);

    expect(field(document, 'Day In Day 3 Saturday').value).toBe('8:30 AM');
    expect(field(document, 'Day In Day 5 Monday').value).toBe('');
    expect(field(document, 'Day In Day 4 Sunday').value).toBe('');
  }, 30000);

  it('clears both location boxes and every Extra row on a full leave day', async () => {
    const { window, document } = load(buildTimesheetHtml());
    field(document, 'On-Site Day 1 Thursday').checked = true;
    field(document, 'Day In Day 1 Thursday').value = '9:00 AM';
    const extras = () => Array.from(document.querySelectorAll('#timesheetTable input'))
      .filter((el) => /^Extra (Out|In) Day 1 Thursday$/.test(el.title));
    expect(extras()).toHaveLength(6);
    extras().forEach((el) => { el.value = '1:00 PM'; });

    const dialog = await openDialog(document);
    const thursday = rowFor(dialog, 1);
    const type = thursday.querySelector('select');
    type.value = 'vacation';
    type.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(thursday.textContent).toContain('None on leave days');

    await applyAndWait(document, dialog);
    expect(field(document, 'Day In Day 1 Thursday').value).toBe('');
    expect(field(document, 'Vacation Day 1 Thursday').value).toBe('7.5');
    expect(field(document, 'On-Site Day 1 Thursday').checked).toBe(false);
    expect(extras().map((el) => el.value)).toEqual(['', '', '', '', '', '']);
  }, 30000);

  it('migrates version 1 settings and fills with them', async () => {
    const { document, chrome } = load(buildTimesheetHtml(), {
      sync: { alternateSchedule: false, week1: { timeIn: '7:00 AM', lunchOut: '11:30 AM', lunchIn: '12:00 PM', timeOut: '3:00 PM' } }
    });
    const dialog = await openDialog(document);
    await applyAndWait(document, dialog);

    expect(field(document, 'Day In Day 1 Thursday').value).toBe('7:00 AM');
    expect(chrome.areas.sync.schemaVersion).toBe(2);
    expect(chrome.areas.sync.week1).toBeUndefined();
  }, 30000);

  it('blocks Apply when leave hours are out of range', async () => {
    const { window, document } = load(buildTimesheetHtml());
    const dialog = await openDialog(document);
    const thursday = rowFor(dialog, 1);
    const type = thursday.querySelector('select');
    type.value = 'sick';
    type.dispatchEvent(new window.Event('change', { bubbles: true }));
    const hours = thursday.querySelector('input[type="number"]');
    hours.value = '9';
    hours.dispatchEvent(new window.Event('input', { bubbles: true }));

    dialog.querySelector('[data-action="apply"]').click();
    const alert = dialog.querySelector('[data-role="errors"]');
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toContain('Enter leave hours from 0.5 to 7.5');
    expect(dialog.open).toBe(true);
    expect(field(document, 'Day In Day 1 Thursday').value).toBe('');
  });
});

describe('Locked periods (FLOW-1)', () => {
  it('explains a locked period in place of Fill Timecard', async () => {
    const { document } = load(buildTimesheetHtml({ locked: true, status: 'New' }));
    const callout = await until(() => document.querySelector('.lg-locked-callout'), 5000);
    expect(callout.textContent).toContain('LATS unlocks this period after you submit earlier timesheets.');
    expect(callout.querySelector('button').textContent).toBe('Open oldest overdue');
    expect(document.getElementById('fillTimecard')).toBeNull();
  });

  it('stays quiet on a submitted period', async () => {
    const { document } = load(buildTimesheetHtml({ locked: true, status: 'Submitted' }));
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(document.querySelector('.lg-locked-callout')).toBeNull();
  });
});

describe('TDS helpers', () => {
  const tdsUrl = 'https://time02.lats.ny.gov/TimeDistribution?tshdrid=123';

  it('shows remaining hours per day and running row totals (TDS-2)', async () => {
    const work = [7.5, 7.5, 0, 0, 7.5];
    const rows = [
      { category: 'ITS Overhead', taskCode: 'ITS-4039', subTask: '', hours: [7.5, 4] },
      { category: 'Labor', taskCode: 'ITS-3886', subTask: 'DTO_ITS_Click to Ren', hours: [0, 2] }
    ];
    const { window, document } = load(buildTdsHtml({ rows, work }), { url: tdsUrl });
    const remaining = await until(() => document.querySelector('.lg-tds-remaining'));
    const cells = Array.from(remaining.querySelectorAll('td:not(.leftColumn)'));

    expect(cells[0].dataset.state).toBe('done');
    expect(cells[1].dataset.state).toBe('left');
    expect(cells[1].textContent).toBe('1.5left');
    expect(cells[2].dataset.state).toBe('none');
    expect(cells[4].textContent).toBe('7.5left');
    expect(remaining.querySelector('td.lg-total-col').textContent).toBe('9 left');

    // UI-4: each row has a running total in the Total column.
    const rowTotals = () => Array.from(document.querySelectorAll('.distributionRow td.lg-total-col')).map((c) => c.textContent);
    expect(rowTotals()).toEqual(['11.5', '2']);

    const input = document.getElementsByName('Distributions[1].Hours[1]')[0];
    input.value = '4';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(cells[1].dataset.state).toBe('over');
    expect(cells[1].textContent).toBe('0.5over');
    expect(rowTotals()).toEqual(['11.5', '4']);
    expect(document.querySelector('#tdsFooter table.lg-work-totals td.lg-total-col').textContent).toBe('22.5');
  });

  it('doesn\'t rewrite the cached rows while you type', async () => {
    const rows = [{ category: 'Labor', taskCode: 'ITS-3886', subTask: '', hours: [1] }];
    const { window, document, chrome } = load(buildTdsHtml({ rows, work: [7.5] }), { url: tdsUrl });
    await until(() => chrome.areas.local.tdsHistory);
    const writes = vi.spyOn(chrome.storage.local, 'set');

    // The row's Total cell changes as you type. That's LATS Go!'s own change, not a new row.
    const input = document.getElementsByName('Distributions[0].Hours[1]')[0];
    input.value = '3';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.querySelector('.distributionRow td.lg-total-col').textContent).toBe('4');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(writes).not.toHaveBeenCalled();
  });

  it('remembers rows, then offers to copy them into an empty period (TDS-1)', async () => {
    const rows = [
      { category: 'ITS Overhead', taskCode: 'ITS-4039', subTask: '' },
      { category: 'Labor', taskCode: 'ITS-3886', subTask: 'DTO_ITS_Click to Ren' }
    ];
    const first = load(buildTdsHtml({ start: '10/08/2026', rows, work: [7.5] }), { url: tdsUrl });
    await until(() => first.chrome.areas.local.tdsHistory);
    const history = first.chrome.areas.local.tdsHistory;
    expect(Object.keys(history)).toEqual(['2026-10-08']);
    expect(history['2026-10-08'].rows[1]).toMatchObject({
      category: 'Labor',
      categoryLabel: 'Labor Category Code',
      taskCode: 'ITS-3886',
      task: 'ITS-3886: Sample Task',
      subTask: 'DTO_ITS_Click to Ren',
      subTaskLabel: 'Sample sub-task description'
    });

    const { document } = load(buildTdsHtml({ start: '10/22/2026', rows: [], work: [7.5] }), {
      url: tdsUrl,
      local: { tdsHistory: history }
    });
    const callout = await until(() => document.querySelector('.lg-tds-copy'));
    await until(() => /2 rows/.test(callout.textContent));
    expect(callout.textContent).toContain('2 rows from the period starting Oct 8.');
    expect(callout.querySelector('button').disabled).toBe(false);
  });

  it('copies rows through the page bridge and reports the ones it couldn\'t add (TDS-1)', async () => {
    const history = {
      '2026-10-08': {
        savedAt: 1,
        rows: [
          { category: 'ITS Overhead', taskCode: 'ITS-4039', task: 'ITS-4039', subTask: '' },
          { category: 'ITS Overhead_HCD', taskCode: 'ITS-3444', task: 'ITS-3444', subTask: 'DTO_ITS_HCD DesignSy' }
        ]
      }
    };
    const { window, document } = load(buildTdsHtml({ start: '10/22/2026', rows: [], work: [7.5] }), {
      url: tdsUrl,
      local: { tdsHistory: history }
    });

    // Stand-in for scripts/page-bridge.js: LATS adds the first row and rejects the retired code.
    const requests = [];
    document.addEventListener('latsgo:request', (event) => {
      const request = JSON.parse(event.detail);
      requests.push(request);
      let result;
      if (request.payload.taskCode === 'ITS-4039') {
        document.getElementById('distributionRows').insertAdjacentHTML('beforeend',
          '<div class="distributionRow"><table class="tdsGrid"><tr><td colspan="15">Overhead: DTO Overhead Category Code</td></tr>' +
          '<tr><td colspan="15">ITS-4039: Overhead (Total Hours: 0) <a href="javascript:tdsJS.DisplaySubTasks(200)">sub tasks</a></td></tr></table></div>');
        result = { status: 'added' };
      } else {
        result = { status: 'failed', message: 'its category isn\'t available for this period.' };
      }
      setTimeout(() => document.dispatchEvent(new window.CustomEvent('latsgo:response', {
        detail: JSON.stringify({ id: request.id, ok: true, result })
      })), 10);
    });

    const callout = await until(() => document.querySelector('.lg-tds-copy'));
    const button = await until(() => {
      const candidate = callout.querySelector('button');
      return candidate && !candidate.disabled && /2 rows/.test(callout.textContent) ? candidate : null;
    });
    button.click();

    await until(() => /Added 1 of 2 rows/.test(callout.textContent));
    expect(requests.map((r) => r.action)).toEqual(['addTdsRow', 'addTdsRow']);
    expect(requests[1].payload).toMatchObject({
      categoryCode: 'ITS Overhead_HCD',
      taskCode: 'ITS-3444',
      subTaskCode: 'DTO_ITS_HCD DesignSy',
      searchTerm: 'DTO_ITS_HCD'
    });
    expect(document.contains(callout)).toBe(true);
    expect(callout.querySelector('li').textContent)
      .toBe('ITS-3444 · DTO_ITS_HCD DesignSy: its category isn\'t available for this period.');
    expect(button.textContent).toBe('Try again');
  });

  it('explains when no earlier TDS page has been seen', async () => {
    const { document } = load(buildTdsHtml({ rows: [], work: [7.5] }), { url: tdsUrl });
    const callout = await until(() => document.querySelector('.lg-tds-copy'));
    await until(() => /hasn't seen/.test(callout.textContent));
    expect(callout.querySelector('button').disabled).toBe(true);
  });
});

describe('LATS page restyle (UI-3, UI-4)', () => {
  it('shows weekday-over-date headers, tags the state holiday, and collapses empty leave rows', async () => {
    const { document } = load(buildTimesheetHtml({ holidays: ['10/12/2026'] }));
    const heads = await until(() => {
      const found = document.querySelectorAll('#timesheetTable .lg-dayhead');
      return found.length ? found : null;
    });
    expect(heads[0].textContent).toBe('ThuOct 8');
    // LATS's warning icon now sits next to the day name.
    expect(heads[0].querySelector('.lg-dayhead__name a[id^="error_"] img')).not.toBeNull();
    const monday = heads[4];
    expect(monday.textContent).toBe('MonOct 12Holiday');
    expect(monday.closest('th').getAttribute('data-holiday')).toBe('true');

    const vacation = document.getElementById('Vacation_rowLabelLeft').closest('tr');
    expect(vacation.getAttribute('data-has-values')).toBe('false');
    expect(document.documentElement.classList.contains('lg-restyled')).toBe(true);

    // The Leave button lives in LATS's existing corner cell. No rows or cells are added.
    const table = document.getElementById('timesheetTable');
    expect(Array.from(table.rows).map((row) => row.cells.length).filter((n) => n !== 15)).toEqual([]);
    const button = table.rows[0].cells[0].querySelector('.lg-leave-button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toBe('Leave (6)');
    button.click();
    expect(document.documentElement.classList.contains('lg-show-empty-leave')).toBe(true);
    expect(button.textContent).toBe('Leave');
    expect(button.getAttribute('aria-label')).toBe('Hide empty leave rows');

    // No HOL row yet, so the holiday notice explains that LATS adds it on Save.
    expect(document.querySelector('.lg-holiday-note').textContent).toContain('when you save');
  });

  it('turns each TDS row into a title over a code line, read from LATS\'s hidden fields', async () => {
    const html = buildTdsHtml({ rows: [{ category: 'Labor', taskCode: 'ITS-3886', subTask: 'DTO_ITS_Click to Ren', hours: [1] }], work: [7.5] })
      .replace('<table class="tdsGrid">',
        '<input type="hidden" id="Distributions_0__CategoryCode" value="Labor">' +
        '<input type="hidden" id="Distributions_0__TaskCode" value="ITS-3886">' +
        '<input type="hidden" id="Distributions_0__TaskDescription" value="Application Development &amp; Implementation">' +
        '<input type="hidden" id="Distributions_0__SubTask_0__Name" value="DTO_ITS_Click to Ren">' +
        '<input type="hidden" id="Distributions_0__SubTask_0__Description" value="Click to Renew Process Development">' +
        '<table class="tdsGrid">');
    const { document } = load(html, { url: 'https://time02.lats.ny.gov/TimeDistribution?tshdrid=1' });
    const task = await until(() => document.querySelector('.lg-task'));
    expect(task.querySelector('.lg-task__title').textContent).toBe('Click to Renew Process Development');
    expect(task.querySelector('.lg-task__meta').textContent).toBe('ITS-3886 · DTO_ITS_Click to Ren · Labor');
    expect(task.querySelector('.lg-task__action').textContent).toBe('Change sub-task');
    expect(task.querySelector('.lg-task__delete').textContent).toBe('Delete');
    expect(document.querySelector('#gridHeader table').hasAttribute('data-lg-cols')).toBe(true);
  });

  it('puts its decorations back after LATS rebuilds grid rows', async () => {
    const { document } = load(buildTimesheetHtml());
    const table = document.getElementById('timesheetTable');
    await until(() => table.querySelector('tr[data-lg-row="Vacation"]'));

    // Simulate LATS rebuilding a row: same markup, none of LATS Go!'s attributes.
    const old = document.getElementById('Vacation_rowLabelLeft').closest('tr');
    const fresh = old.cloneNode(true);
    ['data-lg-row', 'data-has-values'].forEach((name) => fresh.removeAttribute(name));
    fresh.querySelectorAll('[data-weekend]').forEach((cell) => cell.removeAttribute('data-weekend'));
    old.replaceWith(fresh);

    await until(() => fresh.getAttribute('data-has-values') === 'false');
    expect(fresh.getAttribute('data-lg-row')).toBe('Vacation');
    expect(fresh.querySelector('input[title="Vacation Day 3 Saturday"]').closest('td').getAttribute('data-weekend')).toBe('true');
  });

  it('marks TDS weekend cells by input title, even when cells don\'t line up with the header', async () => {
    const html = buildTdsHtml({ rows: [{ category: 'Labor', taskCode: 'ITS-3886', subTask: 'DTO_ITS_ChatNY PRE', hours: [] }], work: [7.5] })
      // Rows with sub-tasks can carry an extra cell before the days.
      .replace(/(<a class="deleteLinkHref" href="#">Delete<\/a><\/td>)/, '$1<td style="display:none"></td>')
      .replace(/name="Distributions\[0\]\.Hours\[(\d+)\]"/g, (m, d) => m + ' title="Task Hours For Day ' + (+d + 1) + ' ' +
        ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'][d % 7] + '"');
    const { document } = load(html, { url: 'https://time02.lats.ny.gov/TimeDistribution?tshdrid=1' });
    await until(() => document.querySelector('.lg-task'));
    const marked = Array.from(document.querySelectorAll('.distributionRow td[data-weekend] input.distributionCell'))
      .map((input) => input.title.replace('Task Hours For ', ''));
    expect(marked).toEqual(['Day 3 Saturday', 'Day 4 Sunday', 'Day 10 Saturday', 'Day 11 Sunday']);

    // The header and both totals tables go by the header text. The Remaining row copies TDS Totals.
    const weekendText = (selector) => Array.from(document.querySelectorAll(selector)).map((cell) => cell.textContent);
    expect(document.querySelectorAll('#gridHeader th[data-weekend]')).toHaveLength(4);
    expect(weekendText('#tdsFooter table.lg-work-totals td[data-weekend]')).toEqual(['0', '0', '0', '0']);
    expect(document.querySelectorAll('#tdsFooter > table.lg-tds-totals td[data-weekend]')).toHaveLength(4);
    const remaining = await until(() => document.querySelector('.lg-tds-remaining'));
    expect(remaining.querySelectorAll('td[data-weekend]')).toHaveLength(4);
    const dates = document.querySelector('#tdsFooter table.lg-tds-dates');
    const dayIndex = (cell) => Array.from(cell.parentElement.cells).indexOf(cell);
    expect(Array.from(document.querySelectorAll('#tdsFooter table.lg-work-totals td[data-weekend]')).map(dayIndex)
      .map((i) => dates.rows[0].cells[i].textContent)).toEqual(['24', '25', '31', '1']);
  });

  it('tags the holiday when LATS writes its notice after load', async () => {
    const { document } = load(buildTimesheetHtml());
    const monday = await until(() => document.querySelectorAll('#timesheetTable .lg-dayhead')[4]);
    expect(monday.textContent).toBe('MonOct 12');

    document.getElementById('topLeftMessages').insertAdjacentHTML('beforeend', '<div class="k-label">Holiday - 10/12/2026</div>');
    await until(() => monday.querySelector('.lg-dayhead__tag'));
    expect(monday.closest('th').getAttribute('data-holiday')).toBe('true');
    await until(() => document.querySelector('.lg-holiday-note'));
    expect(document.querySelector('#Vacation_rowLabelLeft').closest('tr').cells[5].getAttribute('data-holiday')).toBe('true');
  });
});
