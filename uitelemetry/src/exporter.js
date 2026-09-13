export function createExporter(config = {}) {
  const type = config.type || 'console';
  const endpoint = config.endpoint || '';

  async function exportRecord(record) {
    if (type === 'none') return;
    if (type === 'console') {
      console.groupCollapsed(`%c[Svedah UI Telemetry] ${record.event}`, 'color:#f97316;font-weight:700');
      console.table(record);
      console.log(record);
      console.groupEnd();
      return;
    }
    if (type === 'http' && endpoint) {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(record),
        keepalive: true
      });
    }
  }

  return { exportRecord };
}
