# Phase 2: Auth and Calendar Boundary Tracer

Status: completed

## Summary

Build the smallest reliable vertical slice proving that the extension UI can request Google Calendar access through the background service worker, receive normalized success or error results, and display visible auth and Calendar states. The UI must not call Google APIs directly.

Use TDD: add failing unit and E2E tests before production implementation, implement the minimum code to pass, refactor while green, run the full verification suite, and review before committing.

## Behavior

- Add shared `Result<T>` and `AppError` types for expected auth, network, quota, validation, and API failures.
- Add runtime messages for `auth.getStatus`, `auth.requestInteractiveToken`, and `calendar.listEvents`.
- Keep auth and the primary-calendar `events.list` call in the background service worker.
- Use Chrome Identity's cached grant for silent status and Calendar requests. Only the explicit Connect action may initiate interactive auth.
- Add the `identity` permission, Google API host permission, OAuth client ID, and `https://www.googleapis.com/auth/calendar.events` scope to the manifest.
- Show disconnected, connecting, connected, event-count success, auth failure, and Calendar failure states.

## Tests

- Unit-test interactive and cached auth success, cancellation, errors, and timeout recovery.
- Unit-test Calendar success and normalized HTTP, API, and network failures.
- Unit-test routing for all Phase 2 runtime messages and predictable unknown-message behavior.
- Exercise a deterministic extension happy path through mocked auth and Calendar boundaries.
- Verify visible auth and Calendar failures without relying on console output.
- Preserve the Phase 1 shell and background health tracer.

## Assumptions

- The OAuth client ID is public extension configuration; no client secret is used.
- Real OAuth and Calendar smoke testing is opt-in and local only.
- Phase 2 proves read-only Calendar behavior and visible errors; it does not build the Plan column.
