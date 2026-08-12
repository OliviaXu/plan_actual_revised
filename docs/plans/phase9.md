# Phase 9 — Weekly Practice Tracer

## Goal

Add one Calendar-backed `MY PRACTICE THIS WEEK` intention for the work week. The practice
appears Monday through Friday, while Google Calendar stores a single all-day
marker on Monday as the canonical record.

## Calendar Model

Monday reuses the successful current-day Calendar response. Tuesday through
Friday makes one isolated Monday-only read after today's Plan has loaded.
Saturday and Sunday hide the banner and make no practice read. This keeps the
query narrow and lets Plan and daily focus remain usable when Monday cannot be
loaded.

The canonical practice is the first Monday all-day event with the configured
weekly color. New practices are private, transparent, one-day Monday events
with default reminders disabled, and Calendar assigns each a fresh event ID so
a manually deleted practice can be recreated.

## Commit and Reconciliation

A confirmed insert locks the submitted practice immediately and reports
`Weekly practice saved to calendar`. A failed insert rereads Monday: an
existing canonical event locks the banner, while an absent event leaves the
draft retryable and reports that the practice could not be confirmed.

An initial Monday failure hides the practice banner and does not replace the
connected planner with a global error.

## User Interface

The salmon `MY PRACTICE THIS WEEK` banner follows the daily-focus banner. Its empty input
uses the placeholder `practice`; confirmed values are read-only and missing
titles render as `Untitled event`. The intention banners are 12px apart and
the group remains 24px above the day grid.

## Test Coverage

Unit coverage proves workday visibility, Monday derivation, canonical
selection, exact Calendar payloads, single-day reads, form behavior, creation,
and reconciliation. Deterministic Playwright coverage proves midweek creation
and reload, isolated Monday failure and retry, and weekend absence.

The authenticated real Calendar smoke proves a practice can be created,
manually deleted, recreated, reloaded, and cleaned up.

## Working Agreement

Implementation follows red → green → refactor. Unit tests, lint, build, and the
complete deterministic E2E suite must pass before review. Review findings are
reported before fixes, and commit requires explicit approval.
