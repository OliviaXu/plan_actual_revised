import {
  act,
  createEvent,
  fireEvent,
  renderHook,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useActualResize } from "../../src/app/hooks/use-actual-resize";
import type { ActualEvent } from "../../src/domain/day-event";
import { defaultSettings } from "../../src/domain/settings";

const actual: ActualEvent = {
  id: "actual-1",
  summary: "Writing",
  startMinutes: 540,
  durationMinutes: 30,
  colorId: "8",
  saveDisposition: "unsaved",
};

afterEach(() => vi.restoreAllMocks());

function pointerEvent(pointerId: number, clientY: number) {
  return createEvent.pointerDown(window, {
    pointerId,
    clientY,
  }) as PointerEvent;
}

describe("useActualResize", () => {
  it("registers pointer listeners only for an active resize session", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { result, unmount } = renderHook(() =>
      useActualResize({
        actuals: [actual],
        settings: defaultSettings,
      }),
    );

    expect(
      addEventListener.mock.calls.filter(([event]) =>
        ["pointermove", "pointerup", "pointercancel"].includes(event),
      ),
    ).toHaveLength(0);

    act(() => {
      result.current.startActualResize(actual, pointerEvent(1, 100));
    });

    expect(
      addEventListener.mock.calls.filter(([event]) =>
        ["pointermove", "pointerup", "pointercancel"].includes(event),
      ),
    ).toHaveLength(3);

    fireEvent.pointerUp(window, { pointerId: 1, clientY: 100 });

    expect(
      removeEventListener.mock.calls.filter(([event]) =>
        ["pointermove", "pointerup", "pointercancel"].includes(event),
      ),
    ).toHaveLength(3);

    act(() => {
      result.current.startActualResize(actual, pointerEvent(2, 100));
    });
    unmount();

    expect(
      removeEventListener.mock.calls.filter(([event]) =>
        ["pointermove", "pointerup", "pointercancel"].includes(event),
      ),
    ).toHaveLength(6);
  });

  it("previews a snapped duration and commits it on pointer release", () => {
    const onResizeEnd = vi.fn();
    const { result } = renderHook(() =>
      useActualResize({
        actuals: [actual],
        disabled: false,
        onResizeEnd,
        settings: defaultSettings,
      }),
    );

    act(() => {
      result.current.startActualResize(actual, pointerEvent(1, 100));
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 121 });

    expect(result.current.displayedActuals[0].durationMinutes).toBe(45);
    expect(onResizeEnd).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { pointerId: 1, clientY: 121 });

    expect(result.current.displayedActuals[0].durationMinutes).toBe(30);
    expect(onResizeEnd).toHaveBeenCalledOnce();
    expect(onResizeEnd).toHaveBeenCalledWith("actual-1", 45);
  });

  it("restores the original event on cancellation and ignores disabled starts", () => {
    const onResizeEnd = vi.fn();
    const { result, rerender } = renderHook(
      ({ disabled }) =>
        useActualResize({
          actuals: [actual],
          disabled,
          onResizeEnd,
          settings: defaultSettings,
        }),
      { initialProps: { disabled: false } },
    );

    act(() => {
      result.current.startActualResize(actual, pointerEvent(2, 100));
    });
    fireEvent.pointerMove(window, { pointerId: 2, clientY: 30 });
    expect(result.current.displayedActuals[0].durationMinutes).toBe(5);

    fireEvent.pointerCancel(window, { pointerId: 2 });
    expect(result.current.displayedActuals[0].durationMinutes).toBe(30);
    expect(onResizeEnd).not.toHaveBeenCalled();

    rerender({ disabled: true });
    act(() => {
      result.current.startActualResize(actual, pointerEvent(3, 100));
    });
    fireEvent.pointerMove(window, { pointerId: 3, clientY: 121 });
    fireEvent.pointerUp(window, { pointerId: 3, clientY: 121 });

    expect(result.current.displayedActuals[0].durationMinutes).toBe(30);
    expect(onResizeEnd).not.toHaveBeenCalled();
  });
});
