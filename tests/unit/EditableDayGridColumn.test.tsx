import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditableDayGridColumn } from "../../src/app/components/EditableDayGridColumn";
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

describe("EditableDayGridColumn", () => {
  it("renders and selects events for its editable column", () => {
    const onSelectEvent = vi.fn();

    render(
      <EditableDayGridColumn
        column="actual"
        gridStartHour={8}
        gridEndHour={17}
        events={[actual]}
        onSelectEvent={onSelectEvent}
        onResizeEnd={vi.fn()}
        onGrabOffsetCapture={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Focused work" }));

    expect(screen.getByTestId("actual-column")).toBeVisible();
    expect(onSelectEvent).toHaveBeenCalledWith(actual);
  });
});
