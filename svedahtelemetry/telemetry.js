(() => {
  'use strict';

  /*
   * Svedah UI Telemetry - standalone browser POC
   * No CDN imports or runtime package dependencies.
   * Designed for GitHub Pages / static hosting.
   */

  const SERVICE_NAME = 'svedah-web';
  const SESSION_KEY = 'svedah_ui_session_id';
  const RESPECT_DNT = false;
  const MAX_TEXT_LENGTH = 160;

  const dnt =
    navigator.doNotTrack === '1' ||
    window.doNotTrack === '1';

  const trackingDisabled = RESPECT_DNT && dnt;
  const SESSION_ID = getSessionId();
  let currentTraceId = createHexId(32);

  function createHexId(length) {
    let result = '';

    while (result.length < length) {
      result += Math.random()
        .toString(16)
        .slice(2);
    }

    return result.slice(0, length);
  }

  function getSessionId() {
    try {
      const existing = sessionStorage.getItem(SESSION_KEY);

      if (existing) {
        return existing;
      }

      const id = `ses_${createHexId(24)}`;
      sessionStorage.setItem(SESSION_KEY, id);

      return id;
    } catch {
      return `ses_${createHexId(24)}`;
    }
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT_LENGTH);
  }

  function createSpan() {
    return {
      trace_id: currentTraceId,
      span_id: createHexId(16)
    };
  }

  function getXPath(element) {
    if (!(element instanceof Element)) {
      return '';
    }

    const parts = [];
    let current = element;

    while (
      current &&
      current.nodeType === Node.ELEMENT_NODE
    ) {
      let index = 1;
      let sibling = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      parts.unshift(
        `${current.tagName.toLowerCase()}[${index}]`
      );

      current = current.parentElement;
    }

    return '/' + parts.join('/');
  }

  function escapeCss(value) {
    if (window.CSS && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return String(value).replace(
      /([^a-zA-Z0-9_-])/g,
      '\\$1'
    );
  }

  function getElementInfo(element) {
    if (!(element instanceof Element)) {
      return {};
    }

    const dataTestId =
      element.getAttribute('data-test-id') || '';

    const id = element.id || '';
    const role = element.getAttribute('role') || '';
    const ariaLabel =
      element.getAttribute('aria-label') || '';
    const title = element.getAttribute('title') || '';

    let cssSelector = element.tagName.toLowerCase();

    if (dataTestId) {
      cssSelector =
        `[data-test-id="${dataTestId.replace(/"/g, '\\"')}"]`;
    } else if (id) {
      cssSelector = `#${escapeCss(id)}`;
    } else {
      const classes = Array.from(element.classList)
        .filter(Boolean)
        .slice(0, 2);

      if (classes.length) {
        cssSelector += classes
          .map((name) => `.${escapeCss(name)}`)
          .join('');
      }
    }

    return {
      tag: element.tagName,
      text: cleanText(
        element.innerText ||
        element.value ||
        ariaLabel ||
        title ||
        ''
      ),
      id,
      data_test_id: dataTestId,
      role,
      aria_label: ariaLabel,
      title,
      href:
        element instanceof HTMLAnchorElement
          ? element.href
          : '',
      type:
        element.getAttribute('type') || '',
      name:
        element.getAttribute('name') || '',
      css_selector: cssSelector,
      xpath: getXPath(element)
    };
  }

  function emit(eventName, attributes = {}) {
    if (trackingDisabled) {
      return null;
    }

    const span = createSpan();

    const record = {
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      session_id: SESSION_ID,
      trace_id: span.trace_id,
      span_id: span.span_id,
      event: eventName,
      page_url: window.location.href,
      page_path:
        window.location.pathname +
        window.location.hash,
      ...attributes
    };

    console.groupCollapsed(
      `%c[Svedah UI Telemetry] ${eventName}`,
      'color:#f97316;font-weight:700'
    );

    console.table(record);
    console.log(record);

    console.groupEnd();

    return record;
  }

  function trackPageView(reason = 'initial') {
    return emit('PAGE_VIEW', {
      action: 'page_view',
      reason,
      title: document.title,
      referrer: document.referrer || ''
    });
  }

  function trackClick(element) {
    const info = getElementInfo(element);

    return emit('CLICK', {
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

    return emit('CHANGE', {
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

    return emit('FORM_SUBMIT', {
      action: 'submit',
      form_id: form.id || '',
      data_test_id: info.data_test_id || '',
      css_selector: info.css_selector || ''
    });
  }

  function trackNavigation(reason, from, to) {
    // Keep one trace for the current SPA journey.
    emit('SPA_NAVIGATION', {
      action: 'navigation',
      navigation_reason: reason,
      from: from || '',
      to: to || ''
    });

    trackPageView(reason);
  }

  function installClickTracking() {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        const element = target.closest(
          'a,button,input,select,textarea,[role="button"],[data-test-id]'
        );

        if (element) {
          trackClick(element);
        }
      },
      true
    );

    document.addEventListener(
      'change',
      (event) => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        const element = target.closest(
          'input,select,textarea'
        );

        if (element) {
          trackChange(element);
        }
      },
      true
    );

    document.addEventListener(
      'submit',
      (event) => {
        if (event.target instanceof HTMLFormElement) {
          trackSubmit(event.target);
        }
      },
      true
    );
  }

  function installNavigationTracking() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const from = window.location.href;
      const result = originalPushState.apply(this, args);
      const to = window.location.href;

      if (from !== to) {
        trackNavigation('pushState', from, to);
      }

      return result;
    };

    history.replaceState = function (...args) {
      const from = window.location.href;
      const result = originalReplaceState.apply(this, args);
      const to = window.location.href;

      if (from !== to) {
        trackNavigation('replaceState', from, to);
      }

      return result;
    };

    window.addEventListener('popstate', () => {
      trackNavigation(
        'popstate',
        '',
        window.location.href
      );
    });

    window.addEventListener('hashchange', (event) => {
      trackNavigation(
        'hashchange',
        event.oldURL,
        event.newURL
      );
    });
  }

  function installFetchTracking() {
    if (typeof window.fetch !== 'function') {
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (...args) {
      const request = args[0];
      const url =
        typeof request === 'string'
          ? request
          : request?.url || '';

      const method =
        args[1]?.method ||
        request?.method ||
        'GET';

      const started = performance.now();

      try {
        const response = await originalFetch(...args);

        emit('FETCH', {
          action: 'fetch',
          method,
          url: new URL(
            url,
            window.location.href
          ).href,
          status: response.status,
          duration_ms: Math.round(
            performance.now() - started
          )
        });

        return response;
      } catch (error) {
        emit('FETCH_ERROR', {
          action: 'fetch_error',
          method,
          url: new URL(
            url,
            window.location.href
          ).href,
          duration_ms: Math.round(
            performance.now() - started
          ),
          error:
            error?.message ||
            String(error)
        });

        throw error;
      }
    };
  }

  function installXHRTracking() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
      method,
      url,
      ...rest
    ) {
      this.__svedahTelemetry = {
        method: String(method || 'GET').toUpperCase(),
        url: String(url || '')
      };

      return originalOpen.call(
        this,
        method,
        url,
        ...rest
      );
    };

    XMLHttpRequest.prototype.send = function (body) {
      const meta =
        this.__svedahTelemetry || {
          method: 'GET',
          url: ''
        };

      const started = performance.now();

      this.addEventListener('loadend', () => {
        emit('XHR', {
          action: 'xhr',
          method: meta.method,
          url: new URL(
            meta.url,
            window.location.href
          ).href,
          status: this.status,
          duration_ms: Math.round(
            performance.now() - started
          )
        });
      });

      return originalSend.call(this, body);
    };
  }

  function installErrorTracking() {
    window.addEventListener('error', (event) => {
      emit('ERROR', {
        action: 'javascript_error',
        message: event.message || '',
        filename: event.filename || '',
        line: event.lineno || 0,
        column: event.colno || 0
      });
    });

    window.addEventListener(
      'unhandledrejection',
      (event) => {
        emit('UNHANDLED_REJECTION', {
          action: 'unhandled_rejection',
          message:
            event.reason?.message ||
            String(event.reason || '')
        });
      }
    );
  }

  installClickTracking();
  installNavigationTracking();
  installFetchTracking();
  installXHRTracking();
  installErrorTracking();
  trackPageView();

  console.info(
    '[Svedah UI Telemetry] initialized',
    {
      service: SERVICE_NAME,
      session_id: SESSION_ID,
      trace_id: currentTraceId,
      do_not_track: dnt,
      tracking_disabled: trackingDisabled
    }
  );

  window.SvedahTelemetry = {
    service: SERVICE_NAME,
    sessionId: SESSION_ID,
    get traceId() {
      return currentTraceId;
    },
    emit,
    trackPageView,
    trackClick,
    trackNavigation,
    getElementInfo
  };
})();
