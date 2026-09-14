/* Svedah UI Telemetry SDK v1.0.1 - browser bundle */
(function (global) {
  'use strict';

  const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  const DEFAULT_CONFIG = {
    serviceName: 'svedah-web',
    environment: 'development',
    sessionKey: 'svedah_ui_session_state',
    respectDoNotTrack: false,
    maxJourneyEvents: 500,
    sessionIdleTimeoutMs: DEFAULT_SESSION_IDLE_TIMEOUT_MS,
    activityIdleThresholdMs: 30000,
    activityEventThrottleMs: 1000,
    engagementIntervalMs: 30000,
    capture: {
      clicks: true,
      navigation: true,
      forms: true,
      network: true,
      errors: true,
      engagement: true
    },
    privacy: {
      maskInputs: true,
      capturePasswords: false,
      stripQueryString: false
    },
    exporter: {
      type: 'console',
      endpoint: ''
    }
  };

  let instance = null;

  function mergeConfig(base, override) {
    override = override || {};
    return {
      ...base,
      ...override,
      capture: { ...base.capture, ...(override.capture || {}) },
      privacy: { ...base.privacy, ...(override.privacy || {}) },
      exporter: { ...base.exporter, ...(override.exporter || {}) }
    };
  }

  function createHexId(length) {
    let result = '';
    while (result.length < length) result += Math.random().toString(16).slice(2);
    return result.slice(0, length);
  }

  function createSessionState(sessionKey, idleTimeoutMs) {
    const now = Date.now();
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (raw) {
        const existing = JSON.parse(raw);
        const lastSeenAt = Number(existing.lastSeenAt || existing.startedAt || 0);
        const expired = lastSeenAt > 0 && now - lastSeenAt > idleTimeoutMs;
        if (!expired && existing.sessionId && existing.startedAt) {
          const state = { sessionId: existing.sessionId, startedAt: Number(existing.startedAt), lastSeenAt: now };
          sessionStorage.setItem(sessionKey, JSON.stringify(state));
          return state;
        }
      }
      const state = { sessionId: `ses_${createHexId(24)}`, startedAt: now, lastSeenAt: now };
      sessionStorage.setItem(sessionKey, JSON.stringify(state));
      return state;
    } catch {
      return { sessionId: `ses_${createHexId(24)}`, startedAt: now, lastSeenAt: now };
    }
  }

  function touchSession(sessionKey, state) {
    if (!state) return;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({ sessionId: state.sessionId, startedAt: state.startedAt, lastSeenAt: Date.now() }));
    } catch {}
  }

  function cleanText(value, max = 160) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function escapeCss(value) {
    if (global.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }

  function getXPath(element) {
    if (!(element instanceof Element)) return '';
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
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

  function getNearestSection(element) {
    const section = element?.closest?.('section, header, footer, nav, main, [data-section], [data-component]');
    if (!section) return { section_id: '', section_name: '', component_name: '' };
    const heading = section.querySelector?.('h1,h2,h3,[data-section-title]');
    return {
      section_id: section.id || section.getAttribute('data-section') || '',
      section_name: cleanText(section.getAttribute('aria-label') || section.getAttribute('data-section-title') || heading?.innerText || section.id || section.tagName),
      component_name: section.getAttribute('data-component') || section.className || section.tagName.toLowerCase()
    };
  }

  function getElementInfo(element) {
    if (!(element instanceof Element)) return {};
    const testId = element.getAttribute('data-test-id') || element.getAttribute('data-testid') || '';
    const id = element.id || '';
    const role = element.getAttribute('role') || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    const title = element.getAttribute('title') || '';
    const placeholder = element.getAttribute('placeholder') || '';
    const rect = element.getBoundingClientRect();
    let cssSelector = element.tagName.toLowerCase();
    if (testId) cssSelector = `[data-test-id="${testId.replace(/"/g, '\\"')}"]`;
    else if (id) cssSelector = `#${escapeCss(id)}`;
    else if (element.classList.length) cssSelector += '.' + Array.from(element.classList).slice(0, 2).map(escapeCss).join('.');
    return {
      tag: element.tagName,
      text: cleanText(element.innerText || element.value || title || ariaLabel || placeholder),
      id,
      data_test_id: testId,
      role,
      aria_label: ariaLabel,
      title,
      placeholder,
      href: element instanceof HTMLAnchorElement ? element.href : '',
      type: element.getAttribute('type') || '',
      name: element.getAttribute('name') || '',
      css_selector: cssSelector,
      xpath: getXPath(element),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewport_visible: rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth,
      ...getNearestSection(element)
    };
  }

  function createJourney(maxEvents) {
    const events = [];
    const counters = { page_views: 0, clicks: 0, changes: 0, forms_submitted: 0, fetches: 0, outbound_clicks: 0, navigations: 0, errors: 0 };
    function add(record) {
      events.push(record);
      if (events.length > maxEvents) events.shift();
      if (record.event === 'PAGE_VIEW') counters.page_views++;
      if (record.event === 'CLICK') counters.clicks++;
      if (record.event === 'CHANGE' || record.event === 'FORM_FIELD_CHANGE') counters.changes++;
      if (record.event === 'FORM_SUBMIT') counters.forms_submitted++;
      if (record.event === 'FETCH' || record.event === 'XHR') counters.fetches++;
      if (record.event === 'OUTBOUND_CLICK') counters.outbound_clicks++;
      if (record.event === 'SPA_NAVIGATION') counters.navigations++;
      if (record.event === 'ERROR' || record.event === 'UNHANDLED_REJECTION') counters.errors++;
    }
    return { add, getEvents: () => events.slice(), getCounters: () => ({ ...counters, journey_length: events.length }) };
  }

  function createExporter(config) {
    async function exportRecord(record) {
      if (config.type === 'none') return;
      if (config.type === 'http' && config.endpoint) {
        await fetch(config.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record), keepalive: true });
        return;
      }
      console.groupCollapsed(`%c[Svedah UI Telemetry] ${record.event}`, 'color:#f97316;font-weight:700');
      console.table(record);
      console.log(record);
      console.groupEnd();
    }
    return { exportRecord };
  }

  function initTelemetry(userConfig) {
    if (instance) return instance;
    const config = mergeConfig(DEFAULT_CONFIG, userConfig);
    const dnt = navigator.doNotTrack === '1' || global.doNotTrack === '1';
    const disabled = config.respectDoNotTrack && dnt;
    const session = createSessionState(config.sessionKey, config.sessionIdleTimeoutMs);
    const sessionId = session.sessionId;
    const traceId = createHexId(32);
    const journey = createJourney(config.maxJourneyEvents);
    const exporter = createExporter(config.exporter);
    const sessionStart = session.startedAt;
    let visibleStartedAt = document.hidden ? 0 : Date.now();
    let visibleAccumulatedMs = 0;
    let activePeriodStartedAt = 0;
    let lastUserActivityAt = 0;
    let activeAccumulatedMs = 0;
    let lastActivityEventAt = 0;
    let lastUiSpanId = '';

    function normalizeUrl(url) {
      if (!config.privacy.stripQueryString || !url) return url;
      try { const parsed = new URL(url, location.href); parsed.search = ''; return parsed.href; } catch { return url; }
    }

    function closeActivePeriod(now = Date.now()) {
      if (!activePeriodStartedAt || !lastUserActivityAt) return;
      const activeUntil = Math.min(now, lastUserActivityAt + config.activityIdleThresholdMs);
      if (activeUntil > activePeriodStartedAt) activeAccumulatedMs += activeUntil - activePeriodStartedAt;
      activePeriodStartedAt = 0;
      lastUserActivityAt = 0;
    }

    function markUserActivity(force = false) {
      if (document.hidden) return;
      const now = Date.now();
      if (!force && now - lastActivityEventAt < config.activityEventThrottleMs) return;
      lastActivityEventAt = now;
      if (!activePeriodStartedAt || (lastUserActivityAt && now - lastUserActivityAt > config.activityIdleThresholdMs)) {
        closeActivePeriod(now);
        activePeriodStartedAt = now;
      }
      lastUserActivityAt = now;
      touchSession(config.sessionKey, session);
    }

    function getVisibleMs(now = Date.now()) {
      return visibleAccumulatedMs + (visibleStartedAt ? Math.max(0, now - visibleStartedAt) : 0);
    }

    function getActualActiveMs(now = Date.now()) {
      let total = activeAccumulatedMs;
      if (activePeriodStartedAt && lastUserActivityAt) {
        const activeUntil = Math.min(now, lastUserActivityAt + config.activityIdleThresholdMs);
        if (activeUntil > activePeriodStartedAt) total += activeUntil - activePeriodStartedAt;
      }
      return total;
    }

    function getEngagement() {
      const now = Date.now();
      const duration = Math.max(0, Math.round((now - sessionStart) / 1000));
      const visible = Math.round(getVisibleMs(now) / 1000);
      const actualActive = Math.round(getActualActiveMs(now) / 1000);
      const idle = Math.max(0, duration - actualActive);
      return {
        session_duration_seconds: duration,
        visible_time_seconds: visible,
        actual_active_time_seconds: actualActive,
        active_time_seconds: actualActive,
        idle_time_seconds: idle,
        active_ratio: duration > 0 ? Number((actualActive / duration).toFixed(2)) : 0,
        ...journey.getCounters()
      };
    }

    function emit(event, attributes) {
      if (disabled) return null;
      attributes = attributes || {};
      touchSession(config.sessionKey, session);
      const spanId = createHexId(16);
      const record = {
        timestamp: new Date().toISOString(),
        service: config.serviceName,
        environment: config.environment,
        session_id: sessionId,
        trace_id: traceId,
        span_id: spanId,
        parent_ui_span_id: attributes.parent_ui_span_id || lastUiSpanId || '',
        event,
        page_url: normalizeUrl(location.href),
        page_path: location.pathname + location.hash,
        ...attributes,
        ...getEngagement()
      };
      journey.add(record);
      if (['CLICK', 'OUTBOUND_CLICK', 'FORM_FIELD_FOCUS', 'FORM_FIELD_CHANGE', 'FORM_SUBMIT'].includes(event)) lastUiSpanId = spanId;
      exporter.exportRecord(record).catch?.((error) => console.warn('[Svedah UI Telemetry] export failed', error));
      return record;
    }

    function trackPageView(reason) {
      return emit('PAGE_VIEW', { action: 'page_view', reason: reason || 'initial', title: document.title, referrer: document.referrer || '' });
    }

    function isOutboundHref(href) {
      if (!href) return false;
      try { const url = new URL(href, location.href); return url.origin !== location.origin && !['tel:', 'mailto:'].includes(url.protocol); } catch { return false; }
    }

    function trackClick(element) {
      markUserActivity(true);
      const info = getElementInfo(element);
      const outbound = isOutboundHref(info.href);
      return emit(outbound ? 'OUTBOUND_CLICK' : 'CLICK', {
        action: outbound ? 'outbound_click' : 'click',
        element_tag: info.tag || '', element_text: info.text || '', element_id: info.id || '', data_test_id: info.data_test_id || '',
        role: info.role || '', aria_label: info.aria_label || '', title: info.title || '', placeholder: info.placeholder || '',
        href: normalizeUrl(info.href || ''), destination_domain: outbound ? new URL(info.href).hostname : '',
        css_selector: info.css_selector || '', xpath: info.xpath || '', width: info.width || 0, height: info.height || 0,
        viewport_visible: Boolean(info.viewport_visible), component_name: info.component_name || '', section_id: info.section_id || '', section_name: info.section_name || ''
      });
    }

    function trackNavigation(reason, from, to) {
      emit('SPA_NAVIGATION', { action: 'navigation', navigation_reason: reason, from: normalizeUrl(from || ''), to: normalizeUrl(to || '') });
      trackPageView(reason);
    }

    const api = {
      config, sessionId, traceId, emit, trackPageView, trackClick, getElementInfo,
      getJourney: journey.getEvents, getEngagement, markUserActivity,
      createSpanId: () => createHexId(16),
      getCurrentCorrelation: () => ({ trace_id: traceId, parent_ui_span_id: lastUiSpanId })
    };

    function installClicks() {
      document.addEventListener('click', function(event) {
        const element = event.target?.closest?.('a,button,input,select,textarea,[role="button"],[data-test-id],[data-testid]');
        if (element) trackClick(element);
      }, true);
    }

    function installNavigation() {
      const pushState = history.pushState;
      const replaceState = history.replaceState;
      history.pushState = function(...args) { const from = location.href; const result = pushState.apply(this, args); const to = location.href; if (from !== to) trackNavigation('pushState', from, to); return result; };
      history.replaceState = function(...args) { const from = location.href; const result = replaceState.apply(this, args); const to = location.href; if (from !== to) trackNavigation('replaceState', from, to); return result; };
      addEventListener('popstate', () => trackNavigation('popstate', '', location.href));
      addEventListener('hashchange', (event) => trackNavigation('hashchange', event.oldURL, event.newURL));
    }

    function installForms() {
      document.addEventListener('focusin', function(event) {
        const element = event.target?.closest?.('input,select,textarea');
        if (!element) return;
        markUserActivity(true);
        const info = getElementInfo(element);
        emit('FORM_FIELD_FOCUS', { action: 'focus', element_tag: info.tag || '', element_id: info.id || '', data_test_id: info.data_test_id || '', element_type: info.type || '', element_name: info.name || '', form_id: element.form?.id || '', form_test_id: element.form?.getAttribute('data-test-id') || '' });
      }, true);
      document.addEventListener('change', function(event) {
        const element = event.target?.closest?.('input,select,textarea');
        if (!element) return;
        markUserActivity(true);
        const info = getElementInfo(element);
        const sensitive = ['password', 'hidden'].includes((info.type || '').toLowerCase());
        emit('FORM_FIELD_CHANGE', { action: 'change', element_tag: info.tag || '', element_id: info.id || '', data_test_id: info.data_test_id || '', element_type: info.type || '', element_name: info.name || '', input_filled: sensitive ? false : Boolean(element.value), value_length: sensitive ? 0 : String(element.value || '').length, form_id: element.form?.id || '', form_test_id: element.form?.getAttribute('data-test-id') || '' });
      }, true);
      document.addEventListener('submit', function(event) {
        if (!(event.target instanceof HTMLFormElement)) return;
        markUserActivity(true);
        const info = getElementInfo(event.target);
        emit('FORM_SUBMIT', { action: 'submit', form_id: event.target.id || '', data_test_id: info.data_test_id || '', css_selector: info.css_selector || '', field_count: event.target.querySelectorAll('input,select,textarea').length });
      }, true);
    }

    function installNetwork() {
      if (typeof fetch === 'function') {
        const originalFetch = fetch.bind(global);
        global.fetch = async function(...args) {
          const request = args[0];
          const url = typeof request === 'string' ? request : request?.url || '';
          const method = args[1]?.method || request?.method || 'GET';
          const started = performance.now();
          const correlation = api.getCurrentCorrelation();
          try {
            const response = await originalFetch(...args);
            emit('FETCH', { action: 'fetch', request_id: `req_${createHexId(16)}`, method, url: normalizeUrl(new URL(url, location.href).href), status: response.status, duration_ms: Math.round(performance.now() - started), parent_ui_span_id: correlation.parent_ui_span_id || '', correlation_trace_id: correlation.trace_id || '' });
            return response;
          } catch (error) {
            emit('FETCH_ERROR', { action: 'fetch_error', request_id: `req_${createHexId(16)}`, method, url: normalizeUrl(new URL(url, location.href).href), duration_ms: Math.round(performance.now() - started), error: error?.message || String(error), parent_ui_span_id: correlation.parent_ui_span_id || '', correlation_trace_id: correlation.trace_id || '' });
            throw error;
          }
        };
      }

      const OriginalXHR = global.XMLHttpRequest;
      if (OriginalXHR) {
        const open = OriginalXHR.prototype.open;
        const send = OriginalXHR.prototype.send;
        OriginalXHR.prototype.open = function(method, url, ...rest) { this.__svedahTelemetry = { method, url: normalizeUrl(new URL(url, location.href).href) }; return open.call(this, method, url, ...rest); };
        OriginalXHR.prototype.send = function(...args) { const meta = this.__svedahTelemetry || {}; const started = performance.now(); const correlation = api.getCurrentCorrelation(); this.addEventListener('loadend', () => emit('XHR', { action: 'xhr', request_id: `req_${createHexId(16)}`, method: meta.method || '', url: meta.url || '', status: this.status, duration_ms: Math.round(performance.now() - started), parent_ui_span_id: correlation.parent_ui_span_id || '', correlation_trace_id: correlation.trace_id || '' })); return send.apply(this, args); };
      }
    }

    function installErrors() {
      addEventListener('error', (event) => emit('ERROR', { action: 'javascript_error', message: event.message || '', filename: event.filename || '', line: event.lineno || 0, column: event.colno || 0 }));
      addEventListener('unhandledrejection', (event) => emit('UNHANDLED_REJECTION', { action: 'unhandled_rejection', message: event.reason?.message || String(event.reason || '') }));
    }

    function installEngagement() {
      ['click', 'scroll', 'keydown', 'input', 'touchstart'].forEach((name) => addEventListener(name, () => markUserActivity(true), { passive: true }));
      addEventListener('mousemove', () => markUserActivity(false), { passive: true });
      addEventListener('pagehide', () => {
        const now = Date.now();
        if (visibleStartedAt) { visibleAccumulatedMs += now - visibleStartedAt; visibleStartedAt = 0; }
        closeActivePeriod(now);
        emit('SESSION_END', { action: 'session_end' });
      });
      document.addEventListener('visibilitychange', () => {
        const now = Date.now();
        if (document.hidden) {
          if (visibleStartedAt) { visibleAccumulatedMs += now - visibleStartedAt; visibleStartedAt = 0; }
          closeActivePeriod(now);
          emit('SESSION_HIDDEN', { action: 'session_hidden' });
        } else {
          visibleStartedAt = now;
          emit('SESSION_RESUMED', { action: 'session_resumed' });
        }
      });
      setInterval(() => emit('SESSION_ENGAGEMENT', { action: 'session_engagement' }), config.engagementIntervalMs);
    }

    if (config.capture.clicks) installClicks();
    if (config.capture.navigation) installNavigation();
    if (config.capture.forms) installForms();
    if (config.capture.network) installNetwork();
    if (config.capture.errors) installErrors();
    if (config.capture.engagement) installEngagement();

    trackPageView('initial');
    console.info('[Svedah UI Telemetry] initialized', { service: config.serviceName, environment: config.environment, session_id: sessionId, trace_id: traceId, do_not_track: dnt, tracking_disabled: disabled });
    instance = api;
    return api;
  }

  function getTelemetry() { return instance; }

  global.SvedahTelemetry = { init: initTelemetry, initTelemetry, getTelemetry, getElementInfo, version: '1.0.1' };

  const currentScript = document.currentScript;
  if (currentScript && currentScript.getAttribute('data-auto-init') !== 'false') {
    const config = {
      serviceName: currentScript.getAttribute('data-service-name') || currentScript.getAttribute('data-service') || DEFAULT_CONFIG.serviceName,
      environment: currentScript.getAttribute('data-environment') || DEFAULT_CONFIG.environment,
      exporter: { type: currentScript.getAttribute('data-exporter') || 'console', endpoint: currentScript.getAttribute('data-endpoint') || '' },
      respectDoNotTrack: currentScript.getAttribute('data-respect-dnt') === 'true'
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initTelemetry(config));
    else initTelemetry(config);
  }
})(window);
