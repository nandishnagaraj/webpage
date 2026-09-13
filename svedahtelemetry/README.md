# Svedah UI Telemetry POC

GitHub Pages-compatible static Svedah page with a self-contained `telemetry.js` (no esm.sh and no external telemetry imports).

## Captured in Chrome Console

- PAGE_VIEW
- CLICK with rich element context
- FORM_FIELD_FOCUS
- FORM_FIELD_CHANGE (no raw sensitive values)
- FORM_SUBMIT
- SPA_NAVIGATION
- OUTBOUND_CLICK
- FETCH / FETCH_ERROR
- XHR
- PAGE_PERFORMANCE
- SESSION_ENGAGEMENT
- SESSION_RESUMED
- SESSION_END
- JavaScript ERROR / UNHANDLED_REJECTION

## Rich element context

The click event includes `data_test_id`, CSS selector, XPath, text, tag, role, aria label, title, placeholder, href, dimensions, visibility, component and section context.

## User journey

Events are stored in memory for the current browser session and each event includes `session_id`, `journey_id`, `trace_id`, and `span_id`. `window.SvedahTelemetry.getJourney()` returns the captured journey.

## Session engagement

The SDK tracks elapsed session duration, estimated active time, active ratio, click count, page views, navigation count, form submissions, fetch count, outbound clicks, and journey length.

## Network correlation

Fetch and XHR telemetry carry a correlation trace/span pair plus the most recent UI span as `parent_ui_span_id`. This is a POC correlation model; it is not a standards-compliant OpenTelemetry context propagation implementation.

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/`.

## Deploy to GitHub Pages

Upload `index.html` and `telemetry.js` to your `svedahtelemetry/` folder. No server or build step is required.

## Test

Open DevTools -> Console and click the Svedah buttons. The readable telemetry records will be printed as collapsed console groups.
