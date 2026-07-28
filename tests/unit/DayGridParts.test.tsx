import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EditableGridBlock,
  PlanGridBlock,
} from "../../src/app/components/DayGridEventBlock";
import { DayGridTimeAxis } from "../../src/app/components/DayGridTimeAxis";
import type { ActualEvent, PlanEvent } from "../../src/domain/day-event";
import type { DayGridBlock } from "../../src/app/components/day-grid-layout";

afterEach(cleanup);

describe("DayGridTimeAxis", () => {
  it("renders boundary labels at their timeline positions", () => {
    render(
      <DayGridTimeAxis
        hourHeightPx={84}
        range={{
          startHour: 7,
          endHour: 9,
          heightPx: 168,
          hourBoundaries: [7, 8, 9],
        }}
      />,
    );

    expect(screen.getByTestId("plan-hour-marker-7")).toHaveStyle({ top: "0px" });
    expect(screen.getByTestId("plan-hour-marker-8")).toHaveStyle({ top: "84px" });
    expect(screen.getByTestId("plan-hour-marker-9")).toHaveStyle({ top: "168px" });
    expect(screen.getByText("7 AM")).toBeVisible();
    expect(screen.getByText("9 AM")).toHaveClass("-translate-y-full");
  });
});

describe("DayGrid event blocks", () => {
  it("keeps Plan and Actual interactions distinct while sharing event content", () => {
    const plan = dayGridBlock<PlanEvent>({
      id: "plan",
      summary: "Plan event",
      colorId: "8",
      startMinutes: 540,
      durationMinutes: 60,
    });
    const actualEvent: ActualEvent = {
      id: "actual",
      summary: "Actual event",
      colorId: "8",
      startMinutes: 540,
      durationMinutes: 60,
      saveDisposition: "unsaved",
    };
    const actual = dayGridBlock(actualEvent);
    const onBringToFront = vi.fn();
    const onResizeStart = vi.fn();
    const onSelect = vi.fn();

    render(
      <>
        <PlanGridBlock
          block={plan}
          frontZIndex={2}
          isFront={false}
          onBringToFront={onBringToFront}
        />
        <EditableGridBlock
          block={actual}
          column="actual"
          frontZIndex={2}
          isFront
          onResizeStart={onResizeStart}
          onSelect={onSelect}
        />
      </>,
    );

    fireEvent.click(screen.getByTestId("plan-event-plan"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Actual event" }));
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Resize Actual event" }),
      { clientY: 100, pointerId: 1 },
    );

    expect(onBringToFront).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onResizeStart).toHaveBeenCalledWith(
      actualEvent,
      expect.objectContaining({ clientY: 100 }),
    );
    expect(within(screen.getByTestId("actual-block")).getByText("1h"))
      .toBeVisible();
    expect(screen.getByTestId("actual-block")).toHaveStyle({ zIndex: "2" });
  });
});

function dayGridBlock<T extends PlanEvent | ActualEvent>(event: T): DayGridBlock<T> {
  return {
    event,
    clippedStartMinutes: event.startMinutes,
    clippedEndMinutes: event.startMinutes + event.durationMinutes,
    durationMinutes: event.durationMinutes,
    topPx: 168,
    heightPx: 84,
    showTimeRange: true,
    overlapGroupIndex: 0,
    overlapLayerIndex: 0,
  };
}
