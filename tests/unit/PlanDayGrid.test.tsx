import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CalendarEvent } from "../../src/calendar/calendar-event";
import type { ActualBlock } from "../../src/domain/day-record";
import { PlanDayGrid } from "../../src/app/components/PlanDayGrid";

const calendarDay = { date: "2026-07-15", timeZone: "America/Los_Angeles" };

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

function actualBlock(
  id: string,
  startMinutes: number,
  durationMinutes: number,
): ActualBlock {
  return {
    id,
    summary: id,
    startMinutes,
    durationMinutes,
    colorId: "8",
    saveDisposition: "unsaved",
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PlanDayGrid", () => {
  it("renders the complete default hour axis without full-width grid lines", () => {
    render(<PlanDayGrid events={[]} status="connected" {...calendarDay} />);

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
        {...calendarDay}
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
        {...calendarDay}
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
        {...calendarDay}
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
        {...calendarDay}
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
    expect(screen.getByTestId("plan-event-visible-color")).toHaveStyle({
      backgroundColor: "#7986cb40",
      borderColor: "#7986cb80",
    });
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
        {...calendarDay}
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

  it("cascades overlapping Actuals and brings a clicked Actual to the front", () => {
    render(
      <PlanDayGrid
        actuals={[
          actualBlock("base-actual", 540, 120),
          actualBlock("nested-actual", 570, 60),
        ]}
        events={[]}
        status="connected"
        {...calendarDay}
      />,
    );

    const base = screen.getByText("base-actual").closest("button");
    const nested = screen.getByText("nested-actual").closest("button");
    expect(base).not.toBeNull();
    expect(nested).not.toBeNull();
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
    expect(within(base!).getByText("2h")).toBeVisible();
    expect(
      within(base!).getByText("9:00 AM – 11:00 AM"),
    ).toBeVisible();
    expect(screen.getByTestId("actual-column")).toHaveClass("overflow-hidden");

    fireEvent.click(base!);
    expect(base).toHaveStyle({ zIndex: "2" });
    fireEvent.click(nested!);
    expect(base).toHaveStyle({ zIndex: "0" });
    expect(nested).toHaveStyle({ zIndex: "2" });
  });

  it("clips a minimum-height Actual at midnight instead of the extended Plan body", () => {
    render(
      <PlanDayGrid
        actuals={[actualBlock("midnight-actual", 1_435, 60)]}
        events={[
          timedEvent(
            "midnight-plan",
            "2026-07-15T23:55:00-07:00",
            "2026-07-16T00:00:00-07:00",
          ),
        ]}
        status="connected"
        {...calendarDay}
      />,
    );

    expect(screen.getByTestId("plan-grid-body")).toHaveStyle({
      height: "1441px",
    });
    expect(screen.getByTestId("actual-column-clip")).toHaveStyle({
      height: "1428px",
    });
    expect(screen.getByTestId("actual-block")).toHaveStyle({
      top: "1421px",
      height: "20px",
    });
  });

  it("updates the visible now indicator once per minute", () => {
    vi.useFakeTimers();
    let currentTime = new Date(2026, 6, 15, 12, 34);
    render(
      <PlanDayGrid
        events={[]}
        now={() => currentTime}
        status="connected"
        {...calendarDay}
      />,
    );

    const indicator = screen.getByTestId("plan-now-indicator");
    expect(indicator.parentElement).toBe(screen.getByTestId("plan-grid-body"));
    expect(indicator).toHaveStyle({ top: "467.6px" });
    expect(within(indicator).getByText("12:34 PM")).toBeVisible();

    currentTime = new Date(2026, 6, 15, 12, 35);
    act(() => vi.advanceTimersByTime(60_000));

    expect(indicator).toHaveStyle({ top: "469px" });
    expect(within(indicator).getByText("12:35 PM")).toBeVisible();
  });

  it("auto-scrolls once after connected content renders", () => {
    const now = () => new Date(2026, 6, 15, 12);
    const { rerender } = render(
      <PlanDayGrid events={[]} now={now} status="loading" {...calendarDay} />,
    );
    const viewport = screen.getByTestId("plan-scroll-viewport");
    const header = screen.getByTestId("plan-grid-header");
    Object.defineProperty(viewport, "clientHeight", { value: 500 });
    Object.defineProperty(header, "offsetHeight", { value: 35 });

    rerender(
      <PlanDayGrid events={[]} now={now} status="connected" {...calendarDay} />,
    );
    expect(viewport.scrollTop).toBe(305);

    viewport.scrollTop = 700;
    rerender(
      <PlanDayGrid
        events={[
          timedEvent(
            "Later event",
            "2026-07-15T14:00:00-07:00",
            "2026-07-15T15:00:00-07:00",
          ),
        ]}
        now={now}
        status="connected"
        {...calendarDay}
      />,
    );
    expect(viewport.scrollTop).toBe(700);
  });
});
