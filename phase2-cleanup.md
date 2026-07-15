# Phase 2 Cleanup Plan

## Summary

Simplify Phase 2 without changing user-visible behavior or the current OAuth scope. Keep one narrow dependency-injection boundary so Playwright can exercise a genuine UI-to-background happy path without embedding test behavior in production code.

## Implementation Changes

- Replace the runtime and message-handler stack with one side-effect-free `registerServiceWorker(dependencies)` module containing Chrome listeners and a direct message switch. Keep `service-worker.ts` as the production composition root.
- Remove forwarding-only routing, unused error and message helpers, and their low-value forwarding test.
- Reduce shared errors to `Result<T>` with `{ code, message }`.
- Use Chrome Identity's Promise API. Return `Result<string>`, keep explicit interactive and cached functions, and apply the named timeout only to interactive auth.
- Simplify the Calendar API to `listPrimaryCalendarEvents(token, fetchFn = fetch)` returning `{ eventCount }`.
- Replace independent Calendar UI fields with one discriminated state and direct status rendering.
- Keep a named build entry for the side-effect-free registration function, use a default export, and remove `minifyInternalExports: false`.
- Replace the generated E2E scenario engine with a small happy-path-only test worker. Production code must contain no test flags, storage mocks, or conditional test behavior.
- Preserve the existing `calendar.events` OAuth scope.

## TDD and Tests

1. Update tests and run them red.
2. Implement the minimum simplification required to pass.
3. Refactor while green, then run the complete suite and review before committing.

Vitest boundary coverage:

- Auth interactive and cached modes, success, cancellation, rejection, and interactive timeout.
- Calendar request URL, authorization header, date parameters, success, API failure, network failure, and malformed or empty error responses.
- Service-worker explicit auth, Calendar listing, missing token, and ignored unknown messages.

Vitest component coverage:

- Disconnected, connecting, connected success, auth failure, and Calendar failure states.

Playwright coverage:

- Load the production extension and service worker and render the shell.
- Run one deterministic happy path through the real UI and real runtime router with injected auth and Calendar boundaries: Disconnected, Connect, interactive auth, cached-token Calendar read, Connected, and event count.

## Acceptance Criteria

- Desired behavior coverage is preserved; duplicate browser-level failure coverage moves to component tests.
- The Calendar path supersedes the Phase 1 background health tracer.
- Phase 2 starts disconnected and does not check cached auth on load; Phase 3 owns silent event loading and the connection UX.
- The UI never calls Chrome Identity or Google APIs directly.
- Production service-worker code contains no test-specific behavior.
- The message path is readable in one module without a forwarding-only handler layer.
- `npm run test`, `npm run test:e2e`, `npm run build`, and `git diff --check` pass.
- Review findings are reported before any cleanup commit.
