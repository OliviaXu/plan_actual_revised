# Phase 3 - Plan Column Tracer

## Summary

Deliver Phase 3 through five vertical slices, ordered by technical risk:

1. Calendar read path.
2. Time-grid geometry.
3. Eligibility and colors.
4. Overlap cascade.
5. Live-time and viewport behavior.

Each slice follows its own red, green, and refactor loop. Each ends with a dedicated Playwright tracer that can run independently and remains in the accumulated regression suite.

The visible Phase 3 surface contains only Time and Plan. Actual, Revised, intention banners, drag and drop, settings UI, Calendar writes, and Plan persistence remain assigned to later phases.

## Slice 3A - Calendar-to-Plan Read Tracer

Status: implemented and verified; pending independent commit approval.

### Behavior

- Normalize Google responses into timed and all-day Calendar event types.
- Automatically request today's Plan when the extension page opens.
- Keep the app message payload-free: `calendar.listEvents`.
- Let the service worker derive local midnight boundaries and pass explicit ISO values to the Calendar client.
- Use an injectable service-worker clock for deterministic boundary tests.
- Try cached Chrome auth non-interactively before every Calendar read.
- When cached auth is unavailable, replace the entire grid with a compact Calendar connection box.
- Keep the disconnected box minimal: one prompt and one `Connect Calendar` button.
- Do not render the grid, authenticated-empty copy, explanatory copy, or a redundant header status while disconnected.
- Start interactive auth only after the user clicks `Connect Calendar`.
- Keep failed interactive auth in a disconnected-with-error state so the user can retry.
- Refetch Plan after successful interactive auth.
- Distinguish loading, connecting, disconnected, connected-empty, populated, and Calendar-error grid states.
- Keep static styling in Tailwind. Use inline styles only for runtime time geometry.
- Use named time/layout constants and CSS design tokens instead of production magic numbers.

### Tracer

`tests/e2e/plan-read.spec.ts` verifies:

- Cached auth loads Calendar data into Plan without a click.
- A disconnected user sees the Plan sign-in prompt and can connect.
- Failed interactive auth remains recoverable and a retry populates Plan.
- A successful empty Calendar response shows `No timed events today`.
- Calendar failure remains visible while the Plan surface stays usable.

## Slice 3A.1 - Calendar Freshness Tracer

Goal: guarantee that Plan represents the current local day without introducing cache invalidation or manual-refresh complexity before measurements justify it.

### Initial Freshness Policy

- Fetch Calendar from the network once whenever a new extension app page opens.
- Do not use a TTL cache initially.
- Do not add a manual refresh button initially.
- Treat a user opening the extension as an explicit freshness request, not as background polling.
- Calculate the local day in the service worker for every request so a new page can never reuse the previous day's range.
- Keep the mounted page stable: users refresh or reopen the extension to request newer Calendar data.
- Do not refetch for ordinary React renders, timers, focus changes, or visibility restoration.
- Coalesce only simultaneous in-flight requests for the same calendar, local date, and timezone. A later page open still starts a fresh request.
- Follow `nextPageToken` until the complete bounded-day result is loaded; do not assume the default first page contains every event.

### Tracer

`tests/e2e/plan-freshness.spec.ts` will verify:

- Opening a new extension page performs a fresh Calendar request.
- React state changes do not trigger duplicate requests.
- Simultaneous requests for the same day share one in-flight fetch.
- Refreshing or reopening after local midnight requests the new day's boundaries.
- Paginated Calendar responses are combined before Plan renders.

### Calendar Load Stats

Measure successful background Calendar loads with monotonic `performance.now()` timings rather than wall-clock timestamps.

Record these stages:

- Cached-auth lookup duration.
- Calendar HTTP and response-JSON duration across all pages.
- Event normalization duration across all pages.
- Background total from request receipt to normalized response.

Emit one structured background summary per Plan load. Include the page count, raw event count, rendered timed-event count, and the measured durations. Do not log OAuth tokens, Calendar event IDs, summaries, descriptions, attendees, or raw response bodies.

Keep load stats inside the service-worker boundary and separate from canonical Calendar events and future persisted `planSnapshot` data. React render cost is paid on every app open regardless of Calendar freshness policy, so it is not part of the cache decision measurement.

Tests will verify that:

- Successful and empty responses produce one complete timing summary.
- Paginated responses report the combined page and event counts.
- Timing values are finite and non-negative; tests do not assert real elapsed-time thresholds.
- Logs contain no event content or credentials.

Use the opt-in real Calendar smoke to collect representative successful background-load samples before choosing a TTL, stale-while-revalidate cache, refresh action, or latency target. Document the measured environment and sample distribution rather than deciding from a single run.

### Deferred Cache Decision

Measure real OAuth, network, pagination, and normalization latency before adding a Calendar event cache.

If measured latency later makes caching worthwhile:

- Prefer `chrome.storage.session`, keyed by calendar ID, local date, and timezone.
- Never use an entry from a different local date or timezone.
- Keep Calendar as the source of truth and store `fetchedAt` with the normalized snapshot.
- Cache only successful responses, including a legitimate empty response; never cache auth or Calendar failures.
- Prefer stale-while-revalidate when the goal is faster first paint: show a same-day snapshot immediately, then still fetch fresh on open.
- Use a named freshness-policy constant if the goal changes to suppressing rapid repeat requests with a TTL.
- Add an explicit refresh action that bypasses the TTL if the chosen TTL is long enough for same-day Calendar edits to remain noticeably stale.
- Keep this cache separate from the later persisted `planSnapshot` and from missing-data policy.

## Slice 3B - Time Grid Geometry Tracer

### Behavior

- Render the configured hour labels with short Time-axis ticks.
- Keep the Plan column free of full-width horizontal grid lines.
- Position blocks from absolute start time using `pixelsPerMinute`.
- Derive block height from duration, with a named 20px minimum visual height.
- Start with the configured 07:00-21:00 range.
- Expand the start down to the whole hour containing an earlier visible event.
- Expand the end up to the whole hour containing a later visible event.
- Clip timed events crossing local midnight to the portion occurring today.
- Discard malformed and zero-duration events.
- Render title and duration; show the time range only when the block is tall enough.

### Tracer

`tests/e2e/plan-geometry.spec.ts` will verify exact top and height geometry, default boundaries, early and late expansion, whole-hour rounding, minimum visual height, midnight clipping, and conditional time-range labels.

Fixtures use ordinary visible timed events so geometry does not depend on the later eligibility slice.

## Slice 3C - Eligibility and Calendar Color Tracer

### Behavior

- Exclude every all-day event from the grid.
- Exclude timed events whose color appears in `hiddenPlanColorIds`.
- Filter before calculating range boundaries or block geometry.
- Use `Untitled event` when a summary is absent.
- Centralize Google Calendar color IDs 1-11 as design tokens.
- Preserve an absent event-specific color as `null` and use the product's neutral Plan fallback.
- Keep settings read-only and sourced from existing defaults.

### Tracer

`tests/e2e/plan-eligibility.spec.ts` will seed visible colors, hidden early and late events, daily-focus, weekly-learning, unrelated all-day events, and an untitled uncolored event.

It will verify that only eligible timed events render, colors and title fallback are correct, and excluded events do not expand the grid.

## Slice 3D - Overlap Cascade Tracer

### Behavior

- Group intersecting events into overlap clusters.
- Assign deterministic cascade depths.
- Preserve every event's true vertical start.
- Offset each depth 8px horizontally using a named layout constant.
- Increase z-index with depth.
- Bring a peeking event to the front when clicked.
- Keep click-to-front priority transient; persistence belongs to Phase 4.
- Treat events where one ends exactly as another begins as non-overlapping.

### Tracer

`tests/e2e/plan-overlap.spec.ts` will cover separate, partially overlapping, nested, and boundary-touching events. It will verify cluster membership, depth, horizontal offset, z-index, true vertical position, and click-to-front behavior.

## Slice 3E - Live-Time and Viewport Tracer

### Behavior

- Use the same grid-column token for the sticky header and scrolling body.
- Keep Time and Plan labels pinned while events scroll.
- Keep header and body dividers aligned when a scrollbar consumes width.
- Add the soft-orange now line, dot, and time label.
- Position the line using the event time scale and update it at minute granularity.
- Hide the line when the current time is outside the displayed range.
- Auto-scroll once after the first successful render so current time is approximately 30% below the viewport top.
- Do not override later user scrolling.
- Add an opt-in, headful, read-only real Calendar smoke through production OAuth and `events.list`.

### Tracers

`tests/e2e/plan-current-time.spec.ts` will use a fixed clock to verify now-line position and updates, absence outside the range, initial auto-scroll, preserved user scrolling, sticky headers, and divider alignment.

The real smoke will pass when eligible real events render or when a valid authenticated-empty state appears. It will perform no Calendar writes.

## Per-Slice TDD and Verification

For every slice:

1. Add or update domain, boundary, component, and tracer tests.
2. Run the new tests and confirm the expected failure.
3. Implement the minimum production behavior required to pass.
4. Refactor while keeping the slice green.
5. Run the dedicated Playwright tracer with required sandbox escalation.
6. Run all earlier Phase 3 tracers.
7. Run `git diff --check`.

After Slice 3E, run the complete unit suite, lint, build, and deterministic E2E suite. Run the real smoke only when intentionally enabled. Review findings before fixes, apply only selected fixes, and commit only after explicit approval.

## Deferred Follow-Up - Debug Calendar Disconnect

Revisit only if manual disconnected-state testing remains painful after the deterministic tracer and fresh-profile workflow are in regular use.

Preferred design:

- Add a collapsed, clearly labeled debug or connection-tools control rather than a secret gesture.
- Implement an app-managed Calendar disconnect preference in `chrome.storage.local`.
- Check that preference in the background before requesting a cached Chrome auth token.
- Return `AUTH_NOT_CONNECTED` while the preference is disabled, even if Google can silently issue another token.
- Clear the preference after successful interactive Connect.
- Keep the behavior separate from the future Calendar event cache.
- Do not add production test flags or fake Calendar responses.
- Do not call Google's OAuth revoke endpoint for this debug flow: revocation can remove the project's combined OAuth scopes and is broader than the intended local test control.
- Continue using a fresh Chrome profile when the goal is to test the real Google consent screen rather than only the app's disconnected UI.

If implemented, define failing storage, background-message, component, and Playwright tests first. Verify disconnect persists across page refresh, Connect restores normal automatic loading, and no unrelated Calendar or settings data is changed.
