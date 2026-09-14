export function createHttpExporter(options = {}) {
  const endpoint = options.endpoint;
  const batchSize = Number(options.batchSize || 20);
  const flushIntervalMs = Number(options.flushIntervalMs || 5000);
  const maxQueueSize = Number(options.maxQueueSize || 500);
  const useBeacon = options.useBeacon !== false;
  const headers = options.headers && typeof options.headers === 'object' ? options.headers : {};

  if (!endpoint) {
    throw new Error('HTTP exporter requires exporter.endpoint');
  }

  let queue = [];
  let timer = null;
  let flushing = false;

  function createId(prefix) {
    const random = Math.random().toString(16).slice(2);
    const time = Date.now().toString(16);
    return `${prefix}_${time}_${random}`;
  }

  function buildPayload(events) {
    return {
      batch_id: createId('batch'),
      sent_at: new Date().toISOString(),
      event_count: events.length,
      events
    };
  }

  function enqueue(event) {
    if (!event || typeof event !== 'object') return;

    queue.push(event);

    if (queue.length > maxQueueSize) {
      queue = queue.slice(queue.length - maxQueueSize);
    }

    if (queue.length >= batchSize) {
      flush();
    } else {
      scheduleFlush();
    }
  }

  function scheduleFlush() {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = null;
      flush();
    }, flushIntervalMs);
  }

  async function flush() {
    if (flushing || queue.length === 0) return;

    flushing = true;
    const events = queue.splice(0, batchSize);
    const payload = buildPayload(events);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        keepalive: true,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        queue.unshift(...events);
      }
    } catch (error) {
      queue.unshift(...events);
    } finally {
      flushing = false;
      if (queue.length > 0) scheduleFlush();
    }
  }

  function flushWithBeacon() {
    if (!useBeacon || !navigator.sendBeacon || queue.length === 0) {
      flush();
      return;
    }

    const events = queue.splice(0, queue.length);
    const payload = buildPayload(events);
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const accepted = navigator.sendBeacon(endpoint, blob);

    if (!accepted) {
      queue.unshift(...events);
      flush();
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushWithBeacon();
    });
    window.addEventListener('pagehide', flushWithBeacon);
  }

  return {
    type: 'http',
    enqueue,
    flush,
    flushWithBeacon,
    getQueueSize: () => queue.length
  };
}
