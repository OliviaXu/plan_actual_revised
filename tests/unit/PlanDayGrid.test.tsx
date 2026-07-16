import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

  it("filters ineligible events before layout and applies Calendar colors", () => {
    render(
      <PlanDayGrid
        events={[
          {
            ...timedEvent(
              "visible-color",
              "2026-07-15T09:00:00-07:00",
              "2026-07-15T10:00:00-07:00",
            ),
            colorId: "1",
          },
          {
            ...timedEvent(
              "hidden-early",
              "2026-07-15T05:30:00-07:00",
              "2026-07-15T06:00:00-07:00",
            ),
            colorId: "2",
          },
          {
            ...timedEvent(
              "hidden-late",
              "2026-07-15T22:00:00-07:00",
              "2026-07-15T22:30:00-07:00",
            ),
            colorId: "10",
          },
          {
            kind: "allDay",
            id: "daily-focus",
            summary: "Daily focus",
            colorId: "5",
            startDate: "2026-07-15",
            endDate: "2026-07-16",
          },
          {
            ...timedEvent(
              "untitled-neutral",
              "2026-07-15T11:00:00-07:00",
              "2026-07-15T11:30:00-07:00",
            ),
            summary: null,
            colorId: null,
          },
        ]}
        status="connected"
        today={today}
      />,
    );

    expect(screen.getByTestId("plan-grid-body")).toHaveAttribute(
      "data-start-hour",
      "7",
    );
    expect(screen.getByTestId("plan-grid-body")).toHaveAttribute(
      "data-end-hour",
      "21",
    );
    expect(screen.queryByTestId("plan-event-hidden-early")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-event-hidden-late")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-event-daily-focus")).not.toBeInTheDocument();
    expect(screen.getByText("Untitled event")).toBeVisible();
    expect(screen.getByTestId("plan-event-visible-color")).toHaveClass(
      "border-[#7986cb]/50",
      "bg-[#dee1f2]",
    );
    expect(screen.getByTestId("plan-event-untitled-neutral")).toHaveClass(
      "border-border",
      "bg-muted",
    );
  });

  it("cascades overlapping blocks and brings a clicked block to the front", () => {
    render(
      <PlanDayGrid
        events={[
          timedEvent(
            "base",
            "2026-07-15T09:00:00-07:00",
            "2026-07-15T11:00:00-07:00",
          ),
          timedEvent(
            "nested",
            "2026-07-15T09:30:00-07:00",
            "2026-07-15T10:30:00-07:00",
          ),
        ]}
        status="connected"
        today={today}
      />,
    );

    const base = screen.getByTestId("plan-event-base");
    const nested = screen.getByTestId("plan-event-nested");
    expect(base).toHaveAttribute("data-overlap-group-index", "0");
    expect(base).toHaveAttribute("data-overlap-layer-index", "0");
    expect(base).toHaveClass(
      "flex",
      "flex-col",
      "items-stretch",
      "justify-start",
    );
    expect(base).toHaveStyle({
      left: "12px",
      right: "12px",
      top: "168px",
      zIndex: "0",
    });
    expect(nested).toHaveAttribute("data-overlap-group-index", "0");
    expect(nested).toHaveAttribute("data-overlap-layer-index", "1");
    expect(nested).toHaveStyle({
      left: "24px",
      right: "12px",
      top: "210px",
      zIndex: "1",
    });

    fireEvent.click(base);
    expect(base).toHaveStyle({ zIndex: "2" });
    fireEvent.click(nested);
    expect(base).toHaveStyle({ zIndex: "0" });
    expect(nested).toHaveStyle({ zIndex: "2" });
  });
});
