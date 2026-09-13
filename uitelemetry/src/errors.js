export function installErrorTracking(api) {
  window.addEventListener('error', (event) => {
    api.emit('ERROR', {
      action: 'javascript_error',
      message: event.message || '',
      filename: event.filename || '',
      line: event.lineno || 0,
      column: event.colno || 0
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    api.emit('UNHANDLED_REJECTION', {
      action: 'unhandled_rejection',
      message: event.reason?.message || String(event.reason || '')
    });
  });
}
