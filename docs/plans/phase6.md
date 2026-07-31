# Phase 6 — Revised and Drag Workflow Tracer

## Goal

Add Revised as a second editable workspace and complete the native desktop drag
workflow across Plan, Actual, and Revised without changing the optimistic
storage model established in Phase 5.

Plan remains a copy-only drag source. Actual and Revised blocks can move
between editable columns or be repositioned within their current column.
Deletion remains available only through the editable-event dialog.

## Working Agreement

Implementation followed three TDD slices. Each slice used this sequence:

1. Add the agreed failing storage, domain, component, app, or E2E tests.
2. Run the focused tests and confirm the expected failure.
3. Implement the minimum behavior required to pass.
4. Refactor while keeping the focused tests green.
5. Run unit tests and the complete deterministic E2E suite.
6. Review findings and apply only the selected fixes.
7. Commit only after explicit approval.

## Slice 6A — Backward-Compatible Revised Workspace

### Canonical Record Shape

- Keep `schemaVersion: 1`.
- Canonical in-memory and newly written `DayRecord` values require
  `revised: RevisedEvent[]`.
- The storage reader accepts legacy version-one records without `revised` and
  normalizes them in memory to `revised: []` without immediately writing.
- `revised`, when present at the storage boundary, is validated like the rest
  of the persisted record.
- An ordinary later mutation lazily writes the complete canonical shape.

### Editable Event Model

- `EditableEvent` extends the common day-event fields with optional
  `sourceCalendarEventId` and `isSlack` provenance.
- `ActualEvent` adds Calendar-save state to that editable shape.
- `RevisedEvent` has no Calendar-save disposition, event ID, attempt time, or
  save error and is never eligible for Calendar save.

### Workspace Behavior

- Render Time, Plan, Actual, and Revised over the existing Plan-derived grid
  range.
- Revised uses the shared editable block, dialog, clipping, overlap, and resize
  behavior where it genuinely matches Actual.
- Revised supports edit, resize, and dialog deletion.
- Revised has no Add button, Slack control, or Calendar-save action.
- Calendar-save and catch-up workflows continue to process only `actual` while
  preserving `revised` in every complete-record write.

### Status

Completed and committed as `779535d`
(`Add Revised workspace foundation`).

## Slice 6B — Plan Copy Drag

### Native Drag Model

- Use native HTML drag events and the browser-provided drag ghost.
- Plan can be dragged only into Actual or Revised.
- Plan never accepts drops and is never changed or deleted by a drag.
- A Plan drop creates a fresh local UUID and copies summary, duration, color,
  and the Plan event ID as `sourceCalendarEventId`.
- An Actual copy starts `unsaved`; a Revised copy contains no save metadata.

### Drop Geometry

- Preserve the vertical point where the block was grabbed.
- Convert the pointer position to a start time using the target column's grid
  origin and the captured grab offset.
- Snap to the nearest configured `snapMinutes` interval.
- Clamp between the rendered grid start and its final visible snap slot.

### Drop Preview

- Tint only a valid editable target with a subtle primary highlight.
- Show the snapped start-time label followed by a muted now-colored horizontal
  trace; the trace begins after the label instead of running underneath it.
- The current-time indicator uses the same transparent-label treatment, with
  its stronger now-colored trace preceding the time label.
- Clear target tint and trace on leave, cancellation, drag end, or drop.

### Interaction Boundaries

- Disable all drag sources and drop handling while the day record is loading
  or Actuals are being saved to Calendar.
- Re-enable dragging after a storage read settles, including after read
  failure, so the existing optimistic recovery policy remains usable.
- Keep dragging enabled while ordinary optimistic storage writes are pending;
  the ordered queue serializes complete snapshots.
- Keep resize handles outside block dragging.
- Suppress the edit click produced by a completed editable-block drag.
- Retain drag-end cleanup handlers if dragging becomes disabled during an
  already active gesture.

### Status

Completed and committed as `29b568e`
(`Add Plan copy drag workflow`).

## Slice 6C — Actual and Revised Move Workflow

### Operation Routing

Every drop carries the source column, source event ID, target editable column,
and calculated snapped start time.

- Plan to Actual or Revised is a copy.
- Actual to Revised and Revised to Actual is a move and type conversion.
- Actual or Revised to its current column updates `startMinutes`.
- A same-column drop at the existing snapped start is a no-op and does not
  enqueue a storage write.

The source-aware operation keeps grab-offset calculation, snapping, clamping,
preview cleanup, and persistence shared across all drag paths.

### Calendar-Safe Identity

When an Actual changes position or enters Revised:

- An untouched unsaved Actual preserves its UUID.
- A `planMatched` Actual preserves its UUID.
- A `calendarSaved` Actual receives a fresh UUID.
- An unsaved Actual with a previous insert attempt receives a fresh UUID.
- Calendar-save metadata is cleared from the resulting local block.

When Revised enters Actual, it preserves its UUID and starts as `unsaved`.
Summary, duration, color, `sourceCalendarEventId`, and `isSlack` survive every
move. Any Calendar event created earlier remains untouched because Calendar
updates and deletions are outside this phase.

The Calendar-safe identity decision is centralized and shared with normal
Actual edit and resize behavior.

### Persistence and Layering

- Persist each copy, move, or reposition as one complete optimistic
  `DayRecord` snapshot.
- A failed write leaves the changed block visible and surfaces the existing
  storage warning.
- Moving a block updates its natural array recency; no separate cascade
  priority model is stored.
- Click-to-front keeps one transient frontmost ID per column and is never
  written. Reload restores natural cascade layering.

## Deterministic Tracer

The Playwright tracer:

1. Drags one seeded Plan event into Actual and Revised.
2. Verifies copied content, provenance, distinct UUIDs, and snapped starts in
   extension storage.
3. Reloads and confirms both editable columns persist.
4. Moves the untouched Actual to Revised and back while preserving its UUID.
5. Repositions the returned Actual within its own column.
6. Reloads again and verifies the final canonical record and rendered times.

Unit and component coverage additionally verifies legacy storage
normalization, malformed Revised rejection, Revised editing/resizing/deletion,
drop preview cleanup, drag disabling, click-versus-drag separation, complete
optimistic snapshots, visible write failures, and every Calendar-safe identity
case.

## Verification

The final Phase 6 candidate passes:

- 227 tracked unit and component tests;
- 24 deterministic Playwright tests;
- TypeScript typechecking;
- ESLint;
- the production build; and
- `git diff --check`.

## Status

Completed across the Revised foundation, Plan-copy workflow, and this final
Actual/Revised move-workflow commit.
