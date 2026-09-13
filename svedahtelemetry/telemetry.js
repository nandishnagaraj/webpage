(() => {
  'use strict';

  const CONFIG = {
    serviceName: 'svedah-web',
    sessionKey: 'svedah_ui_session_id',
    idleTimeoutMs: 30000,
    engagementFlushMs: 5000,
    maxJourneyEvents: 250,
    maxFieldEventsPerField: 20,
    captureInputs: true,
    respectDoNotTrack: false,
    captureFetch: true,
    captureXHR: true,
    capturePerformance: true
  };

  const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const disabled = CONFIG.respectDoNotTrack && dnt;
  const SESSION_ID = getSessionId();
  const SESSION_START = Date.now();
  const JOURNEY = [];
  const FIELD_COUNTS = new Map();
  const componentRegistry = new WeakMap();

  let activeTimeMs = 0;
  let lastActivityAt = Date.now();
  let activeTimer = null;
  let sessionEnded = false;
  let currentJourneyId = createId('journey');

  function getSessionId() {
    try {
      const existing = sessionStorage.getItem(CONFIG.sessionKey);
      if (existing) return existing;
      const id = `ses_${createHexId(24)}`;
      sessionStorage.setItem(CONFIG.sessionKey, id);
      return id;
    } catch {
      return `ses_${createHexId(24)}`;
    }
  }

  function createHexId(length) {
    let result = '';
    while (result.length < length) result += Math.random().toString(16).slice(2);
    return result.slice(0, length);
  }

  function createId(prefix) {
    return `${prefix}_${createHexId(16)}`;
  }

  function cleanText(value, max = 160) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getSection(element) {
    if (!(element instanceof Element)) return {};

    const section = element.closest('section, header, nav, footer, main, [data-test-section]');
    if (!section) return {};

    return {
      section_id: section.id || section.getAttribute('data-test-section') || '',
      section_test_id: section.getAttribute('data-test-id') || '',
      section_name: cleanText(
        section.getAttribute('aria-label') ||
        section.querySelector('h1,h2,h3')?.textContent ||
        section.id ||
        ''
      )
    };
  }

  function getComponent(element) {
    if (!(element instanceof Element)) return {};

    const component = element.closest(
      '[data-component],[data-component-name],[data-test-component],.service-card,.program-card,.session-card,.testimonial-card,.philosophy-card,.card'
    );

    if (!component) return {};

    const componentName =
      component.getAttribute('data-component-name') ||
      component.getAttribute('data-component') ||
      component.getAttribute('data-test-component') ||
      component.classList.value.split(/\s+/).find(c => /card|program|session|testimonial|philosophy/.test(c)) ||
      '';

    return {
      component_name: cleanText(componentName, 100),
      component_test_id: component.getAttribute('data-test-id') || '',
      component_id: component.id || ''
    };
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

    return `/${parts.join('/')}`;
  }

  function escapeCss(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }

  function getUniqueCssSelector(element) {
    if (!(element instanceof Element)) return '';

    const testId = element.getAttribute('data-test-id');
    if (testId) return `[data-test-id="${testId.replace(/"/g, '\\"')}"]`;

    if (element.id) return `#${escapeCss(element.id)}`;

    const tag = element.tagName.toLowerCase();
    const stableAttrs = ['name', 'aria-label', 'href', 'type', 'title'];
    for (const attr of stableAttrs) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const selector = `${tag}[${attr}="${value.replace(/"/g, '\\"')}"]`;
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch {}
    }

    const classes = Array.from(element.classList).filter(Boolean).slice(0, 2);
    let selector = tag + classes.map(c => `.${escapeCss(c)}`).join('');

    try {
      if (document.querySelectorAll(selector).length === 1) return selector;
    } catch {}

    let current = element;
    const parts = [];
    while (current && current instanceof Element && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += `#${escapeCss(current.id)}`;
        parts.unshift(part);
        break;
      }
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(el => el.tagName === current.tagName)
        : [];
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function getElementInfo(element) {
    if (!(element instanceof Element)) return {};

    const section = getSection(element);
    const component = getComponent(element);
    const testId = element.getAttribute('data-test-id') || '';
    const id = element.id || '';
    const role = element.getAttribute('role') || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    const title = element.getAttribute('title') || '';
    const placeholder = element.getAttribute('placeholder') || '';
    const type = element.getAttribute('type') || '';
    const name = element.getAttribute('name') || '';
    const text = cleanText(
      element.innerText ||
      element.value ||
      ariaLabel ||
      title ||
      ''
    );

    const rect = element.getBoundingClientRect();

    return {
      tag: element.tagName,
      text,
      id,
      data_test_id: testId,
      role,
      aria_label: ariaLabel,
      title,
      placeholder,
      type,
      name,
      href: element instanceof HTMLAnchorElement ? element.href : '',
      css_selector: getUniqueCssSelector(element),
      xpath: getXPath(element),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      viewport_visible: rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
      ...component,
      ...section
    };
  }

  function createTraceContext() {
    return {
      trace_id: createHexId(32),
      span_id: createHexId(16)
    };
  }

  function addJourneyEvent(record) {
    JOURNEY.push({
      sequence: JOURNEY.length + 1,
      timestamp: record.timestamp,
      event: record.event,
      trace_id: record.trace_id,
      span_id: record.span_id,
      action: record.action || '',
      data_test_id: record.data_test_id || '',
      element_text: record.element_text || '',
      page_path: record.page_path || '',
      target_url: record.href || record.to || record.url || ''
    });

    if (JOURNEY.length > CONFIG.maxJourneyEvents) JOURNEY.shift();
    JOURNEY.forEach((item, index) => item.sequence = index + 1);
  }

  function emit(event, attributes = {}, options = {}) {
    if (disabled) return null;

    const trace = createTraceContext();
    const record = {
      timestamp: nowIso(),
      service: CONFIG.serviceName,
      session_id: SESSION_ID,
      journey_id: currentJourneyId,
      trace_id: trace.trace_id,
      span_id: trace.span_id,
      event,
      page_url: location.href,
      page_path: location.pathname + location.hash,
      document_title: document.title,
      ...attributes
    };

    if (!options.skipJourney && event !== 'SESSION_ENGAGEMENT') {
      addJourneyEvent(record);
    }

    console.groupCollapsed(
      `%c[Svedah UI Telemetry] ${event}`,
      'color:#f97316;font-weight:700'
    );
    console.table(record);
    console.log('Full event:', record);
    if (event === 'SESSION_ENGAGEMENT') {
      console.log('User journey:', JOURNEY);
    }
    console.groupEnd();

    return record;
  }

  // ----------------------------
  // Engagement tracking
  // ----------------------------

  function markActivity(reason) {
    const now = Date.now();
    const delta = now - lastActivityAt;
    if (!document.hidden && delta > 0 && delta <= CONFIG.idleTimeoutMs) {
      activeTimeMs += delta;
    }
    lastActivityAt = now;

    if (reason && reason !== 'mousemove') {
      window.SvedahTelemetryLastActivity = reason;
    }
  }

  function startEngagementTimer() {
    activeTimer = window.setInterval(() => {
      markActivity('timer');
    }, CONFIG.engagementFlushMs);
  }

  function getEngagementSnapshot() {
    const now = Date.now();
    markActivity('snapshot');
    const elapsed = now - SESSION_START;
    const active = Math.min(activeTimeMs, elapsed);
    const activeRatio = elapsed > 0 ? active / elapsed : 0;

    return {
      session_duration_ms: elapsed,
      session_duration_seconds: Math.round(elapsed / 1000),
      active_time_ms: Math.round(active),
      active_time_seconds: Math.round(active / 1000),
      active_ratio: Number(activeRatio.toFixed(3)),
      clicks: JOURNEY.filter(x => x.event === 'CLICK').length,
      page_views: JOURNEY.filter(x => x.event === 'PAGE_VIEW').length,
      navigations: JOURNEY.filter(x => x.event === 'SPA_NAVIGATION').length,
      forms_submitted: JOURNEY.filter(x => x.event === 'FORM_SUBMIT').length,
      fetches: JOURNEY.filter(x => x.event === 'FETCH').length,
      outbound_clicks: JOURNEY.filter(x => x.event === 'OUTBOUND_CLICK').length,
      journey_length: JOURNEY.length
    };
  }

  function emitEngagement(reason) {
    emit('SESSION_ENGAGEMENT', {
      action: 'engagement',
      reason,
      ...getEngagementSnapshot()
    }, { skipJourney: true });
  }

  // ----------------------------
  // UI actions
  // ----------------------------

  function trackPageView(reason = 'initial') {
    emit('PAGE_VIEW', {
      action: 'page_view',
      reason,
      referrer: document.referrer || '',
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio || 1
    });
  }

  function trackClick(element) {
    const info = getElementInfo(element);
    const external = isOutbound(info.href);

    emit(external ? 'OUTBOUND_CLICK' : 'CLICK', {
      action: external ? 'outbound_click' : 'click',
      element_tag: info.tag || '',
      element_text: info.text || '',
      element_id: info.id || '',
      data_test_id: info.data_test_id || '',
      role: info.role || '',
      aria_label: info.aria_label || '',
      title: info.title || '',
      placeholder: info.placeholder || '',
      type: info.type || '',
      name: info.name || '',
      href: info.href || '',
      css_selector: info.css_selector || '',
      xpath: info.xpath || '',
      width: info.width,
      height: info.height,
      viewport_visible: info.viewport_visible,
      destination_domain: external ? safeUrl(info.href)?.hostname || '' : '',
      ...pickComponentAndSection(info)
    });
  }

  function pickComponentAndSection(info) {
    const keys = [
      'component_name','component_test_id','component_id',
      'section_id','section_test_id','section_name'
    ];
    return Object.fromEntries(keys.filter(k => info[k] !== undefined).map(k => [k, info[k]]));
  }

  function trackChange(element) {
    const info = getElementInfo(element);
    if (!CONFIG.captureInputs) return;

    const fieldKey = info.data_test_id || info.name || info.id || info.css_selector || info.tag;
    const count = FIELD_COUNTS.get(fieldKey) || 0;
    if (count >= CONFIG.maxFieldEventsPerField) return;
    FIELD_COUNTS.set(fieldKey, count + 1);

    emit('FORM_FIELD_CHANGE', {
      action: 'change',
      element_tag: info.tag || '',
      element_id: info.id || '',
      data_test_id: info.data_test_id || '',
      element_type: info.type || '',
      element_name: info.name || '',
      placeholder: info.placeholder || '',
      input_filled: fieldHasValue(element),
      value_length: getSafeValueLength(element),
      ...pickComponentAndSection(info)
    });
  }

  function fieldHasValue(element) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    return String(element.value || '').length > 0;
  }

  function getSafeValueLength(element) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return 0;
    if (element instanceof HTMLInputElement && ['password','hidden'].includes(element.type)) return 0;
    return String(element.value || '').length;
  }

  function trackSubmit(form) {
    const info = getElementInfo(form);
    emit('FORM_SUBMIT', {
      action: 'submit',
      form_id: form.id || '',
      form_test_id: info.data_test_id || '',
      css_selector: info.css_selector || '',
      field_count: form.elements ? form.elements.length : 0,
      ...pickComponentAndSection(info)
    });
  }

  // ----------------------------
  // SPA navigation
  // ----------------------------

  function trackNavigation(reason, from, to) {
    emit('SPA_NAVIGATION', {
      action: 'navigation',
      navigation_reason: reason,
      from: from || '',
      to: to || '',
      from_path: safeUrl(from)?.pathname || '',
      to_path: safeUrl(to)?.pathname || '',
      from_hash: safeUrl(from)?.hash || '',
      to_hash: safeUrl(to)?.hash || ''
    });
    trackPageView(reason);
  }

  function installNavigation() {
    const pushState = history.pushState;
    const replaceState = history.replaceState;

    history.pushState = function (...args) {
      const from = location.href;
      const result = pushState.apply(this, args);
      const to = location.href;
      if (from !== to) trackNavigation('pushState', from, to);
      return result;
    };

    history.replaceState = function (...args) {
      const from = location.href;
      const result = replaceState.apply(this, args);
      const to = location.href;
      if (from !== to) trackNavigation('replaceState', from, to);
      return result;
    };

    window.addEventListener('popstate', () => {
      trackNavigation('popstate', '', location.href);
    });

    window.addEventListener('hashchange', event => {
      trackNavigation('hashchange', event.oldURL, event.newURL);
    });
  }

  // ----------------------------
  // Network correlation
  // ----------------------------

  function installFetch() {
    if (!CONFIG.captureFetch || typeof window.fetch !== 'function') return;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const request = args[0];
      const url = typeof request === 'string' ? request : request?.url || '';
      const method = args[1]?.method || request?.method || 'GET';
      const requestId = createId('req');
      const started = performance.now();
      const parentUiEvent = JOURNEY[JOURNEY.length - 1];

      const networkTrace = createTraceContext();

      try {
        const response = await originalFetch(...args);
        emit('FETCH', {
          action: 'fetch',
          request_id: requestId,
          correlation_trace_id: networkTrace.trace_id,
          correlation_span_id: networkTrace.span_id,
          parent_ui_span_id: parentUiEvent?.span_id || '',
          method: String(method).toUpperCase(),
          url: safeUrl(url)?.href || url,
          status: response.status,
          ok: response.ok,
          duration_ms: Math.round(performance.now() - started),
          destination_domain: safeUrl(url)?.hostname || ''
        });
        return response;
      } catch (error) {
        emit('FETCH_ERROR', {
          action: 'fetch_error',
          request_id: requestId,
          correlation_trace_id: networkTrace.trace_id,
          correlation_span_id: networkTrace.span_id,
          parent_ui_span_id: parentUiEvent?.span_id || '',
          method: String(method).toUpperCase(),
          url: safeUrl(url)?.href || url,
          duration_ms: Math.round(performance.now() - started),
          error: error?.message || String(error)
        });
        throw error;
      }
    };
  }

  function installXHR() {
    if (!CONFIG.captureXHR || !window.XMLHttpRequest) return;

    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__svedahTelemetry = {
        request_id: createId('req'),
        method: String(method || 'GET').toUpperCase(),
        url: safeUrl(url)?.href || String(url || ''),
        started: 0,
        networkTrace: createTraceContext()
      };
      return open.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const meta = this.__svedahTelemetry || {
        request_id: createId('req'),
        method: 'GET',
        url: '',
        networkTrace: createTraceContext()
      };

      meta.started = performance.now();
      const parentUiEvent = JOURNEY[JOURNEY.length - 1];

      const complete = () => {
        emit('XHR', {
          action: 'xhr',
          request_id: meta.request_id,
          correlation_trace_id: meta.networkTrace.trace_id,
          correlation_span_id: meta.networkTrace.span_id,
          parent_ui_span_id: parentUiEvent?.span_id || '',
          method: meta.method,
          url: meta.url,
          status: this.status,
          duration_ms: Math.round(performance.now() - meta.started),
          ok: this.status >= 200 && this.status < 400
        });
      };

      this.addEventListener('loadend', complete, { once: true });
      return send.call(this, body);
    };
  }

  // ----------------------------
  // Errors
  // ----------------------------

  function installErrors() {
    window.addEventListener('error', event => {
      emit('ERROR', {
        action: 'javascript_error',
        message: event.message || '',
        filename: event.filename || '',
        line: event.lineno || 0,
        column: event.colno || 0
      });
    });

    window.addEventListener('unhandledrejection', event => {
      emit('UNHANDLED_REJECTION', {
        action: 'unhandled_rejection',
        message: event.reason?.message || String(event.reason || '')
      });
    });
  }

  // ----------------------------
  // Visibility / session end
  // ----------------------------

  function installVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        markActivity('hidden');
        emitEngagement('visibility_hidden');
      } else {
        lastActivityAt = Date.now();
        emit('SESSION_RESUMED', {
          action: 'session_resumed'
        });
      }
    });

    window.addEventListener('pagehide', () => {
      endSession('pagehide');
    });

    window.addEventListener('beforeunload', () => {
      endSession('beforeunload');
    });
  }

  function endSession(reason) {
    if (sessionEnded) return;
    sessionEnded = true;
    if (activeTimer) window.clearInterval(activeTimer);
    emit('SESSION_END', {
      action: 'session_end',
      reason,
      ...getEngagementSnapshot(),
      journey: JOURNEY.slice(-50)
    }, { skipJourney: true });
  }

  // ----------------------------
  // Performance
  // ----------------------------

  function installPerformance() {
    if (!CONFIG.capturePerformance || !('performance' in window)) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        emit('PAGE_PERFORMANCE', {
          action: 'page_performance',
          dns_ms: nav ? Math.round(nav.domainLookupEnd - nav.domainLookupStart) : 0,
          tcp_ms: nav ? Math.round(nav.connectEnd - nav.connectStart) : 0,
          request_ms: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
          response_ms: nav ? Math.round(nav.responseEnd - nav.responseStart) : 0,
          dom_interactive_ms: nav ? Math.round(nav.domInteractive) : 0,
          dom_complete_ms: nav ? Math.round(nav.domComplete) : 0,
          load_event_ms: nav ? Math.round(nav.loadEventEnd) : 0
        });
      }, 0);
    }, { once: true });
  }

  // ----------------------------
  // Observability helpers
  // ----------------------------

  function isOutbound(href) {
    if (!href) return false;
    const url = safeUrl(href);
    if (!url) return false;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.origin !== location.origin;
  }

  function safeUrl(value) {
    try {
      return new URL(value, location.href);
    } catch {
      return null;
    }
  }

  function installGlobalActivity() {
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(type => {
      window.addEventListener(type, () => markActivity(type), { passive: true, capture: true });
    });
  }

  // ----------------------------
  // Init
  // ----------------------------

  if (!disabled) {
    document.addEventListener('click', event => {
      const element = event.target?.closest?.(
        'a,button,input,select,textarea,[role="button"],[data-test-id]'
      );
      if (element) {
        markActivity('click');
        trackClick(element);
      }
    }, true);

    document.addEventListener('change', event => {
      const element = event.target?.closest?.('input,select,textarea');
      if (element) {
        markActivity('change');
        trackChange(element);
      }
    }, true);

    document.addEventListener('focusin', event => {
      const element = event.target?.closest?.('input,select,textarea');
      if (!element || !CONFIG.captureInputs) return;

      const info = getElementInfo(element);
      emit('FORM_FIELD_FOCUS', {
        action: 'focus',
        element_tag: info.tag || '',
        element_id: info.id || '',
        data_test_id: info.data_test_id || '',
        element_type: info.type || '',
        element_name: info.name || '',
        placeholder: info.placeholder || '',
        ...pickComponentAndSection(info)
      });
    }, true);

    document.addEventListener('submit', event => {
      if (event.target instanceof HTMLFormElement) {
        markActivity('submit');
        trackSubmit(event.target);
      }
    }, true);

    installNavigation();
    installFetch();
    installXHR();
    installErrors();
    installVisibility();
    installPerformance();
    installGlobalActivity();
    startEngagementTimer();
    trackPageView('initial');

    console.info('[Svedah UI Telemetry] initialized', {
      service: CONFIG.serviceName,
      session_id: SESSION_ID,
      journey_id: currentJourneyId,
      do_not_track: dnt,
      tracking_disabled: disabled,
      features: {
        richer_element_context: true,
        user_journey: true,
        session_duration: true,
        form_safe_capture: true,
        outbound_tracking: true,
        network_correlation: true
      }
    });
  }

  window.SvedahTelemetry = {
    sessionId: SESSION_ID,
    journeyId: currentJourneyId,
    getJourney: () => JOURNEY.slice(),
    getEngagement: getEngagementSnapshot,
    getElementInfo,
    trackPageView,
    trackClick,
    emit,
    flushEngagement: () => emitEngagement('manual'),
    endSession: () => endSession('manual')
  };
})();
