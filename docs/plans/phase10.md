# Phase 10 — Slack Intention Tracer

## Goal

Make opening Slack an intentional action by asking for an intention first,
logging that intention as a normal Actual, and then attempting to open the
Slack desktop app.

The Slack Actual is the durable outcome. Slack launch is best-effort and never
controls whether that Actual is kept.

## User Experience

The Actual header contains two compact icon controls:

- a `+` icon for Add Actual; and
- a muted grayscale Slack mark for Log Slack time.

The Slack control opens a lightweight Radix popover containing:

- the friendly prompt `What are you up to?`;
- a text input with placeholder `attention is devotion :)`; and
- a compact `Open Slack` action.

The text field uses the same underline-only visual language as the Add Actual
editor. The Slack mark remains recognizable without competing with the rest of
the interface.

Whitespace-only input is invalid. Submission stays disabled until the trimmed
intention is nonempty. Closing or successfully submitting the popover clears
the draft intention.

## Actual Creation

Slack does not introduce a separate block type. It creates a standard
`ActualEvent` through the same creation and persistence path as Add Actual,
with these Slack-specific values:

- `summary`: the trimmed intention;
- `startMinutes`: the current Calendar-local time snapped to settings;
- `durationMinutes`: `settings.slackDefaultDurationMinutes`, bounded at
  midnight;
- `colorId`: `settings.slackColorId`;
- `isSlack: true`; and
- `saveDisposition: "unsaved"`.

The app shares Actual construction, time bounding, append, and persistence
logic between Add Actual and Slack. Editor behavior and Slack launch behavior
remain explicit at their call sites.

## Persisted Shape

`ActualEvent` has one optional canonical marker:

```ts
isSlack?: true;
```

The marker stays in the existing version-one `DayRecord`; no schema version
increment or parallel Slack record is introduced. Persisted `isSlack: false`
is rejected so absence remains the canonical representation of a normal
Actual.

The marker is preserved through edits, resizes, identity replacement, storage
reloads, and Calendar-save state transitions. This read path is necessary
because a Slack Actual may be saved to Calendar after the app reloads.

No `planActualRevisedKind` metadata is stored.

## Launch Behavior

Submission performs these operations in the same synchronous user-activation
stack:

1. Build and optimistically persist the Slack Actual.
2. Attempt `window.open("slack://open", "_self")`.
3. Close and clear the popover.

Logging happens before launch, so the Slack Actual remains even if Slack is
missing or the protocol attempt fails.

If the launch call throws synchronously, the app shows a dismissible warning:

> Slack may not have opened. Your time was still logged.

The app does not use blur, visibility, timeout, or focus heuristics to guess
whether another application opened. Browsers do not expose a reliable success
signal for custom-protocol handoff, so a missing Slack installation may fail
without producing an in-app warning.

## Calendar Save

Slack Actuals use the standard Actual Calendar workflow:

- Plan matching and deterministic event IDs are unchanged.
- Inserted summaries use the configured Slack prefix, currently `[s]`.
- The configured Slack color is retained.
- Existing private metadata remains
  `planActualRevisedActual: "true"`.
- No Slack-specific private metadata kind is added.

After creation, Slack Actuals remain ordinary editable, resizable, deletable,
and saveable Actual blocks.

## Overlap and Front Selection

Creation does not explicitly force a Slack or Add Actual block to the front.
The shared layout algorithm orders blocks by:

1. earlier start time;
2. longer duration when start times match; and
3. persisted input order for exact timing ties.

Because new Actuals are appended, an exact-time new block naturally receives
the higher overlap layer without storing `createdAt` solely for presentation.

Clicking or resizing can still bring an Actual to the front. That selection is
transient local `DayGrid` state and is never persisted.

## Component Responsibilities

- `src/app/components/SlackIntentionPopover.tsx` owns the controlled Radix
  popover, intention draft, validation, accessible labels, and Slack icon.
- `src/app/components/ui/popover.tsx` owns the small shared Radix wrapper and
  base popover styling.
- `src/app/components/DayGrid.tsx` owns the header controls and transient
  click/resize front selection.
- `src/app/App.tsx` owns Actual creation, optimistic persistence, protocol
  launch, and launch-failure feedback.
- `src/domain/day-event.ts` and `src/domain/day-record.ts` own the canonical
  Slack marker and persisted-boundary validation.
- `src/workflows/sync-day-actuals-to-calendar.ts` selects the Slack Calendar
  summary prefix at the Calendar edge.

## Test Coverage

Unit coverage proves:

- compact accessible icon controls and friendly popover styling;
- trimmed required input and no creation before valid submission;
- configured Slack timing, midnight bounding, color, and marker;
- optimistic persistence even when launch throws;
- storage round-trip for `isSlack: true` and rejection of `false`;
- marker preservation through editing and identity replacement;
- `[s]` Calendar summaries with existing private Actual metadata; and
- natural insertion-order layering for exact timing ties.

Deterministic Playwright coverage proves:

- empty input neither logs nor launches;
- launch is attempted from active user activation;
- a Slack Actual persists across reload;
- Calendar save uses `[s]` and standard private metadata; and
- synchronous launch failure keeps the logged Actual and shows a warning.

An opt-in real smoke test attempts the actual Slack protocol using a dedicated
Chrome profile and verifies that the local Slack Actual remains. It restores
the profile's original day-record storage afterward.

## Working Agreement

Implementation followed red → green → refactor:

1. Add focused failing tests for each agreed behavior.
2. Implement the smallest behavior that passes.
3. Refactor shared Actual creation and persistence while keeping tests green.
4. Remove returned-ID and controlled front-selection plumbing after choosing
   natural overlap ordering.
5. Run unit tests, lint, build, deterministic E2E where the environment allows,
   and review before commit.

## Status

Completed in:

- `e5196ad` — `Add Slack audit tracer`

Final unit, lint, build, and diff checks passed. The deterministic E2E suite
passed during implementation; the final rerun after the overlap tie-break
refactor was blocked because the environment denied the required unsandboxed
Chromium execution. The opt-in real Slack smoke was not run.

## Deferred Work

- Reliable detection of whether the Slack desktop app actually opened.
- Any Slack API, OAuth, workspace, channel, or message integration.
- Persisted per-Actual creation timestamps; current insertion order is
  sufficient for exact-tie layering.
- Slack-specific Calendar private metadata beyond the `[s]` summary prefix.
