'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultFilters, filterIncidents } from '../lib/incident-filters.mjs';
const percent = value => value === null ? 'No data' : `${value.toFixed(2)}%`;
const human = value => value.replaceAll('-', ' ');
export default function Dashboard() {
  const [data, setData] = useState(null), [hours, setHours] = useState(24), [error, setError] = useState('');
  const [token, setToken] = useState(''), [busy, setBusy] = useState(false), [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null), [filters, setFilters] = useState(defaultFilters), [notice, setNotice] = useState('');
  const generation = useRef(0);
  const load = useCallback(async signal => {
    const sequence = ++generation.current;
    const response = await fetch(`/api/snapshot?hours=${hours}`, { signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load telemetry.');
    if (!signal?.aborted && sequence === generation.current) setData(result);
  }, [hours]);
  useEffect(() => {
    const controller = new AbortController(); let timer;
    async function poll() {
      try { await load(controller.signal); } catch (e) { if (!controller.signal.aborted) setError(e.message); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 15000);
    }
    poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [load]);
  async function mutate(path, method, body) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Update failed.');
      setSelectedId(result.id); setShowForm(false); await load(); setNotice('Incident update recorded.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const services = data?.services ?? [], incidents = data?.incidents ?? [];
  const visibleIncidents = filterIncidents(incidents, filters);
  const selected = visibleIncidents.find(i => i.id === selectedId);
  const active = incidents.filter(i => i.status !== 'resolved');
  const next = selected && data.workflow[selected.status];
  return <div className="shell"><header><a className="brand" href="/"><span>◈</span> Service Health<span className="console">CONSOLE</span></a><span className="workspace">OPERATIONS WORKSPACE</span><a href={`/api/report?hours=${hours}`}>Export report ↗</a></header><main>
    <div className="intro"><div><p className="eyebrow">RELIABILITY AT A GLANCE</p><h1>Know the state of your services.</h1><p>Probe health, error budgets, and incident updates in one view.</p></div><div className="window"><label htmlFor="window">Reporting window</label><select id="window" value={hours} onChange={e => setHours(Number(e.target.value))}><option value={1}>Last hour</option><option value={6}>Last 6 hours</option><option value={24}>Last 24 hours</option><option value={168}>Last 7 days</option></select></div></div>
    <div className="toolbar"><span className="live">● {data ? `Snapshot ${new Date(data.as_of).toLocaleTimeString()}` : 'Connecting to telemetry…'}</span><span>Refreshes every 15 seconds</span><button onClick={() => load().then(() => setError('')).catch(e => setError(e.message))}>Refresh now</button></div>
    {error && <div className="error" role="alert">{error}</div>}<p className="notice" role="status">{notice}</p>
    <div className="stats">{[['Monitored services', services.length, 'Registered in this workspace'], ['Healthy services', services.filter(s => s.state === 'healthy').length, 'Fresh data and within target'], ['Open incidents', active.length, 'Need operator attention'], ['Probes in window', services.reduce((sum, s) => sum + s.samples, 0), `${data?.window_hours ?? hours}-hour reporting window`]].map(([label, value, note]) => <div className="stat" key={label}><span>{label}</span><strong>{data ? value : '…'}</strong><small>{note}</small></div>)}</div>
    <section className="servicepanel"><div className="sectionhead"><div><h2>Service overview</h2><p>Availability is the fraction of successful probes, not request-based uptime.</p></div><span className="legend"><i/> Passed <i className="failed"/> Failed</span></div><div className="services">{services.map(service => <article className="service" key={service.id}><div className="servicehead"><div><h3>{service.name}</h3><p>{service.owner} team · target {service.target}%</p></div><span className={`badge ${service.state}`}>{human(service.state)}</span></div><div className="readings"><div><span>AVAILABILITY</span><strong>{percent(service.availability)}</strong></div><div><span>P95 SUCCESS LATENCY</span><strong>{service.p95_ms === null ? 'No data' : `${service.p95_ms} ms`}</strong></div></div><div className="history" role="img" aria-label={`${service.history.filter(s => s.success).length} successful probes out of the last ${service.history.length} samples`}>{service.history.length ? service.history.map((sample, i) => <span key={i} className={sample.success ? 'passed' : 'failed'} title={`${sample.observed_at}: ${sample.success ? 'passed' : 'failed'} (${sample.latency_ms} ms)`}/>) : <p>No probes recorded. Run the seed script or import samples.</p>}</div><div className="budget"><span>Error budget remaining</span><strong>{service.budget_remaining === null ? 'No data' : `${service.budget_remaining.toFixed(0)}%`}</strong><progress max="100" value={service.budget_remaining ?? 0} aria-label={`${service.name} error budget remaining`}/></div><div className="servicefoot"><span>{service.samples} probes · {service.failures} failures</span><span>{service.latest ? `Last ${new Date(service.latest).toLocaleTimeString()}` : 'Awaiting data'}</span></div></article>)}</div>{!data && <p role="status" className="empty">Loading service snapshot…</p>}</section>
    <section className="operator"><div><h2>Operator access</h2><p>Enter the local ADMIN_TOKEN to record incident updates. It stays in this page’s memory.</p></div><label>Operator token<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Configured in .env.local"/></label><button onClick={() => setToken('')}>Clear</button></section>
    <div className="incidentgrid"><section><div className="sectionhead"><div><h2>Incident workspace</h2><p>A clear record of what happened and what comes next.</p></div><button className="primary" disabled={!data || token.length < 12} onClick={() => setShowForm(!showForm)}>{showForm ? 'Close form' : '+ Open incident'}</button></div>
      {showForm && <form className="panel create" onSubmit={e => { e.preventDefault(); mutate('/api/incidents', 'POST', Object.fromEntries(new FormData(e.currentTarget))); }}><div className="formrow"><label>Service<select name="service_id">{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Severity<select name="severity"><option value="sev3">SEV3 · Minor</option><option value="sev2">SEV2 · Major</option><option value="sev1">SEV1 · Critical</option></select></label></div><label>Incident title<input name="title" required minLength={3} maxLength={140}/></label><label>Initial update<textarea name="note" required minLength={3} maxLength={1000} rows={3}/></label><button className="primary" disabled={busy}>Record incident</button></form>}
      <fieldset className="incidentfilters"><legend>Filter incidents</legend><div className="filterfields">
        <label>Service<select value={filters.service} onChange={e => setFilters({ ...filters, service: e.target.value })}><option value="">All services</option>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Severity<select value={filters.severity} onChange={e => setFilters({ ...filters, severity: e.target.value })}><option value="">All severities</option>{['sev1', 'sev2', 'sev3'].map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
        <label>Status<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="open">Open incidents</option><option value="">All statuses</option>{['investigating', 'identified', 'monitoring', 'resolved'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Search title<input type="search" value={filters.query} maxLength={140} placeholder="Search incident titles…" onChange={e => setFilters({ ...filters, query: e.target.value })}/></label>
      </div><div className="filterfooter"><p role="status">{visibleIncidents.length} of {incidents.length} loaded incidents shown. Snapshot includes up to 100 recent incidents, with open incidents first.</p><button type="button" onClick={() => setFilters(defaultFilters)}>Reset filters</button></div></fieldset><div className="incidents">{visibleIncidents.map(incident => <button className={`incidentrow ${selectedId === incident.id ? 'selected' : ''}`} key={incident.id} onClick={() => setSelectedId(incident.id)}><span className={`severity ${incident.severity}`}>{incident.severity.toUpperCase()}</span><div><h3>{incident.title}</h3><p>{services.find(s => s.id === incident.service_id)?.name} · {new Date(incident.created_at).toLocaleString()}</p></div><span className="stage">{incident.status}</span></button>)}{!visibleIncidents.length && <p className="empty">No incidents match these filters. Change the filters or reset to open incidents.</p>}</div>
    </section><aside className="panel detail">{selected ? <div key={`${selected.id}-${selected.version}`}><p className="eyebrow">INCIDENT TIMELINE</p><h2>{selected.title}</h2><p className="detailmeta">{selected.severity.toUpperCase()} · {selected.status} · version {selected.version}</p><ol>{selected.events.map((event, i) => <li key={i}><strong>{event.status}</strong><p>{event.note}</p><time>{new Date(event.created_at).toLocaleString()}</time></li>)}</ol>{next && <form onSubmit={e => { e.preventDefault(); const note = new FormData(e.currentTarget).get('note'); mutate(`/api/incidents/${selected.id}`, 'PATCH', { version: selected.version, status: next, note }); }}><label>Update for the next stage<textarea name="note" required minLength={next === 'resolved' ? 10 : 3} maxLength={1000} rows={3} placeholder="Findings, action taken, and verification…"/></label><button className="primary" disabled={busy || token.length < 12}>Mark {next}</button></form>}</div> : <div className="empty"><h2>Context makes response better.</h2><p>Select an incident to review its updates and record the next step.</p></div>}</aside></div>
    </main><footer><span>Service Health Console · Local operations lab</span><span>Seed data is synthetic · No vendor integration claimed</span></footer></div>;
}
