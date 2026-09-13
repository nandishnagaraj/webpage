# Svedah page using hosted UI Telemetry SDK

This package contains an updated `index.html` that uses your hosted SDK from:

```html
<script src="https://svedah.co.in/uitelemetry/dist/telemetry.min.js"></script>
```

It initializes the SDK in console mode for testing.

## Upload location

Upload this `index.html` into any test folder, for example:

```text
webpage/sdktest/index.html
```

Then open:

```text
https://svedah.co.in/sdktest/index.html
```

## Test steps

1. Open Chrome DevTools.
2. Go to Console.
3. Click `Start Your Journey`, `Join Session`, `Open My Calendar`, `Try the AI Planner Now`, etc.
4. You should see `[Svedah UI Telemetry]` console events.

## Important

This page no longer loads `./telemetry.js`. It consumes the reusable SDK from `/uitelemetry/dist/telemetry.min.js`.
