import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditableDayGridColumn } from "../../src/app/components/EditableDayGridColumn";
import type { DayGridDragDropController } from "../../src/app/hooks/use-day-grid-drag-drop";
import type { ActualEvent } from "../../src/domain/day-event";

const actual: ActualEvent = {
  id: "actual-1",
  summary: "Focused work",
  startMinutes: 540,
  durationMinutes: 30,
  colorId: "8",
  saveDisposition: "unsaved",
};

afterEach(cleanup);

function dragDropController(): DayGridDragDropController {
  return {
    captureGrabOffset: vi.fn(),
    startDrag: vi.fn(),
    previewDrop: vi.fn(),
    clearDropPreview: vi.fn(),
    finishDrop: vi.fn(),
    clearDragState: vi.fn(),
  };
}

describe("EditableDayGridColumn", () => {
  it("renders and selects events for its editable column", () => {
    const onSelectEvent = vi.fn();

    render(
      <EditableDayGridColumn
        column="actual"
        gridStartHour={8}
        gridEndHour={17}
        events={[actual]}
        dragDrop={dragDropController()}
        onSelectEvent={onSelectEvent}
        onResizeEnd={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Focused work" }));

    expect(screen.getByTestId("actual-column")).toBeVisible();
    expect(onSelectEvent).toHaveBeenCalledWith("actual", actual);
  });
});
