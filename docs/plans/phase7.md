# Phase 7 — Catch-up Tracer

## Goal

Catch up unsaved Actuals from previous Calendar days whenever the app opens or
refreshes, without blocking today's Plan or Actual workspace.

Catch-up starts only after both of the inputs that define today's canonical
working day are known to be usable:

- today's primary Calendar load succeeded; and
- today's canonical `DayRecord` read succeeded.

Today remains manual-save territory. Catch-up processes only records whose
Calendar-local date is earlier than today.

## Execution Model

- The app sends one background-owned `catchUp.run` message on every successful
  app load. A refresh is a new load.
- The message carries the canonical Calendar date returned by today's
  successful Calendar read.
- Catch-up is not limited to once per day, and its last result is not persisted.
- The app does not await catch-up before rendering or enabling today's UI.
- A failed Calendar load or failed canonical local-record read prevents
  catch-up from starting on that load.
- Concurrent requests are coalesced into one service-worker run. All callers
  share the result of the run already in flight; a later request can start a
  fresh run after it settles.
- Runtime messages sent by the extension's own statically typed code are
  trusted. The receiver does not repeat runtime date validation for
  `todayDate`.

## Historical Record Selection

`selectCatchUpRecords` is a pure domain operation. It classifies the current
inventory before any record is processed:

- Today and future records are ignored.
- Historical records with `actual.length === 0` are immediately eligible for
  local cleanup and do not occupy the retention window.
- The two most recent nonempty historical records are retained.
- Any older nonempty historical records are expired.
- Gaps between dates do not matter.

“Nonempty” is deliberately based on the record at the start of the run, not on
the number of unsaved blocks it contains. A nonempty record containing only
terminal blocks can therefore occupy the two-record window, but it is deleted
without Calendar work when processed.

## Per-Day Synchronization

Manual save and catch-up use the same
`syncDayActualsToCalendar` workflow. The caller supplies the day, Calendar
operations, clock, and persistence boundary.

For each selected historical day containing unsaved Actuals, the workflow:

1. Performs one fresh Calendar read for that record's date and timezone.
2. Skips blocks already marked `calendarSaved` or `planMatched`.
3. Classifies exact Plan matches as `planMatched`.
4. Inserts every other eligible block with the existing deterministic Calendar
   event ID.
5. Makes at most one insert attempt per eligible block during that run.
6. Persists the complete working `DayRecord` immediately after each block's
   outcome.

Per-block persistence limits how much completed work can be lost if the
service worker stops partway through a day. A later run safely retries an
ambiguous insert because the deterministic ID prevents a duplicate Calendar
event.

Calendar inserts remain sequential and individually persisted. Phase 7 does
not add a batch-insert path.

## Cleanup and Retention

Cleanup never performs an additional “final” save attempt.

### Retained Records

- Delete the record after every block is `calendarSaved` or `planMatched`.
- Preserve the record when any insert fails so its unsaved blocks can be
  retried on the next app load.

### Expired Records

- Process every eligible block once during the normal pass.
- If the historical Calendar read succeeds, delete the record after that pass
  even when an insert failed.
- Count failed unsaved blocks removed with the record as `discarded`.
- If deletion itself fails, preserve the record and report those blocks as
  failed rather than claiming that they were discarded.

### Preflight and Storage Failures

- If authentication or the historical Calendar read fails before insertion,
  record the normalized failure on each eligible block and preserve the record
  regardless of age.
- A failure to persist a block outcome prevents cleanup of that record.
- A failed inventory read fails the whole catch-up request; it is never treated
  as an empty inventory.
- A failed cleanup is logged and never reported as successful deletion.
- One day's failure does not prevent later selected days from being processed.

## Storage Boundary

`chrome.storage.local` is an untrusted runtime boundary.

- `listDayRecords` reads the complete inventory and validates every
  `dayRecord:*` entry.
- Valid records are returned independently of malformed entries.
- A malformed value or a key/date mismatch is isolated and reported as an
  invalid key.
- Invalid records are preserved. Catch-up neither processes nor silently
  deletes data it cannot understand.
- Missing records require no cleanup because there is no stored value to
  remove.
- Reads, writes, and deletes translate Chrome failures into explicit
  `DayRecordStorageError` variants.

## Background Responsibilities

The final implementation separates concerns as follows:

- `src/domain/catch-up.ts` owns pure historical selection and retention-window
  classification.
- `src/workflows/sync-day-actuals-to-calendar.ts` owns unsaved filtering, Plan
  matching, deterministic insertion, normalized outcomes, and ordered
  per-block persistence for one day.
- `src/background/run-catch-up.ts` owns multi-day orchestration, retained versus
  expired cleanup, storage-failure policy, public counts, and private
  diagnostics.
- `src/background/calendar-operations.ts` owns cached authentication plus
  current-day and historical Calendar access.
- `src/background/catch-up-request.ts` owns in-flight coalescing, request-level
  error translation, and total timing.
- `src/background/compose-service-worker.ts` wires storage and Calendar
  dependencies into the runner.
- `src/app/App.tsx` owns the successful-load gate and current-run feedback.

The service worker owns catch-up because the workflow spans historical storage,
authentication, Calendar reads, Calendar writes, and cleanup. The shared
single-day workflow prevents that boundary from duplicating manual-save
business rules.

## User Feedback

The runtime response contains only:

- `saved`: Actuals inserted into Calendar during this run;
- `failed`: Actuals preserved for a later retry; and
- `discarded`: failed Actuals removed with expired records.

Feedback describes only the current run and is not persisted:

- A no-op run is silent.
- Successful inserts are reported as saved to Calendar.
- Retained failures say they could not be saved and will be retried next time.
- Discarded older Actuals are reported separately and make the message a
  warning.
- Plan matches are not shown as saved because no Calendar event was inserted.
- Invalid-record and storage-operation counts are not exposed in the UI.
- A request-level or transport failure produces an accessible warning without
  disabling today's workspace.

## Diagnostics and Privacy

The background logs aggregate, privacy-safe data only:

- total duration and request success;
- `saved`, `failed`, and `discarded`;
- affected historical-day count;
- Plan-match count;
- invalid-record count; and
- storage-error count.

Logs never include dates, titles, Actual IDs, or Calendar event IDs.

## Test Coverage

The Phase 7 test suite covers:

- historical enumeration, empty-record cleanup, date ordering, the two-record
  window, and today/future exclusion;
- malformed-record isolation and storage read, write, and delete failures;
- immediate no-work return before Calendar access;
- unsaved-only filtering, one Calendar read per processed day, exact matches,
  deterministic inserts, and per-block persistence;
- retained-success deletion and retained-failure preservation;
- expired deletion after one pass without a second attempt;
- expired preservation after authentication or Calendar-read failure;
- day isolation, failed cleanup, and explicit discarded counts;
- successful-load gating, failure skips, nonblocking UI, silent no-op behavior,
  accessible feedback, and in-flight request coalescing.

Deterministic Playwright coverage proves:

- yesterday's unsaved Actual is inserted and the completed record is removed;
- terminal blocks are not retried;
- a retained insert failure survives and succeeds after refresh; and
- the oldest record outside the two-record window is processed once, removed,
  and reports any remaining unsaved work as discarded.

No Phase 7 real-Calendar smoke test was added.

## Working Agreement

Implementation followed red → green → refactor:

1. Add the relevant failing storage, domain, runner, service-worker, app, or E2E
   test.
2. Implement the minimum behavior required to pass.
3. Refactor while keeping the focused tests green.
4. Run unit tests, lint, build, and the complete deterministic E2E suite.
5. Review findings and apply only selected fixes.
6. Commit only after explicit approval.

## Status

Completed in:

- `94f89f0` — `Implement Phase 7 catch-up tracer`
- `a0dd7c7` — `Simplify catch-up feedback reporting`

The service-worker responsibilities were subsequently separated without
changing Phase 7 behavior in:

- `37cb304` — `Refactor service worker responsibilities`

## Deferred Work

The following remain outside Phase 7:

- Phase 10 Slack Intention Tracer behavior;
- persisted catch-up history or once-per-day throttling;
- Calendar batch insertion;
- a real historical-Calendar smoke test; and
- overlap and drag-and-drop interaction design for Actual blocks.
