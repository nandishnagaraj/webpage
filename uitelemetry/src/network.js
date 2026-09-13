export function installNetworkTracking(api) {
  installFetchTracking(api);
  installXHRTracking(api);
}

function installFetchTracking(api) {
  if (typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url || '';
    const method = args[1]?.method || request?.method || 'GET';
    const started = performance.now();
    const correlation = api.getCurrentCorrelation();

    try {
      const response = await originalFetch(...args);
      api.emit('FETCH', {
        action: 'fetch',
        request_id: `req_${api.createSpanId()}`,
        method,
        url: new URL(url, location.href).href,
        status: response.status,
        duration_ms: Math.round(performance.now() - started),
        parent_ui_span_id: correlation.parent_ui_span_id || '',
        correlation_trace_id: correlation.trace_id || ''
      });
      return response;
    } catch (error) {
      api.emit('FETCH_ERROR', {
        action: 'fetch_error',
        request_id: `req_${api.createSpanId()}`,
        method,
        url: new URL(url, location.href).href,
        duration_ms: Math.round(performance.now() - started),
        error: error?.message || String(error),
        parent_ui_span_id: correlation.parent_ui_span_id || '',
        correlation_trace_id: correlation.trace_id || ''
      });
      throw error;
    }
  };
}

function installXHRTracking(api) {
  const OriginalXHR = window.XMLHttpRequest;
  if (!OriginalXHR) return;

  const open = OriginalXHR.prototype.open;
  const send = OriginalXHR.prototype.send;

  OriginalXHR.prototype.open = function(method, url, ...rest) {
    this.__svedahTelemetry = { method, url: new URL(url, location.href).href };
    return open.call(this, method, url, ...rest);
  };

  OriginalXHR.prototype.send = function(...args) {
    const meta = this.__svedahTelemetry || {};
    const started = performance.now();
    const correlation = api.getCurrentCorrelation();
    this.addEventListener('loadend', () => {
      api.emit('XHR', {
        action: 'xhr',
        request_id: `req_${api.createSpanId()}`,
        method: meta.method || '',
        url: meta.url || '',
        status: this.status,
        duration_ms: Math.round(performance.now() - started),
        parent_ui_span_id: correlation.parent_ui_span_id || '',
        correlation_trace_id: correlation.trace_id || ''
      });
    });
    return send.apply(this, args);
  };
}
