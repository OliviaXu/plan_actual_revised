import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CalendarEvent } from "../../src/calendar/calendar-event";
import { PlanDayGrid } from "../../src/app/components/PlanDayGrid";

const today = new Date(2026, 6, 15, 12);

function timedEvent(
  id: string,
  start: string,
  end: string,
): CalendarEvent {
  return {
    kind: "timed",
    id,
    summary: id,
    colorId: null,
    start,
    end,
    timeZone: "America/Los_Angeles",
  };
}

afterEach(cleanup);

describe("PlanDayGrid", () => {
  it("renders the complete default hour axis without full-width grid lines", () => {
    render(<PlanDayGrid events={[]} status="connected" today={today} />);

    expect(screen.queryByTestId("plan-hour-line")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("plan-hour-tick")).toHaveLength(15);
    expect(screen.getByTestId("plan-hour-marker-7")).toHaveStyle({
      top: "0px",
    });
    expect(screen.getByTestId("plan-hour-marker-21")).toHaveStyle({
      top: "1176px",
    });
    expect(screen.getByTestId("plan-grid-body")).toHaveStyle({
      height: "1176px",
    });
    expect(screen.getByText("7 AM")).toBeVisible();
    expect(screen.getByText("9 PM")).toBeVisible();
  });

  it("renders title, duration, exact geometry, and a tall-block time range", () => {
    render(
      <PlanDayGrid
        events={[
          timedEvent(
            "Design review",
            "2026-07-15T09:00:00-07:00",
            "2026-07-15T10:00:00-07:00",
          ),
        ]}
        status="connected"
        today={today}
      />,
    );

    const block = screen.getByTestId("plan-event-Design review");
    expect(block).toHaveStyle({ top: "168px", height: "84px" });
    expect(within(block).getByText("Design review")).toBeVisible();
    expect(within(block).getByText("1h")).toBeVisible();
    expect(within(block).getByText("9:00 AM – 10:00 AM")).toBeVisible();
  });

  it("hides the time range below 40px and shows it above 40px", () => {
    render(
      <PlanDayGrid
        events={[
          timedEvent(
            "Below threshold",
            "2026-07-15T09:00:00-07:00",
            "2026-07-15T09:20:00-07:00",
          ),
          timedEvent(
            "Above threshold",
            "2026-07-15T10:00:00-07:00",
            "2026-07-15T10:30:00-07:00",
          ),
        ]}
        status="connected"
        today={today}
      />,
    );

    expect(
      within(screen.getByTestId("plan-event-Below threshold")).queryByTestId(
        "plan-event-time-range",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("plan-event-Above threshold")).getByTestId(
        "plan-event-time-range",
      ),
    ).toBeVisible();
  });

  it("keeps a minimum-height block visible at the final boundary", () => {
    render(
      <PlanDayGrid
        events={[
          timedEvent(
            "Final five minutes",
            "2026-07-15T20:55:00-07:00",
            "2026-07-15T21:00:00-07:00",
          ),
        ]}
        status="connected"
        today={today}
      />,
    );

    expect(screen.getByTestId("plan-grid-body")).toHaveStyle({
      height: "1189px",
    });
    expect(screen.getByTestId("plan-event-Final five minutes")).toHaveStyle({
      top: "1169px",
      height: "20px",
    });
  });
});
