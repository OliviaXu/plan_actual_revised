# Phase 5 — Actual Column Editing Tracer

## Goal

Make Actual a multi-block, editable workspace after Plan has loaded
successfully. Actual changes are optimistic and remain usable when local
storage fails.

The deterministic E2E tracer stays focused on real persistence and reload
behavior. It will not include an artificial storage-failure hook.

Actuals never expand the Plan-derived grid range. Partially visible Actuals
are clipped to the Actual column, and completely out-of-range Actuals are not
rendered.

## Working Agreement

Implementation is split into small functional slices. Each slice follows:

1. Add or update tests for the agreed behavior.
2. Run the new tests and confirm that they fail for the expected reason.
3. Implement the minimum production code needed to pass.
4. Refactor while keeping the tests green.
5. Run unit tests and the complete deterministic E2E suite.
6. Review the slice and report findings.
7. Pause for user inspection and selection of any review fixes.
8. Commit only after explicit user approval.

The next slice does not begin until the preceding slice has been reviewed and
committed.

## Slice 5A — Plan-Gated Hydration

### Behavior

- Actual creation and hydration wait for a successful initial Plan response.
- An authenticated Calendar response with zero Plan events still counts as a
  successful Plan load.
- The canonical `DayRecord` is loaded using the Calendar response's date and
  timezone.
- Add remains disabled while Plan or Actual storage is loading and whenever
  Calendar is disconnected or failed.
- The browser timezone is only a display fallback while Plan is loading. It is
  not used to create a canonical Actual record.

### Status

Completed and committed as `dcd8bf9` (`Gate Actual hydration on Plan load`).

## Slice 5B — Optimistic, Ordered Persistence

### Behavior

- Update the in-memory `DayRecord` immediately.
- Serialize every complete mutation snapshot through the existing
  `chrome.storage.local` boundary.
- Preserve the order in which rapid mutations were made, even when an earlier
  write fails.
- Keep optimistic Actuals in memory after a failed write.
- Surface local-storage failures as warnings without blocking Actual use or
  Calendar saving.
- A later mutation or Calendar disposition update naturally retries storage by
  writing the latest complete snapshot through the same queue.
- Do not add an explicit Retry button or a separate read-retry state machine.

### Storage Failure Policy

Chrome local-storage failures are treated as exceptional. The app favors
keeping Actual logging and Calendar saving available instead of adding a
recovery workflow for rare failures.

- A read failure is treated as an empty in-memory day after showing a warning.
- A write failure preserves the optimistic in-memory record and shows a
  warning.
- Read and write errors are not modeled as mutually exclusive application
  modes. A subsequent successful full-record write establishes the latest
  durable state.
- Storage failures do not disable Add or Calendar Save after the initial
  Plan-gated load has settled.
- Calendar is the durable fallback for Actuals that were successfully inserted
  there.

This policy intentionally accepts two risks:

- A read failure followed by a successful write can replace a record that was
  temporarily inaccessible.
- Closing the page before any later successful write can lose session-only
  optimistic changes.

These cases are expected to be rare, and affected Actuals are straightforward
to recreate manually. We are intentionally not adding complexity to eliminate
that risk.

### Validation Boundary

- Keep runtime validation when reading from `chrome.storage.local`, because the
  storage result enters the app as unknown runtime data and may include an old,
  malformed, or manually modified record.
- Trust the statically typed `DayRecord` on the write path. The app constructs
  these records itself, so `saveDayRecord(record: DayRecord)` does not repeat
  `isDayRecord` or `isActualBlock` validation.
- Old records are expected to be removed in a later phase. Until then, the
  limited read-boundary validation remains inexpensive and keeps the runtime
  type boundary honest.

### Testing

Unit and component coverage includes:

- optimistic rendering before a write finishes;
- ordered rapid writes;
- continuation of the queue after a rejected write;
- preservation of an optimistic block after failure;
- Calendar saving while a local write is pending or has failed;
- a later complete write clearing the warning after success; and
- a rare read failure becoming an empty but usable in-memory day.

Storage failure translation remains unit-tested. Failure UI is
component-tested. No artificial storage-failure E2E hook is added.

### Status

Completed and committed as `58ea138`
(`Make Actual persistence optimistic and ordered`).

The implementation intentionally clears an existing storage warning when a
later complete write begins. If that write fails, the warning is shown again.
This keeps the deliberately lightweight, availability-first failure policy
without adding separate pending-durability UI.

## Slice 5C — Multiple-Block Add and Edit

### Multiple-Block Creation

- Remove the one-Actual limit.
- Add creates an `Untitled`, 30-minute, default-colored, unsaved block.
- Immediately open the new block's dialog with its title selected.
- Start every new block at the current time snapped down to `snapMinutes`.
- Allow new blocks to overlap existing Actuals. Overlap is unavoidable once
  dragging and Slack blocks are introduced, so creation does not maintain or
  cache a latest-Actual-end value.
- Near midnight, shorten the default duration to the remaining time.
- If fewer than five minutes remain, create a five-minute block beginning at
  11:55 PM.
- Derive each Add from the rendered `DayRecord` without a duplicate
  synchronous record mirror. Same-render rapid clicks are intentionally not
  supported; the edit modal will serialize normal creation.
- Disable Add while Actuals are being saved to Calendar, with the same guard at
  the handler boundary, so a disposition write cannot replace a newly added
  block with its older Calendar-save snapshot.

### Edit Dialog

- Add `@radix-ui/react-dialog`.
- Add a local shadcn-style Dialog primitive.
- Require a nonblank title.
- Require a positive whole-minute duration.
- Show the configured color swatches.
- Preserve an out-of-palette stored color until the user touches the picker.
- Clicking the currently selected swatch clears the color selection.
- Provide Delete and Save actions.
- Escape or backdrop dismissal discards the dialog draft and leaves the
  underlying block unchanged.
- A no-op Save closes the dialog without writing or changing the block's
  identity.
- Delete removes only the local Actual. It never deletes Calendar or Plan
  events.

### Mutation Disposition Rules

- Editing a `planMatched` block resets it to `unsaved` while preserving its
  UUID.
- Editing a `calendarSaved` block assigns a fresh UUID and resets it to
  `unsaved`.
- Editing an unsaved block with a previous insert attempt also assigns a fresh
  UUID before resetting it to `unsaved`.
- A meaningful edit clears `calendarEventId`, `lastSaveAttemptAt`, and
  `lastSaveError`.

### Testing

Unit and component coverage includes:

- multiple-block placement;
- current-time placement with intentional overlap;
- late-night shortening and the 11:55 PM minimum case;
- immediate dialog opening and title selection;
- title and duration validation;
- dialog dismissal;
- palette and out-of-palette behavior;
- no-op saves;
- disposition and UUID transitions;
- local-only deletion;
- rapid mutation snapshots and stale-closure prevention; and
- canonical persistence after every meaningful mutation.

Playwright adds multiple Actuals and reloads between creation, editing, and
deletion to prove persistence through the real extension storage boundary.

## Slice 5D — Resize and Bounded Rendering

### Rendering

- Render Actual title and duration.
- Render the time range only when the block is tall enough.
- Apply the Actual color tint.
- Provide a distinct edit surface and bottom resize handle.
- Keep the shared grid range determined solely by eligible Plan events and the
  configured defaults.
- Do not include Actual start or end bounds when calculating the grid range.
- Clip Actuals that partially intersect the Plan-derived range.
- Omit Actuals that are completely outside the range.
- Existing crossing-midnight records remain loadable and are clipped, but must
  be shortened before they can be edited.

### Resize Interaction

- Preview duration continuously while the pointer moves.
- Snap the preview to `snapMinutes`.
- Enforce the configured minimum duration.
- Cap the block at midnight.
- Persist exactly once on pointer release.
- Restore the original duration on pointer cancellation.
- Resizing a block follows the same disposition and UUID rules as editing it.
- The resize handle must not open the edit dialog or initiate future block
  dragging.

### Testing

Unit and component coverage includes:

- continuous preview;
- snapping;
- minimum duration;
- midnight cap;
- one write on release;
- cancellation rollback;
- resize disposition and UUID transitions;
- separation of resize and edit interactions;
- partial clipping; and
- complete omission outside the Plan-derived range.

Playwright reloads after resizing to prove canonical persistence.

## Interfaces and Dependencies

- Extend `PlanDayGrid` with Actual edit and resize callbacks plus a
  mutation-disabled state.
- Keep `ActualBlock` unchanged.
- Keep `DayRecord.schemaVersion` unchanged.
- Keep queue, dialog draft, error display, and resize-preview state transient.
- Add `@radix-ui/react-dialog` and a local shadcn-style Dialog primitive.
- Preserve the existing uncommitted Luxon and timezone work.

## Deferred Work

The following remain outside Phase 5:

- Revised-column behavior;
- dragging Actual blocks;
- overlap-priority persistence;
- Calendar event update; and
- Calendar event deletion.
