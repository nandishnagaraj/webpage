import { createExporter } from './exporter.js';

const DEFAULT_CONFIG = {
  serviceName: 'svedah',
  environment: 'test',
  exporter: { type: 'console' },
  capture: {
    clicks: true,
    navigation: true,
    forms: true,
    network: true,
    errors: true,
    journey: true,
    engagement: true,
    outbound: true
  },
  privacy: {
    respectDoNotTrack: false,
    maskInputs: true,
    capturePasswords: false
  },
  session: {
    idleTimeoutMs: 30000,
    resetAfterInactiveMs: 30 * 60 * 1000
  },
  network: {
    ignoreUrls: [
      '/v1/telemetry/events',
      'localhost:8080/v1/telemetry/events'
    ]
  }
};

let initialized = false;
let config = DEFAULT_CONFIG;
let exporter = null;
let journey = [];
let counters = {
  page_views: 0,
  clicks: 0,
  changes: 0,
  forms_submitted: 0,
  fetches: 0,
  outbound_clicks: 0,
  navigations: 0,
  errors: 0
};
let session = null;
let currentTraceId = createHexId(32);
let lastUiSpanId = null;
let engagementTimer = null;
let lastVisibilityStart = null;
let visibleTimeMs = 0;
let activeTimeMs = 0;
let lastActivityAt = 0;
let activeWindowStartedAt = null;
let originalFetch = null;
let originalXhrOpen = null;
let originalXhrSend = null;

function deepMerge(target, source) {
  const output = { ...target };
  Object.keys(source || {}).forEach((key) => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(output[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  });
  return output;
}

function createHexId(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

function now() {
  return Date.now();
}

function readSession() {
  const raw = sessionStorage.getItem('svedah_ui_session');
  const current = now();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.last_seen_at && current - parsed.last_seen_at <= config.session.resetAfterInactiveMs) {
        return parsed;
      }
    } catch {}
  }

  return {
    session_id: `ses_${createHexId(24)}`,
    started_at: current,
    last_seen_at: current
  };
}

function saveSession() {
  if (!session) return;
  session.last_seen_at = now();
  sessionStorage.setItem('svedah_ui_session', JSON.stringify(session));
}

function seconds(ms) {
  return Math.max(0, Math.round(ms / 1000));
}

function markActivity() {
  const current = now();
  lastActivityAt = current;

  if (document.visibilityState === 'hidden') return;

  if (activeWindowStartedAt === null) {
    activeWindowStartedAt = current;
  }
}

function closeActiveWindow() {
  if (activeWindowStartedAt === null) return;
  const current = now();
  const maxActiveUntil = Math.min(current, lastActivityAt + config.session.idleTimeoutMs);
  if (maxActiveUntil > activeWindowStartedAt) {
    activeTimeMs += maxActiveUntil - activeWindowStartedAt;
  }
  activeWindowStartedAt = null;
}

function updateActiveTime() {
  if (activeWindowStartedAt === null) return;
  const current = now();
  if (current - lastActivityAt > config.session.idleTimeoutMs) {
    closeActiveWindow();
  }
}

function updateVisibleTime() {
  if (document.visibilityState === 'visible' && lastVisibilityStart !== null) {
    const current = now();
    visibleTimeMs += current - lastVisibilityStart;
    lastVisibilityStart = current;
  }
}

function getEngagement() {
  updateActiveTime();
  updateVisibleTime();
  const durationMs = now() - session.started_at;
  const actualActiveSeconds = seconds(activeTimeMs);
  return {
    session_duration_seconds: seconds(durationMs),
    visible_time_seconds: seconds(visibleTimeMs),
    actual_active_time_seconds: actualActiveSeconds,
    active_time_seconds: actualActiveSeconds,
    idle_time_seconds: Math.max(0, seconds(durationMs) - actualActiveSeconds),
    active_ratio: durationMs > 0 ? Number((activeTimeMs / durationMs).toFixed(2)) : 0,
    ...counters,
    journey_length: journey.length
  };
}

function createSpan() {
  return {
    trace_id: currentTraceId,
    span_id: createHexId(16),
    parent_ui_span_id: lastUiSpanId
  };
}

function emit(eventName, attributes = {}, options = {}) {
  if (!session) return null;

  saveSession();
  const span = createSpan();
  if (options.uiSpan !== false) lastUiSpanId = span.span_id;

  const record = {
    timestamp: new Date().toISOString(),
    service: config.serviceName,
    environment: config.environment,
    session_id: session.session_id,
    trace_id: span.trace_id,
    span_id: span.span_id,
    parent_ui_span_id: span.parent_ui_span_id,
    event: eventName,
    page_url: window.location.href,
    page_path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    ...attributes
  };

  if (config.capture.journey) journey.push(record);
  exporter.enqueue(record);
  return record;
}

function getText(element) {
  return (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function getSelector(element) {
  if (!element || !element.tagName) return '';
  const testId = element.getAttribute('data-test-id');
  if (testId) return `[data-test-id="${testId}"]`;
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 && current !== document.body && parts.length < 5) {
    let part = current.tagName.toLowerCase();
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(' > ');
}

function getXPath(element) {
  if (!element || element.nodeType !== 1) return '';
  const parts = [];
  let current = element;
  while (current && current.nodeType === 1) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  return `/${parts.join('/')}`;
}

function getSection(element) {
  const section = element.closest('section, header, footer, nav');
  if (!section) return {};
  const heading = section.querySelector('h1,h2,h3');
  return {
    section_id: section.id || undefined,
    section_name: heading ? getText(heading) : section.tagName.toLowerCase()
  };
}

function getElementInfo(element) {
  const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : {};
  return {
    data_test_id: element.getAttribute('data-test-id') || undefined,
    element_tag: element.tagName,
    element_text: getText(element),
    element_id: element.id || undefined,
    role: element.getAttribute('role') || undefined,
    aria_label: element.getAttribute('aria-label') || undefined,
    title: element.getAttribute('title') || undefined,
    placeholder: element.getAttribute('placeholder') || undefined,
    type: element.getAttribute('type') || undefined,
    name: element.getAttribute('name') || undefined,
    href: element.href || undefined,
    css_selector: getSelector(element),
    xpath: getXPath(element),
    width: Math.round(rect.width || 0),
    height: Math.round(rect.height || 0),
    viewport_visible: Boolean(rect.width && rect.height && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth),
    component_name: element.closest('[data-component]')?.getAttribute('data-component') || undefined,
    ...getSection(element)
  };
}

function isOutboundLink(element) {
  if (!element.href) return false;
  try {
    return new URL(element.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function trackClick(event) {
  if (!config.capture.clicks) return;
  const element = event.target.closest('a,button,input,select,textarea,[role="button"],[data-test-id]');
  if (!element) return;
  markActivity();
  counters.clicks += 1;
  const info = getElementInfo(element);

  if (config.capture.outbound && element.tagName === 'A' && isOutboundLink(element)) {
    counters.outbound_clicks += 1;
    emit('OUTBOUND_CLICK', {
      action: 'outbound_click',
      destination_domain: new URL(element.href).hostname,
      destination_url: element.href,
      ...info,
      ...getEngagement()
    });
    return;
  }

  emit('CLICK', {
    action: 'click',
    ...info,
    ...getEngagement()
  });
}

function trackFieldChange(event) {
  if (!config.capture.forms) return;
  const element = event.target;
  if (!element || !['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) return;
  markActivity();
  counters.changes += 1;
  const sensitive = ['password', 'hidden'].includes((element.type || '').toLowerCase());
  emit('FORM_FIELD_CHANGE', {
    action: 'form_field_change',
    ...getElementInfo(element),
    input_filled: Boolean(element.value),
    value_length: sensitive ? undefined : String(element.value || '').length,
    ...getEngagement()
  });
}

function trackFormSubmit(event) {
  if (!config.capture.forms) return;
  markActivity();
  counters.forms_submitted += 1;
  emit('FORM_SUBMIT', {
    action: 'form_submit',
    ...getElementInfo(event.target),
    ...getEngagement()
  });
}

function trackNavigation(action, fromUrl, toUrl) {
  if (!config.capture.navigation) return;
  counters.navigations += 1;
  emit('SPA_NAVIGATION', {
    action,
    from_url: fromUrl,
    to_url: toUrl,
    ...getEngagement()
  });
}

function patchNavigation() {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushState(...args) {
    const fromUrl = window.location.href;
    const result = originalPushState.apply(this, args);
    trackNavigation('pushState', fromUrl, window.location.href);
    return result;
  };

  history.replaceState = function replaceState(...args) {
    const fromUrl = window.location.href;
    const result = originalReplaceState.apply(this, args);
    trackNavigation('replaceState', fromUrl, window.location.href);
    return result;
  };

  window.addEventListener('popstate', () => trackNavigation('popstate', '', window.location.href));
  window.addEventListener('hashchange', (event) => trackNavigation('hashchange', event.oldURL, event.newURL));
}

function normalizeUrlForCompare(value) {
  if (!value) return '';
  try {
    if (typeof value === 'string') return value;
    if (value.url) return value.url;
  } catch {}
  return String(value || '');
}

function getIgnoredNetworkUrls() {
  const ignored = Array.isArray(config.network?.ignoreUrls) ? [...config.network.ignoreUrls] : [];
  const endpoint = config.exporter?.endpoint;
  if (endpoint) ignored.push(endpoint);
  return ignored.filter(Boolean);
}

function shouldIgnoreNetworkTelemetry(url) {
  const normalizedUrl = normalizeUrlForCompare(url);
  if (!normalizedUrl) return false;
  return getIgnoredNetworkUrls().some((ignoredUrl) => normalizedUrl.includes(ignoredUrl));
}

function patchNetwork() {
  if (!config.capture.network) return;

  originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = async function instrumentedFetch(input, init = {}) {
      const startedAt = performance.now();
      const method = init.method || 'GET';
      const url = typeof input === 'string' ? input : input?.url;
      const ignoreTelemetry = shouldIgnoreNetworkTelemetry(url);
      const requestId = `req_${createHexId(12)}`;
      try {
        const response = await originalFetch.apply(this, arguments);
        if (!ignoreTelemetry) {
          counters.fetches += 1;
          emit('FETCH', {
            action: 'fetch',
            request_id: requestId,
            method,
            url,
            status: response.status,
            duration_ms: Math.round(performance.now() - startedAt),
            ...getEngagement()
          }, { uiSpan: false });
        }
        return response;
      } catch (error) {
        if (!ignoreTelemetry) {
          counters.errors += 1;
          emit('FETCH_ERROR', {
            action: 'fetch_error',
            request_id: requestId,
            method,
            url,
            error_message: error.message,
            duration_ms: Math.round(performance.now() - startedAt),
            ...getEngagement()
          }, { uiSpan: false });
        }
        throw error;
      }
    };
  }

  originalXhrOpen = XMLHttpRequest.prototype.open;
  originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function open(method, url) {
    this.__svedah = { method, url };
    return originalXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function send() {
    const startedAt = performance.now();
    const xhr = this;
    xhr.addEventListener('loadend', () => {
      if (shouldIgnoreNetworkTelemetry(xhr.__svedah?.url)) return;
      counters.fetches += 1;
      emit('XHR', {
        action: 'xhr',
        request_id: `xhr_${createHexId(12)}`,
        method: xhr.__svedah?.method,
        url: xhr.__svedah?.url,
        status: xhr.status,
        duration_ms: Math.round(performance.now() - startedAt),
        ...getEngagement()
      }, { uiSpan: false });
    });
    return originalXhrSend.apply(this, arguments);
  };
}

function trackErrors() {
  if (!config.capture.errors) return;
  window.addEventListener('error', (event) => {
    counters.errors += 1;
    emit('ERROR', {
      action: 'error',
      error_message: event.message,
      file: event.filename,
      line: event.lineno,
      column: event.colno,
      ...getEngagement()
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    counters.errors += 1;
    emit('UNHANDLED_REJECTION', {
      action: 'unhandled_rejection',
      error_message: String(event.reason?.message || event.reason || ''),
      ...getEngagement()
    });
  });
}

function startEngagementTracking() {
  lastVisibilityStart = document.visibilityState === 'visible' ? now() : null;
  ['click', 'scroll', 'keydown', 'input', 'touchstart'].forEach((eventName) => {
    window.addEventListener(eventName, markActivity, { passive: true, capture: true });
  });
  let lastMouseMove = 0;
  window.addEventListener('mousemove', () => {
    const current = now();
    if (current - lastMouseMove > 1000) {
      lastMouseMove = current;
      markActivity();
    }
  }, { passive: true, capture: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      updateVisibleTime();
      closeActiveWindow();
      emit('SESSION_HIDDEN', { action: 'session_hidden', ...getEngagement() });
    } else {
      lastVisibilityStart = now();
      emit('SESSION_RESUMED', { action: 'session_resumed', ...getEngagement() });
    }
  });

  engagementTimer = window.setInterval(() => {
    emit('SESSION_ENGAGEMENT', { action: 'session_engagement', ...getEngagement() });
  }, 30000);

  window.addEventListener('pagehide', () => {
    updateVisibleTime();
    closeActiveWindow();
    emit('SESSION_END', { action: 'session_end', ...getEngagement() });
    exporter.flush?.();
  });
}

export function initTelemetry(userConfig = {}) {
  if (initialized) return window.SvedahTelemetry;
  config = deepMerge(DEFAULT_CONFIG, userConfig);

  if (config.privacy.respectDoNotTrack && navigator.doNotTrack === '1') {
    return window.SvedahTelemetry;
  }

  exporter = createExporter(config);
  session = readSession();
  saveSession();

  document.addEventListener('click', trackClick, true);
  document.addEventListener('change', trackFieldChange, true);
  document.addEventListener('submit', trackFormSubmit, true);
  patchNavigation();
  patchNetwork();
  trackErrors();
  startEngagementTracking();

  counters.page_views += 1;
  emit('PAGE_VIEW', { action: 'page_view', ...getEngagement() });

  initialized = true;
  return window.SvedahTelemetry;
}

export function getTelemetry() {
  return {
    getSession: () => ({ ...session }),
    getJourney: () => [...journey],
    getEngagement,
    shouldIgnoreNetworkTelemetry,
    flush: () => exporter?.flush?.()
  };
}

if (typeof window !== 'undefined') {
  window.SvedahTelemetry = {
    init: initTelemetry,
    getTelemetry,
    getJourney: () => [...journey],
    getSession: () => ({ ...session }),
    shouldIgnoreNetworkTelemetry,
    emit,
    flush: () => exporter?.flush?.()
  };

  const script = document.currentScript;
  if (script && script.dataset && script.dataset.autoInit !== 'false') {
    const exporterType = script.dataset.exporter || 'console';
    const endpoint = script.dataset.endpoint;
    initTelemetry({
      serviceName: script.dataset.serviceName || 'svedah',
      environment: script.dataset.environment || 'test',
      exporter: exporterType === 'http' ? { type: 'http', endpoint } : { type: 'console' }
    });
  }
}
