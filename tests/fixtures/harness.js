/**
 * The shared test harness: load a LATS page into jsdom with the extension's content scripts,
 * wait for what the scripts do, and read the extension's stylesheets.
 *
 * The extension's scripts aren't modules, so loadPage runs them in the page with window.eval,
 * in manifest order, the way Chrome injects them.
 */

import { vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const TIMESHEET_URL = 'https://time02.lats.ny.gov/Timesheet';
export const TDS_URL = 'https://time02.lats.ny.gov/TimeDistribution?tshdrid=1';

/** The content scripts that run on /Time* pages, in manifest order. */
export const CONTENT_SCRIPTS = ['scripts/shared/utils.js', 'scripts/lats-restyle.js', 'scripts/content.js'];

/** The page restyle on its own: utils.js and lats-restyle.js, without content.js. */
export const RESTYLE_SCRIPTS = CONTENT_SCRIPTS.slice(0, 2);

const files = new Map();

/** A repository file's text, such as 'styles/content.css'. Each file is read once. */
function readRepoFile(file) {
  if (!files.has(file)) files.set(file, readFileSync(ROOT + file, 'utf8'));
  return files.get(file);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * A stand-in for the chrome APIs the content scripts use. `areas` holds what's in storage, so
 * tests can read what the scripts saved. Callbacks run on a later tick, as Chrome's do.
 */
export function chromeStub({ sync = {}, local = {} } = {}) {
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

/**
 * Load `html` as a LATS page's body and run the extension's scripts in it.
 * @param {string} html The page body, such as buildTimesheetHtml() or buildTdsHtml().
 * @param {Object} [options]
 * @param {string} [options.url] The page's URL. Defaults to the timesheet.
 * @param {string[]} [options.scripts] Repository paths of the scripts to run, in order.
 *   Defaults to CONTENT_SCRIPTS. Pass [] for a page without scripts.
 * @param {Object} [options.sync] What chrome.storage.sync holds at load.
 * @param {Object} [options.local] What chrome.storage.local holds at load.
 * @returns {{ window, document, chrome, LatsGo }} `chrome` is the chromeStub. `LatsGo` is the
 *   page's own LatsGo, when the scripts include utils.js.
 */
export function loadPage(html, { url = TIMESHEET_URL, scripts = CONTENT_SCRIPTS, sync, local } = {}) {
  const { window } = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  // jsdom has no layout, so innerText falls back to textContent here. On live LATS, innerText
  // skips display: none, which is why content.css only visually hides LATS's holiday notices.
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent; },
    configurable: true
  });
  // jsdom doesn't implement modal dialogs. These keep the open attribute and the close event.
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
  const chrome = chromeStub({ sync, local });
  window.chrome = chrome;
  // Top-level const declarations stay inside the eval, so its last expression hands LatsGo out.
  const LatsGo = window.eval(scripts.map(readRepoFile).join('\n') +
    "\n;typeof LatsGo === 'undefined' ? undefined : LatsGo;");
  return { window, document: window.document, chrome, LatsGo };
}

/** Resolve after `ms` milliseconds. */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `check` until it returns something truthy, and return that.
 * @param {Function} check
 * @param {Object} [options]
 * @param {number} [options.timeout] Milliseconds before it throws. Defaults to 10 seconds.
 * @param {number} [options.interval] Milliseconds between checks. Defaults to 25.
 */
export async function until(check, { timeout = 10000, interval = 25 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await wait(interval);
  }
  throw new Error('Timed out waiting for condition');
}

/** Split `text` at each `separator` that's outside quotes and parentheses. */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === '\'') {
      quote = char;
    } else if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === separator && !depth) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const sheets = new Map();

/**
 * A stylesheet's rules, without comments, as { selector, body, declarations }. `body` is the
 * text between the braces. `declarations` maps each property to its value, `!important`
 * included. Rules inside at-rules such as @media are listed; the at-rules themselves aren't.
 * @param {string} file A repository path, such as 'styles/content.css'.
 */
export function cssRules(file) {
  if (!sheets.has(file)) {
    const css = readRepoFile(file).replace(/\/\*[\s\S]*?\*\//g, '');
    sheets.set(file, Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selector, body]) => ({
      selector: selector.trim(),
      body,
      declarations: Object.fromEntries(splitTopLevel(body, ';').map((declaration) => {
        const colon = declaration.indexOf(':');
        return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
      }))
    })));
  }
  return sheets.get(file);
}

/**
 * The rules among `rules` that apply to `element` itself: any selector in a rule's list
 * matches it. Pseudo-element selectors and @keyframes steps (0%, from) don't count.
 */
export function matchingRules(element, rules) {
  return rules.filter((rule) => splitTopLevel(rule.selector, ',').some((selector) =>
    !/::|:(before|after)\b/.test(selector) && !/^(from|to|[\d.]+%)$/.test(selector) && element.matches(selector)));
}
