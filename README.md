# Plan / Actual / Revised

Helps you manage your time and attention throughout the day.

Inspired by Jake Knapp and John Zeratsky’s
[*Make Time*](https://jakeknapp.com/make-time).

## Setup

Requires Google Chrome, Node.js 24, and a Google account.

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**,
and choose `dist`.

## Google Calendar OAuth

1. Copy the extension ID from `chrome://extensions`.
2. In [Google Cloud Console](https://console.cloud.google.com/), create or
   select a project and enable the **Google Calendar API**.
3. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview)
   for that project. Under **Audience**, choose **External**, keep **Testing**,
   and add its Google accounts as **Test users**. Under **Data Access**, add
   `https://www.googleapis.com/auth/calendar.events`.
4. Under **Clients**, create a **Chrome Extension** OAuth client. Paste the
   extension ID into **Item ID**, then copy the generated client ID.
5. Replace `oauth2.client_id` in `public/manifest.json` with that client ID.
6. Run `npm run build`, reload the extension in `chrome://extensions`, and
   select **Connect Calendar**.

Do not change the manifest’s public `key`; it keeps the extension ID stable
across computers. No client secret is needed. While the app remains in Testing,
Google may require test users to reconnect after seven days.

## Live Google Calendar and Slack E2E Tests

These opt-in tests attach Playwright to a dedicated Chrome profile and exercise
the unpacked extension against Google Calendar. The Slack smoke verifies the
`slack://` launch attempt and local Actual persistence; Slack need not be
installed.

One-time setup:

1. Add the Google account under the OAuth app's **Audience → Test users**.
2. Start the dedicated Chrome profile:

   ```sh
   npm run real:open
   ```

3. In that Chrome window, select **Connect Calendar**, complete Google sign-in,
   and wait for the planner to load. Leave Chrome open; the tests do not perform
   interactive sign-in.

Then run the live E2E suite in another terminal:

```sh
npm run test:real
```

The isolated, Git-ignored profile lives at `.pw-profiles/calendar`; do not use a
normal Chrome profile or open it in two Chrome processes. The default debugging
endpoint is `127.0.0.1:9225`. Override it with `REAL_CHROME_PROFILE_DIR`,
`REAL_CHROME_CDP_PORT`, or `REAL_CHROME_CDP_URL`.
