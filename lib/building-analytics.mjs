/**
 * Building Operations Analytics: fully synthetic deterministic telemetry.
 * No real equipment, building integrations, energy savings, or control actions.
 */
export const BUILDINGS = [
  { id: 'harbor', name: 'Harbor Tower', market: 'Northeast' },
  { id: 'river', name: 'Riverside Plaza', market: 'Northeast' },
  { id: 'summit', name: 'Summit Center', market: 'Mountain' },
  { id: 'maple', name: 'Maple Commons', market: 'Midwest' },
  { id: 'cedar', name: 'Cedar Exchange', market: 'Midwest' },
  { id: 'civic', name: 'Civic Square', market: 'Southeast' },
  { id: 'meridian', name: 'Meridian Place', market: 'Southeast' },
  { id: 'capitol', name: 'Capitol Annex', market: 'Mid-Atlantic' },
  { id: 'union', name: 'Union Station Offices', market: 'Mid-Atlantic' },
  { id: 'park', name: 'Parkside Campus', market: 'West' },
  { id: 'pacific', name: 'Pacific Landing', market: 'West' },
  { id: 'grove', name: 'Grove District', market: 'Southwest' }
];
export const ASSET_TYPES = ['Air Handler', 'Chiller', 'Boiler', 'Pump', 'Lighting', 'HVAC'];
export const SAMPLE_COUNT = 96; // 24 hours at 15-minute intervals
export const WINDOW_OPTIONS = [
  { value: 6, label: '90 minutes' },
  { value: 24, label: '6 hours' },
  { value: 96, label: '24 hours' }
];

function pseudoRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const round = (n, precision = 1) => Number(n.toFixed(precision));
const statusPriority = { critical: 0, warning: 1, healthy: 2, stale: 3, 'no-data': 4 };

export function classifyAsset(readings, stale = false) {
  if (!Array.isArray(readings) || readings.length === 0) return 'no-data';
  if (stale) return 'stale';
  const recent = readings.at(-1);
  if (!Number.isFinite(recent?.temp) || !Number.isFinite(recent?.kw)) return 'no-data';
  if (recent.temp >= 29 || recent.vibration >= 7.5) return 'critical';
  if (recent.temp >= 26 || recent.vibration >= 5.7) return 'warning';
  return 'healthy';
}

/** Each refresh advances only the simulated clock, not external telemetry. */
export function createSyntheticPortfolio(tick = 0) {
  if (!Number.isInteger(tick) || tick < 0) throw new RangeError('tick must be a non-negative integer');
  return BUILDINGS.flatMap((building, buildingIndex) =>
    Array.from({ length: 18 }, (_, assetIndex) => {
      const n = buildingIndex * 18 + assetIndex;
      const kind = ASSET_TYPES[assetIndex % ASSET_TYPES.length];
      const id = `${building.id}-${String(assetIndex + 1).padStart(2, '0')}`;
      const missing = n % 41 === 0;
      const stale = !missing && n % 29 === 0;
      const rng = pseudoRandom((n + 1) * 15485863);
      const offset = 4 + (assetIndex % 7) * 2.3;
      const fault = n % 13 === 0 ? 7 : n % 11 === 0 ? 4.2 : 0;
      const readings = missing ? [] : Array.from({ length: SAMPLE_COUNT }, (_, step) => {
        const phase = (step + tick) * Math.PI / 48;
        const daily = Math.sin(phase) + 0.3 * Math.cos(phase * 3);
        const drift = step > 73 ? fault * (step - 73) / 22 : 0;
        return {
          bucket: step,
          kw: round(Math.max(0, offset * 3 + daily * 2 + rng() * 2 + drift)),
          temp: round(21 + daily * 1.5 + rng() * 1.2 + drift),
          vibration: round(1.9 + rng() * 2.2 + drift * 0.8)
        };
      });
      return {
        id,
        name: `${kind} ${String(assetIndex + 1).padStart(2, '0')}`,
        kind,
        buildingId: building.id,
        buildingName: building.name,
        market: building.market,
        readings,
        status: classifyAsset(readings, stale),
        synthetic: true
      };
    })
  );
}

export function lastReadings(asset, count = SAMPLE_COUNT) {
  return (asset?.readings ?? []).slice(-Math.min(SAMPLE_COUNT, Math.max(1, count)));
}
export function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
export function summarizePortfolio(assets, count = SAMPLE_COUNT) {
  const present = assets.filter(asset => lastReadings(asset, count).length > 0 && asset.status !== 'stale');
  const totalKw = present.reduce((sum, asset) => sum + (average(lastReadings(asset, count).map(r => r.kw)) ?? 0), 0);
  return {
    assets: assets.length,
    reporting: present.length,
    critical: assets.filter(a => a.status === 'critical').length,
    warning: assets.filter(a => a.status === 'warning').length,
    unknown: assets.filter(a => a.status === 'stale' || a.status === 'no-data').length,
    averageKw: present.length ? round(totalKw) : null
  };
}
export function portfolioSeries(assets, count = SAMPLE_COUNT, buildingId = '') {
  const active = assets.filter(a =>
    (!buildingId || a.buildingId === buildingId) &&
    a.status !== 'stale' && a.readings.length > 0);
  if (!active.length) return [];
  const size = Math.max(1, Math.min(SAMPLE_COUNT, count));
  return Array.from({ length: size }, (_, index) => {
    const bucket = SAMPLE_COUNT - size + index;
    return { bucket, kw: round(active.reduce((sum, a) => sum + a.readings[bucket].kw, 0)) };
  });
}
export function filterAssets(assets, { query = '', building = '', kind = '', status = '', sort = 'risk' } = {}) {
  const needle = String(query).trim().toLowerCase();
  const filtered = assets.filter(a =>
    (!building || a.buildingId === building) &&
    (!kind || a.kind === kind) &&
    (!status || a.status === status) &&
    (!needle || [a.id, a.name, a.buildingName, a.market].some(v => v.toLowerCase().includes(needle)))
  );
  return filtered.sort((a, b) => {
    if (sort === 'building') return a.buildingName.localeCompare(b.buildingName) || a.id.localeCompare(b.id);
    if (sort === 'power') return (b.readings.at(-1)?.kw ?? -1) - (a.readings.at(-1)?.kw ?? -1) || a.id.localeCompare(b.id);
    return (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9) || a.id.localeCompare(b.id);
  });
}
export function assetGuidance(asset) {
  if (!asset || ['stale', 'no-data'].includes(asset.status)) {
    return 'Verify sensor coverage and data freshness before making an operational decision.';
  }
  if (asset.status === 'critical') return 'Inspect the asset, check recent alarms, and escalate to an authorized building operator.';
  if (asset.status === 'warning') return 'Review temperature and vibration trends, then schedule an operator inspection.';
  return 'No simulated anomaly detected. Continue routine observation.';
}
