# Plan / Actual / Revised - Product Requirements Document

## 1. Product Overview

Plan / Actual / Revised is a production-ready Chrome extension for personal time tracking and daily replanning. It is inspired by the "plan / actual / revised" schedule template from Cal Newport's Deep Work. It helps a knowledge worker:

- See their intended day from Google Calendar.
- Log what actually happened as the day unfolds.
- Replan the rest of the day when reality diverges from the plan.
- Set intentions: a daily "something hard" and a weekly learning goal.
- Set an intention before each Slack visit with a lightweight launcher that also logs the visit.

The extension reads from and writes to the user's Google Calendar through the Google Calendar REST API using Chrome extension OAuth. It stores unsaved working state locally with Chrome extension storage and syncs durable actuals back to the calendar with idempotent writes.

The guiding principle is unchanged from the prototype: never lose the user's data. Anything the user types, drags, resizes, or saves must be recoverable, and any failure to persist must be visible.

## 2. Product Surface

### 2.1 Chrome Extension Shape

The product is a Manifest V3 Chrome extension. The primary UI is an extension app page opened from the toolbar action, not a small popup. The grid, drag interactions, modal editing, settings, and save feedback need a full-page workspace.

Acceptable launch surfaces:

- Toolbar action opens the full extension page in a tab.
- Future option: Chrome side panel if the layout remains usable at narrower widths.

Non-goal for the first production build:

- A tiny toolbar popup version of the full day grid.

### 2.2 Runtime Contexts

The extension has three main runtime areas:

- Extension UI page: React application, user interactions, rendering, optimistic UI.
- Background service worker: auth token acquisition, calendar API calls, message handling, retry orchestration that does not require DOM access.
- Shared domain modules: date math, block calculations, save filtering, Calendar event mapping, storage schema validation.

The service worker is not treated as an always-on process. All behavior must tolerate Manifest V3 worker suspension and restart.

## 3. Technical Stack

### 3.1 Baseline Stack

- TypeScript.
- React.
- Vite for app build and dev workflow.
- Vitest for unit tests.
- Playwright for extension E2E tests.
- Tailwind CSS.
- shadcn/ui components built on Radix primitives.
- lucide-react for icons where icons are needed.
- Standard Node package ecosystem for install, scripts, CI, and tooling.

## 4. Architecture Blueprint

### 4.1 Source Organization

Target structure:

```text
src/
  app/
    App.tsx
    routes/
    components/
    hooks/
  background/
    service-worker.ts
    message-handlers.ts
  calendar/
    google-calendar-client.ts
    calendar-mappers.ts
    calendar-types.ts
  domain/
    blocks.ts
    dates.ts
    save-filter.ts
    catch-up.ts
    settings.ts
  storage/
    extension-storage.ts
    schemas.ts
  design/
    tokens.ts
    google-calendar-colors.ts
  test/
    fixtures/
```

The goal is to keep production code honest:

- Calendar networking belongs in `calendar/` and the background worker.
- UI rendering belongs in `app/`.
- Calendar-independent rules belong in `domain/`.
- Persistence boundaries belong in `storage/`.

### 4.2 Message Boundary

The UI page talks to the background service worker through typed Chrome runtime messages.

Required message families:

- `calendar.listEvents`
- `calendar.insertEvent`
- `calendar.findExistingActual`
- `auth.getStatus`
- `auth.requestInteractiveToken`
- `settings.get`
- `catchUp.run`

The UI must never call Google APIs directly. This centralizes token handling, error normalization, and retry behavior.

### 4.3 Error Model

Calendar and storage operations return a normalized result:

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };
```

`AppError` includes:

- `code`
- `message`
- `recoverable`
- optional `cause`
- optional `httpStatus`

Throwing exceptions across application layers is allowed only for truly unexpected programmer errors. Expected auth, network, quota, validation, and API failures must become `Result` values.

## 5. Google Calendar Integration

### 5.1 Authentication

Use Chrome's `identity` permission and OAuth2 support.

Manifest requirements:

- `permissions`: `identity`, `storage`
- `host_permissions`: `https://www.googleapis.com/*`
- `oauth2.client_id`: Google OAuth client ID for the Chrome extension.
- `oauth2.scopes`: minimum calendar scopes needed for reading and writing events.

Preferred scope:

- `https://www.googleapis.com/auth/calendar.events`

Rationale:

- The product reads existing calendar events and creates user-owned events.
- No OAuth client secret is stored in the extension.
- Interactive auth must be triggered by an explicit user action with context, not silently on first launch.

### 5.2 Calendar Operations

The production Calendar adapter replaces the prototype MCP connector.

Required REST operations:

- `events.list` for fetching Plan, daily focus, weekly learning, and idempotency checks.
- `events.insert` for writing focus events, weekly learning events, and Actual logs.

After authentication, all dates and times use the primary Calendar's IANA
timezone returned by `events.list`. The first read starts with a browser-local
range, adopts the returned Calendar timezone, and repeats once only if that
timezone changes the requested day boundaries. Later reads reuse the discovered
timezone. The browser timezone is otherwise only a disconnected fallback.
Additional timezones displayed by the Google Calendar UI do not replace the
primary Calendar timezone.

Use the primary calendar for MVP unless user settings later introduce calendar selection.

### 5.3 Calendar Colors

Google Calendar color IDs are the canonical calendar color vocabulary. The product maps them into design tokens instead of scattering raw hex codes across components.

| ID | Name | Hex | Default role |
| --- | --- | --- | --- |
| 1 | Lavender | `#a4bdfc` | Default Slack actual block; palette option "Slack" |
| 2 | Sage | `#7ae7bf` | Hidden from Plan by default (self-care) |
| 3 | Grape | `#dbadff` | Available through config, not in default palette |
| 4 | Flamingo | `#ff887c` | Weekly-learning event color |
| 5 | Banana | `#fbd75b` | Daily "something hard" all-day event color |
| 6 | Tangerine | `#ffb878` | Palette option "Learning" |
| 7 | Peacock | `#46d6db` | Available through config, not in default palette |
| 8 | Graphite | `#e1e1e1` | Default saved Actual color when no color is chosen |
| 9 | Blueberry | `#5484ed` | Available through config, not in default palette |
| 10 | Basil | `#51b749` | Hidden from Plan by default (self-care) |
| 11 | Tomato | `#dc2127` | Palette option "Self learning" |

These defaults are represented as user configuration, but MVP does not include any UI for editing them. The persisted settings store semantic choices like `hiddenPlanColorIds` and `dailyFocusColorId`, not duplicated derived UI state.

## 6. Persistence Model

### 6.1 Storage Areas

Use Chrome extension storage rather than `localStorage`.

- `chrome.storage.local`: versioned daily working records, Actual save dispositions, save errors, and the last catch-up result.

Do not use Web Storage for canonical product data.
MVP settings are always derived from code and are not persisted in extension storage.

### 6.2 Daily Working Record

Each day has one `DayRecord` keyed by its primary-Calendar-local date:

```ts
type DayRecord = {
  schemaVersion: 1;
  date: string;
  timezone: string;
  actual: ActualBlock[];
  updatedAt: string;
};
```

Later phases extend the versioned record only when their persisted concepts are implemented. Google Calendar remains the source of truth for the Plan column.

### 6.3 Editable Block Model

Each Actual/Revised block has:

- `id`: stable local UUID.
- `sourceCalendarEventId`: optional, when created by dragging from Plan.
- `summary`: user-editable title.
- `startMinutes`: minutes from local midnight.
- `durationMinutes`: positive whole number.
- `colorId`: empty string or Google Calendar color ID.
- `isSlack`: true if created through the Slack intention flow.
- `saveDisposition`: `unsaved`, `calendarSaved`, or `planMatched`.
- `calendarEventId`: created Google Calendar event ID, once known.
- `lastSaveAttemptAt`: optional timestamp.
- `lastSaveError`: optional normalized error.

`saving` is transient UI state and is never persisted. A failed or ambiguous attempt remains `unsaved` with `lastSaveAttemptAt` and `lastSaveError`. A `planMatched` decision is terminal and is not reconsidered on later saves.

### 6.4 Settings Model

Settings are code-defined defaults and are separate from daily records.

MVP requirement:

- Define and consume the settings schema directly from code.
- Do not persist, validate, migrate, or repair settings in Chrome storage.
- Do not show a settings page, modal, drawer, form, or header button for editing settings.
- Do not treat settings updates as a supported in-product user workflow yet.

Default configurable settings:

- `dayStartHour`: default `7`
- `dayEndHour`: default `21`
- `pixelsPerMinute`: default `1.4`
- `snapMinutes`: default `5`
- `minimumBlockDurationMinutes`: default `5`
- `hiddenPlanColorIds`: default `["2", "10"]`
- `dailyFocusColorId`: default `"5"`
- `weeklyLearningColorId`: default `"4"`
- `defaultActualColorId`: default `"8"`
- `slackColorId`: default `"1"`
- `slackDefaultDurationMinutes`: default `15`
- `actualPaletteColorIds`: default `["11", "6", "1"]`
- `actualEventPrefix`: default `"[Actual]"`
- `slackEventPrefix`: default `"[s]"`

## 7. Top-Level Page Structure

Vertical stack:

- Header: product title "Plan / Actual / Revised", today's date, auth status.
- Error area: banner shown only when there is an active user-visible error.
- Focus banner: "Something hard today".
- Weekly learning banner: "This week's learning on work".
- Day grid: the three-column time-block view.
- Footer action row: secondary "Save Actual to calendar" button and save status hint.

Spacing rhythm:

- Banners are 12px apart.
- Gap between intention banners and the day grid is 24px.
- The grid should feel like the primary workspace, not a marketing page.

## 8. Intention Banners

### 8.1 Something Hard Today

Intent: Encourage the user to commit to one hard thing per day, framed as growth rather than obligation.

Behavior:

- On extension page load, fetch all-day events for today's date.
- Find all-day events with `settings.dailyFocusColorId`.
- If one exists, show a warm amber-tinted banner with label `SOMETHING HARD TODAY`, title, and plain-text description.
- If none exists, show the same banner style with an inline text input placeholder `struggling is how learning happens` and a small check button.
- Clicking the check button or pressing Enter creates an all-day private event for today.
- On save success, switch to read-only display and show toast: `Committed - saved to calendar`.
- On save failure, keep the input editable and show a red toast with the error.
- Multiple matching all-day events stack as separate banners.

### 8.2 This Week's Learning on Work

Intent: Encourage the user to name one skill or muscle to build during the current work week.

Behavior:

- Compute this week's Monday. If today is Monday-Saturday, use the most recent Monday on or before today. If today is Sunday, use the Monday six days ago.
- Fetch all-day events for that Monday.
- Find all-day events with `settings.weeklyLearningColorId`.
- If one exists, show a salmon-tinted banner with label `THIS WEEK'S LEARNING ON WORK`, title, and plain-text description.
- If none exists, show an inline input with placeholder `learning focus` and a check button.
- Clicking the check button or pressing Enter creates an all-day private event on that Monday.
- Toast on save: `Committed for the week - saved to <Monday date>`.

Critical behavior:

- This banner displays Monday through Sunday.
- Opening the extension on Wednesday or Friday must still fetch Monday's all-day events and show the current week's learning goal.

## 9. The Day Grid

### 9.1 Structure

Four visual columns share one time axis:

- Time: narrow left axis with hour labels.
- Plan: today's calendar events, read-only.
- Actual: what really happened today, editable.
- Revised: the replan for the rest of the day, editable.

Column headers are sticky and must align with content dividers even when the scroll area has a scrollbar.

### 9.2 Vertical Time Layout

Blocks are positioned by absolute time, not sequential order. A 9:00am block in Plan and a 9:00am block in Actual sit at the same y-coordinate.

Time range:

- Minimum range uses `settings.dayStartHour` to `settings.dayEndHour`.
- Expanded to include earliest and latest block/event of the day.
- Range boundaries round to whole hours.
- Vertical density uses `settings.pixelsPerMinute`.

On load, auto-scroll to the current time, positioned about 30% down from the visible scroll area.

### 9.3 Now Indicator

A soft orange horizontal line spans the three content columns at the current time. It has:

- Small orange dot on the left tip.
- Small time label on the right.
- Muted orange color, not alarming red.
- Minute-level updates.

### 9.4 Blocks

Every Plan, Actual, and Revised block renders as an absolutely positioned rectangle:

- Top is derived from `startMinutes`.
- Height is derived from `durationMinutes`.
- Minimum visual height is 20px for readability.
- Title truncates with ellipsis.
- Duration label appears in the top-right.
- Time range appears when the block is tall enough.
- Background tint derives from Google Calendar color token at readable opacity.

### 9.5 Overlapping Events

When events overlap, display them as cascaded cards:

- Overlapping blocks share the same top position.
- Each later depth offsets 8px to the right.
- Higher-depth blocks sit visually above lower-depth blocks.
- Clicking a peeking block brings it to the front.
- Click-to-front priority is transient and resets on reload.
- Clicking Actual/Revised also opens the edit modal.

Cascade affects display only. It does not alter the underlying time data.

### 9.6 Column Behavior

Plan:

- Read-only.
- Re-fetched from Calendar.
- Filters out colors in `settings.hiddenPlanColorIds`.
- Excludes daily focus and weekly learning all-day events from the grid.
- Excludes other all-day events from the grid for MVP.

Actual:

- Starts empty for a new day.
- Add by dragging from Plan.
- Add by clicking `+`.
- Add through the Slack intention flow.

Revised:

- Starts empty for a new day.
- Add by dragging from Plan or Actual.
- No direct `+` creation flow in MVP.

## 10. Interactions

### 10.1 Drag Plan to Actual or Revised

Dragging a Plan block into Actual or Revised copies it with:

- Same summary.
- Same duration.
- Same color ID.
- `sourceCalendarEventId` from the Plan event.
- Dropped start time snapped to `settings.snapMinutes`.

The Plan block remains unchanged.

### 10.2 Drag Actual Between Columns

Dragging Actual to Revised or Revised to Actual moves the block. The source column loses the block and the target column receives it at the dropped snapped time.

Dragging an Actual or Revised block within its current column updates its snapped start time. Dropping it at the same snapped start time is a no-op.

### 10.3 Add Block

The Actual header has a `+` button.

Clicking it:

- Inserts an `Untitled` 30-minute block.
- Uses the latest-ending Actual block as the start point, or current time if Actual is empty.
- Opens the edit modal immediately.
- Pre-selects the title.

If the modal is dismissed, the block remains and can be edited or deleted later.

### 10.4 Resize

Actual and Revised blocks have a bottom resize handle.

Behavior:

- Dragging the handle changes duration continuously.
- Duration snaps to `settings.snapMinutes`.
- Minimum duration is `settings.minimumBlockDurationMinutes`.
- Releasing saves the day record.
- Handle drag must not start block drag.
- Handle click must not open the edit modal.

## 11. Edit Modal

Opens when the user clicks an Actual or Revised block.

Contents:

- Block name input.
- Duration input with `min` suffix.
- Color picker based on `settings.actualPaletteColorIds`.
- Delete button.
- Save button.

Color behavior:

- Matching palette color shows selected state.
- Clicking selected swatch deselects it.
- If the block has a color outside the current palette and the user does not touch the palette, preserve the original color.
- Only update `colorId` when the user interacts with the color picker.

Duration behavior:

- Modal duration accepts positive whole minutes.
- Drag/resize still snaps, but typed modal duration does not have to be a multiple of the snap interval.

There is no Cancel button. Users close with Escape or backdrop click.

## 12. Save-to-Calendar

### 12.1 Save Paths

- Manual save: clicking `Save Actual to calendar` saves today's eligible Actual blocks.
- Catch-up save: on extension page load, after initial day data loads, process past-day records in the background.

The first production version does not require alarm-based background saving. The user should never have to remember to save, but the guarantee is still tied to opening the extension again.

### 12.2 Which Blocks Get Saved

Eligible blocks:

- Actual blocks only.
- `saveDisposition` is `unsaved` or absent on a pre-save Phase 4A block.
- Not an exact copy of a Plan event.

Exact Plan copy definition:

- Same normalized summary, local date/start time, duration/end time, effective color, and effective timezone against one fresh day-level Calendar read.

Skipped blocks:

- Already `calendarSaved`.
- Permanently classified `planMatched` blocks.
- Revised blocks.

### 12.3 What Gets Written

Each saved block becomes a new event on the user's primary calendar:

- Summary: `settings.slackEventPrefix` or `settings.actualEventPrefix` plus block summary.
- Start/end: correct historical date and local timezone.
- Color: block color ID if set, otherwise `settings.defaultActualColorId`.
- Reminders: disabled or default-free where Calendar API permits.
- Attendees: none.
- Extended private properties:
  - `planActualRevisedActual: "true"`

### 12.4 Idempotency

The Calendar adapter derives a valid deterministic Google Calendar event ID from the stable local block ID and inserts directly without a pre-insert lookup.

Rules:

- If insert succeeds, mark the block `calendarSaved` and store the returned event ID.
- If insert returns duplicate/409, the deterministic ID proves an earlier attempt created the event, so mark it `calendarSaved` without another request.
- If insert fails or is ambiguous, keep the block local as `unsaved` with normalized failure details.
- Phase 4 retains `calendarSaved` and `planMatched` blocks locally so the active Actual column has one source.

This prevents duplicate events when a network response is lost after Google Calendar successfully created the event.

### 12.5 Manual Save UX

If nothing needs saving:

- Toast: `Nothing new to save - N already saved, M match the plan`.

If blocks need saving:

- Confirmation dialog: `Save X block(s) to your primary calendar? Skipping Y already saved and Z matching the plan.`
- Button shows saving state and is disabled while running.
- Toast summary: `Saved 3 blocks to calendar` or `Saved 2, 1 failed`.

Every save path must show visible success, failure, or no-op feedback.

## 13. Catch-up Auto-save and Cleanup

### 13.1 When It Runs

Catch-up runs on extension page load after:

- Today's day record has loaded.
- Initial Calendar fetch has returned or failed.

The UI remains interactive while catch-up runs.

### 13.2 What It Does

The active window is today plus the two most recent nonempty prior `DayRecord`s, regardless of calendar gaps. For retained past-day records:

- Retry only `unsaved` Actual blocks.
- Never retry `calendarSaved` or `planMatched` blocks.
- Persist per-block save results immediately after each attempt.
- When a record leaves the active window, make one final retry for its unsaved blocks and then delete the entire record regardless of outcome.
- Surface saved, matched, failed, and discarded counts so bounded data loss is explicit.

Days are independent. A failure for Monday must not interfere with Tuesday's local record.

### 13.3 Failure Semantics

Any of these count as failure:

- Network failure.
- Auth failure.
- Calendar API non-2xx response.
- Rate limiting.
- Malformed response.
- Missing event ID after a supposed insert.
- Ambiguous result where the adapter cannot prove the event exists.

Failure behavior:

- Do not mark the block `saved`.
- Do not delete the day record.
- Store the normalized error.
- Surface the failure in a toast.
- Retry on the next catch-up run.

### 13.4 User-visible Feedback

Catch-up shows a toast if anything was saved or failed:

- `Catch-up: saved 5 blocks from 2 past days`
- `Catch-up: saved 3 blocks from 1 past day - 2 pending`
- `Catch-up: 5 blocks pending - will retry next open`

Silent partial failure is forbidden.

## 14. Slack Intention

### 14.1 Intent

Frame every Slack visit as an intentional choice. Before launch, the user names
what they intend to do in Slack, which deters ambient context switching and
creates a corresponding Actual.

### 14.2 UI

A small Slack button sits next to the Actual `+` button. Clicking opens a popover anchored below the button.

Popover contents:

- Label: `What are you up to?`
- Text input with placeholder `attention is devotion :)`
- Button: `Open Slack`

### 14.3 Submission

Clicking `Open Slack`:

- Requires non-empty input.
- Creates a new Actual block:
  - Summary from input.
  - Duration from `settings.slackDefaultDurationMinutes`.
  - Start time is current time snapped to settings.
  - Color ID from `settings.slackColorId`.
  - `isSlack: true`.
- Brings the block to front.
- Persists state.
- Opens `slack://open`.
- Closes and clears the popover.

Use a direct user gesture for the protocol launch. If browser or OS blocks the protocol, keep the logged block and show a non-destructive warning toast.

### 14.4 Later Editing

Slack blocks are normal Actual blocks after creation:

- Editable summary and duration.
- Draggable.
- Deletable.
- Color can be changed.

`isSlack` persists regardless of edits and only affects the save prefix and private Calendar metadata.

## 15. Design System

### 15.1 Design Direction

The UI should feel quiet, work-focused, and durable:

- Warm neutral base.
- Muted calendar color accents.
- Soft shadows.
- Crisp grid alignment.
- Small, readable controls.
- No marketing-style hero sections.
- No decorative gradient blobs or ornamental backgrounds.

### 15.2 Token System

Define design tokens for:

- Backgrounds.
- Foregrounds.
- Borders.
- Focus rings.
- Shadows.
- Spacing.
- Radii.
- Typography sizes.
- Z-index layers.
- Semantic states: success, warning, danger, info.
- Calendar colors.

Tailwind config and CSS variables should both derive from the token source. Google Calendar hex values live in `design/google-calendar-colors.ts`; semantic product tokens live separately.

### 15.3 shadcn/ui Usage

Use shadcn/ui for standard controls:

- Button.
- Dialog.
- Popover.
- Tooltip.
- Input.
- Select.
- Switch.
- Slider.
- Toast.

Do not force the time grid into generic card components. The time grid is custom domain UI.

### 15.4 Layering

From bottom to top:

- Time grid and blocks.
- Grid overlays: now line, drag indicators.
- Sticky headers.
- Popovers.
- Dialogs/modals.
- Toasts.
- Tooltips.

Layer values must come from design tokens, not scattered arbitrary z-index values.

## 16. Empty States and Tooltips

Column title tooltips:

- Plan: `From your calendar - drag to copy into Actual or Revised`
- Actual: `What really happened today`
- Revised: `Drag from Actual to replan the rest of the day`

Control tooltips:

- `+`: `Add block`
- Slack button: `Log Slack time`
- Color swatches: names from current settings/palette.

Tooltips should use the shared tooltip component, not native `title` attributes.

Both intention banners always render. If there is no matching calendar event, render the inline creation form.

## 17. Reliability Requirements

### 17.1 Preserve Local Data

Any failure to write to Calendar must keep local data intact. There is no path where unsaved work is cleared because a save was attempted.

### 17.2 Storage Writes

State is saved on every user action:

- Add.
- Edit.
- Resize.
- Drag.
- Delete.
- Slack log.
- Intention creation attempt.
- Save result update.

Storage operations are asynchronous and may fail. A storage failure must surface an error and keep in-memory state available for retry during the active session.

### 17.3 Recoverable Degradation

- Calendar unreachable at load: show Plan error, keep local editing available.
- Auth missing: show sign-in/connect prompt, keep local editing available.
- Individual write fails: keep block pending and show toast.
- Settings missing or invalid: fall back to defaults and repair persisted settings.
- Schema version mismatch: migrate if possible; otherwise preserve raw data and surface a recovery error.

## 18. Testing Strategy

Implementation follows a TDD workflow:

1. Define or update tests for the agreed behavior.
2. Implement failing tests first and run them red.
3. Implement the minimal production code required to pass.
4. Refactor while keeping tests green.

### 18.1 Unit Tests with Vitest

Required coverage:

- Date math, especially weekly Monday calculation.
- Time snapping and block placement.
- Overlap/cascade grouping.
- Save eligibility filtering.
- Exact Plan copy detection.
- Google Calendar event mapping.
- Deterministic Calendar ID and duplicate-verification behavior.
- Catch-up success, partial failure, and all-failure semantics.
- Storage migration behavior.

### 18.2 Component Tests

Use Vitest with React Testing Library or equivalent for:

- Intention banners.
- Edit modal.
- Slack popover.
- Save button states.
- Error and toast surfaces.

### 18.3 E2E Tests with Playwright

Required E2E flows:

- Extension loads as a Chrome extension page.
- User connects Google account through mocked or test-controlled auth boundary.
- Plan events render from mocked Calendar API responses.
- Drag Plan to Actual and persist across reload.
- Add Actual block, edit it, resize it, delete it.
- Save Actual writes Calendar event with expected payload.
- Failed save keeps local pending block and shows visible error.
- Catch-up retries retained past days on app open.
- A record leaving the bounded active window receives one final attempt and is then deleted with visible discarded counts.
- Slack logging creates a block and attempts protocol launch through user gesture.
- Code-defined settings defaults affect hidden colors, palette, and day range.

Networked Calendar tests should mock the Google API boundary by default. A small manually-run smoke test may exercise a real Google account only when credentials are intentionally configured.

## 19. Implementation Phases

### Phase 1 - Extension Foundation

- Manifest V3 project scaffold.
- React/Vite/Tailwind/shadcn setup.
- Token system.
- Extension app page.
- Background service worker.
- Typed message boundary.
- Versioned daily-record storage wrapper and code-defined settings defaults.

### Phase 2 - Calendar and Auth

- Chrome identity OAuth.
- Calendar client.
- Event list/insert mapping.
- Auth UI states.
- Mockable Calendar adapter for tests.

### Phase 3 - Core Day Grid

- Plan fetch and render.
- Actual/Revised state.
- Add/edit/delete.
- Drag/copy/move.
- Resize.
- Cascade overlays.
- Now indicator.

### Phase 4 - Intentions and Slack

- Daily focus banner.
- Weekly learning banner.
- Slack intention popover.
- Calendar creation for intention events.

### Phase 5 - Save Reliability

- Save eligibility.
- Idempotent insert.
- Manual save.
- Catch-up.
- Error normalization.
- Bounded catch-up retries and explicit cleanup after the active window.

### Phase 6 - Configuration Foundation and Polish

- Centralized settings schema for colors, day range, snapping, palette, and prefixes.
- No user-facing settings UI in MVP.
- E2E coverage.
- Accessibility pass.
- Performance pass.

## 20. Non-Goals for MVP

- Editing Plan blocks in place.
- Updating already-created `[Actual]` events after save.
- Collaboration or sharing.
- Statistics or aggregate views.
- Multi-calendar selection.
- Multi-day blocks that span midnight.
- Mobile/iOS support.
- Tiny popup UI.
- User-facing settings UI.
- Server-side backend.

## 21. Success Criteria

The product works if a user:

- Opens the extension each morning and immediately sees today's calendar, weekly learning goal, and option to commit to a hard thing.
- Logs Actual events with low friction throughout the day.
- Replans the remainder of the day without fighting the UI.
- Trusts that unsaved local data will not disappear.
- Gets clear feedback for every save, failure, and retry.
- Sees past Actuals flow into Google Calendar without duplicate events.
- Gets behavior driven by centralized settings defaults for day range and color semantics.
- Sets an intention before opening Slack often enough to change their behavior around impulsive Slack opens.

The mechanical requirements above serve those experiential outcomes.
