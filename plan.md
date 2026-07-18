# Plan / Actual / Revised - Implementation Plan

## Planning Principles

- Build in risk-first vertical slices. Each phase should leave a thin working product path, not only scaffolding.
- Use TDD within each phase: write or update the relevant unit/component/E2E tests first, run them red, implement the minimal code to pass, then refactor while keeping tests green.
- Every phase must have a deterministic E2E tracer that can run in CI with mocked or seeded boundaries.
- External integration phases should also have an opt-in real smoke check for local validation against Chrome and Google Calendar.
- Real smoke checks must be safe: test-created Calendar events use a unique test prefix and private metadata so they can be identified and cleaned up.
- Design tokens, Tailwind, and shadcn primitives are part of the foundation. Viewport breadth, visual QA, and polish can come later.
- MVP includes settings schema/defaults, but no user-facing settings UI.

## Phase 1 - Extension, Test Harness, and Design System Tracer

Goal: prove the extension runtime, app shell, background messaging, test harness, and design foundation all work together.

Build:

- Manifest V3 extension shell with an extension app page opened from the toolbar action.
- React, TypeScript, Vite, Tailwind, shadcn/ui, lucide-react, and tokenized CSS variables.
- Background service worker with a typed ping/status message.
- Playwright extension loader for deterministic E2E tests.
- Vitest setup for unit tests.
- Settings defaults available in memory for the app shell only; persistent storage work starts in Phase 4.

Deterministic E2E tracer:

- Load the unpacked extension in Playwright.
- Open the extension page.
- Verify the app shell renders with tokenized styles.
- Verify the UI receives a successful response from the background service worker.
- Verify default config values affect visible shell text or styling.

Real smoke:

- None required beyond manually loading the unpacked extension in Chrome.

Exit criteria:

- `npm run build`, unit test command, and deterministic E2E command exist.
- The extension is runnable as an unpacked extension.
- No throwaway styling path bypasses the token system.

## Phase 2 - Auth and Calendar Boundary Tracer

[Phase 2 cleanup plan](./phase2-cleanup.md)

Goal: prove the risky OAuth and Calendar API boundary before building the calendar UI.

Build:

- Chrome identity OAuth flow behind an explicit user action.
- Background-owned Calendar client boundary.
- Normalized success/error result handling for auth and Calendar calls.
- UI states for disconnected, connecting, connected, and Calendar error.
- Mockable Calendar API boundary for deterministic tests.

Deterministic E2E tracer:

- Mock auth success and Calendar success through the background boundary.
- Verify the UI can request Calendar data and display a minimal raw success state.
- Mock auth failure and Calendar failure.
- Verify user-visible error states render without relying on console output.

Real smoke:

- Opt-in local test acquires a real OAuth token.
- Opt-in local test performs a read-only Calendar call against the user's primary calendar and displays a basic success count.

Exit criteria:

- UI never calls Google APIs directly.
- Auth and Calendar failures are visible in the UI.
- Real read-only OAuth smoke is documented and can be run without affecting Calendar data.

## Phase 3 - Plan Column Tracer

Goal: turn Calendar reads into the first real product surface: a correct read-only Plan column.

Build:

- Calendar event normalization for timed events, all-day events, colors, timezone, and duration.
- Primary Calendar timezone discovery and Calendar-local day ranges, positioning, and now-line behavior.
- Plan-only day grid with time axis, sticky header, now line, block rendering, overlap cascade, hidden color filtering, and all-day exclusions.
- Use settings defaults for day range, hidden colors, vertical density, and Calendar color tokens.

Deterministic E2E tracer:

- Seed Calendar responses with timed events, overlapping events, hidden-color events, daily-focus all-day events, weekly-learning all-day events, and unrelated all-day events.
- Verify only eligible timed events render in Plan.
- Verify time positions, durations, colors, cascade behavior, and now-line presence.
- Verify Calendar error leaves the app usable and shows a visible Plan error.

Real smoke:

- Opt-in local test uses real OAuth and real Calendar `events.list`.
- Verify real events from the user's primary Calendar render in the Plan column through the same UI path as seeded events.

Exit criteria:

- Plan rendering is correct enough to trust real Calendar data.
- All Calendar read behavior still passes deterministic E2E before real smoke is considered.

## Phase 4 - Actual Save Reliability and Storage Tracer

Goal: prove the core durability promise before building complex editing and dragging.

Build:

- Chrome extension storage wrapper for canonical daily records; settings remain code-derived.
- Versioned `DayRecord` shape with one primary-Calendar-local date key per day.
- Minimal Actual block creation path for a single block.
- Manual save path for Actual blocks.
- Calendar insert payload mapping with private extended metadata.
- Deterministic Calendar event ID derived from the local block ID; a duplicate/409 proves an earlier insert succeeded.
- Persisted save dispositions: unsaved, Calendar-saved, and permanently Plan-matched; saving remains UI-only.

Deterministic E2E tracer:

- Create one minimal Actual block and verify it persists across reload.
- Save the block and verify the mocked Calendar insert payload includes title, time, color, timezone, and private metadata.
- Simulate an exact Plan match and verify it becomes permanently Plan-matched without insert.
- Simulate failed and ambiguous insert outcomes and verify the local block survives reload as unsaved with failure details.

Real smoke:

- Opt-in local test creates one clearly prefixed test Actual event on the user's primary Calendar.
- Verify the event includes private metadata.
- Verify rerunning the smoke does not create a duplicate.
- Cleanup either deletes the test event or prints an explicit cleanup target.

Exit criteria:

- The product can write one durable Actual without data loss or duplication.
- Storage schema/versioning is in place before richer Actual/Revised workflows depend on it.

## Phase 5 - Actual Column Editing Tracer

Goal: make daily Actual logging usable while staying inside the already-proven storage/save model.

Build:

- Actual column rendering from the daily record.
- Add button for Actual.
- Edit modal for title, duration, and color.
- Resize handle.
- Delete flow.
- Local persistence after every user action.

Deterministic E2E tracer:

- Add an Actual block, edit title/duration/color, resize it, delete it, and reload between steps.
- Verify storage-backed state survives reloads.
- Verify invalid or failed storage writes surface visible errors and keep in-memory work available during the session.

Real smoke:

- Optional: save an edited Actual block through the Phase 4 real Calendar write path.

Exit criteria:

- Actual is useful without drag interactions.
- Every Actual mutation writes through the canonical storage path.

## Phase 6 - Revised and Drag Workflow Tracer

Goal: add the interaction-heavy Plan/Actual/Revised mechanics after Plan rendering and Actual persistence are reliable.

Build:

- Revised column rendering and persistence.
- Drag Plan to Actual or Revised as copy.
- Drag Actual/Revised between editable columns as move.
- Drag Actual/Revised onto Plan as delete.
- Snapped drop times based on settings defaults.
- Cascade priority persistence for clicked/fronted blocks.

Deterministic E2E tracer:

- Drag a Plan event into Actual and Revised and verify copied summary, duration, color, source event ID, and snapped start time.
- Move Actual to Revised and back.
- Drag an editable block to Plan and verify deletion.
- Reload and verify resulting Actual/Revised state persists.

Real smoke:

- Optional: use real Plan events from Phase 3 as drag sources, without writing anything to Calendar unless the user manually triggers save.

Exit criteria:

- The core Plan/Actual/Revised loop works end to end with persisted local state.

## Phase 7 - Catch-up Tracer

Goal: prove historical auto-save and cleanup semantics independently from today's manual save.

Build:

- Catch-up runner that scans past-day records.
- Save filtering for unsaved Actual blocks.
- Per-block persistence after each save attempt.
- Active window of today plus the two most recent nonempty prior day records.
- One final retry followed by deletion when a record leaves the active window, regardless of outcome.
- Catch-up summary with saved, matched, failed, and discarded counts.

Deterministic E2E tracer:

- Seed yesterday's unsaved Actual block.
- Load today's extension page.
- Verify catch-up saves the block and removes yesterday's record only after proven success.
- Simulate retained-record failure and verify it remains unsaved for the next app-open retry.
- Verify Plan-matched and Calendar-saved blocks are never retried.
- Verify an expired record gets one final attempt and is deleted with explicit discarded counts.

Real smoke:

- Opt-in local test seeds a past-day record and writes one clearly prefixed test event.
- Rerun the smoke to verify idempotency prevents duplicates.
- Cleanup uses the test prefix/private metadata convention.

Exit criteria:

- Retained past-day records retry on every app open.
- Cleanup is bounded and any discarded unsaved work is reported explicitly.

## Phase 8 - Daily Focus Tracer

Goal: add the first intention feature as its own vertical slice.

Build:

- Daily focus read path using the configured focus color default.
- Daily focus empty state input.
- All-day Calendar insert for the focus event.
- Success, failure, and existing-event display states.

Deterministic E2E tracer:

- Seed no focus event and verify the input renders.
- Submit focus text and verify all-day Calendar insert payload.
- Seed an existing focus event and verify read-only display.
- Simulate insert failure and verify the input remains retryable with a visible error.

Real smoke:

- Opt-in local test creates a clearly prefixed daily focus all-day event and verifies it renders after reload.

Exit criteria:

- Daily focus works without depending on weekly learning or Slack.

## Phase 9 - Weekly Learning Tracer

Goal: add weekly learning separately because week-boundary date math is easy to get subtly wrong.

Build:

- Monday calculation for Monday-Saturday and Sunday behavior.
- Weekly learning read path using the configured weekly-learning color default.
- Weekly learning empty state input.
- All-day Calendar insert on the computed Monday.

Deterministic E2E tracer:

- Freeze dates for Monday, Wednesday, Saturday, and Sunday.
- Verify the computed Monday is correct in each case.
- Seed existing weekly learning on Monday and verify it renders throughout the week.
- Submit new weekly learning and verify the insert date is the computed Monday.

Real smoke:

- Opt-in local test creates a clearly prefixed weekly learning all-day event on the computed Monday and verifies it renders from the current day.

Exit criteria:

- Weekly learning behavior is correct across the work-week boundary.

## Phase 10 - Slack Audit Tracer

Goal: add Slack logging as an isolated behavior-shaping feature with its own launch risk.

Build:

- Slack popover anchored in the Actual header.
- Required reason input.
- Slack Actual block creation with default duration, color, and `isSlack`.
- Direct user-gesture protocol launch via `slack://open`.
- Warning toast if the launch is blocked, while keeping the logged block.

Deterministic E2E tracer:

- Open the Slack popover, enter a reason, submit, and verify an Actual block is created and persisted.
- Verify empty input does not launch or create a block.
- Mock/observe the protocol-launch attempt from a direct user gesture.
- Save a Slack block and verify the Slack prefix/private metadata kind.

Real smoke:

- Optional local smoke attempts to open Slack desktop through the protocol URL and verifies the block is still logged.

Exit criteria:

- Slack audit creates durable Actual data even when external protocol launch fails.

## Phase 11 - Production Hardening and Visual QA

Goal: broaden confidence after the risky architecture, Calendar, storage, and workflow paths are proven.

Build:

- Viewport polish across desktop and narrower extension-page widths.
- Accessibility pass for keyboard, focus, dialogs, labels, and contrast.
- Error copy refinement.
- Performance pass for dense calendars and overlapping events.
- Visual QA around grid alignment, sticky headers, modals, popovers, toasts, and tooltips.

Deterministic E2E tracer:

- Run desktop and narrow viewport smoke tests.
- Verify text does not overflow controls.
- Verify grid headers align with content columns.
- Verify modal/popover/toast layering.
- Verify major failure states remain visible and recoverable.

Real smoke:

- Manual end-to-end day-in-the-life smoke using real Calendar reads and a small number of clearly prefixed test writes.

Exit criteria:

- The extension feels production-ready enough for regular personal use.
- Remaining gaps are documented as follow-up product work, not hidden implementation debt.
