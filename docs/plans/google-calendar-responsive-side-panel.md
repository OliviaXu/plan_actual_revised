# Google Calendar Responsive Side Panel

## Summary

Add a Google Calendar-specific Chrome side panel that progressively reveals Actual, Revised, and Plan as the user widens it. Preserve the existing standalone three-column page for toolbar clicks outside Google Calendar.

## Implementation Changes

- Add a dedicated side-panel entry that renders the shared app in `side-panel` mode; keep the existing page in `standalone` mode.
- Add Chrome's `sidePanel` and `tabs` permissions and require Chrome 116 or newer.
- Route toolbar clicks by active tab:
  - `calendar.google.com` refreshes the side-panel data, then enables and opens the tab-specific panel.
  - Any other URL disables the panel for that tab and opens a new standalone extension tab.
  - Monitor tab navigation and disable an enabled panel immediately after leaving Google Calendar.
- Use these side-panel layouts:
  - `< 520px`: Actual only, with an `R` reveal rail on the right.
  - `520-1023px`: Actual and Revised, with a `P` reveal rail on the left.
  - `>= 1024px`: Plan, Actual, and Revised, with no reveal rail.
- Build the reveal rail as a dedicated 23px grid sliver with:
  - A miniature `R` or `P` header.
  - Faint empty timeline grid lines.
  - A three-dot grip cue centered in the visible rail and retained while scrolling.
  - A hover tooltip: "Drag the side panel wider to show Revised/Plan."
  - No click behavior and no overlap with headers, events, or drop targets.
- Animate newly revealed columns gently while retaining the same scroll viewport, vertical timeline, time range, and scroll position. Hidden Plan events still determine the shared timeline range.
- Enable all existing operations for visible columns:
  - Actual-only: add, Slack, edit, resize, and reposition Actual.
  - Two columns: additionally edit and resize Revised and drag between Actual and Revised.
  - Three columns: additionally drag Plan events into Actual or Revised.
- Treat clicking the extension toolbar icon on Google Calendar as the manual refresh action. Each click reloads Calendar events and the current day record before opening or updating the panel.
- Invoke `sidePanel.open()` synchronously within the toolbar action's user-gesture window while initiating refreshed panel configuration first.
- Do not add a refresh control inside the panel or automatically refresh on Calendar reload, tab activation, or storage changes.
- Introduce only presentation and runtime interfaces such as an app surface mode, responsive grid mode, and toolbar-triggered refresh. Do not change persisted day-record schemas or runtime validation boundaries.

## TDD and Verification

1. Add failing tests first for:
   - Width-to-layout mapping at 519/520px and 1023/1024px.
   - Correct visible columns, rail location and content, centered grip, tooltip, and disappearance.
   - Existing header controls remaining accessible without overlap.
   - Toolbar clicks refreshing panel data before opening it on Calendar.
   - Toolbar routing for Calendar, non-Calendar, missing, and restricted URLs.
   - Panel disabling when a Calendar tab navigates elsewhere.
   - Manifest permissions, side-panel build entry, and minimum Chrome version.
2. Run the relevant unit and component tests and confirm the new cases fail.
3. Implement the minimum code to make them pass, then refactor while green.
4. Add deterministic extension E2E coverage for:
   - Side-panel rendering at all three widths.
   - Gentle column transitions and unchanged vertical scroll.
   - Actual, Revised, and Plan drag behavior at eligible widths.
   - Add, Slack, edit, resize, and toolbar-triggered refresh behavior.
   - Standalone toolbar behavior remaining unchanged outside Calendar.
5. Keep deterministic E2E and review recordings headless. Run a focused headed test only when live observation of Chrome's browser-owned side-panel UI is explicitly requested.
6. Run the full unit and E2E suites, review the implementation, and report findings. Wait for the user to select any fixes; commit only after explicit approval.

## Assumptions

- "Google Calendar" means URLs whose origin is exactly `https://calendar.google.com`.
- The reveal rail always represents the next hidden column: `R`, then `P`, then nothing.
- Breakpoints are fixed at 520px and 1024px. The full layout uses the standalone page's maximum width as its comfort threshold.
- Chrome owns side-panel resizing; the extension provides guidance but cannot resize it programmatically.
- Clicking the extension icon is the only refresh mechanism in this version.
- The `tabs` permission is accepted to guarantee strict site-only panel behavior.
