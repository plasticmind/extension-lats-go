import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { buildTimesheetHtml, buildTdsHtml, holidayNotice, miscLeaveRows, noticeLabels } from './fixtures/lats-pages.js';
import { cssRules, loadPage, matchingRules, until, TDS_URL } from './fixtures/harness.js';

const LG = createRequire(import.meta.url)('../scripts/shared/utils.js');

const holidayAlert = (document) => document.querySelector('.lg-holiday-alert');
const part = (alert, role) => alert.querySelector(`[data-role="${role}"]`);

describe('Holiday helpers', () => {
  it('links to the Department of Civil Service calendar for a year', () => {
    expect(LG.holidayCalendarUrl(2026)).toBe('https://www.cs.ny.gov/attendance_leave/2026_legal_holidays.cfm');
    expect(LG.holidayCalendarUrl('2027')).toBe('https://www.cs.ny.gov/attendance_leave/2027_legal_holidays.cfm');
  });

  it('lists holidays as MM/DD/YYYY dates, as LATS writes them, with a serial comma', () => {
    expect(LG.formatHolidayList(['2026-11-11'])).toBe('11/11/2026');
    expect(LG.formatHolidayList(['2026-12-25', '2027-01-01'])).toBe('12/25/2026 and 01/01/2027');
    expect(LG.formatHolidayList(['2026-12-24', '2026-12-25', '2027-01-01'])).toBe('12/24/2026, 12/25/2026, and 01/01/2027');
    // findStateHolidays only reads a date right after "Holiday - ".
    expect(LG.findStateHolidays('State holiday reminder' + LG.formatHolidayList(['2026-11-11']))).toEqual([]);
  });
});

describe('Holiday alert (replaces the holiday badge)', () => {
  it('shows LATS\'s holiday notice as an info alert with a calendar link and the HOL note', async () => {
    const { document } = loadPage(buildTimesheetHtml({ holidays: ['10/12/2026'] }));
    const alert = await until(() => holidayAlert(document));

    expect(alert.classList.contains('lg-alert--info')).toBe(true);
    expect(alert.previousElementSibling.id).toBe('topLeftMessages');
    expect(alert.querySelector('svg.lg-alert__icon').getAttribute('aria-hidden')).toBe('true');
    // nys-alert's info type: a polite status region, not role="alert".
    const body = alert.querySelector('.lg-alert__body');
    expect(body.getAttribute('role')).toBe('status');
    expect(body.getAttribute('aria-live')).toBe('polite');

    expect(alert.querySelector('.lg-alert__heading').textContent).toBe('State holiday reminder');
    expect(part(alert, 'dates').textContent).toBe('10/12/2026 is an observed New York State holiday.');
    expect(part(alert, 'note').hidden).toBe(false);
    expect(part(alert, 'note').textContent).toBe('LATS adds 7.5 hours of HOL - State Holiday when you save.');

    const links = alert.querySelectorAll('a.lg-alert__link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://www.cs.ny.gov/attendance_leave/2026_legal_holidays.cfm');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toBe('noopener');
    expect(links[0].textContent).toBe('View the 2026 State holiday calendar (opens in a new tab)');

    // LATS's notice stays in the page (Fill Timecard and the day headers read it), hidden
    // from screen readers because the alert repeats it.
    const label = Array.from(document.querySelectorAll('#topLeftMessages .k-label')).find((el) => /Holiday/.test(el.textContent));
    expect(label.textContent).toBe('Holiday - 10/12/2026');
    expect(label.getAttribute('data-lg-holiday')).toBe('true');
    expect(label.classList.contains('lg-visually-hidden')).toBe(true);
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('#topLeftMessages .k-label[data-lg-empty]').hasAttribute('data-lg-holiday')).toBe(false);

    // The alert's own text doesn't add holidays, and the grid's Holiday tag stays.
    expect(LG.findStateHolidays(document.body.textContent)).toEqual(['2026-10-12']);
    const monday = document.querySelectorAll('#timesheetTable .lg-dayhead')[4];
    expect(monday.querySelector('.lg-dayhead__tag').textContent).toBe('Holiday');
  });

  it('names every holiday in one alert, with a calendar link for each year', async () => {
    const { document } = loadPage(buildTimesheetHtml({ start: '12/24/2026', holidays: ['12/25/2026', '01/01/2027'] }));
    const alert = await until(() => holidayAlert(document));
    expect(document.querySelectorAll('.lg-holiday-alert')).toHaveLength(1);
    expect(part(alert, 'dates').textContent).toBe('12/25/2026 and 01/01/2027 are observed New York State holidays.');
    expect(part(alert, 'note').textContent).toBe('LATS adds 7.5 hours of HOL - State Holiday to each one when you save.');
    expect(Array.from(alert.querySelectorAll('a.lg-alert__link')).map((a) => a.getAttribute('href'))).toEqual([
      'https://www.cs.ny.gov/attendance_leave/2026_legal_holidays.cfm',
      'https://www.cs.ny.gov/attendance_leave/2027_legal_holidays.cfm'
    ]);
    expect(document.querySelectorAll('#topLeftMessages .k-label[data-lg-holiday]')).toHaveLength(2);
  });

  it('doesn\'t add or repeat holidays in the page text that Fill Timecard reads', async () => {
    const { document } = loadPage(buildTimesheetHtml({ start: '12/24/2026', holidays: ['12/24/2026', '12/25/2026', '01/01/2027'] }));
    const alert = await until(() => holidayAlert(document));
    expect(part(alert, 'dates').textContent).toBe('12/24/2026, 12/25/2026, and 01/01/2027 are observed New York State holidays.');

    // The alert's own text holds no "Holiday - MM/DD/YYYY" notice...
    expect(LG.findStateHolidays(alert.textContent)).toEqual([]);
    // ...so the page holds LATS's three notices, once each.
    const text = document.body.textContent;
    expect(text.match(/Holiday\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/g)).toHaveLength(3);
    expect(LG.findStateHolidays(text)).toEqual(['2026-12-24', '2026-12-25', '2027-01-01']);
  });

  it('drops the HOL note once LATS has added the HOL - State Holiday row', async () => {
    // LATS adds the row with 7.5 hours on the holiday, Monday 10/12.
    const extraRows = miscLeaveRows({ values: (i) => (i === 4 ? '7.5' : '0') });
    const { document } = loadPage(buildTimesheetHtml({ holidays: ['10/12/2026'], extraRows }));
    const alert = await until(() => holidayAlert(document));
    expect(part(alert, 'note').hidden).toBe(true);
    expect(part(alert, 'note').textContent).toBe('');
    expect(part(alert, 'dates').textContent).toBe('10/12/2026 is an observed New York State holiday.');
  });

  it('follows LATS\'s notices as LATS writes, rewrites, and removes them', async () => {
    const { document } = loadPage(buildTimesheetHtml());
    await until(() => document.querySelector('#timesheetTable .lg-dayhead'));
    expect(holidayAlert(document)).toBeNull();

    // LATS writes the notice after load.
    const notices = document.getElementById('topLeftMessages');
    notices.insertAdjacentHTML('beforeend', holidayNotice('10/12/2026'));
    const alert = await until(() => holidayAlert(document));
    expect(part(alert, 'dates').textContent).toBe('10/12/2026 is an observed New York State holiday.');

    // LATS rebuilds its notices with a second holiday: still one alert, now with both.
    notices.innerHTML = noticeLabels(['10/12/2026', '10/13/2026']);
    await until(() => /10\/12\/2026 and 10\/13\/2026/.test(part(alert, 'dates').textContent));
    expect(document.querySelectorAll('.lg-holiday-alert')).toHaveLength(1);
    expect(holidayAlert(document)).toBe(alert);
    expect(alert.previousElementSibling).toBe(notices);

    // LATS drops the holiday notices: the alert goes too.
    notices.innerHTML = noticeLabels();
    await until(() => !holidayAlert(document));
  });

  it('shows the alert on the TDS page too, without the timesheet\'s HOL note', async () => {
    const html = buildTdsHtml({ holidays: ['10/26/2026'], rows: [{ category: 'Direct', taskCode: 'TST-1001', hours: [] }] });
    const { document } = loadPage(html, { url: TDS_URL });
    const alert = await until(() => holidayAlert(document));
    expect(part(alert, 'dates').textContent).toBe('10/26/2026 is an observed New York State holiday.');
    expect(part(alert, 'note').hidden).toBe(true);
    // LATS's empty notice is flagged here too, so the notice row can collapse.
    expect(document.querySelector('#topLeftMessages .k-label').getAttribute('data-lg-empty')).toBe('true');
  });

  it('re-syncs when LATS re-renders the TDS grid with fresh notices', async () => {
    // LATS renders the notices inside the container it re-renders.
    const grid = buildTdsHtml({ holidays: ['10/26/2026'], rows: [{ category: 'Direct', taskCode: 'TST-1001', hours: [] }] });
    const { document } = loadPage(`<div id="tdsContainer">${grid}</div>`, { url: TDS_URL });
    await until(() => holidayAlert(document));

    // A sub-task change: LATS re-renders the container, with raw notices in a new #topLeftMessages.
    document.getElementById('tdsContainer').innerHTML = grid;
    const fresh = document.getElementById('topLeftMessages');
    const label = await until(() => fresh.querySelector('.k-label[data-lg-holiday]'));
    expect(label.getAttribute('aria-hidden')).toBe('true');
    const alert = await until(() => holidayAlert(document));
    expect(document.querySelectorAll('.lg-holiday-alert')).toHaveLength(1);
    expect(alert.previousElementSibling).toBe(fresh);

    // The new #topLeftMessages is watched too: a notice LATS adds without touching the grid shows up.
    fresh.insertAdjacentHTML('beforeend', holidayNotice('10/27/2026'));
    await until(() => /10\/26\/2026 and 10\/27\/2026/.test(part(holidayAlert(document), 'dates').textContent));
    expect(fresh.querySelectorAll('.k-label[data-lg-holiday][aria-hidden="true"]')).toHaveLength(2);
  }, 10000);
});

describe('Shared alert style', () => {
  it('draws the info icon as NYSDS\'s filled glyph and keeps line icons stroked', () => {
    // utils.js on its own, so the icons are the page's own SVG elements.
    const { LatsGo } = loadPage('', { scripts: ['scripts/shared/utils.js'] });
    const info = LatsGo.icon('info', 'lg-alert__icon');
    expect(info.getAttribute('fill')).toBe('currentColor');
    expect(info.getAttribute('class')).toBe('lg-alert__icon');
    expect(info.querySelector('path').getAttribute('fill-rule')).toBe('evenodd');
    const close = LatsGo.icon('close');
    expect(close.getAttribute('fill')).toBe('none');
    expect(close.getAttribute('stroke')).toBe('currentColor');
  });

  it('keeps holiday notices rendered and the TDS-page banner hidden (ui.css, content.css)', async () => {
    const rules = [...cssRules('styles/ui.css'), ...cssRules('styles/content.css')];
    // The display values of the rules that apply to an element.
    const display = (element) => matchingRules(element, rules).map((rule) => rule.declarations.display).filter(Boolean);
    const hidden = (element) => display(element).filter((value) => /^none\b/.test(value));

    // display: none would drop the notices from document.body.innerText, which Fill Timecard
    // and the day headers read holidays from. Only LATS's empty notice leaves the layout.
    const { document } = loadPage(buildTimesheetHtml({ holidays: ['10/12/2026'] }));
    const notice = await until(() => document.querySelector('#topLeftMessages .k-label[data-lg-holiday]'));
    expect(notice.classList.contains('lg-visually-hidden')).toBe(true);
    expect(hidden(notice)).toEqual([]);
    expect(hidden(document.querySelector('#topLeftMessages .k-label[data-lg-empty]'))).toEqual(['none !important']);

    // On the TDS page, LATS's mismatch banner is hidden, whether it's an element of its own or a
    // cell in its own table. Day headers with a mismatch also carry .TdsError, with .k-header; they stay.
    const tds = loadPage(`
      <div id="blockBanner" class="TdsError">TDS hours don't match</div>
      <table id="cellBanner"><tbody><tr><td class="TdsError">TDS hours don't match</td></tr></tbody></table>
      <table><tbody><tr><th id="dayHeader" class="k-header TdsError">10/26</th></tr></tbody></table>`, { url: TDS_URL, scripts: [] });
    tds.document.documentElement.classList.add('lg-restyled', 'lg-restyled-tds');
    expect(hidden(tds.document.getElementById('blockBanner'))).toEqual(['none !important']);
    expect(hidden(tds.document.getElementById('cellBanner'))).toEqual(['none !important']);
    expect(hidden(tds.document.getElementById('dayHeader'))).toEqual([]);
  });

  it('gives drawn banner copy and the Empty rows glyph empty alt text, so screen readers skip them (content.css)', () => {
    const rules = cssRules('styles/content.css')
      .filter((rule) => /MissingTimeError|TdsError|lg-empty-rows-button/.test(rule.selector) && /content\s*:\s*"/.test(rule.body));
    // A heading and a body for each of the two banners, so screen readers read LATS's own
    // sentence once; and the button's "+" and "−", so its name is its text.
    expect(rules).toHaveLength(6);
    rules.forEach((rule) => expect(rule.body, rule.selector).toMatch(/content:\s*"[^"]+"\s*\/\s*""/));
  });

  it('spaces a warning banner that\'s a cell in its own table or an element of its own, never the grid (content.css)', () => {
    const rules = cssRules('styles/content.css')
      .filter((rule) => /MissingTimeError/.test(rule.selector) && /(^|\s|;)margin\s*:/.test(rule.body));
    const { document } = loadPage(`
      <table id="cellBanner"><tbody><tr><td class="MissingTimeError">Missing time</td></tr></tbody></table>
      <div id="blockBanner" class="TdsError">TDS hours don't match</div>
      <table id="timesheetTable"><tbody>
        <tr><td id="gridCell" class="MissingTimeError">Missing time</td></tr>
        <tr><td><div id="gridBlock" class="MissingTimeError">Missing time</div></td></tr>
      </tbody></table>`, { scripts: [] });
    document.documentElement.classList.add('lg-restyled');
    const spaced = rules.flatMap((rule) => Array.from(document.querySelectorAll(rule.selector), (node) => node.id));
    expect(spaced.sort()).toEqual(['blockBanner', 'cellBanner']);
  });
});
