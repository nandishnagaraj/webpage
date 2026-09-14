import { createHttpExporter } from './exporters/http-exporter.js';

export function createExporter(config = {}) {
  const exporterConfig = config.exporter || { type: 'console' };

  if (exporterConfig.type === 'http') {
    return createHttpExporter(exporterConfig);
  }

  return createConsoleExporter();
}

function createConsoleExporter() {
  function enqueue(event) {
    const eventName = event.event || 'EVENT';
    console.groupCollapsed(
      `%c[Svedah UI Telemetry] ${eventName}`,
      'color:#f97316;font-weight:700'
    );
    console.table(event);
    console.log(event);
    console.groupEnd();
  }

  return {
    type: 'console',
    enqueue,
    flush() {},
    getQueueSize: () => 0
  };
}
