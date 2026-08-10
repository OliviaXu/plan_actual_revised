# Phase 4 - Actual Persistence and Calendar Save Reliability

## Slice 4A - Actual Persistence Tracer

Store one versioned `DayRecord` per primary-Calendar-local date in `chrome.storage.local`. The app lazily adopts the primary Calendar timezone returned by its event read, hydrates that Calendar day's Actual blocks on every page load, and persists the minimal one-click Actual before rendering it. Settings remain code-derived and are not stored.

## Slice 4B - Calendar Save Reliability Tracer

Manual save refreshes the day's Plan once, permanently classifies exact matches as `planMatched`, reconciles extension Actuals already present under their deterministic Calendar IDs, and inserts the remaining unsaved Actuals. HTTP insert failures remain failures; a later save recognizes an ambiguously created event during its normal Calendar refresh. `saving` is UI-only; failures remain `unsaved` with normalized attempt details. Calendar-saved and Plan-matched blocks remain in the local working record until Phase 7 cleanup.

## Real Calendar Write Smoke

Start the dedicated Chrome profile, complete Connect Calendar manually, and
leave that browser open:

```sh
npm run real:open
npm run test:real:actual
```

The opt-in test temporarily replaces today's test-profile `DayRecord`, saves a clearly prefixed Actual twice with the same deterministic ID, verifies private metadata, deletes only that Calendar event, and restores the prior local record. Do not point it at a profile currently open in another Chrome process.

## Verification Gate

Run unit tests, lint, build, and deterministic E2E. Review findings before fixes and commit only after explicit approval.
