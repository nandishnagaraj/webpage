# Svedah UI Telemetry SDK

Browser UI telemetry SDK with console and HTTP exporters.

## Key update in this version

The SDK now ignores its own telemetry transport calls so your user journey is not polluted by repeated `FETCH` events to the telemetry API.

Ignored by default:

```js
'/v1/telemetry/events'
'localhost:8080/v1/telemetry/events'
```

The configured HTTP exporter endpoint is also ignored automatically.

## Files to upload to GitHub Pages

Replace these files in your repo:

```text
webpage/uitelemetry/dist/telemetry.js
webpage/uitelemetry/dist/telemetry.min.js
```

If you keep source files in GitHub too, also replace:

```text
webpage/uitelemetry/src/core.js
webpage/uitelemetry/src/exporter.js
webpage/uitelemetry/src/exporters/http-exporter.js
webpage/uitelemetry/package.json
webpage/uitelemetry/README.md
```

## Local API test config

```html
<script src="https://svedah.co.in/uitelemetry/dist/telemetry.min.js" data-auto-init="false"></script>
<script>
  window.SvedahTelemetry.init({
    serviceName: "svedah",
    environment: "local-api-test",
    exporter: {
      type: "http",
      endpoint: "http://localhost:8080/v1/telemetry/events",
      batchSize: 5,
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

## Optional custom ignored network URLs

```js
window.SvedahTelemetry.init({
  serviceName: "svedah",
  exporter: {
    type: "http",
    endpoint: "http://localhost:8080/v1/telemetry/events"
  },
  network: {
    ignoreUrls: [
      "/v1/telemetry/events",
      "localhost:8080/v1/telemetry/events",
      "analytics.google.com"
    ]
  }
});
```

## Debug

```js
SvedahTelemetry.shouldIgnoreNetworkTelemetry("http://localhost:8080/v1/telemetry/events")
```

Expected result:

```js
true
```
