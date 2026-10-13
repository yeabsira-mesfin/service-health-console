import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_TYPES, BUILDINGS, SAMPLE_COUNT, assetGuidance,
  classifyAsset, createSyntheticPortfolio, filterAssets,
  lastReadings, portfolioSeries, summarizePortfolio
} from '../lib/building-analytics.mjs';

test('synthetic portfolio is deterministic, bounded and explicitly marked', () => {
  const a = createSyntheticPortfolio();
  const b = createSyntheticPortfolio();
  assert.equal(a.length, 216);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map(asset => asset.id)).size, a.length);
  assert.ok(a.every(asset => asset.synthetic === true));
  assert.ok(a.every(asset => asset.readings.length === 0 || asset.readings.length === SAMPLE_COUNT));
  assert.equal(BUILDINGS.length, 12);
  assert.equal(ASSET_TYPES.length, 6);
  assert.notDeepEqual(a[1].readings, createSyntheticPortfolio(1)[1].readings);
  assert.throws(() => createSyntheticPortfolio(-1), RangeError);
});

test('missing and stale signals cannot be classified as healthy', () => {
  const assets = createSyntheticPortfolio();
  assert.equal(assets[0].status, 'no-data');
  assert.equal(assets[29].status, 'stale');
  assert.equal(classifyAsset([]), 'no-data');
  assert.equal(classifyAsset([{ kw: 2, temp: 21, vibration: 1 }], true), 'stale');
  assert.equal(classifyAsset([{ kw: 2, temp: 21, vibration: 1 }]), 'healthy');
  assert.equal(classifyAsset([{ kw: 2, temp: 26.5, vibration: 1 }]), 'warning');
  assert.equal(classifyAsset([{ kw: 2, temp: 30, vibration: 1 }]), 'critical');
  assert.equal(classifyAsset([{ kw: Number.NaN, temp: 21, vibration: 1 }]), 'no-data');
});

test('portfolio metrics exclude unknown signals and count statuses correctly', () => {
  const assets = createSyntheticPortfolio();
  const summary = summarizePortfolio(assets);
  assert.equal(summary.assets, 216);
  assert.equal(summary.reporting + summary.unknown, 216);
  assert.ok(summary.unknown >= 2);
  assert.equal(summary.critical + summary.warning,
    assets.filter(a => ['critical', 'warning'].includes(a.status)).length);
  assert.ok(Number.isFinite(summary.averageKw));
  const empty = summarizePortfolio([]);
  assert.deepEqual(empty, {
    assets: 0, reporting: 0, critical: 0, warning: 0, unknown: 0, averageKw: null
  });
});

test('portfolio time series uses only available recent equipment signals', () => {
  const assets = createSyntheticPortfolio();
  const six = portfolioSeries(assets, 6);
  const full = portfolioSeries(assets, 96);
  assert.equal(six.length, 6);
  assert.equal(full.length, SAMPLE_COUNT);
  assert.equal(six.at(-1).kw, full.at(-1).kw);
  assert.equal(portfolioSeries(assets, 8, 'harbor').length, 8);
  assert.equal(portfolioSeries(assets, 8, 'unlisted').length, 0);
  assert.equal(lastReadings(assets[1], 12).length, 12);
  assert.deepEqual(lastReadings(assets[0], 12), []);
  assert.ok(full.every(p => Number.isFinite(p.kw) && p.kw >= 0));
});

test('filter, search and pagination inputs stay scoped to selected building', () => {
  const assets = createSyntheticPortfolio();
  assert.equal(filterAssets(assets, { building: 'harbor' }).length, 18);
  assert.equal(filterAssets(assets, { building: 'harbor', kind: 'Chiller' }).length, 3);
  assert.equal(filterAssets(assets, { query: 'HARBOR-02' }).length, 1);
  assert.deepEqual(filterAssets(assets, { query: 'no such building' }), []);
  const risk = filterAssets(assets, { sort: 'risk' });
  const unknown = risk.findIndex(a => a.status === 'no-data');
  assert.ok(unknown > -1 && risk.slice(unknown).every(a => a.status === 'no-data'));
  const power = filterAssets(assets, { sort: 'power' });
  assert.ok((power[0].readings.at(-1)?.kw ?? 0) >= (power[1].readings.at(-1)?.kw ?? 0));
  assert.ok(assetGuidance(assets[0]).includes('sensor'));
  assert.ok(assetGuidance(assets.find(a => a.status === 'critical')).includes('operator'));
});
