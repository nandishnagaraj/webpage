import { getSessionId, createTraceId, createSpanId, DEFAULT_SESSION_KEY } from './session.js';
import { getElementInfo } from './element.js';
import { createJourney } from './journey.js';
import { installNetworkTracking } from './network.js';
import { installFormTracking } from './forms.js';
import { installErrorTracking } from './errors.js';
import { createExporter } from './exporter.js';

const DEFAULT_CONFIG = {
  serviceName: 'svedah-web',
  environment: 'development',
  sessionKey: DEFAULT_SESSION_KEY,
  respectDoNotTrack: false,
  maxJourneyEvents: 500,
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
    type: 'console'
  }
};

let currentInstance = null;

export function initTelemetry(userConfig = {}) {
  if (currentInstance) return currentInstance;

  const config = mergeConfig(DEFAULT_CONFIG, userConfig);
  const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const disabled = config.respectDoNotTrack && dnt;
  const sessionId = getSessionId(config.sessionKey);
  const journeyTraceId = createTraceId();
  const journey = createJourney(config.maxJourneyEvents);
  const exporter = createExporter(config.exporter);
  const sessionStart = Date.now();
  let lastActivity = Date.now();
  let activeMs = 0;
  let lastUiSpanId = '';

  function normalizeUrl(url) {
    if (!config.privacy.stripQueryString) return url;
    try {
      const parsed = new URL(url, location.href);
      parsed.search = '';
      return parsed.href;
    } catch {
      return url;
    }
  }

  function markActivity() {
    const now = Date.now();
    const delta = now - lastActivity;
    if (delta > 0 && delta < 30000) activeMs += delta;
    lastActivity = now;
  }

  function getEngagement() {
    const durationSeconds = Math.round((Date.now() - sessionStart) / 1000);
    const activeSeconds = Math.round(activeMs / 1000);
    return {
      session_duration_seconds: durationSeconds,
      active_time_seconds: activeSeconds,
      active_ratio: durationSeconds > 0 ? Number((activeSeconds / durationSeconds).toFixed(2)) : 0,
      ...journey.getCounters()
    };
  }

  function emit(event, attributes = {}) {
    if (disabled) return null;
    markActivity();
    const spanId = createSpanId();
    const record = {
      timestamp: new Date().toISOString(),
      service: config.serviceName,
      environment: config.environment,
      session_id: sessionId,
      trace_id: journeyTraceId,
      span_id: spanId,
      parent_ui_span_id: attributes.parent_ui_span_id || lastUiSpanId || '',
      event,
      page_url: normalizeUrl(location.href),
      page_path: location.pathname + location.hash,
      ...attributes,
      ...getEngagement()
    };

    journey.add(record);
    if (['CLICK', 'OUTBOUND_CLICK', 'FORM_FIELD_FOCUS', 'FORM_FIELD_CHANGE', 'FORM_SUBMIT'].includes(event)) {
      lastUiSpanId = spanId;
    }
    exporter.exportRecord(record).catch?.((error) => console.warn('[Svedah UI Telemetry] export failed', error));
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

  function isOutboundHref(href) {
    if (!href) return false;
    try {
      const url = new URL(href, location.href);
      return url.origin !== location.origin && !['tel:', 'mailto:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  function trackClick(element) {
    const info = getElementInfo(element);
    const outbound = isOutboundHref(info.href);
    const event = outbound ? 'OUTBOUND_CLICK' : 'CLICK';
    return emit(event, {
      action: outbound ? 'outbound_click' : 'click',
      element_tag: info.tag || '',
      element_text: info.text || '',
      element_id: info.id || '',
      data_test_id: info.data_test_id || '',
      role: info.role || '',
      aria_label: info.aria_label || '',
      title: info.title || '',
      placeholder: info.placeholder || '',
      href: normalizeUrl(info.href || ''),
      destination_domain: outbound ? new URL(info.href).hostname : '',
      css_selector: info.css_selector || '',
      xpath: info.xpath || '',
      width: info.width || 0,
      height: info.height || 0,
      viewport_visible: Boolean(info.viewport_visible),
      component_name: info.component_name || '',
      section_id: info.section_id || '',
      section_name: info.section_name || ''
    });
  }

  function trackNavigation(reason, from, to) {
    emit('SPA_NAVIGATION', {
      action: 'navigation',
      navigation_reason: reason,
      from: normalizeUrl(from || ''),
      to: normalizeUrl(to || '')
    });
    trackPageView(reason);
  }

  function installClicks() {
    document.addEventListener('click', (event) => {
      const element = event.target?.closest?.('a,button,input,select,textarea,[role="button"],[data-test-id],[data-testid]');
      if (element) trackClick(element);
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

    window.addEventListener('popstate', () => trackNavigation('popstate', '', location.href));
    window.addEventListener('hashchange', (event) => trackNavigation('hashchange', event.oldURL, event.newURL));
  }

  function installEngagement() {
    ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach((name) => {
      window.addEventListener(name, markActivity, { passive: true });
    });

    const emitEngagement = () => emit('SESSION_ENGAGEMENT', { action: 'session_engagement' });
    window.addEventListener('pagehide', () => emit('SESSION_END', { action: 'session_end' }));
    document.addEventListener('visibilitychange', () => {
      emit(document.hidden ? 'SESSION_HIDDEN' : 'SESSION_RESUMED', { action: document.hidden ? 'session_hidden' : 'session_resumed' });
    });
    setInterval(emitEngagement, 30000);
  }

  const api = {
    config,
    sessionId,
    traceId: journeyTraceId,
    emit,
    trackPageView,
    trackClick,
    getElementInfo,
    getJourney: journey.getEvents,
    getEngagement,
    createSpanId,
    getCurrentCorrelation() {
      return { trace_id: journeyTraceId, parent_ui_span_id: lastUiSpanId };
    }
  };

  if (config.capture.clicks) installClicks();
  if (config.capture.navigation) installNavigation();
  if (config.capture.forms) installFormTracking(api);
  if (config.capture.network) installNetworkTracking(api);
  if (config.capture.errors) installErrorTracking(api);
  if (config.capture.engagement) installEngagement();

  trackPageView('initial');

  console.info('[Svedah UI Telemetry] initialized', {
    service: config.serviceName,
    environment: config.environment,
    session_id: sessionId,
    trace_id: journeyTraceId,
    do_not_track: dnt,
    tracking_disabled: disabled
  });

  currentInstance = api;
  window.SvedahTelemetry = api;
  return api;
}

export function getTelemetry() {
  return currentInstance;
}

function mergeConfig(base, override) {
  return {
    ...base,
    ...override,
    capture: { ...base.capture, ...(override.capture || {}) },
    privacy: { ...base.privacy, ...(override.privacy || {}) },
    exporter: { ...base.exporter, ...(override.exporter || {}) }
  };
}
