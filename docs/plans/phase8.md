# Phase 8 — Daily Focus Tracer

## Goal

Add one Calendar-backed “Something hard today” intention without depending on
weekly learning. The extension creates at most one focus per primary-Calendar
local day and treats Google Calendar as the canonical persisted record.

## Calendar Model

The focus read path uses the successful current-day Calendar response. It
selects one all-day event by preferring the stable extension ID
`parfocusYYYYMMDD`, then falling back to the first event with the configured
daily-focus color. Additional color matches are not rendered.

New focuses use the trimmed intention as their summary, today as the inclusive
start, tomorrow as the exclusive end, and the configured focus color. They are
private, transparent to availability, have no attendees, and disable default
reminders. Calendar descriptions are ignored.

## Commit and Reconciliation

A confirmed 2xx insert locks the submitted focus immediately without another
Calendar read. The banner becomes read-only and shows the transient feedback
`Daily focus saved to calendar`.

Any failed insert triggers one fresh current-day read:

- if the canonical focus exists, the banner silently locks to Calendar's
  returned title;
- otherwise the draft remains in the ordinary enabled form and the insert error
  remains visible.

There is no separate retry control or retry mode. A later form submission is a
normal insert using the same per-day ID. This makes ambiguous writes
duplicate-safe while avoiding a read after proven creation.

## User Interface

The amber banner precedes the day grid and always appears on the connected
workspace. Its empty state contains the placeholder
`struggling is how learning happens` and an accessible check action. Enter and
the check action submit the same form. Whitespace-only input is invalid and the
controls are disabled during a save.

Confirmed focuses expose no edit or delete controls. Missing Calendar titles
render as `Untitled event`; editing remains available in Google Calendar.

## Test Coverage

Unit coverage proves canonical selection, Calendar-compatible IDs, exact
all-day payloads, explicit create/conflict outcomes,
form accessibility, immediate 2xx locking, and reconciliation behavior.

The deterministic Playwright tracer proves empty creation and reload, singular
selection from duplicate color matches, and failed-save reconciliation followed
by an ordinary resubmission. The opt-in real smoke uses a dedicated authenticated
profile, creates a clearly prefixed focus, verifies it after reload, and removes
only that event during cleanup.

## Working Agreement

Implementation follows red → green → refactor. Unit tests, lint, build, and the
complete deterministic E2E suite must pass before review. Review findings are
reported before fixes, and commit requires explicit approval.

## Deferred Work

- Weekly learning remains Phase 9.
- In-extension focus editing and deletion.
- Persisted local focus drafts or focus history.
