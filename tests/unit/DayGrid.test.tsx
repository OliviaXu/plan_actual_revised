import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ActualEvent,
  PlanEvent,
  RevisedEvent,
} from "../../src/domain/day-event";
import { DayGrid } from "../../src/app/components/DayGrid";

const calendarDay = { date: "2026-07-15", timeZone: "America/Los_Angeles" };

function planEvent(
  id: string,
  startMinutes: number,
  durationMinutes: number,
  overrides: Partial<PlanEvent> = {},
): PlanEvent {
  return {
    id,
    summary: id,
    colorId: "",
    startMinutes,
    durationMinutes,
    ...overrides,
  };
}

function actualEvent(
  id: string,
  startMinutes: number,
  durationMinutes: number,
): ActualEvent {
  return {
    id,
    summary: id,
    startMinutes,
    durationMinutes,
    colorId: "8",
    saveDisposition: "unsaved",
  };
}

function revisedEvent(
  id: string,
  startMinutes: number,
  durationMinutes: number,
): RevisedEvent {
  return {
    id,
    summary: id,
    startMinutes,
    durationMinutes,
    colorId: "6",
  };
}

function dataTransfer() {
  return {
    dropEffect: "none",
    effectAllowed: "none",
    getData: vi.fn(),
    setData: vi.fn(),
  } as unknown as DataTransfer;
}

function fireDragEvent(
  target: Element,
  type: "dragstart" | "dragover" | "drop" | "dragend",
  clientY: number,
  transfer: DataTransfer,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY,
  });
  Object.defineProperty(event, "dataTransfer", { value: transfer });
  fireEvent(target, event);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DayGrid", () => {
  it("shows only Actual with a non-interactive Revised reveal rail", () => {
    render(
      <DayGrid
        actuals={[actualEvent("actual", 540, 30)]}
        layoutMode="actual"
        planEvents={[planEvent("plan", 480, 30)]}
        revised={[revisedEvent("revised", 600, 30)]}
        {...calendarDay}
      />,
    );

    expect(screen.getByRole("heading", { name: "Actual" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Revised" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-column")).not.toBeInTheDocument();
    expect(screen.queryByTestId("revised-column")).not.toBeInTheDocument();
    expect(screen.getByTestId("revised-reveal-header")).toHaveTextContent("R");
    expect(screen.getByTestId("revised-reveal-rail")).toHaveAttribute(
      "title",
      "Drag the side panel wider to show Revised",
    );
    expect(screen.getByTestId("revised-reveal-rail")).not.toHaveAttribute(
      "role",
      "button",
    );
    expect(screen.getByTestId("revised-reveal-grip")).toHaveClass(
      "sticky",
      "top-1/2",
    );
    expect(screen.getByRole("button", { name: "Add Actual" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Log Slack time" })).toBeVisible();
  });

  it("shows Actual and Revised with the Plan reveal rail on the left", () => {
    render(
      <DayGrid
        actuals={[actualEvent("actual", 540, 30)]}
        layoutMode="actual-revised"
        planEvents={[planEvent("plan", 480, 30)]}
        revised={[revisedEvent("revised", 600, 30)]}
        {...calendarDay}
      />,
    );

    expect(screen.queryByRole("heading", { name: "Plan" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actual" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Revised" })).toBeVisible();
    expect(screen.getByTestId("plan-reveal-header")).toHaveTextContent("P");
    expect(screen.getByTestId("plan-reveal-rail")).toHaveAttribute(
      "title",
      "Drag the side panel wider to show Plan",
    );
    expect(screen.getByTestId("plan-reveal-rail").compareDocumentPosition(
      screen.getByTestId("actual-column"),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows all columns without a reveal rail in full mode", () => {
    render(
      <DayGrid layoutMode="full" planEvents={[]} {...calendarDay} />,
    );

    expect(screen.getByRole("heading", { name: "Plan" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Actual" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Revised" })).toBeVisible();
    expect(screen.queryByTestId("plan-reveal-rail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("revised-reveal-rail")).not.toBeInTheDocument();
  });

  it("preserves the shared timeline and scroll position when columns appear", () => {
    const { rerender } = render(
      <DayGrid
        layoutMode="actual"
        planEvents={[planEvent("late-plan", 1200, 60)]}
        {...calendarDay}
      />,
    );
    const viewport = screen.getByTestId("plan-scroll-viewport");
    const actualColumn = screen.getByTestId("actual-column");
    viewport.scrollTop = 320;
    const bodyHeight = screen.getByTestId("day-grid-body").style.height;

    rerender(
      <DayGrid
        layoutMode="actual-revised"
        planEvents={[planEvent("late-plan", 1200, 60)]}
        {...calendarDay}
      />,
    );

    expect(screen.getByTestId("plan-scroll-viewport")).toBe(viewport);
    expect(screen.getByTestId("actual-column")).toBe(actualColumn);
    expect(viewport.scrollTop).toBe(320);
    expect(screen.getByTestId("day-grid-body").style.height).toBe(bodyHeight);
  });

  it("renders the complete default hour axis without full-width grid lines", () => {
    render(<DayGrid planEvents={[]} {...calendarDay} />);

    expect(screen.queryByTestId("plan-hour-line")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("plan-hour-tick")).toHaveLength(15);
    expect(screen.getByTestId("plan-hour-marker-7")).toHaveStyle({
      top: "0px",
    });
    expect(screen.getByTestId("plan-hour-marker-21")).toHaveStyle({
      top: "1176px",
    });
    expect(screen.getByTestId("day-grid-body")).toHaveStyle({
      height: "1176px",
    });
    expect(screen.getByText("7 AM")).toBeVisible();
    expect(screen.getByText("9 PM")).toBeVisible();
  });

  it("renders title, duration, exact geometry, and a tall-block time range", () => {
    render(
      <DayGrid
        planEvents={[
          planEvent("Design review", 540, 60),
        ]}
        {...calendarDay}
      />,
    );

    const block = screen.getByTestId("plan-event-Design review");
    expect(block).toHaveStyle({ top: "168px", height: "84px" });
    expect(within(block).getByText("Design review")).toBeVisible();
    expect(within(block).getByText("1h")).toBeVisible();
    expect(within(block).getByText("9:00 AM – 10:00 AM")).toBeVisible();
  });

  it("renders shared event content and appearance in Plan and Actual", () => {
    render(
      <DayGrid
        actuals={[
          { ...actualEvent("actual-empty", 540, 60), summary: "" },
        ]}
        planEvents={[
          planEvent("plan-empty", 540, 60, {
            summary: "",
            colorId: "8",
          }),
        ]}
        {...calendarDay}
      />,
    );

    const planBlock = screen.getByTestId("plan-event-plan-empty");
    const actualBlock = screen.getByTestId("actual-block");
    for (const block of [planBlock, actualBlock]) {
      expect(within(block).getByText("Untitled event")).toBeVisible();
      expect(within(block).getByText("1h")).toBeVisible();
      expect(within(block).getByText("9:00 AM – 10:00 AM")).toBeVisible();
      expect(block).toHaveStyle({
        backgroundColor: "#61616140",
        borderColor: "#61616180",
      });
    }
  });

  it("renders Revised as a fourth column with column-aware edit and resize interactions", () => {
    const onEditEditable = vi.fn();
    const onEditableResizeEnd = vi.fn();
    render(
      <DayGrid
        actuals={[actualEvent("actual", 540, 30)]}
        revised={[revisedEvent("revised", 600, 30)]}
        onEditEditable={onEditEditable}
        onEditableResizeEnd={onEditableResizeEnd}
        planEvents={[]}
        {...calendarDay}
      />,
    );

    expect(screen.getByRole("heading", { name: "Revised" })).toBeVisible();
    expect(screen.getByTestId("revised-column")).toHaveClass(
      "overflow-hidden",
    );
    expect(screen.getByTestId("revised-block")).toHaveTextContent("revised");

    fireEvent.click(
      screen.getByRole("button", { name: "Edit revised" }),
    );
    expect(onEditEditable).toHaveBeenCalledWith(
      "revised",
      revisedEvent("revised", 600, 30),
    );

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Resize revised" }),
      { clientY: 100, pointerId: 7 },
    );
    fireEvent.pointerMove(window, { clientY: 121, pointerId: 7 });
    fireEvent.pointerUp(window, { clientY: 121, pointerId: 7 });

    expect(onEditableResizeEnd).toHaveBeenCalledWith(
      "revised",
      "revised",
      45,
    );
  });

  it("previews and emits a snapped Plan copy over valid editable targets", () => {
    const onDropEditable = vi.fn();
    render(
      <DayGrid
        onDropEditable={onDropEditable}
        planEvents={[planEvent("plan-copy", 540, 60)]}
        {...calendarDay}
      />,
    );

    const planBlock = screen.getByTestId("plan-event-plan-copy");
    vi.spyOn(planBlock, "getBoundingClientRect").mockReturnValue({
      top: 168,
      bottom: 252,
      left: 0,
      right: 200,
      width: 200,
      height: 84,
      x: 0,
      y: 168,
      toJSON: () => undefined,
    });
    const actualColumn = screen.getByTestId("actual-column");
    vi.spyOn(actualColumn, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 1_176,
      left: 200,
      right: 400,
      width: 200,
      height: 1_176,
      x: 200,
      y: 0,
      toJSON: () => undefined,
    });
    const transfer = dataTransfer();

    fireDragEvent(planBlock, "dragstart", 210, transfer);
    fireDragEvent(actualColumn, "dragover", 399, transfer);

    expect(actualColumn).toHaveClass("bg-accent/15");
    const dropTimeIndicator = screen.getByTestId("drop-time-indicator");
    expect(dropTimeIndicator).toHaveStyle({
      top: "357px",
    });
    expect(dropTimeIndicator).toHaveTextContent(
      "11:15 AM",
    );
    const timeLabel = screen.getByText("11:15 AM");
    const timeTrace = screen.getByTestId("drop-time-trace");
    expect(timeLabel).not.toHaveClass("bg-white/90");
    expect(timeLabel).toHaveClass("text-now/80");
    expect(timeTrace).toHaveClass("border-now/40");
    expect(timeLabel.nextElementSibling).toBe(timeTrace);

    fireDragEvent(actualColumn, "drop", 399, transfer);

    expect(onDropEditable).toHaveBeenCalledWith({
      sourceColumn: "plan",
      sourceEventId: "plan-copy",
      targetColumn: "actual",
      startMinutes: 675,
    });
    expect(screen.queryByTestId("drop-time-indicator"))
      .not.toBeInTheDocument();
    expect(actualColumn).not.toHaveClass("bg-accent/15");
  });

  it("disables every Plan drag source and drop target while dragging is disabled", () => {
    const onDropEditable = vi.fn();
    render(
      <DayGrid
        actuals={[actualEvent("disabled-actual", 600, 30)]}
        dragDisabled
        onDropEditable={onDropEditable}
        planEvents={[planEvent("disabled-plan", 540, 60)]}
        {...calendarDay}
      />,
    );

    const planBlock = screen.getByTestId("plan-event-disabled-plan");
    const actualBlockButton = screen.getByRole("button", {
      name: "Edit disabled-actual",
    });
    expect(planBlock).toHaveAttribute("draggable", "false");
    expect(actualBlockButton).toHaveAttribute("draggable", "false");
    expect(screen.getByRole("button", {
      name: "Resize disabled-actual",
    })).toHaveProperty("draggable", false);
    fireEvent.dragStart(planBlock, {
      clientY: 210,
      dataTransfer: dataTransfer(),
    });
    fireEvent.dragOver(screen.getByTestId("revised-column"), {
      clientY: 399,
      dataTransfer: dataTransfer(),
    });

    expect(screen.queryByTestId("drop-time-indicator"))
      .not.toBeInTheDocument();
    expect(onDropEditable).not.toHaveBeenCalled();
  });

  it("moves an editable block across columns and suppresses its drag click", () => {
    const onDropEditable = vi.fn();
    const onEditEditable = vi.fn();
    render(
      <DayGrid
        actuals={[actualEvent("actual-source", 600, 30)]}
        onDropEditable={onDropEditable}
        onEditEditable={onEditEditable}
        planEvents={[]}
        {...calendarDay}
      />,
    );
    const source = screen.getByRole("button", {
      name: "Edit actual-source",
    });
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue({
      top: 252,
      bottom: 294,
      left: 200,
      right: 400,
      width: 200,
      height: 42,
      x: 200,
      y: 252,
      toJSON: () => undefined,
    });
    const target = screen.getByTestId("revised-column");
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 1_176,
      left: 400,
      right: 600,
      width: 200,
      height: 1_176,
      x: 400,
      y: 0,
      toJSON: () => undefined,
    });
    const transfer = dataTransfer();

    fireEvent.mouseDown(source, { clientY: 273 });
    fireDragEvent(source, "dragstart", 273, transfer);
    expect(transfer.effectAllowed).toBe("move");
    expect(screen.getByTestId("actual-block")).toHaveStyle({ zIndex: "0" });
    fireDragEvent(target, "dragover", 441, transfer);
    expect(transfer.dropEffect).toBe("move");
    expect(screen.getByTestId("drop-time-indicator")).toHaveStyle({
      top: "420px",
    });
    fireDragEvent(target, "drop", 441, transfer);
    fireDragEvent(source, "dragend", 441, transfer);
    fireEvent.click(source);

    expect(onDropEditable).toHaveBeenCalledWith({
      sourceColumn: "actual",
      sourceEventId: "actual-source",
      targetColumn: "revised",
      startMinutes: 720,
    });
    expect(onEditEditable).not.toHaveBeenCalled();
  });

  it("emits same-column editable drops as reposition operations", () => {
    const onDropEditable = vi.fn();
    render(
      <DayGrid
        revised={[revisedEvent("revised-source", 600, 30)]}
        onDropEditable={onDropEditable}
        planEvents={[]}
        {...calendarDay}
      />,
    );
    const source = screen.getByRole("button", {
      name: "Edit revised-source",
    });
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue({
      top: 252,
      bottom: 294,
      left: 400,
      right: 600,
      width: 200,
      height: 42,
      x: 400,
      y: 252,
      toJSON: () => undefined,
    });
    const target = screen.getByTestId("revised-column");
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 1_176,
      left: 400,
      right: 600,
      width: 200,
      height: 1_176,
      x: 400,
      y: 0,
      toJSON: () => undefined,
    });
    const transfer = dataTransfer();

    fireEvent.mouseDown(source, { clientY: 273 });
    fireDragEvent(source, "dragstart", 273, transfer);
    fireDragEvent(target, "drop", 357, transfer);

    expect(onDropEditable).toHaveBeenCalledWith({
      sourceColumn: "revised",
      sourceEventId: "revised-source",
      targetColumn: "revised",
      startMinutes: 660,
    });
  });

  it("clears a valid drop preview when a drag leaves or is canceled", () => {
    render(
      <DayGrid
        planEvents={[planEvent("cancel-plan", 540, 60)]}
        {...calendarDay}
      />,
    );
    const planBlock = screen.getByTestId("plan-event-cancel-plan");
    const actualColumn = screen.getByTestId("actual-column");
    const transfer = dataTransfer();

    fireDragEvent(planBlock, "dragstart", 210, transfer);
    fireDragEvent(actualColumn, "dragover", 399, transfer);
    expect(screen.getByTestId("drop-time-indicator")).toBeInTheDocument();

    fireEvent.dragLeave(actualColumn);
    expect(screen.queryByTestId("drop-time-indicator"))
      .not.toBeInTheDocument();

    fireDragEvent(actualColumn, "dragover", 399, transfer);
    fireEvent.dragEnd(planBlock, { dataTransfer: transfer });
    expect(screen.queryByTestId("drop-time-indicator"))
      .not.toBeInTheDocument();
  });

  it("places the first-slot time label below its unclipped grid edge", () => {
    render(
      <DayGrid
        planEvents={[planEvent("grid-start-plan", 540, 60)]}
        {...calendarDay}
      />,
    );
    const planBlock = screen.getByTestId("plan-event-grid-start-plan");
    vi.spyOn(planBlock, "getBoundingClientRect").mockReturnValue({
      top: 168,
      bottom: 252,
      left: 0,
      right: 200,
      width: 200,
      height: 84,
      x: 0,
      y: 168,
      toJSON: () => undefined,
    });
    const actualColumn = screen.getByTestId("actual-column");
    vi.spyOn(actualColumn, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 1_176,
      left: 200,
      right: 400,
      width: 200,
      height: 1_176,
      x: 200,
      y: 0,
      toJSON: () => undefined,
    });
    const transfer = dataTransfer();

    fireDragEvent(planBlock, "dragstart", 210, transfer);
    fireDragEvent(actualColumn, "dragover", 42, transfer);

    expect(screen.getByTestId("drop-time-indicator")).toHaveStyle({
      top: "0px",
    });
    expect(screen.getByText("7:00 AM")).not.toHaveClass(
      "-translate-y-full",
    );
  });

  it("hides the time range below 40px and shows it above 40px", () => {
    render(
      <DayGrid
        planEvents={[
          planEvent("Below threshold", 540, 20),
          planEvent("Above threshold", 600, 30),
        ]}
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

  it("clips a minimum-height Plan block at the final grid boundary", () => {
    render(
      <DayGrid
        planEvents={[
          planEvent("Final five minutes", 1_255, 5),
        ]}
        {...calendarDay}
      />,
    );

    expect(screen.getByTestId("day-grid-body")).toHaveStyle({
      height: "1176px",
    });
    expect(screen.getByTestId("plan-column")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("plan-event-Final five minutes")).toHaveStyle({
      top: "1169px",
      height: "20px",
    });
  });

  it("renders normalized titles and Calendar colors", () => {
    render(
      <DayGrid
        planEvents={[
          planEvent("visible-color", 540, 60, { colorId: "1" }),
          planEvent("untitled-neutral", 660, 30, {
            summary: "",
            colorId: "",
          }),
        ]}
        {...calendarDay}
      />,
    );

    expect(screen.getByTestId("day-grid-body")).toHaveAttribute(
      "data-start-hour",
      "7",
    );
    expect(screen.getByTestId("day-grid-body")).toHaveAttribute(
      "data-end-hour",
      "21",
    );
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
      <DayGrid
        planEvents={[
          planEvent("base", 540, 120),
          planEvent("nested", 570, 60),
        ]}
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
      <DayGrid
        actuals={[
          actualEvent("base-actual", 540, 120),
          actualEvent("nested-actual", 570, 60),
        ]}
        planEvents={[]}
        {...calendarDay}
      />,
    );

    const blocks = screen.getAllByTestId("actual-block");
    const base = blocks.find(
      (block) => block.getAttribute("data-actual-id") === "base-actual",
    );
    const nested = blocks.find(
      (block) => block.getAttribute("data-actual-id") === "nested-actual",
    );
    expect(base).toBeDefined();
    expect(nested).toBeDefined();
    expect(base).toHaveAttribute("data-overlap-group-index", "0");
    expect(base).toHaveAttribute("data-overlap-layer-index", "0");
    expect(
      within(base!).getByRole("button", { name: "Edit base-actual" }),
    ).toHaveClass(
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

    fireEvent.click(
      within(base!).getByRole("button", { name: "Edit base-actual" }),
    );
    expect(base).toHaveStyle({ zIndex: "2" });
    fireEvent.click(
      within(nested!).getByRole("button", { name: "Edit nested-actual" }),
    );
    expect(base).toHaveStyle({ zIndex: "0" });
    expect(nested).toHaveStyle({ zIndex: "2" });
  });

  it("previews a snapped Actual resize and commits once on pointer release", () => {
    const onEditEditable = vi.fn();
    const onEditableResizeEnd = vi.fn();
    render(
      <DayGrid
        actuals={[actualEvent("resized-actual", 540, 30)]}
        onEditEditable={onEditEditable}
        onEditableResizeEnd={onEditableResizeEnd}
        planEvents={[]}
        {...calendarDay}
      />,
    );

    const handle = screen.getByRole("button", {
      name: "Resize resized-actual",
    });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 121, pointerId: 1 });

    const preview = screen.getByTestId("actual-block");
    expect(preview).toHaveStyle({ height: "63px" });
    expect(within(preview).getByText("45m")).toBeVisible();
    expect(within(preview).getByText("9:00 AM – 9:45 AM")).toBeVisible();
    expect(onEditableResizeEnd).not.toHaveBeenCalled();
    expect(onEditEditable).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { clientY: 121, pointerId: 1 });

    expect(onEditableResizeEnd).toHaveBeenCalledOnce();
    expect(onEditableResizeEnd).toHaveBeenCalledWith(
      "actual",
      "resized-actual",
      45,
    );
    expect(onEditEditable).not.toHaveBeenCalled();
  });

  it("enforces the minimum resize duration and restores on cancellation", () => {
    const onEditableResizeEnd = vi.fn();
    render(
      <DayGrid
        actuals={[actualEvent("cancelled-actual", 540, 30)]}
        onEditableResizeEnd={onEditableResizeEnd}
        planEvents={[]}
        {...calendarDay}
      />,
    );

    const handle = screen.getByRole("button", {
      name: "Resize cancelled-actual",
    });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(window, { clientY: 0, pointerId: 2 });

    const preview = screen.getByTestId("actual-block");
    expect(preview).toHaveStyle({ height: "20px" });
    expect(within(preview).getByText("5m")).toBeVisible();

    fireEvent.pointerCancel(window, { pointerId: 2 });

    expect(screen.getByTestId("actual-block")).toHaveStyle({ height: "42px" });
    expect(within(screen.getByTestId("actual-block")).getByText("30m"))
      .toBeVisible();
    expect(onEditableResizeEnd).not.toHaveBeenCalled();
  });

  it("clips minimum-height Plan and Actual blocks at midnight", () => {
    render(
      <DayGrid
        actuals={[actualEvent("midnight-actual", 1_435, 60)]}
        planEvents={[
          planEvent("midnight-plan", 1_435, 5),
        ]}
        {...calendarDay}
      />,
    );

    expect(screen.getByTestId("day-grid-body")).toHaveStyle({
      height: "1428px",
    });
    expect(screen.getByTestId("plan-column")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("actual-column")).toHaveClass(
      "overflow-hidden",
    );
    expect(screen.getByTestId("actual-block")).toHaveStyle({
      top: "1421px",
      height: "20px",
    });
  });

  it("updates the visible now indicator once per minute", () => {
    vi.useFakeTimers();
    let currentTime = new Date(2026, 6, 15, 12, 34);
    render(
      <DayGrid
        planEvents={[]}
        now={() => currentTime}
        {...calendarDay}
      />,
    );

    const indicator = screen.getByTestId("plan-now-indicator");
    expect(indicator.parentElement).toBe(screen.getByTestId("day-grid-body"));
    expect(indicator).toHaveStyle({ top: "467.6px" });
    const timeLabel = within(indicator).getByText("12:34 PM");
    const timeTrace = within(indicator).getByTestId("now-time-trace");
    expect(timeLabel).toBeVisible();
    expect(timeLabel).not.toHaveClass("bg-white");
    expect(timeTrace).toHaveClass("border-now");
    expect(timeTrace.nextElementSibling).toBe(timeLabel);

    currentTime = new Date(2026, 6, 15, 12, 35);
    act(() => vi.advanceTimersByTime(60_000));

    expect(indicator).toHaveStyle({ top: "469px" });
    expect(within(indicator).getByText("12:35 PM")).toBeVisible();
  });

  it("keeps the Now label inside the first visible grid slot", () => {
    render(
      <DayGrid
        planEvents={[]}
        now={() => new Date(2026, 6, 15, 7)}
        {...calendarDay}
      />,
    );

    expect(screen.getByText("7:00 AM")).not.toHaveClass(
      "-translate-y-full",
    );
  });

  it("auto-scrolls once after connected content renders", () => {
    const now = () => new Date(2026, 6, 15, 12);
    const clientHeight = vi.spyOn(
      HTMLElement.prototype,
      "clientHeight",
      "get",
    ).mockReturnValue(500);
    const offsetHeight = vi.spyOn(
      HTMLElement.prototype,
      "offsetHeight",
      "get",
    ).mockReturnValue(35);

    const { rerender } = render(
      <DayGrid planEvents={[]} now={now} {...calendarDay} />,
    );
    const viewport = screen.getByTestId("plan-scroll-viewport");
    expect(viewport.scrollTop).toBe(305);

    viewport.scrollTop = 700;
    rerender(
      <DayGrid
        planEvents={[
          planEvent("Later event", 840, 60),
        ]}
        now={now}
        {...calendarDay}
      />,
    );
    expect(viewport.scrollTop).toBe(700);

    clientHeight.mockRestore();
    offsetHeight.mockRestore();
  });
});
