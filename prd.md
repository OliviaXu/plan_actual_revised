# Plan / Actual / Revised — Product Requirements Document

## Part I — Product Direction

### 1. Product Summary

Plan / Actual / Revised is a personal day planner for knowledge workers. It is
inspired by Jake Knapp and John Zeratsky's *Make Time* and helps a user shape
a day intentionally rather than merely react to it.

The product brings together three views of the day:

- **Plan:** what the user intended to do, drawn from Google Calendar.
- **Actual:** what the user actually did.
- **Revised:** how the user now intends to use the rest of the day.

It also encourages two broader intentions—a hard thing for today and a practice
for the work week—and asks the user to name their purpose before opening Slack.

### 2. User Problem

A calendar records intention, but the day rarely unfolds exactly as planned.
Once reality diverges from the calendar, it becomes difficult to see where time
went, make a deliberate new plan, or preserve an honest record without a large
amount of administrative work.

Frequent tools such as Slack make the problem worse by inviting unplanned
context switching. The product should create a small moment of reflection
before that switch and make the resulting time visible.

### 3. Target User

The primary user is an individual knowledge worker who:

- Plans work in Google Calendar.
- Wants a lightweight, honest record of the day.
- Regularly replans as priorities and circumstances change.
- Benefits from naming a daily challenge and a weekly learning practice.
- Wants to use Slack more intentionally.

The MVP is a personal tool. It does not support teams, shared planning, or
managerial reporting.

### 4. Core Product Loop

The product should make this loop quick enough to repeat throughout the day:

1. Review today's Plan from Calendar.
2. Record what actually happened in Actual.
3. Compare Actual with Plan without judgment.
4. Revise the remaining day when the Plan no longer fits reality.
5. Save the useful historical record back to Calendar.

The daily and weekly intentions provide direction for the loop. The Slack
intention flow interrupts impulsive tool use at the moment it occurs.

### 5. Guiding Principles

#### Make reality easy to record

Logging, editing, moving, and resizing Actuals should require little effort.
The product should help the user notice reality, not punish them for departing
from the Plan.

#### Replanning is a normal part of the day

Revised is not a failed Plan. It is the user's current best decision about what
to do next.

#### Keep ordinary work safe

- Keep local changes across reloads.
- If a Calendar save fails, keep the affected Actual locally and try again
  later.
- Retry for a limited period rather than building an indefinite recovery
  system.
- Tell the user when an Actual cannot be saved or when old unsaved work is
  discarded.
- Leave exceptional recovery, such as corrupted local storage, to manual
  intervention and developer diagnostics.

#### Do not rewrite Calendar history

The extension creates Calendar events but does not update or delete them.
Changing an Actual after it has reached Calendar creates a new Actual on the
next save. This avoids unintentionally corrupting an existing Calendar event.

#### Make every important outcome visible

The user should receive clear feedback when Calendar work succeeds, fails,
matches an existing Plan, requires another attempt, or is eventually discarded.

#### Keep the product quiet

The planner should feel focused, calm, and durable. The day grid is the primary
workspace; decoration and secondary controls should not compete with it.

### 6. MVP Outcomes

The MVP succeeds when a user can:

- Open the planner and understand today's intended schedule immediately.
- Record and correct Actuals with low friction.
- Replan the rest of the day without altering the original Plan.
- Return later without losing ordinary local changes.
- Preserve Actuals in Calendar without creating duplicates during retries.
- Understand what did and did not reach Calendar.
- Commit to one hard thing today and one practice for the work week.
- Name a purpose before opening Slack and see that visit in Actual.

## Part II — Detailed Product Behavior

### 7. Product Surfaces

#### Essential surface

The essential MVP surface is a full planner page opened from the Chrome
extension action. If that page is already open, invoking the action should
return the user to it rather than open another copy.

The planner requires enough room for the time grid and editing interactions. A
small toolbar popup is not an acceptable primary surface.

#### Google Calendar side panel

Opening the extension while viewing Google Calendar may show the planner in a
side panel. This is a useful convenience, but it is not essential to the MVP.

The side panel should prioritize Actual at narrow widths, then reveal Revised
and Plan as more width becomes available. Resizing it should not reset the
user's place in the day.

### 8. Calendar Dependency

The Plan and intention features depend on the user's primary Google Calendar.
The user explicitly connects Calendar before using the planner.

An initial Calendar load must succeed before the planner becomes usable. If
Calendar is unavailable before the day loads, the product may show a blocking
error or connection state. Offline-first operation is not required. A planner
that has already loaded may continue using the data available in that session.

The product uses the primary Calendar's day and timezone as the shared frame of
reference. Multi-calendar selection is outside the MVP.

### 9. Day Workspace

The workspace presents one shared time axis and three aligned columns:

- **Plan** is today's read-only Calendar schedule.
- **Actual** is the user's editable record of what happened.
- **Revised** is the user's editable plan for the remainder of the day.

Blocks appear at their real time of day rather than as a sequential list. The
visible range covers a normal working day and expands when an event falls
outside it. The view initially positions the current time within the visible
area and keeps a current-time indicator updated.

Overlapping blocks remain individually accessible. Bringing one overlapping
block forward changes only its temporary presentation, never its recorded time.

### 10. Plan

Plan shows eligible timed events from today's primary Calendar and is never
edited in place.

The Plan excludes:

- All-day events.
- Actual events previously created by this product.
- Calendar color categories intentionally hidden from the planning view.

An empty Plan should be shown as a valid empty day, not an error.

Dragging a Plan block into Actual or Revised copies its title, duration, and
color. Its new time is determined by where the user drops it. The Calendar
event remains unchanged.

### 11. Actual

Actual begins empty on a new day unless the user already recorded local work
for that day.

The user can create an Actual by:

- Opening the new-Actual editor.
- Copying a Plan block into Actual.
- Moving a Revised block into Actual.
- Completing the Slack intention flow.

A newly authored Actual defaults to the current time and a short working
duration. Its start time follows the planner's time increments. Dismissing the
creation editor abandons the draft; the Actual exists only after the user saves
the editor.

The user can edit an Actual's title, duration, and color; move it in time;
resize it; move it to Revised; or delete it locally. These changes survive a
reload after they are applied.

Deleting a local Actual does not delete any Calendar event previously created
from it.

### 12. Revised

Revised begins empty on a new day unless the user already recorded a revised
plan for that day.

The user creates Revised blocks by copying from Plan or moving from Actual.
There is no separate new-Revised control in the MVP.

Revised blocks can be edited, moved, resized, returned to Actual, or deleted.
They remain local planning aids and are never saved to Calendar.

### 13. Editing and Time Changes

Moving and resizing editable blocks follows consistent time increments and
never changes the original Plan event. Typed durations may use any positive
whole number of minutes.

Closing an editor without saving abandons the draft changes. Saving an edit
applies it locally.

If an Actual was already saved to Calendar, a meaningful edit, move, or resize
makes the changed version eligible to be saved as a new Calendar event. The
previous Calendar event remains untouched.

### 14. Daily Focus

The daily focus asks the user to choose one hard thing for today.

- If no focus exists, the product offers a short inline commitment form.
- Committing creates a private all-day event in Calendar for today.
- Once confirmed, the focus is read-only in the extension and can be changed
  directly in Calendar.
- If multiple qualifying focus events exist, the first one is shown.
- If creation cannot be confirmed, the draft remains available for another
  attempt and the user receives a warning.

### 15. Weekly Practice

The weekly practice asks the user to name one skill or behavior to practice
during the current work week.

- It appears Monday through Friday and is hidden on weekends.
- The practice belongs to Monday of the current work week and remains visible
  through Friday.
- Committing creates a private all-day Calendar event on that Monday.
- Once confirmed, it is read-only in the extension and can be changed directly
  in Calendar.
- If the week's practice cannot be loaded, only this banner is hidden; the rest
  of the planner remains usable.
- If creation cannot be confirmed, the draft remains available for another
  attempt and the user receives a warning.

### 16. Slack Intention

Before opening Slack from the planner, the user must enter a nonempty statement
of purpose.

Submitting the intention:

- Creates a short Actual at the current time using the entered purpose.
- Attempts to open the Slack application immediately from the user's action.
- Keeps the Actual even if Slack does not open.
- Warns the user when the launch appears to fail.

After creation, a Slack Actual behaves like any other Actual. When saved to
Calendar, it remains identifiable as having come from the Slack flow.

### 17. Saving Actuals to Calendar

The user saves today's Actuals with one click. No confirmation step is required.

Only unsaved Actuals are eligible. Revised blocks are never saved. An Actual
that already matches its Plan is treated as accounted for and does not create a
duplicate Calendar event.

Each eligible Actual creates a new event in the primary Calendar. The product
must avoid duplicates when a previous attempt may have succeeded but its result
was uncertain.

The user receives a concise result after every manual save:

- How many Actuals were saved.
- How many already matched Plan.
- How many could not be saved.
- Whether there was nothing new to save.

A failed or uncertain save leaves the Actual available for another attempt.

### 18. Catch-up and Retention

When the planner opens, it attempts to save eligible Actuals from recent prior
days without blocking today's workspace.

The product retains the two most recent nonempty prior days for retry,
regardless of gaps between dates. A failure on one day does not prevent work on
another day.

When an older record falls outside that retained history:

1. Make one final attempt to save its remaining Actuals.
2. Remove the local record whether or not the attempt succeeds.
3. Clearly report any Actuals that were discarded.

This is deliberately bounded, best-effort recovery. Users may manually repair
Calendar when an exceptional failure outlives the retention window.

### 19. Failure and Feedback Policy

- A Calendar write failure must not remove a retained local Actual.
- Ambiguous Calendar results are treated as failures unless the product can
  later confirm that the event exists.
- Successful, partial, failed, no-op, and discarded outcomes must be visible.
- A failed Slack launch must not undo the recorded Actual.
- A weekly-practice failure must not disable the rest of the planner.
- Failure to load Calendar initially may make the planner unavailable.
- Rare local-storage failures may be recorded only in developer diagnostics;
  user-facing recovery for corrupted local storage is outside the MVP.

### 20. Experience Direction

The interface should feel quiet, work-focused, and durable:

- Warm, neutral foundations with muted Calendar colors.
- Clear time alignment and readable blocks.
- Small controls that remain understandable through accessible labels.
- Visible focus states and keyboard access for essential actions.
- No marketing-style hero treatment or ornamental backgrounds.

Specific components, styling libraries, layout measurements, and internal
design-token choices are implementation concerns rather than product
requirements.

### 21. MVP Non-goals

- Editing Plan events from the extension.
- Updating or deleting Calendar events after the extension creates them.
- Indefinite retention or automated recovery of all local history.
- Offline-first use when Calendar has not loaded.
- User-facing settings or Calendar selection.
- Collaboration, sharing, or team workflows.
- Statistics, reports, or aggregate time analysis.
- Blocks that continue past midnight into the next day.
- Mobile or iOS support.
- A full planner inside a small toolbar popup.
- A server-side product backend.

### 22. Nice-to-have

- A responsive planner side panel when the extension is opened from Google
  Calendar.

Nice-to-have behavior must not complicate or weaken the essential standalone
planning experience.
