/**
 * LATS Go! page bridge
 *
 * Runs in the page's main world (manifest "world": "MAIN") so it can reach LATS's own jQuery,
 * Kendo widgets, and modules, which content scripts can't see from their isolated world.
 *
 * content.js dispatches a 'latsgo:request' CustomEvent whose detail is a JSON string:
 *   { id, action, payload }
 * The bridge answers with a 'latsgo:response' event:
 *   { id, ok, result } or { id, ok: false, error }
 *
 * Only the actions listed in ACTIONS run. None of them saves or submits a timesheet.
 */

(function () {
  'use strict';

  if (window.__latsGoBridge) return;
  window.__latsGoBridge = true;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function waitFor(check, timeoutMs, intervalMs) {
    const end = Date.now() + (timeoutMs || 8000);
    while (Date.now() < end) {
      const value = check();
      if (value) return value;
      await sleep(intervalMs || 150);
    }
    return null;
  }

  function norm(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(node) {
    return !!(node && (node.offsetWidth || node.offsetHeight || node.getClientRects().length));
  }

  function dropDown(id) {
    const $ = window.jQuery;
    return $ ? $('#' + id).data('kendoDropDownList') : null;
  }

  /**
   * Find a dropdown item whose code field matches `wanted`. Exact matches win. Otherwise an item
   * whose code appears inside `wanted` wins, longest code first, so a category header like
   * "Agency Indirect_Team - Indirect" still finds the "Agency Indirect_Team" item.
   */
  function findItem(widget, wanted, codeField) {
    if (!widget || !wanted) return null;
    const target = norm(wanted).toLowerCase();
    const textField = widget.options.dataTextField;
    const items = widget.dataSource.data().slice();
    const values = function (item) {
      return [item[codeField], item[textField]].map(function (value) { return norm(value).toLowerCase(); })
        .filter(function (value) { return value.length >= 3; });
    };
    const exact = items.find(function (item) { return values(item).indexOf(target) !== -1; });
    if (exact) return exact;
    let best = null;
    let bestLength = 0;
    items.forEach(function (item) {
      values(item).forEach(function (value) {
        if (target.indexOf(value) !== -1 && value.length > bestLength) {
          best = item;
          bestLength = value.length;
        }
      });
    });
    return best;
  }

  function dataSourceChanged(widget, timeoutMs) {
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (changed) {
        if (done) return;
        done = true;
        resolve(changed);
      };
      widget.dataSource.one('change', function () { finish(true); });
      setTimeout(function () { finish(false); }, timeoutMs);
    });
  }

  function subTaskLinks() {
    return Array.prototype.slice.call(document.querySelectorAll('a[href*="DisplaySubTasks"]'));
  }

  function linkForId(id) {
    return subTaskLinks().find(function (link) {
      return (link.getAttribute('href') || '').replace(/\D/g, '') === String(id);
    });
  }

  function closeOpenWindows() {
    document.querySelectorAll('.k-window').forEach(function (win) {
      if (!isVisible(win)) return;
      const button = Array.prototype.find.call(win.querySelectorAll('button, a'), function (node) {
        return /^close$/i.test(norm(node.textContent)) || /close/i.test(node.getAttribute('aria-label') || '');
      });
      if (button) button.click();
    });
  }

  const ACTIONS = {
    /** UI-4: open LATS's sub-task picker for a row (its hidden link is otherwise unreachable). */
    showSubTasks: function (payload) {
      const id = parseInt(payload.id, 10);
      if (!id || !window.tdsJS || typeof window.tdsJS.DisplaySubTasks !== 'function') {
        throw new Error('The sub-task picker isn\'t available on this page.');
      }
      window.tdsJS.DisplaySubTasks(id);
      return { opened: true };
    },

    /**
     * FLOW-1: open the Overdue Timesheets dialog and select its last row. New periods don't
     * open by URL (L2), so this goes through LATS's own dialog.
     */
    openOldestOverdue: async function () {
      const module = window.OverdueTimesheetsModule;
      if (!module || typeof module.ShowDialog !== 'function') {
        throw new Error('The Overdue Timesheets list isn\'t available on this page.');
      }
      module.ShowDialog();
      const link = await waitFor(function () {
        const windows = Array.prototype.filter.call(document.querySelectorAll('.k-window'), isVisible);
        for (let i = 0; i < windows.length; i++) {
          const selects = Array.prototype.filter.call(windows[i].querySelectorAll('a, button'), function (node) {
            return /^select$/i.test(norm(node.textContent));
          });
          if (selects.length) return selects[selects.length - 1];
        }
        return null;
      }, 8000);
      if (!link) return { selected: false };
      link.click();
      return { selected: true };
    },

    /**
     * TDS-1: add one task row, then attach its sub-task. Follows the order LATS needs:
     * #Category, #Task, #btnAddTask, tdsJS.DisplaySubTasks(id), #subTaskCodeSearch,
     * #SubTask, #btnAddSubTask. content.js sends exact codes and the sub-task search term.
     * @param {{categoryCode, taskCode, task, subTaskCode, searchTerm}} row
     * @returns {{status: 'added'|'partial'|'failed', message?: string}}
     */
    addTdsRow: async function (row) {
      const category = dropDown('Category');
      const task = dropDown('Task');
      if (!category || !task) throw new Error('The TDS task picker isn\'t on this page.');

      const categoryCode = norm(row.categoryCode);
      const subTaskCode = norm(row.subTaskCode);
      const categoryItem = findItem(category, categoryCode, 'CategoryCode');
      if (!categoryItem) {
        return { status: 'failed', message: 'its category isn\'t available for this period. TDS codes may have changed.' };
      }

      const before = new Set(subTaskLinks().map(function (link) { return link.getAttribute('href'); }));
      const taskReload = dataSourceChanged(task, 5000);
      category.value(categoryItem[category.options.dataValueField]);
      category.trigger('change');
      await taskReload;
      await sleep(200);

      const wantedTask = row.taskCode || row.task;
      const taskItem = await waitFor(function () { return findItem(task, wantedTask, 'TaskCode'); }, 5000);
      if (!taskItem) {
        return { status: 'failed', message: 'its task isn\'t available for this period. TDS codes may have changed.' };
      }
      task.value(taskItem[task.options.dataValueField]);
      task.trigger('change');
      await sleep(300);

      const addTask = document.getElementById('btnAddTask');
      if (!addTask) throw new Error('LATS\'s Add Task button isn\'t on this page.');
      addTask.click();

      const newLink = await waitFor(function () {
        return subTaskLinks().find(function (link) { return !before.has(link.getAttribute('href')); });
      }, 12000);
      if (!newLink) return { status: 'failed', message: 'LATS didn\'t add the row.' };
      if (!subTaskCode) return { status: 'added' };

      const id = (newLink.getAttribute('href') || '').replace(/\D/g, '');
      if (!window.tdsJS || typeof window.tdsJS.DisplaySubTasks !== 'function') {
        return { status: 'partial', message: 'the sub-task picker isn\'t available. Add the sub-task yourself.' };
      }
      window.tdsJS.DisplaySubTasks(parseInt(id, 10));

      const search = await waitFor(function () {
        const input = document.getElementById('subTaskCodeSearch');
        return isVisible(input) ? input : null;
      }, 8000);
      if (!search) return { status: 'partial', message: 'the sub-task search didn\'t open. Add the sub-task yourself.' };

      const description = document.getElementById('subTaskDescriptionSearch');
      if (description) description.value = '';
      search.value = row.searchTerm || subTaskCode;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.dispatchEvent(new Event('change', { bubbles: true }));
      const searchButton = document.getElementById('btnSubTaskSearch');
      if (searchButton) searchButton.click();

      const wanted = subTaskCode.toLowerCase();
      const match = await waitFor(function () {
        const widget = dropDown('SubTask');
        if (!widget) return null;
        const item = widget.dataSource.data().find(function (candidate) {
          return norm(candidate.SubTaskCode || candidate[widget.options.dataTextField]).split(' - ')[0].toLowerCase() === wanted;
        });
        return item ? { widget: widget, item: item } : null;
      }, 10000);

      if (!match) {
        closeOpenWindows();
        return { status: 'partial', message: 'sub-task ' + subTaskCode + ' isn\'t available for this period.' };
      }

      match.widget.close();
      match.widget.value(match.item[match.widget.options.dataValueField] || match.item.SubTaskId);
      match.widget.trigger('change');
      await sleep(300);
      const addSubTask = document.getElementById('btnAddSubTask');
      if (!addSubTask) {
        closeOpenWindows();
        return { status: 'partial', message: 'LATS\'s Add Sub Task button isn\'t available. Add the sub-task yourself.' };
      }
      addSubTask.click();

      const attached = await waitFor(function () {
        const link = linkForId(id);
        const text = link ? norm(link.textContent).toLowerCase() : '';
        return text === wanted || text.indexOf(wanted + ' - ') === 0;
      }, 6000);
      await sleep(300);
      closeOpenWindows();
      await sleep(500);

      return attached
        ? { status: 'added' }
        : { status: 'partial', message: 'LATS didn\'t confirm the sub-task. Check this row.' };
    }
  };

  document.addEventListener('latsgo:request', async function (event) {
    let request;
    try {
      request = JSON.parse(event.detail);
    } catch (error) {
      return;
    }
    if (!request || !Object.prototype.hasOwnProperty.call(ACTIONS, request.action)) return;

    let response;
    try {
      const result = await ACTIONS[request.action](request.payload || {});
      response = { id: request.id, ok: true, result: result };
    } catch (error) {
      response = { id: request.id, ok: false, error: error && error.message ? error.message : String(error) };
    }
    document.dispatchEvent(new CustomEvent('latsgo:response', { detail: JSON.stringify(response) }));
  });
})();
