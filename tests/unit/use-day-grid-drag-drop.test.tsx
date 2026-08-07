import { act, renderHook } from "@testing-library/react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { describe, expect, it, vi } from "vitest";

import {
  calculateDroppedStartMinutes,
  useDayGridDragDrop,
} from "../../src/app/hooks/use-day-grid-drag-drop";

function blockMouseEvent(
  element: HTMLButtonElement,
  clientY: number,
) {
  return { currentTarget: element, clientY } as ReactMouseEvent<HTMLButtonElement>;
}

function dragEvent<T extends HTMLElement>(
  element: T,
  clientY: number,
  dataTransfer: DataTransfer,
) {
  return {
    currentTarget: element,
    clientY,
    dataTransfer,
    preventDefault: vi.fn(),
    relatedTarget: null,
  } as unknown as ReactDragEvent<T>;
}

function dataTransfer() {
  return {
    dropEffect: "none",
    effectAllowed: "none",
    setData: vi.fn(),
  } as unknown as DataTransfer;
}

describe("useDayGridDragDrop", () => {
  const dropCalculationInput = {
    pointerClientY: 399,
    columnViewportTopPx: 0,
    grabOffsetYPx: 42,
    gridStartMinutes: 420,
    gridEndMinutes: 1_260,
    pixelsPerMinute: 1.4,
    snapMinutes: 5,
  };

  it("preserves the grab offset and snaps the block top to the nearest interval", () => {
    expect(calculateDroppedStartMinutes(dropCalculationInput)).toBe(675);
  });

  it("clamps drops to the first and final visible snap slots", () => {
    expect(calculateDroppedStartMinutes({
      ...dropCalculationInput,
      pointerClientY: -200,
    })).toBe(420);
    expect(calculateDroppedStartMinutes({
      ...dropCalculationInput,
      pointerClientY: 2_000,
    })).toBe(1_255);
  });

  it("previews and finishes a snapped drop using the recorded grab offset", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() =>
      useDayGridDragDrop({
        gridStartMinutes: 420,
        gridEndMinutes: 1_020,
        onDrop,
        settings: { pixelsPerMinute: 2, snapMinutes: 15 },
      }),
    );
    const source = document.createElement("button");
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue({
      top: 100,
      height: 60,
    } as DOMRect);
    const target = document.createElement("div");
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 40,
    } as DOMRect);
    const transfer = dataTransfer();

    act(() => {
      result.current.captureGrabOffset(
        blockMouseEvent(source, 120),
        "plan",
        "plan-1",
      );
      result.current.startDrag(
        dragEvent(source, 120, transfer),
        "plan",
        "plan-1",
      );
    });
    act(() => {
      result.current.previewDrop(
        dragEvent(target, 280, transfer),
        "actual",
      );
    });

    expect(transfer.effectAllowed).toBe("copy");
    expect(transfer.dropEffect).toBe("copy");
    expect(transfer.setData).toHaveBeenCalledWith("text/plain", "plan-1");
    expect(result.current.dropPreview).toEqual({
      targetColumn: "actual",
      startMinutes: 525,
    });

    act(() => {
      result.current.finishDrop(
        dragEvent(target, 280, transfer),
        "actual",
      );
    });

    expect(onDrop).toHaveBeenCalledWith({
      sourceColumn: "plan",
      sourceEventId: "plan-1",
      targetColumn: "actual",
      startMinutes: 525,
    });
    expect(result.current.dropPreview).toBeUndefined();
  });
});
