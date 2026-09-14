# Svedah UI Telemetry SDK - HTTP Exporter Build

This SDK captures browser UI telemetry and can export events either to the browser console or to an HTTP telemetry API.

## Browser script usage

```html
<script src="https://svedah.co.in/uitelemetry/dist/telemetry.min.js" data-auto-init="false"></script>
<script>
  window.SvedahTelemetry.init({
    serviceName: 'svedah',
    environment: 'test',
    exporter: {
      type: 'http',
      endpoint: 'https://YOUR_API_DOMAIN/v1/telemetry/events',
      batchSize: 10,
      flushIntervalMs: 3000,
      maxQueueSize: 500
    },
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
    }
  });
</script>
```

## Auto-init usage

```html
<script
  src="https://svedah.co.in/uitelemetry/dist/telemetry.min.js"
  data-service-name="svedah"
  data-environment="test"
  data-exporter="http"
  data-endpoint="https://YOUR_API_DOMAIN/v1/telemetry/events">
</script>
```

## Console testing

```html
<script
  src="https://svedah.co.in/uitelemetry/dist/telemetry.min.js"
  data-service-name="svedah"
  data-environment="test"
  data-exporter="console">
</script>
```

## API payload sent by HTTP exporter

```json
{
  "batch_id": "batch_...",
  "sent_at": "2026-09-14T06:20:00.000Z",
  "event_count": 2,
  "events": [
    {
      "timestamp": "2026-09-14T06:20:00.000Z",
      "service": "svedah",
      "environment": "test",
      "session_id": "ses_...",
      "trace_id": "...",
      "span_id": "...",
      "event": "CLICK",
      "data_test_id": "svedah_home_start_journey"
    }
  ]
}
```

## Retrieve events from Lambda API

```bash
curl "https://YOUR_API_DOMAIN/v1/telemetry/events?service=svedah&limit=50"
```

## Changed SDK behavior

- Uses sessionStorage for tab-scoped sessions.
- Emits `visible_time_seconds` separately from `actual_active_time_seconds`.
- Keeps `active_time_seconds` for backward compatibility, mapped to actual active time.
- HTTP exporter batches events and flushes using fetch or sendBeacon.
