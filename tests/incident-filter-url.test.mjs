import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilters } from '../lib/incident-filters.mjs';
import { readFilters, filterURL, connectFilterHistory } from '../lib/incident-filter-url.mjs';

test('filter URLs round trip all statuses, Unicode and reserved search characters', () => {
  for (const status of ['', 'open', 'investigating', 'identified', 'monitoring', 'resolved']) {
    const filters = { service: 'orders', severity: 'sev1', status, query: '界 & latency + 50%?' };
    assert.deepEqual(readFilters(new URL(filterURL('/', filters), 'https://example.test').search), filters);
  }
  assert.equal(filterURL('/', defaultFilters), '/');
  assert.equal(readFilters('?status=').status, '');
  assert.equal(readFilters('').status, 'open');
});
test('invalid and duplicate values default safely; query length and controls are bounded', () => {
  assert.deepEqual(readFilters('?service=unknown&severity=SEV1&status=closed'), defaultFilters);
  assert.deepEqual(readFilters('?service=web&service=orders&status=resolved&status=open&query=a&query=b'), defaultFilters);
  assert.equal(readFilters('?query=%00hello%0Aworld').query, 'helloworld');
  assert.equal(readFilters('?query=' + 'x'.repeat(200)).query.length, 140);
  assert.doesNotThrow(() => readFilters('?query=%E0%A4%A'));
});
function fakeBrowser(start) {
  const entries = [new URL(start, 'https://example.test').href], listeners = new Set();
  let index = 0;
  const browser = {
    get location() { return new URL(entries[index]); },
    history: {
      replaceState(state, _, url) { assert.equal(state, null); entries[index] = new URL(url, browser.location).href; },
      pushState(state, _, url) { assert.equal(state, null); const next = new URL(url, browser.location).href; entries.splice(++index); entries.push(next); },
    },
    addEventListener(event, listener) { assert.equal(event, 'popstate'); listeners.add(listener); },
    removeEventListener(event, listener) { listeners.delete(listener); },
    go(delta) { index += delta; listeners.forEach(listener => listener()); },
    entries, listeners,
  };
  return browser;
}
test('initial restore, changes, reload, back/forward, reset and listener cleanup', () => {
  const browser = fakeBrowser('/?service=orders&status=resolved');
  let filters;
  const connection = connectFilterHistory(browser, value => { filters = value; });
  assert.equal(filters.status, 'resolved');
  connection.update({ ...filters, severity: 'sev1' });
  connection.update(defaultFilters);
  assert.equal(browser.location.search, '');
  browser.go(-1); assert.equal(filters.severity, 'sev1'); assert.equal(filters.service, 'orders');
  browser.go(-1); assert.equal(filters.severity, ''); assert.equal(filters.status, 'resolved');
  browser.go(1); assert.equal(filters.severity, 'sev1');
  assert.deepEqual(readFilters(browser.location.search), filters, 'reload restores the same filters');
  const length = browser.entries.length;
  connection.update(filters); assert.equal(browser.entries.length, length);
  connection.dispose(); assert.equal(browser.listeners.size, 0);
});
test('token and unrelated state are excluded from serialization and history', () => {
  const browser = fakeBrowser('/?token=secret&operatorToken=secret&service=web#secret');
  const connection = connectFilterHistory(browser, () => {});
  assert.equal(browser.location.href, 'https://example.test/?service=web');
  connection.update({ ...defaultFilters, severity: 'sev2', token: 'secret', operatorToken: 'secret', password: 'secret' });
  assert.ok(browser.entries.every(url => !url.includes('secret')));
  connection.dispose();
});
