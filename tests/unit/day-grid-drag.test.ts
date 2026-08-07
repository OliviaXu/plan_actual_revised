import { describe, expect, it } from "vitest";

import { calculateDroppedStartMinutes } from "../../src/app/hooks/use-day-grid-drag-drop";

describe("calculateDroppedStartMinutes", () => {
  const input = {
    pointerClientY: 399,
    columnViewportTopPx: 0,
    grabOffsetYPx: 42,
    gridStartMinutes: 420,
    gridEndMinutes: 1_260,
    pixelsPerMinute: 1.4,
    snapMinutes: 5,
  };

  it("preserves the grab offset and snaps the block top to the nearest interval", () => {
    expect(calculateDroppedStartMinutes(input)).toBe(675);
  });

  it("clamps drops to the first and final visible snap slots", () => {
    expect(calculateDroppedStartMinutes({
      ...input,
      pointerClientY: -200,
    })).toBe(420);
    expect(calculateDroppedStartMinutes({
      ...input,
      pointerClientY: 2_000,
    })).toBe(1_255);
  });
});
