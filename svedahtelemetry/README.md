# Svedah UI Telemetry - GitHub Pages POC

This package is designed for the `nandishnagaraj/webpage` repository and does not require Python, a backend, OpenTelemetry CDN modules, or external runtime package imports.

## Files

- `index.html` - Svedah page with stable `data-test-id` attributes and telemetry script included.
- `telemetry.js` - standalone browser telemetry collector.

## Deploy

Upload both files into the same directory in the GitHub repository, for example:

```text
svedahtelemetry/
  index.html
  telemetry.js
```

The HTML references:

```html
<script src="./telemetry.js"></script>
```

## Test

Open the page and use Chrome DevTools > Console.

Reload the page. You should see:

`[Svedah UI Telemetry] initialized`

Then click buttons such as:

- Start Your Journey
- Join Now
- Join Session
- Open My Calendar
- Try the AI Planner Now
- WhatsApp
- Instagram

The console shows event records containing session ID, trace ID, span ID, element details, `data-test-id`, CSS selector and XPath.

## Important

This is a standalone telemetry POC. It writes events to the browser console. It does not send telemetry to a remote collector.

It intentionally has no runtime package dependency, so it is suitable for GitHub Pages static hosting.
