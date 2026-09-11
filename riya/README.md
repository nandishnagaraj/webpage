# The School Blast - Google Sheets powered static site

This version is a plain HTML/CSS/JavaScript website. No Python application is required.

## Architecture

1. Visitor submits a blast from `index.html`.
2. The page sends the category + blast text to a Google Apps Script Web App.
3. Apps Script writes a row into the `Blasts` Google Sheet with `Status = PENDING`.
4. A moderator reviews the row in Google Sheets.
5. When the moderator changes `Status` to `APPROVED`, the public site picks it up on its next refresh (30 seconds by default).
6. Only `APPROVED` or legacy `PUBLISHED` rows are rendered publicly.

## Google Sheet setup

Create a Google Sheet with a tab named `Blasts`. The Apps Script will create the header row automatically:

`Timestamp | ID | Category | Blast | Status | Moderation Note | Published At`

For a published row, the moderator should change the `Status` cell to `APPROVED` and optionally enter `Published At` as the approval time.

Recommended statuses:

- `PENDING` - waiting for moderation
- `APPROVED` - visible on the website
- `PUBLISHED` - legacy visible status, still supported
- `REJECTED` - never shown publicly
- `REMOVED` - no longer shown publicly

## Deploy Google Apps Script

1. Open Google Apps Script and create a project.
2. Copy `google-apps-script/Code.gs` into the project.
3. Replace `PASTE_YOUR_GOOGLE_SHEET_ID_HERE` with the ID of your Google Sheet.
4. Deploy > New deployment > Web app.
5. Execute as: `Me`.
6. Who has access: choose the setting that matches your audience (for a public site, typically `Anyone`).
7. Copy the Web App URL.
8. In `index.html`, replace `PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` with that URL.

## Run locally

Because this is a static site, you can host the folder on any static web server. For a quick local test, Python's built-in server is optional:

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/`.

You do not need `app.py` anymore.

## Important moderation note

The page deliberately does not expose sender identity. For a real deployment, add stronger abuse controls at the backend layer: CAPTCHA/bot protection, rate limiting, reporting, moderator audit logs, and a clear retention/deletion policy. Google Sheets is suitable for a prototype or small community workflow, but it should not be treated as a hardened moderation database at scale.
