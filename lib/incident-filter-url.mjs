import { defaultFilters } from './incident-filters.mjs';
const choices = {
  service: ['', 'identity', 'orders', 'web'],
  severity: ['', 'sev1', 'sev2', 'sev3'],
  status: ['', 'open', 'investigating', 'identified', 'monitoring', 'resolved'],
};
export function normalizeFilters(filters = {}) {
  const result = { ...defaultFilters };
  for (const [key, values] of Object.entries(choices))
    if (values.includes(filters[key])) result[key] = filters[key];
  if (typeof filters.query === 'string') result.query = filters.query.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 140);
  return result;
}
export function readFilters(search) {
  const params = new URLSearchParams(search);
  const filters = {};
  for (const key of Object.keys(defaultFilters)) {
    // Ambiguous duplicate parameters safely fall back to the default.
    if (params.getAll(key).length === 1) filters[key] = params.get(key);
  }
  return normalizeFilters(filters);
}
export function filterURL(pathname, filters) {
  const clean = normalizeFilters(filters), params = new URLSearchParams();
  for (const key of Object.keys(defaultFilters))
    if (clean[key] !== defaultFilters[key]) params.set(key, clean[key]);
  return pathname + (params.size ? `?${params}` : '');
}
// Only filter fields enter history. Unknown parameters and fragments are dropped;
// operator credentials stay in the component's separate, in-memory state.
export function connectFilterHistory(browser, onChange) {
  function restore() {
    const filters = readFilters(browser.location.search);
    browser.history.replaceState(null, '', filterURL(browser.location.pathname, filters));
    onChange(filters);
  }
  restore();
  browser.addEventListener('popstate', restore);
  return {
    update(filters) {
      const clean = normalizeFilters(filters), url = filterURL(browser.location.pathname, clean);
      if (url !== browser.location.pathname + browser.location.search + browser.location.hash)
        browser.history.pushState(null, '', url);
      onChange(clean);
    },
    dispose() { browser.removeEventListener('popstate', restore); },
  };
}
