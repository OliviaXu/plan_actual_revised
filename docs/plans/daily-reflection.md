# Daily Reflection

## Direction

Add a concise weekday closing ritual backed by one persisted active session and
one private all-day Google Calendar event. Deliver it in tracer-bullet phases:

1. Manual reflection in the standalone planner.
2. Weekday timing and fifteen-minute snooze resurfacing.
3. Side-panel handoff into the standalone planner.

Only Phase 1 is authorized for the first implementation pass.

## Shared decisions

- Reflection time is code-defined as 4:30 PM; there is no settings UI.
- Focus and weekly practice are snapshotted when a session is created and then
  remain frozen for that session.
- One active session may cross dates and weekends. Without an active session,
  the product does not search backward for missed reflections.
- A stale planner date must not create a new reflection, but an existing session
  may still resume.
- The opening is: “Take a breath. Close your eyes for a moment. What do you
  notice about your day?”
- The modal is non-dismissible. Its only exits are saving and snoozing for
  fifteen minutes.
- Saved reflections remain Calendar-owned and are not reopened or edited in the
  extension.

## Phase 1 — manual tracer

- Add a subtle reflection icon beside the standalone date. Hide it in the side
  panel, on weekends without an active session, and after today is complete.
- Persist a validated draft containing its intended date, frozen focus/practice
  context, frog outcome, narrative fields, and optional snooze deadline.
- Require a frog outcome and its dynamic detail. Keep weekly-practice progress,
  next experiment, and next frog optional.
- Save a private, transparent, reminder-free all-day event using deterministic
  ID `parreflectionYYYYMMDD` and private marker
  `planActualRevisedReflection: "true"`.
- Format the summary as `[Outcome] Focus`, or `[Not set] Detail`, truncating
  beyond 80 Unicode characters with `…`.
- On a failed insert, read that date once to reconcile a possible lost success
  response. Otherwise retain the session and use the existing persistent
  bottom-right warning toast.
- In Phase 1, snooze closes the modal and preserves the session; reopening is
  manual until Phase 2.

## Later phases

Phase 2 checks on mount and once per minute. New sessions are created only on
weekdays at or after 4:30 PM when the loaded planner date is current. Existing
sessions ignore the configured time and resurface whenever snooze expires.

Phase 3 shows only **Reflect** and **Snooze 15 minutes** over a blurred side
panel. Reflect opens or focuses the standalone planner; the full form never
renders in the side panel.

Notifications, Chrome alarms, historical reflection search, user-facing time
settings, energy/focus ratings, and reflection editing are deferred.

## Delivery process

Each phase follows TDD: failing tests, minimal implementation, refactor, focused
verification, full unit and escalated E2E suites, then review. Report findings
and wait for selected fixes. Commit only after explicit approval.
