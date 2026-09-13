import { WebTracerProvider } from 'https://esm.sh/@opentelemetry/sdk-trace-web@2.1.0';
import { ConsoleSpanExporter, SimpleSpanProcessor } from 'https://esm.sh/@opentelemetry/sdk-trace-base@2.1.0';
import { context, trace } from 'https://esm.sh/@opentelemetry/api@1.9.0';
import { ZoneContextManager } from 'https://esm.sh/@opentelemetry/context-zone@2.1.0';
import { DocumentLoadInstrumentation } from 'https://esm.sh/@opentelemetry/instrumentation-document-load@0.67.0';
import { registerInstrumentations } from 'https://esm.sh/@opentelemetry/instrumentation@0.67.0';

const SERVICE_NAME = 'svedah-web';
const RESPECT_DNT = false; // Set true for production privacy behaviour.
const SESSION_KEY = 'svedah_otel_session_id';
const SESSION_ID = getSessionId();

function getSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `ses_${crypto.randomUUID().replaceAll('-', '')}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `ses_${Math.random().toString(16).slice(2)}${Date.now()}`;
  }
}

const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1';
const trackingDisabled = RESPECT_DNT && dnt;

const provider = new WebTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())]
});

provider.register({
  contextManager: new ZoneContextManager()
});

if (!trackingDisabled) {
  registerInstrumentations({
    instrumentations: [new DocumentLoadInstrumentation()]
  });
}

const tracer = trace.getTracer(SERVICE_NAME, '1.0.0');

function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function getElementInfo(element) {
  if (!(element instanceof Element)) return {};

  const testId = element.getAttribute('data-test-id') || '';
  const id = element.id || '';
  const role = element.getAttribute('role') || '';
  const aria = element.getAttribute('aria-label') || '';
  const text = cleanText(element.innerText || element.value || element.getAttribute('title') || '');

  let cssSelector = element.tagName.toLowerCase();
  if (testId) {
    cssSelector += `[data-test-id="${CSS.escape(testId)}"]`;
  } else if (id) {
    cssSelector += `#${CSS.escape(id)}`;
  } else if (element.classList.length) {
    cssSelector += '.' + [...element.classList].slice(0, 2).map(CSS.escape).join('.');
  }

  return {
    tag: element.tagName,
    text,
    id,
    testId,
    role,
    ariaLabel: aria,
    href: element instanceof HTMLAnchorElement ? element.href : '',
    name: element.getAttribute('name') || '',
    type: element.getAttribute('type') || '',
    cssSelector,
    xpath: getXPath(element)
  };
}

function getXPath(element) {
  if (!(element instanceof Element)) return '';
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 12) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  return '/' + parts.join('/');
}

function emitAction(name, attributes = {}, pretty = {}) {
  if (trackingDisabled) return;

  const span = tracer.startSpan(name);
  span.setAttribute('service.name', SERVICE_NAME);
  span.setAttribute('svedah.session_id', SESSION_ID);
  span.setAttribute('svedah.page_url', window.location.href);
  span.setAttribute('svedah.page_path', window.location.pathname + window.location.hash);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') span.setAttribute(key, String(value));
  });
  span.end();

  console.groupCollapsed(`[Svedah UI Telemetry] ${name.toUpperCase()}`);
  console.table({
    session_id: SESSION_ID,
    trace_id: span.spanContext().traceId,
    span_id: span.spanContext().spanId,
    ...pretty
  });
  console.groupEnd();
}

function emitPageView(reason = 'initial-load') {
  emitAction('ui.page_view', {
    'ui.event': 'page_view',
    'ui.navigation_reason': reason,
    'ui.page.title': document.title
  }, {
    action: 'PAGE_VIEW',
    reason,
    page: window.location.pathname + window.location.hash,
    title: document.title
  });
}

function emitClick(element, eventType = 'click') {
  const info = getElementInfo(element);
  emitAction('ui.click', {
    'ui.event': eventType,
    'ui.element.tag': info.tag,
    'ui.element.text': info.text,
    'ui.element.id': info.id,
    'ui.element.test_id': info.testId,
    'ui.element.role': info.role,
    'ui.element.aria_label': info.ariaLabel,
    'ui.element.href': info.href,
    'ui.element.name': info.name,
    'ui.element.type': info.type,
    'ui.selector.css': info.cssSelector,
    'ui.selector.xpath': info.xpath
  }, {
    action: eventType.toUpperCase(),
    element: info.tag,
    text: info.text,
    data_test_id: info.testId || '(none)',
    css_selector: info.cssSelector,
    xpath: info.xpath,
    href: info.href || '(none)',
    page: window.location.pathname + window.location.hash
  });
}

function emitNavigation(reason, from, to) {
  emitAction('ui.navigation', {
    'ui.event': 'navigation',
    'ui.navigation_reason': reason,
    'ui.navigation_from': from,
    'ui.navigation_to': to
  }, {
    action: 'SPA_NAVIGATION',
    reason,
    from,
    to
  });
}

function installHistoryTracking() {
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;

  history.pushState = function (...args) {
    const from = location.href;
    const result = originalPush.apply(this, args);
    const to = location.href;
    if (from !== to) emitNavigation('pushState', from, to);
    return result;
  };

  history.replaceState = function (...args) {
    const from = location.href;
    const result = originalReplace.apply(this, args);
    const to = location.href;
    if (from !== to) emitNavigation('replaceState', from, to);
    return result;
  };

  window.addEventListener('popstate', () => emitNavigation('popstate', document.referrer || '', location.href));
  window.addEventListener('hashchange', (event) => emitNavigation('hashchange', event.oldURL, event.newURL));
}

function installFetchTracking() {
  if (!window.fetch) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url || '';
    const method = args[1]?.method || request?.method || 'GET';
    const start = performance.now();
    try {
      const response = await originalFetch(...args);
      emitAction('ui.fetch', {
        'http.request.method': method,
        'url.full': new URL(url, location.href).href,
        'http.response.status_code': response.status,
        'ui.network.duration_ms': Math.round(performance.now() - start)
      }, {
        action: 'FETCH',
        method,
        url: new URL(url, location.href).href,
        status: response.status,
        duration_ms: Math.round(performance.now() - start)
      });
      return response;
    } catch (error) {
      emitAction('ui.fetch.error', {
        'http.request.method': method,
        'url.full': new URL(url, location.href).href,
        'error.message': error?.message || String(error)
      }, {
        action: 'FETCH_ERROR',
        method,
        url: new URL(url, location.href).href,
        error: error?.message || String(error)
      });
      throw error;
    }
  };
}

function installErrorTracking() {
  window.addEventListener('error', (event) => {
    emitAction('ui.error', {
      'error.type': 'window.error',
      'error.message': event.message,
      'error.filename': event.filename,
      'error.line_number': event.lineno,
      'error.column_number': event.colno
    }, {
      action: 'ERROR',
      message: event.message,
      source: event.filename || '(unknown)',
      line: event.lineno || '',
      column: event.colno || ''
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    emitAction('ui.error', {
      'error.type': 'unhandledrejection',
      'error.message': event.reason?.message || String(event.reason || '')
    }, {
      action: 'UNHANDLED_REJECTION',
      message: event.reason?.message || String(event.reason || '')
    });
  });
}

function installClickTracking() {
  document.addEventListener('click', (event) => {
    const element = event.target?.closest?.('a,button,input,select,textarea,[role="button"],[data-test-id]');
    if (element) emitClick(element);
  }, true);

  document.addEventListener('change', (event) => {
    const element = event.target?.closest?.('input,select,textarea');
    if (!element) return;
    const info = getElementInfo(element);
    emitAction('ui.change', {
      'ui.event': 'change',
      'ui.element.tag': info.tag,
      'ui.element.id': info.id,
      'ui.element.test_id': info.testId,
      'ui.element.type': info.type
    }, {
      action: 'CHANGE',
      element: info.tag,
      data_test_id: info.testId || '(none)',
      type: info.type || '(none)'
    });
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    const info = getElementInfo(form);
    emitAction('ui.form.submit', {
      'ui.event': 'form_submit',
      'ui.form.id': form.id || '',
      'ui.form.test_id': form.getAttribute('data-test-id') || '',
      'ui.selector.css': info.cssSelector
    }, {
      action: 'FORM_SUBMIT',
      form_id: form.id || '(none)',
      data_test_id: form.getAttribute('data-test-id') || '(none)'
    });
  }, true);
}

if (!trackingDisabled) {
  installClickTracking();
  installHistoryTracking();
  installFetchTracking();
  installErrorTracking();
  emitPageView();
}

console.info('[Svedah OTel] initialized', {
  service: SERVICE_NAME,
  sessionId: SESSION_ID,
  doNotTrack: dnt,
  trackingDisabled,
  mode: 'ConsoleSpanExporter'
});
