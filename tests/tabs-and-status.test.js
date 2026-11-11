import { describe, it, expect } from 'vitest';
import { buildTimesheetHtml, buildTdsHtml } from './fixtures/lats-pages.js';
import { cssRules, loadPage, matchingRules, until, wait, RESTYLE_SCRIPTS, TDS_URL, TIMESHEET_URL } from './fixtures/harness.js';

/**
 * Load a page and wait for its load event. The top tabs and status pills come from
 * lats-restyle.js. The tab reorder runs on DOMContentLoaded and again on load, so both passes
 * are done when this resolves. `beforeReady` runs after the scripts and before either pass.
 */
async function load(html, url = TIMESHEET_URL, beforeReady = () => {}) {
  const page = loadPage(html, { url, scripts: RESTYLE_SCRIPTS });
  beforeReady(page.window);
  await until(() => page.document.readyState === 'complete');
  await wait(0);
  return page;
}

/** A top tab bar like LATS's: Bootstrap 3 nav tabs whose links open separate pages. */
function tabBar(tabs) {
  return '<ul class="nav nav-tabs">' + tabs.map(([text, href, active]) =>
    `<li${active ? ' class="active"' : ''}><a href="${href}">${text}</a></li>`).join('\n') + '</ul>';
}

function page(tabs, body = buildTimesheetHtml()) {
  return `<div class="container">${tabBar(tabs)}<div class="tabContent">${body}</div></div>`;
}

function tabOrder(document, selector = '.container > ul.nav-tabs') {
  return Array.from(document.querySelector(selector).children).map((li) => li.textContent.trim());
}

/** Record child moves in `selector`'s list from now on. */
function watchMoves(window, selector = '.container > ul.nav-tabs') {
  const moves = [];
  new window.MutationObserver((records) => moves.push(...records))
    .observe(window.document.querySelector(selector), { childList: true });
  return moves;
}

const SUPERVISOR_TABS = [
  ['Approval List', '/Approval/List'],
  ['Timesheet', '/Timesheet?tshdrid=1', true],
  ['TDS', '/TimeDistribution?tshdrid=1'],
  ['Reports', '/Reports']
];

describe('Top tab order', () => {
  it('puts Timesheet and TDS first and keeps the other tabs in their order', async () => {
    const { document } = await load(page(SUPERVISOR_TABS));
    expect(tabOrder(document)).toEqual(['Timesheet', 'TDS', 'Approval List', 'Reports']);
    // The moved tabs are LATS's own elements, so the active tab and its link don't change.
    const active = document.querySelector('.nav-tabs > li.active > a');
    expect(active.textContent).toBe('Timesheet');
    expect(active.getAttribute('href')).toBe('/Timesheet?tshdrid=1');
  });

  it('reorders the tabs on the TDS page too', async () => {
    const tabs = SUPERVISOR_TABS.map(([text, href]) => [text, href, text === 'TDS']);
    const { document } = await load(page(tabs, buildTdsHtml()), TDS_URL);
    expect(tabOrder(document)).toEqual(['Timesheet', 'TDS', 'Approval List', 'Reports']);
  });

  it('leaves a bar that\'s already in order alone', async () => {
    let moves;
    const { document } = await load(page([
      ['Timesheet', '/Timesheet', true],
      ['TDS', '/TimeDistribution?tshdrid=1'],
      ['Leave Requests', '/Leave']
    ]), TIMESHEET_URL, (window) => { moves = watchMoves(window); });
    expect(moves).toEqual([]);
    expect(tabOrder(document)).toEqual(['Timesheet', 'TDS', 'Leave Requests']);
  });

  it('moves tabs once: running it again moves nothing', async () => {
    const { window, document } = await load(page([
      ['Approval List', '/Approval/List'],
      ['TDS', '/TimeDistribution?tshdrid=1'],
      ['Timesheet', '/Timesheet', true]
    ]));
    expect(tabOrder(document)).toEqual(['Timesheet', 'TDS', 'Approval List']);
    const moves = watchMoves(window);
    window.dispatchEvent(new window.Event('load'));
    await wait(0);
    expect(moves).toEqual([]);
  });

  it('handles a bar with only one of the primary tabs', async () => {
    const { document } = await load(page([
      ['Approval List', '/Approval/List'],
      ['Reports', '/Reports'],
      ['Timesheet', '/Timesheet', true]
    ]));
    expect(tabOrder(document)).toEqual(['Timesheet', 'Approval List', 'Reports']);
  });

  it('finds a tab by its link when the text differs', async () => {
    const { document } = await load(page([
      ['Approval List', '/Approval/List'],
      ['Time Sheet', 'https://time02.lats.ny.gov/Timesheet?tshdrid=1', true],
      ['Distribution', '/TimeDistribution?tshdrid=1']
    ]));
    expect(tabOrder(document)).toEqual(['Time Sheet', 'Distribution', 'Approval List']);
  });

  it('doesn\'t match a tab whose link only starts with Timesheet', async () => {
    const { document } = await load(page([
      ['Approvals', '/TimesheetApproval'],
      ['History', '/Timesheet/History'],
      ['Reports', '/Reports']
    ]));
    expect(tabOrder(document)).toEqual(['Approvals', 'History', 'Reports']);
  });

  it('leaves tab bars that switch panels in place alone', async () => {
    const picker = '<div id="tdsTasks"><ul class="nav nav-tabs">' +
      '<li class="active"><a href="#browseTab" data-toggle="tab">Browse</a></li>' +
      '<li><a href="#searchTab" data-toggle="tab">Search</a></li></ul></div>';
    const widget = '<ul class="nav nav-tabs" id="widget">' +
      '<li><a href="#notes" data-toggle="tab">Notes</a></li>' +
      '<li><a href="#timesheetPane" data-toggle="tab">Timesheet</a></li></ul>';
    const { document } = await load(page(SUPERVISOR_TABS, buildTdsHtml() + picker + widget), TDS_URL);
    expect(tabOrder(document, '#tdsTasks ul.nav-tabs')).toEqual(['Browse', 'Search']);
    expect(tabOrder(document, '#widget')).toEqual(['Notes', 'Timesheet']);
    expect(tabOrder(document)).toEqual(['Timesheet', 'TDS', 'Approval List', 'Reports']);
  });
});

describe('Summary block status labels', () => {
  // LATS's summary block: labels and values in Bootstrap columns of three widths.
  const tdsSummary = '<div class="row timesheetHeader">' +
    '<div class="col-xs-5"><label class="k-label">Employee</label> <a id="lnkEmployeeInfo" href="#">Sample Employee</a></div>' +
    '<div class="col-xs-4"><label class="k-label">Timesheet Status</label> Unsubmitted<br>' +
    '<label class="k-label">TDS Timesheet Status</label> Unsubmitted</div>' +
    '<div class="col-xs-3"><label class="k-label">Agency</label> Sample Agency</div>' +
    '</div>';
  const rules = cssRules('styles/content.css');

  /** The TDS page with its summary block, once both status pills are in. */
  async function loadSummary() {
    const { document } = await load(tdsSummary + buildTdsHtml(), TDS_URL);
    const pills = await until(() => {
      const found = document.querySelectorAll('.lg-status-pill');
      return found.length === 2 ? found : null;
    });
    return { document, pills };
  }

  /** The values that content.css's rules for `element` give `property`. */
  function declared(element, property) {
    return matchingRules(element, rules).map((rule) => rule.declarations[property]).filter(Boolean);
  }

  it('puts each TDS status pill right after its full label', async () => {
    const { document, pills } = await loadSummary();
    expect(document.documentElement.classList.contains('lg-restyled-tds')).toBe(true);
    Array.from(pills).forEach((pill) => {
      expect(pill.textContent).toBe('Unsubmitted');
      expect(pill.getAttribute('data-status')).toBe('unsubmitted');
      // The pill follows its label as a sibling, so the column's CSS can line it up.
      expect(pill.parentElement.classList.contains('col-xs-4')).toBe(true);
    });
    expect(pills[0].previousElementSibling.textContent).toBe('Timesheet Status');
    expect(pills[1].previousElementSibling.textContent).toBe('TDS Timesheet Status');
  });

  it('gives summary labels a minimum width, not a fixed one, so long labels aren\'t clipped', async () => {
    const { document } = await loadSummary();
    const labels = Array.from(document.querySelectorAll('.timesheetHeader label.k-label'));
    expect(labels.map((label) => label.parentElement.className)).toEqual(['col-xs-5', 'col-xs-4', 'col-xs-4', 'col-xs-3']);
    labels.forEach((label) => {
      expect(declared(label, 'width'), label.textContent).toEqual([]);
      expect(declared(label, 'min-width').length, label.textContent).toBeGreaterThan(0);
    });
  });

  it('wraps each TDS status pill under its label when the column is too narrow for both', async () => {
    const { document, pills } = await loadSummary();
    const column = pills[0].parentElement;
    // Summary columns don't wrap, but this one may, between a label and its pill.
    expect(declared(document.querySelector('.timesheetHeader > .col-xs-5'), 'white-space')).not.toContain('normal');
    expect(declared(column, 'white-space')).toContain('normal');
    // The label's minimum width never exceeds the column, so the label isn't cut off either.
    column.querySelectorAll('label.k-label').forEach((label) => {
      expect(declared(label, 'min-width'), label.textContent).toContain('min(14em, 100%)');
    });
    expect(declared(document.querySelector('.timesheetHeader > .col-xs-5 > label.k-label'), 'min-width')).not.toContain('min(14em, 100%)');
  });
});
