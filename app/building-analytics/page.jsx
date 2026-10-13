'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ASSET_TYPES, BUILDINGS, WINDOW_OPTIONS, assetGuidance,
  createSyntheticPortfolio, filterAssets, lastReadings,
  portfolioSeries, summarizePortfolio
} from '../../lib/building-analytics.mjs';
import './analytics.css';

const PAGE_SIZE = 18;
const pretty = value => value === null ? 'No data' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
const STATUS_LABEL = { critical: 'Critical', warning: 'Attention', healthy: 'Normal', stale: 'Stale', 'no-data': 'No data' };

function TrendChart({ series, label, unit = 'kW' }) {
  const points = series.filter(p => Number.isFinite(p.kw));
  if (!points.length) return <div className="ba-no-data">No fresh readings for this selection. The chart does not assume missing data is healthy.</div>;
  const max = Math.max(1, ...points.map(p => p.kw));
  const min = Math.max(0, Math.min(...points.map(p => p.kw)) * 0.88);
  const span = Math.max(1, max - min);
  const coords = points.map((point, index) => {
    const x = 58 + (index / Math.max(1, points.length - 1)) * 748;
    const y = 177 - ((point.kw - min) / span) * 142;
    return [x, y];
  });
  const line = coords.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ');
  const fill = '58,180 ' + line + ' 806,180';
  const first = points[0].bucket;
  const last = points[points.length - 1].bucket;
  return <div className="ba-chart-wrap">
    <svg viewBox="0 0 840 212" role="img" aria-label={label + '. Range ' + pretty(min) + ' to ' + pretty(max) + ' ' + unit + '.'} preserveAspectRatio="xMidYMid meet">
      <title>{label}</title>
      <desc>Synthetic 15-minute power samples. Chart values are also summarized above the graph.</desc>
      {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="58" x2="806" y1={35 + i * 35.5} y2={35 + i * 35.5} stroke="#dfe8ee" strokeDasharray="4 6"/><text x="46" y={39 + i * 35.5} textAnchor="end" fill="#667c8a" fontSize="12">{pretty(max - (span * i / 4))}</text></g>)}
      <polygon points={fill} fill="#dcecfb" opacity="0.75"/>
      <polyline points={line} fill="none" stroke="#287fb9" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={coords.at(-1)[0]} cy={coords.at(-1)[1]} r="5.5" fill="#287fb9" stroke="white" strokeWidth="2"/>
      <text x="58" y="203" fill="#667c8a" fontSize="12">T-{(95 - first) * 15} min</text>
      <text x="806" y="203" fill="#667c8a" fontSize="12" textAnchor="end">T-{(95 - last) * 15} min</text>
      <text x="806" y="24" fill="#667c8a" fontSize="12" textAnchor="end">{unit}</text>
    </svg>
  </div>;
}

export default function BuildingAnalytics() {
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [windowSize, setWindowSize] = useState(96);
  const [filters, setFilters] = useState({ building: '', kind: '', status: '', query: '', sort: 'risk' });
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState('harbor-02');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [reviews, setReviews] = useState([]);
  const assets = useMemo(() => createSyntheticPortfolio(tick), [tick]);
  const visible = useMemo(() => filterAssets(assets, filters), [assets, filters]);
  const summary = useMemo(() => summarizePortfolio(assets, windowSize), [assets, windowSize]);
  const trend = useMemo(() => portfolioSeries(assets, windowSize, filters.building), [assets, windowSize, filters.building]);
  const selected = assets.find(a => a.id === selectedId) || assets[0];
  const equipmentTrend = lastReadings(selected, windowSize).map(r => ({ bucket: r.bucket, kw: r.kw }));
  const count = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedPower = selected.readings.at(-1)?.kw ?? null;

  useEffect(() => {
    if (!running) return undefined;
    const handle = setInterval(() => setTick(n => n + 1), 8000);
    return () => clearInterval(handle);
  }, [running]);

  function changeFilter(key, value) {
    setPage(0);
    setFilters(prev => ({ ...prev, [key]: value }));
  }
  function recordReview(event) {
    event.preventDefault();
    if (!selected || reviewNote.trim().length < 12) return;
    setReviews(prev => [{
      id: selected.id, equipment: selected.name, building: selected.buildingName,
      note: reviewNote.trim(), status: selected.status, tick,
      recordedAt: new Date().toISOString()
    }, ...prev].slice(0, 12));
    setReviewNote('');
    setReviewOpen(false);
  }
  const summaryLabel = filters.building
    ? BUILDINGS.find(b => b.id === filters.building)?.name + ' power trend'
    : 'Portfolio power trend';

  return <div className="ba-shell">
    <header className="ba-nav"><a className="ba-wordmark" href="/building-analytics"><span className="ba-glyph">◈</span> FIELDVIEW <small>OPERATIONS INTELLIGENCE</small></a><nav><a href="/">Service Health Console</a><a href="https://github.com/yeabsira-mesfin/service-health-console" target="_blank" rel="noreferrer">Source code ↗</a></nav></header>
    <main className="ba-main">
      <div className="ba-hero"><div><p className="ba-overline">FRONT-END ARCHITECTURE SHOWCASE / SYNTHETIC DATA</p><h1>Building operations, made actionable.</h1><p>Explore equipment health, energy demand and operational decisions across a fictional property portfolio. No building systems are connected.</p></div><div className="ba-live"><span className="ba-live-dot"/><strong>Simulated feed</strong><small>Step {tick} · deterministic 15-minute samples</small><button onClick={() => setRunning(v => !v)}>{running ? 'Pause simulation' : 'Start simulation'}</button></div></div>
      <div className="ba-kpis" aria-label="Portfolio statistics">
        <article><span>MONITORED ASSETS</span><strong>{summary.assets}</strong><small>{BUILDINGS.length} fictional properties</small></article>
        <article><span>FRESH SIGNALS</span><strong>{summary.reporting}</strong><small>Assets with usable telemetry</small></article>
        <article><span>NEEDS ATTENTION</span><strong>{summary.critical + summary.warning}</strong><small>{summary.critical} critical · {summary.warning} warning</small></article>
        <article><span>UNKNOWN HEALTH</span><strong>{summary.unknown}</strong><small>Stale and missing readings</small></article>
        <article><span>AVERAGE POWER</span><strong>{pretty(summary.averageKw)} <em>kW</em></strong><small>Sum of per-asset mean power</small></article>
      </div>
      <section className="ba-panel ba-trend"><div className="ba-panel-header"><div><p className="ba-overline">TIME-SERIES ANALYTICS</p><h2>{summaryLabel}</h2><p>Aggregated active asset demand. Stale and missing signals are excluded, never silently reported as zero.</p></div><label>Reporting window <select value={windowSize} onChange={e => setWindowSize(Number(e.target.value))}>{WINDOW_OPTIONS.map(o => <option value={o.value} key={o.value}>{o.label}</option>)}</select></label></div><TrendChart series={trend} label={summaryLabel}/></section>
      <section className="ba-workspace" aria-label="Equipment investigation workspace">
        <div className="ba-panel ba-roster">
          <div className="ba-panel-header"><div><p className="ba-overline">INVESTIGATION WORKSPACE</p><h2>Equipment inventory</h2><p>Filter by property, system and health status. Sort by risk or power.</p></div><button className="ba-link" onClick={() => { setFilters({ building: '', kind: '', status: '', query: '', sort: 'risk' }); setPage(0); }}>Reset filters</button></div>
          <div className="ba-controls">
            <label className="ba-wide">Search assets<input type="search" value={filters.query} onChange={e => changeFilter('query', e.target.value)} placeholder="Equipment, property or asset ID"/></label>
            <label>Building<select value={filters.building} onChange={e => changeFilter('building', e.target.value)}><option value="">All buildings</option>{BUILDINGS.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
            <label>System<select value={filters.kind} onChange={e => changeFilter('kind', e.target.value)}><option value="">All systems</option>{ASSET_TYPES.map(t => <option value={t} key={t}>{t}</option>)}</select></label>
            <label>Health<select value={filters.status} onChange={e => changeFilter('status', e.target.value)}><option value="">All statuses</option>{Object.keys(STATUS_LABEL).map(s => <option value={s} key={s}>{STATUS_LABEL[s]}</option>)}</select></label>
            <label>Sort<select value={filters.sort} onChange={e => changeFilter('sort', e.target.value)}><option value="risk">Highest risk first</option><option value="power">Highest power first</option><option value="building">Building name</option></select></label>
          </div>
          <p className="ba-count" role="status">{visible.length} matching assets · showing {pageRows.length} per page · no virtual equipment commands</p>
          <div className="ba-table-scroll"><table><thead><tr><th scope="col">Equipment</th><th scope="col">Property</th><th scope="col">Health</th><th scope="col" className="ba-number">Power</th></tr></thead><tbody>{pageRows.map(a => <tr key={a.id} className={selected.id === a.id ? 'ba-selected' : ''}><td><button className="ba-equipment-button" onClick={() => { setSelectedId(a.id); setReviewOpen(false); }} aria-pressed={selected.id === a.id}>{a.name}<small>{a.id}</small></button></td><td>{a.buildingName}</td><td><span className={'ba-status ba-' + a.status}>{STATUS_LABEL[a.status]}</span></td><td className="ba-number">{a.readings.length ? pretty(a.readings.at(-1).kw) + ' kW' : '—'}</td></tr>)}</tbody></table>{!pageRows.length && <p className="ba-no-data">No assets match. Clear a filter to see more equipment.</p>}</div>
          <div className="ba-pagination"><button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</button><span>Page {page + 1} of {count}</span><button disabled={page + 1 >= count} onClick={() => setPage(p => p + 1)}>Next</button></div>
        </div>
        <aside className="ba-panel ba-inspection"><p className="ba-overline">SELECTED ASSET / DECISION SUPPORT</p><div className="ba-asset-top"><div><h2>{selected.name}</h2><p>{selected.buildingName} · {selected.kind} · {selected.id}</p></div><span className={'ba-status ba-' + selected.status}>{STATUS_LABEL[selected.status]}</span></div>
          <div className="ba-asset-value"><span>Latest simulated demand</span><strong>{pretty(selectedPower)} <em>{selectedPower !== null ? 'kW' : ''}</em></strong></div>
          <TrendChart series={equipmentTrend} label={selected.name + ' simulated power demand'}/>
          <div className="ba-recommendation"><strong>Operator guidance</strong><p>{assetGuidance(selected)}</p></div>
          <p className="ba-safety">This dashboard provides decision support only. It cannot actuate equipment. Any intervention requires a qualified operator and independent verification.</p>
          <button className="ba-primary" onClick={() => setReviewOpen(v => !v)}>{reviewOpen ? 'Cancel review' : 'Document operator review'}</button>
          {reviewOpen && <form className="ba-review-form" onSubmit={recordReview}><label>Review notes (12+ characters)<textarea minLength={12} maxLength={800} value={reviewNote} onChange={e => setReviewNote(e.target.value)} required placeholder="What should a building operator verify?"/></label><button className="ba-primary" type="submit" disabled={reviewNote.trim().length < 12}>Record decision-support note</button><small>This writes to session memory only and sends no commands.</small></form>}
          {reviews.length > 0 && <div className="ba-review-history"><strong>Session review log</strong>{reviews.slice(0, 3).map((r, i) => <div key={r.recordedAt + i}><b>{r.equipment} / {r.status}</b><p>{r.note}</p><small>{new Date(r.recordedAt).toLocaleTimeString()}</small></div>)}</div>}
        </aside>
      </section>
      <footer className="ba-footer">Front-end architecture demo: React, reusable analytical components, memoized aggregation, accessible SVG charts and paginated filtering. All readings, assets, buildings and recommendations are illustrative simulations.</footer>
    </main>
  </div>;
}
