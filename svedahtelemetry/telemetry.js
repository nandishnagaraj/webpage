(() => {
  'use strict';

  const SERVICE_NAME = 'svedah-web';
  const SESSION_KEY = 'svedah_ui_session_id';
  const RESPECT_DNT = false; // Change to true for production if you want DNT respected.
  const SESSION_ID = getSessionId();

  function getSessionId() {
    try {
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const id = `ses_${createHexId(24)}`;
      sessionStorage.setItem(SESSION_KEY, id);
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

  const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const disabled = RESPECT_DNT && dnt;

  function cleanText(value, max = 160) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function createTrace() {
    return {
      trace_id: createHexId(32),
      span_id: createHexId(16)
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
    return '/' + parts.join('/');
  }

  function escapeCss(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }

  function getElementInfo(element) {
    if (!(element instanceof Element)) return {};

    const testId = element.getAttribute('data-test-id') || '';
    const id = element.id || '';
    const role = element.getAttribute('role') || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    const title = element.getAttribute('title') || '';

    let cssSelector = element.tagName.toLowerCase();

    if (testId) {
      cssSelector = `[data-test-id="${testId.replace(/"/g, '\\"')}"]`;
    } else if (id) {
      cssSelector = `#${escapeCss(id)}`;
    } else if (element.classList.length) {
      cssSelector += '.' + Array.from(element.classList).slice(0, 2).map(escapeCss).join('.');
    }

    return {
      tag: element.tagName,
      text: cleanText(element.innerText || element.value || title || ariaLabel),
      id,
      data_test_id: testId,
      role,
      aria_label: ariaLabel,
      title,
      href: element instanceof HTMLAnchorElement ? element.href : '',
      type: element.getAttribute('type') || '',
      name: element.getAttribute('name') || '',
      css_selector: cssSelector,
      xpath: getXPath(element)
    };
  }

  function emit(event, attributes = {}) {
    if (disabled) return;

    const trace = createTrace();
    const record = {
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      session_id: SESSION_ID,
      trace_id: trace.trace_id,
      span_id: trace.span_id,
      event,
      page_url: location.href,
      page_path: location.pathname + location.hash,
      ...attributes
    };

    console.groupCollapsed(`%c[Svedah UI Telemetry] ${event}`, 'color:#f97316;font-weight:700');
    console.table(record);
    console.log(record);
    console.groupEnd();
  }

  function trackPageView(reason = 'initial') {
    emit('PAGE_VIEW', {
      action: 'page_view',
      reason,
      title: document.title,
      referrer: document.referrer || ''
    });
  }

  function trackClick(element) {
    const info = getElementInfo(element);
    emit('CLICK', {
      action: 'click',
      element_tag: info.tag || '',
      element_text: info.text || '',
      element_id: info.id || '',
      data_test_id: info.data_test_id || '',
      role: info.role || '',
      aria_label: info.aria_label || '',
      href: info.href || '',
      css_selector: info.css_selector || '',
      xpath: info.xpath || ''
    });
  }

  function trackChange(element) {
    const info = getElementInfo(element);
    emit('CHANGE', {
      action: 'change',
      element_tag: info.tag || '',
      element_id: info.id || '',
      data_test_id: info.data_test_id || '',
      element_type: info.type || '',
      element_name: info.name || ''
    });
  }

  function trackSubmit(form) {
    const info = getElementInfo(form);
    emit('FORM_SUBMIT', {
      action: 'submit',
      form_id: form.id || '',
      data_test_id: info.data_test_id || '',
      css_selector: info.css_selector || ''
    });
  }

  function trackNavigation(reason, from, to) {
    emit('SPA_NAVIGATION', {
      action: 'navigation',
      navigation_reason: reason,
      from,
      to
    });
    trackPageView(reason);
  }

  function installClicks() {
    document.addEventListener('click', (event) => {
      const element = event.target?.closest?.(
        'a,button,input,select,textarea,[role="button"],[data-test-id]'
      );
      if (element) trackClick(element);
    }, true);

    document.addEventListener('change', (event) => {
      const element = event.target?.closest?.('input,select,textarea');
      if (element) trackChange(element);
    }, true);

    document.addEventListener('submit', (event) => {
      if (event.target instanceof HTMLFormElement) trackSubmit(event.target);
    }, true);
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

    window.addEventListener('hashchange', (event) => {
      trackNavigation('hashchange', event.oldURL, event.newURL);
    });
  }

  function installFetch() {
    if (typeof window.fetch !== 'function') return;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const request = args[0];
      const url = typeof request === 'string' ? request : request?.url || '';
      const method = args[1]?.method || request?.method || 'GET';
      const started = performance.now();

      try {
        const response = await originalFetch(...args);
        emit('FETCH', {
          action: 'fetch',
          method,
          url: new URL(url, location.href).href,
          status: response.status,
          duration_ms: Math.round(performance.now() - started)
        });
        return response;
      } catch (error) {
        emit('FETCH_ERROR', {
          action: 'fetch_error',
          method,
          url: new URL(url, location.href).href,
          duration_ms: Math.round(performance.now() - started),
          error: error?.message || String(error)
        });
        throw error;
      }
    };
  }

  function installErrors() {
    window.addEventListener('error', (event) => {
      emit('ERROR', {
        action: 'javascript_error',
        message: event.message || '',
        filename: event.filename || '',
        line: event.lineno || 0,
        column: event.colno || 0
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      emit('UNHANDLED_REJECTION', {
        action: 'unhandled_rejection',
        message: event.reason?.message || String(event.reason || '')
      });
    });
  }

  installClicks();
  installNavigation();
  installFetch();
  installErrors();
  trackPageView();

  console.info('[Svedah UI Telemetry] initialized', {
    service: SERVICE_NAME,
    session_id: SESSION_ID,
    do_not_track: dnt,
    tracking_disabled: disabled
  });

  window.SvedahTelemetry = {
    sessionId: SESSION_ID,
    emit,
    trackPageView,
    trackClick,
    getElementInfo
  };
})();
