import { describe, it, expect, vi } from 'vitest';
import { buildTdsHtml, buildTdsRowHtml } from './fixtures/lats-pages.js';
import { loadPage, until, wait, TDS_URL } from './fixtures/harness.js';

// LATS re-renders parts of the TDS grid from AJAX responses, such as after a sub-task change.
// These tests swap the grid for fresh LATS markup and check that every LATS Go! decoration and
// feature comes back once, on the new nodes. The fixture's hour inputs carry LATS's titles
// ("Task Hours For Day 3 Saturday") and each row its hidden fields with its codes.

const WORK = [7.5, 7.5, 0, 0, 7.5, 7.5, 7.5];
const BEFORE = [
  { category: 'Direct', taskCode: 'TST-1001', description: 'Design System', subTask: '', hours: [4, 7.5] },
  { category: 'Direct', taskCode: 'TST-1002', description: 'Click to Renew', subTask: '', hours: [3.5] }
];
// After a sub-task change: the second row now has a sub-task, and LATS sends fresh markup.
const AFTER = [
  BEFORE[0],
  { category: 'Direct', taskCode: 'TST-1002', description: 'Click to Renew', subTask: 'SUB_DEMO_Beta', subTaskDescription: 'SUB_DEMO_Beta work', hours: [3.5] }
];

function load(html, local) {
  return loadPage(html, { url: TDS_URL, local });
}

/** The TDS grid's markup, which LATS can render again into the same container. */
function tdsGrid(rows) {
  return buildTdsHtml({ rows, work: WORK });
}

/** Every LATS Go! TDS decoration, counted, so a missing or duplicate one shows up. */
function snapshot(document) {
  const grid = document.querySelectorAll('#gridHeader table, .distributionRow table.tdsGrid, #tdsFooter table.tdsGrid');
  const remaining = document.querySelectorAll('.lg-tds-remaining');
  return {
    restyled: document.documentElement.classList.contains('lg-restyled-tds'),
    dayHeads: document.querySelectorAll('#gridHeader th .lg-dayhead').length,
    headerWeekends: document.querySelectorAll('#gridHeader th[data-weekend]').length,
    totalHeads: document.querySelectorAll('#gridHeader .lg-total-head').length,
    // Each LATS table, the Remaining copy included, has one <colgroup> and one Total cell.
    colgroups: Array.from(grid).map((table) => table.querySelectorAll(':scope > colgroup').length),
    totalCells: Array.from(grid).map((table) => table.querySelectorAll('.lg-total-col').length),
    tasks: Array.from(document.querySelectorAll('.distributionRow')).map((row) =>
      Array.from(row.querySelectorAll('.lg-task__title')).map((title) => title.textContent)),
    actions: Array.from(document.querySelectorAll('.distributionRow')).map((row) =>
      row.querySelectorAll('.lg-task__actions > *').length),
    rowWeekends: Array.from(document.querySelectorAll('.distributionRow')).map((row) =>
      row.querySelectorAll('td[data-weekend] input.distributionCell').length),
    rowTotals: Array.from(document.querySelectorAll('.distributionRow td.lg-total-col')).map((cell) => cell.textContent),
    // LATS's footer tables, without the Remaining row's copy of TDS Totals.
    footer: ['lg-tds-totals', 'lg-work-totals', 'lg-tds-dates'].map((name) =>
      Array.from(document.querySelectorAll('#tdsFooter table.' + name)).filter((table) => !table.closest('.lg-tds-remaining')).length),
    footerWeekends: document.querySelectorAll('#tdsFooter table.lg-work-totals td[data-weekend]').length,
    workTotal: document.querySelector('#tdsFooter table.lg-work-totals td.lg-total-col')?.textContent,
    remainingRows: remaining.length,
    remainingInFooter: remaining.length === 1 && remaining[0].parentElement === document.getElementById('tdsFooter'),
    remainingStates: remaining.length ? Array.from(remaining[0].querySelectorAll('td[data-state]')).map((cell) => cell.dataset.state) : [],
    remainingSummary: remaining.length ? remaining[0].querySelector('[data-role="summary"]').textContent : null,
    mismatches: document.querySelectorAll('#tdsFooter td[data-mismatch="true"]').length
  };
}

/** Wait until the decorations match `expected` and stay that way. */
async function settled(document, expected) {
  // On a timeout, the assertion shows what differs.
  await until(() => JSON.stringify(snapshot(document)) === JSON.stringify(expected), { timeout: 3000 }).catch(() => {});
  await wait(300);
  expect(snapshot(document)).toEqual(expected);
}

const EXPECTED_BEFORE = {
  restyled: true,
  dayHeads: 14,
  headerWeekends: 4,
  totalHeads: 1,
  colgroups: [1, 1, 1, 1, 1, 1, 1],
  totalCells: [1, 1, 1, 1, 1, 1, 1],
  tasks: [['Design System'], ['Click to Renew']],
  actions: [2, 2],
  rowWeekends: [4, 4],
  rowTotals: ['11.5', '3.5'],
  footer: [1, 1, 1],
  footerWeekends: 4,
  workTotal: '37.5',
  remainingRows: 1,
  remainingInFooter: true,
  remainingStates: ['done', 'done', 'none', 'none', 'left', 'left', 'left', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
  remainingSummary: '22.5 left',
  // TDS Totals and Work Totals differ on five days, and LATS Go! marks both cells.
  mismatches: 10
};

const EXPECTED_AFTER = {
  ...EXPECTED_BEFORE,
  tasks: [['Design System'], ['SUB_DEMO_Beta work']]
};

describe('TDS grid re-renders', () => {
  it('re-applies every decoration when LATS replaces the grid, twice, without duplicates', async () => {
    const container = `<div id="tdsContainer">${tdsGrid(BEFORE)}</div>`;
    const { window, document, chrome } = load(container);
    await settled(document, EXPECTED_BEFORE);

    // First re-render: LATS writes fresh HTML into the container, as jQuery's .html() does.
    const writes = vi.spyOn(chrome.storage.local, 'set');
    const holder = document.getElementById('tdsContainer');
    holder.innerHTML = tdsGrid(AFTER);
    await settled(document, EXPECTED_AFTER);
    // The rows cache picks up the new sub-task (TDS-1).
    await until(() => writes.mock.calls.length);
    expect(chrome.areas.local.tdsHistory['2026-10-22'].rows.map((row) => row.subTask)).toEqual(['', 'SUB_DEMO_Beta']);

    // Typing in the new inputs still updates the row Total and the Remaining row (TDS-2).
    const input = document.getElementsByName('Distributions[1].Hours[4]')[0];
    input.value = '7.5';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(snapshot(document).rowTotals).toEqual(['11.5', '11']);
    expect(snapshot(document).remainingStates[4]).toBe('done');

    // Second re-render: LATS replaces the container element itself.
    const fresh = document.createElement('div');
    fresh.id = 'tdsContainer';
    fresh.innerHTML = tdsGrid(AFTER);
    document.getElementById('tdsContainer').replaceWith(fresh);
    await settled(document, EXPECTED_AFTER);

    // Once settled, LATS Go!'s own changes don't wake the watcher again.
    const html = document.body.innerHTML;
    const callsBefore = writes.mock.calls.length;
    await wait(400);
    expect(document.body.innerHTML).toBe(html);
    expect(writes.mock.calls.length).toBe(callsBefore);
  });

  it('re-decorates a row whose contents LATS rewrites in place', async () => {
    const { document } = load(tdsGrid(BEFORE));
    await settled(document, EXPECTED_BEFORE);

    // LATS keeps the row's <div> but rewrites what's inside it.
    document.querySelectorAll('.distributionRow')[1].innerHTML = buildTdsRowHtml(AFTER[1], 1);
    await settled(document, EXPECTED_AFTER);
  });

  it('rebuilds a row\'s title when LATS updates its hidden fields or sub-task link in place', async () => {
    const { document } = load(tdsGrid(BEFORE));
    await settled(document, EXPECTED_BEFORE);
    const row = document.querySelectorAll('.distributionRow')[1];

    // A hidden field alone. Setting a hidden input's value, as jQuery's .val() does, sets its
    // value attribute; nothing else in the row changes.
    document.getElementById('Distributions_1__TaskDescription').value = 'Click to Renew Phase 2';
    await settled(document, { ...EXPECTED_BEFORE, tasks: [['Design System'], ['Click to Renew Phase 2']] });

    // A sub-task change: LATS rewrites the link text and adds the sub-task's fields to the same row.
    row.querySelector('a[href*="DisplaySubTasks"]').textContent = 'SUB_DEMO_Beta - Sample sub-task description';
    row.insertAdjacentHTML('afterbegin', '<input type="hidden" id="Distributions_1__SubTask_0__Name" value="SUB_DEMO_Beta">' +
      '<input type="hidden" id="Distributions_1__SubTask_0__Description" value="SUB_DEMO_Beta work">');
    await settled(document, { ...EXPECTED_BEFORE, tasks: [['Design System'], ['SUB_DEMO_Beta work']] });

    // One title block, with the new codes, the sub-task button's new text, and LATS's own
    // delete link carried over from the old block.
    expect(row.querySelectorAll('.lg-task')).toHaveLength(1);
    expect(row.querySelector('.lg-task__meta').textContent).toBe('TST-1002 · SUB_DEMO_Beta · Direct');
    expect(row.querySelector('button.lg-task__action').textContent).toBe('Change sub-task');
    expect(row.querySelectorAll('a.deleteLinkHref')).toHaveLength(1);
    expect(row.querySelector('.lg-task__actions > a.deleteLinkHref').getAttribute('aria-label')).toBe('Delete SUB_DEMO_Beta work');

    // Rebuilding doesn't wake the grid watcher again.
    const html = document.body.innerHTML;
    await wait(400);
    expect(document.body.innerHTML).toBe(html);
  });

  it('keeps the sub-task button working on re-rendered rows', async () => {
    const { document } = load(`<div id="tdsContainer">${tdsGrid(BEFORE)}</div>`);
    await settled(document, EXPECTED_BEFORE);
    document.getElementById('tdsContainer').innerHTML = tdsGrid(AFTER);
    await settled(document, EXPECTED_AFTER);

    const requests = [];
    document.addEventListener('latsgo:request', (event) => requests.push(JSON.parse(event.detail)));
    const button = document.querySelectorAll('.distributionRow .lg-task__action')[2];
    expect(button.textContent).toBe('Change sub-task');
    button.click();
    expect(requests).toMatchObject([{ action: 'showSubTasks', payload: { id: 101 } }]);
    expect(document.querySelectorAll('.lg-task__action')).toHaveLength(4);
  });

  it('puts the Copy rows callout back when LATS re-renders the grid around it (TDS-1)', async () => {
    const history = {
      '2026-10-08': { savedAt: 1, rows: [{ category: 'Direct', taskCode: 'TST-1001', task: 'TST-1001', subTask: '' }] }
    };
    const { document } = load(`<div id="tdsContainer">${tdsGrid([])}</div>`, { tdsHistory: history });
    const callout = await until(() => document.querySelector('.lg-tds-copy'));
    await until(() => /1 row/.test(callout.textContent));

    document.getElementById('tdsContainer').innerHTML = tdsGrid([]);
    await until(() => document.contains(callout));
    expect(document.querySelectorAll('.lg-tds-copy')).toHaveLength(1);
    expect(callout.nextElementSibling).toBe(document.getElementById('distributionRows'));
    expect(callout.querySelector('button').disabled).toBe(false);
    await until(() => document.querySelector('.lg-tds-remaining'));
    expect(document.querySelectorAll('.lg-tds-remaining')).toHaveLength(1);
  });
});
