# Svedah UI Telemetry + data-test-id POC

This version is designed to run as a static GitHub Pages site.

## Files

- `index.html` - Svedah single-page site with stable `data-test-id` attributes.
- `telemetry.js` - OpenTelemetry browser setup plus custom UI telemetry.

## What is captured

- page views
- clicks
- SPA navigation (`pushState`, `replaceState`, `popstate`, `hashchange`)
- form changes/submits
- JavaScript errors and unhandled promise rejections
- browser `fetch()` calls
- element metadata: tag, text, ID, `data-test-id`, role, aria-label, href, CSS selector and XPath
- session ID
- OpenTelemetry trace ID and span ID

## Test on GitHub Pages

1. Copy `index.html` and `telemetry.js` into the root of the `nandishnagaraj/webpage` repository.
2. Commit and push to the branch currently used by GitHub Pages.
3. Open the GitHub Pages URL.
4. Open Chrome DevTools > Console.
5. Click `Start Your Journey`, `Join Now`, `Join Session`, `Book Slots`, `Try the AI Planner Now`, WhatsApp, Instagram, etc.
6. Look for `[Svedah UI Telemetry] CLICK` entries.

The telemetry uses `ConsoleSpanExporter`, so this POC does not send telemetry to a backend.

## Important

`RESPECT_DNT` is deliberately `false` in this test build so that local testing still shows telemetry when the browser has Do Not Track enabled. Before production use, set it to `true` and define your privacy/consent policy.

The browser OpenTelemetry implementation is currently documented by OpenTelemetry as experimental. For production collection, replace the console exporter with OTLP/HTTP to an OpenTelemetry Collector and configure CORS for the GitHub Pages origin.
