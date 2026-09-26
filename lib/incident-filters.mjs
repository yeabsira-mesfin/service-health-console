export const defaultFilters = Object.freeze({ service: '', severity: '', status: 'open', query: '' });

// Filter the snapshot's latest 100 incidents. Preserve their existing order and
// leave workspace-wide service metrics and incident totals unchanged.
export function filterIncidents(incidents, { service = '', severity = '', status = 'open', query = '' } = {}) {
  const search = query.trim().toLowerCase();
  return incidents.filter(incident =>
    (!service || incident.service_id === service) &&
    (!severity || incident.severity === severity) &&
    (!status || (status === 'open' ? incident.status !== 'resolved' : incident.status === status)) &&
    (!search || incident.title.toLowerCase().includes(search)));
}
