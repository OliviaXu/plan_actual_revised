import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  getSidePanelLayoutMode,
  useDayGridLayoutMode,
} from "../../src/app/side-panel-layout";

afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
});

describe("getSidePanelLayoutMode", () => {
  it.each([
    [519, "actual"],
    [520, "actual-revised"],
    [1023, "actual-revised"],
    [1024, "full"],
  ] as const)("maps %ipx to %s", (width, expected) => {
    expect(getSidePanelLayoutMode(width)).toBe(expected);
  });

  it("updates a side-panel layout as its viewport is resized", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 519 });
    const { result } = renderHook(() => useDayGridLayoutMode("side-panel"));
    expect(result.current).toBe("actual");

    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe("actual-revised");

    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe("full");
  });

  it("keeps standalone pages in full mode at narrow widths", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    const { result } = renderHook(() => useDayGridLayoutMode("standalone"));
    expect(result.current).toBe("full");
  });
});
