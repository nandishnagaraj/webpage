# Svedah UI Telemetry

A framework-agnostic browser UI telemetry SDK for capturing user journeys, rich element context, `data-test-id`, safe form interaction metadata, outbound journeys, engagement metrics, JavaScript errors, `fetch`/XHR calls and network correlation.

This package is designed to work with:

- Static HTML
- Angular
- React
- Vue
- Any browser-based JavaScript application

The SDK currently exports events to the browser console by default. It can also POST event records to an HTTP endpoint.

---

## Folder structure

```text
svedah-ui-telemetry/
├── src/
│   ├── core.js
│   ├── session.js
│   ├── element.js
│   ├── journey.js
│   ├── network.js
│   ├── forms.js
│   ├── errors.js
│   └── exporter.js
├── adapters/
│   ├── angular.js
│   ├── react.js
│   └── vue.js
├── dist/
│   ├── telemetry.js
│   └── telemetry.min.js
├── package.json
├── README.md
└── LICENSE
```

---

## Static HTML usage

Copy `dist/telemetry.min.js` to your hosted folder or CDN.

```html
<script
  src="./dist/telemetry.min.js"
  data-service-name="svedah-web"
  data-environment="production">
</script>
```

The script auto-initializes unless you set:

```html
<script src="./dist/telemetry.min.js" data-auto-init="false"></script>
<script>
  SvedahTelemetry.init({
    serviceName: 'my-static-site',
    environment: 'production'
  });
</script>
```

---

## CDN-style usage

Host the file at a versioned location:

```text
https://your-domain.example/ui-telemetry/1.0.0/telemetry.min.js
```

Then use:

```html
<script
  src="https://your-domain.example/ui-telemetry/1.0.0/telemetry.min.js"
  data-service-name="customer-portal"
  data-environment="production">
</script>
```

---

## React usage

```js
import { initReactTelemetry } from '@svedah/ui-telemetry/react';

initReactTelemetry({
  serviceName: 'react-portal',
  environment: 'production'
});
```

---

## Vue usage

```js
import { createApp } from 'vue';
import App from './App.vue';
import { createSvedahTelemetryPlugin } from '@svedah/ui-telemetry/vue';

createApp(App)
  .use(createSvedahTelemetryPlugin({
    serviceName: 'vue-portal',
    environment: 'production'
  }))
  .mount('#app');
```

---

## Angular usage

In `main.ts` or `app.config.ts`:

```ts
import { initAngularTelemetry } from '@svedah/ui-telemetry/angular';

initAngularTelemetry({
  serviceName: 'angular-portal',
  environment: 'production'
});
```

---

## Recommended data-test-id convention

Use stable attributes on important elements:

```html
<button data-test-id="product_checkout_submit">
  Submit
</button>
```

Suggested pattern:

```text
<product>_<area>_<component>_<action>
```

Examples:

```text
svedah_nav_home
svedah_session_sunday_join
svedah_ai_planner_try_now
```

---

## Events captured

| Event | Description |
|---|---|
| `PAGE_VIEW` | Initial page view and SPA route/hash changes |
| `CLICK` | Internal element clicks |
| `OUTBOUND_CLICK` | Links to external domains |
| `SPA_NAVIGATION` | `pushState`, `replaceState`, `popstate`, `hashchange` |
| `FORM_FIELD_FOCUS` | Safe field focus metadata |
| `FORM_FIELD_CHANGE` | Safe field change metadata; does not capture actual input value |
| `FORM_SUBMIT` | Form submit metadata |
| `FETCH` | `fetch()` request result |
| `FETCH_ERROR` | Failed `fetch()` request |
| `XHR` | XMLHttpRequest result |
| `ERROR` | JavaScript runtime errors |
| `UNHANDLED_REJECTION` | Unhandled Promise rejections |
| `SESSION_ENGAGEMENT` | Periodic engagement summary |
| `SESSION_END` | Fired on page hide/unload lifecycle |

---

## Rich element context

For clicks and form fields, the SDK captures:

```text
data_test_id
element_tag
element_text
element_id
role
aria_label
title
placeholder
href
css_selector
xpath
width
height
viewport_visible
component_name
section_id
section_name
```

---

## Session and journey

Open the browser console and run:

```js
SvedahTelemetry.getTelemetry().getJourney()
```

or, when loaded by script tag:

```js
SvedahTelemetry.getTelemetry().getEngagement()
```

Every event has:

```text
session_id
trace_id
span_id
parent_ui_span_id
timestamp
service
environment
```

The same `trace_id` is used for the browser journey, and each event receives a unique `span_id`.

---

## Exporting to a server

Console mode is the default:

```js
SvedahTelemetry.init({
  exporter: {
    type: 'console'
  }
});
```

HTTP mode:

```js
SvedahTelemetry.init({
  exporter: {
    type: 'http',
    endpoint: 'https://telemetry.example.com/events'
  }
});
```

Your backend endpoint should accept JSON POST requests and return a 2xx status.

---

## Privacy defaults

The SDK does not capture full form values. For form fields it captures only:

```text
input_filled
value_length
element_type
element_name
data_test_id
```

Password and hidden field values are not captured.

Recommended production config:

```js
SvedahTelemetry.init({
  respectDoNotTrack: true,
  privacy: {
    maskInputs: true,
    capturePasswords: false,
    stripQueryString: true
  }
});
```

---

## Playwright generation use case

Because every important event captures `data_test_id`, you can later transform a journey into Playwright actions:

```js
await page.getByTestId('svedah_session_sunday_join').click();
```

This package does not generate Playwright scripts yet, but it captures the metadata required for that next step.
