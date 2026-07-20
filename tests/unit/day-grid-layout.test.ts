import { describe, expect, it } from "vitest";

import type { ActualEvent, PlanEvent } from "../../src/domain/day-event";
import { defaultSettings } from "../../src/domain/settings";
import {
  calculateActualDayGridLayout,
  calculatePlanDayGridLayout,
  calculatePlanNowIndicatorTopPx,
  MINIMUM_PLAN_BLOCK_HEIGHT_PX,
} from "../../src/app/components/day-grid-layout";

const date = "2026-07-15";
const timeZone = "America/Los_Angeles";

function planEvent(
  id: string,
  startMinutes: number,
  durationMinutes: number,
): PlanEvent {
  return {
    id,
    summary: id,
    colorId: "",
    startMinutes,
    durationMinutes,
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

describe("calculatePlanDayGridLayout", () => {
  it("positions normalized day-relative events", () => {
    const layout = calculatePlanDayGridLayout(
      [planEvent("morning", 600, 60)],
      defaultSettings,
    );

    expect(layout.blocks[0]).toMatchObject({
      durationMinutes: 60,
      topPx: 252,
    });
  });

  it("uses the configured range and exact time geometry by default", () => {
    const layout = calculatePlanDayGridLayout(
      [planEvent("design-review", 540, 60)],
      defaultSettings,
    );

    expect(layout.startHour).toBe(7);
    expect(layout.endHour).toBe(21);
    expect(layout.heightPx).toBe(1_176);
    expect(layout.hourBoundaries).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    ]);
    expect(layout.blocks[0]).toMatchObject({
      durationMinutes: 60,
      topPx: 168,
      heightPx: 84,
      showTimeRange: true,
    });
  });

  it("expands and rounds the range to whole-hour boundaries", () => {
    const layout = calculatePlanDayGridLayout(
      [
        planEvent("early", 390, 30),
        planEvent("late", 1_275, 15),
      ],
      defaultSettings,
    );

    expect(layout.startHour).toBe(6);
    expect(layout.endHour).toBe(22);
    expect(layout.blocks.map(({ topPx, heightPx }) => ({ topPx, heightPx })))
      .toEqual([
        { topPx: 42, heightPx: 42 },
        { topPx: 1_281, heightPx: 21 },
      ]);
  });

  it("does not expand an event ending exactly at the configured end hour", () => {
    const layout = calculatePlanDayGridLayout(
      [planEvent("ends-at-nine", 1_230, 30)],
      defaultSettings,
    );

    expect(layout.endHour).toBe(21);
  });

  it("positions event starts at minute precision", () => {
    const layout = calculatePlanDayGridLayout(
      [planEvent("minute-start", 540, 60)],
      defaultSettings,
    );

    expect(layout.blocks[0]).toMatchObject({ topPx: 168 });
  });

  it("applies the named minimum height and the time-range threshold", () => {
    const belowThreshold = calculatePlanDayGridLayout(
      [planEvent("short", 600, 5)],
      defaultSettings,
    ).blocks[0];
    const atThreshold = calculatePlanDayGridLayout(
      [planEvent("threshold", 600, 20)],
      { ...defaultSettings, pixelsPerMinute: 2 },
    ).blocks[0];

    expect(belowThreshold?.heightPx).toBe(MINIMUM_PLAN_BLOCK_HEIGHT_PX);
    expect(belowThreshold?.showTimeRange).toBe(false);
    expect(atThreshold?.heightPx).toBe(40);
    expect(atThreshold?.showTimeRange).toBe(true);
  });

  it("allows enough bottom space to show a minimum-height boundary block", () => {
    const layout = calculatePlanDayGridLayout(
      [planEvent("ends-at-boundary", 1_255, 5)],
      defaultSettings,
    );

    expect(layout.endHour).toBe(21);
    expect(layout.heightPx).toBe(1_189);
    expect(layout.blocks[0]).toMatchObject({ topPx: 1_169, heightPx: 20 });
  });

  it("positions events normalized at both local-midnight boundaries", () => {
    const layout = calculatePlanDayGridLayout(
      [
        planEvent("from-yesterday", -30, 60),
        planEvent("into-tomorrow", 1_410, 60),
      ],
      defaultSettings,
    );

    expect(layout.startHour).toBe(0);
    expect(layout.endHour).toBe(24);
    expect(layout.blocks.map((block) => ({
      id: block.event.id,
      startMinutes: block.clippedStartMinutes,
      endMinutes: block.clippedEndMinutes,
      durationMinutes: block.durationMinutes,
      topPx: block.topPx,
      heightPx: block.heightPx,
    }))).toEqual([
      {
        id: "from-yesterday",
        startMinutes: 0,
        endMinutes: 30,
        durationMinutes: 30,
        topPx: 0,
        heightPx: 42,
      },
      {
        id: "into-tomorrow",
        startMinutes: 1_410,
        endMinutes: 1_440,
        durationMinutes: 30,
        topPx: 1_974,
        heightPx: 42,
      },
    ]);
  });

  it("assigns deterministic layers within transitive overlap groups", () => {
    const layout = calculatePlanDayGridLayout(
      [
        planEvent("chain-end", 600, 60),
        planEvent("chain-middle", 570, 60),
        planEvent("chain-start", 540, 60),
        planEvent("separate", 780, 60),
      ],
      defaultSettings,
    );

    expect(
      layout.blocks.map(({ event, overlapGroupIndex, overlapLayerIndex }) => ({
        id: event.id,
        overlapGroupIndex,
        overlapLayerIndex,
      })),
    ).toEqual([
      { id: "chain-start", overlapGroupIndex: 0, overlapLayerIndex: 0 },
      { id: "chain-middle", overlapGroupIndex: 0, overlapLayerIndex: 1 },
      { id: "chain-end", overlapGroupIndex: 0, overlapLayerIndex: 0 },
      { id: "separate", overlapGroupIndex: 1, overlapLayerIndex: 0 },
    ]);
  });

  it("orders same-start nested events deterministically and reuses touching layers", () => {
    const layout = calculatePlanDayGridLayout(
      [
        planEvent("shorter", 540, 60),
        planEvent("longer", 540, 120),
        planEvent("touching-shorter", 600, 30),
      ],
      defaultSettings,
    );

    expect(layout.blocks.map(({ event, overlapLayerIndex }) => ({
      id: event.id,
      overlapLayerIndex,
    }))).toEqual([
      { id: "longer", overlapLayerIndex: 0 },
      { id: "shorter", overlapLayerIndex: 1 },
      { id: "touching-shorter", overlapLayerIndex: 1 },
    ]);
  });
});

describe("calculateActualDayGridLayout", () => {
  it("uses the same deterministic overlap groups and reusable layers as Plan", () => {
    const blocks = calculateActualDayGridLayout(
      [
        actualEvent("chain-end", 600, 60),
        actualEvent("chain-middle", 570, 60),
        actualEvent("chain-start", 540, 60),
        actualEvent("separate", 780, 60),
      ],
      7,
      21,
      defaultSettings,
    );

    expect(
      blocks.map(
        ({ actual, overlapGroupIndex, overlapLayerIndex }) => ({
          id: actual.id,
          overlapGroupIndex,
          overlapLayerIndex,
        }),
      ),
    ).toEqual([
      { id: "chain-start", overlapGroupIndex: 0, overlapLayerIndex: 0 },
      { id: "chain-middle", overlapGroupIndex: 0, overlapLayerIndex: 1 },
      { id: "chain-end", overlapGroupIndex: 0, overlapLayerIndex: 0 },
      { id: "separate", overlapGroupIndex: 1, overlapLayerIndex: 0 },
    ]);
  });

  it("clips partial Actuals and omits blocks outside the Plan-derived range", () => {
    const blocks = calculateActualDayGridLayout(
      [
        actualEvent("before", 300, 60),
        actualEvent("early-clipped", 390, 60),
        actualEvent("late-clipped", 1_425, 60),
        actualEvent("after", 1_440, 30),
      ],
      7,
      24,
      defaultSettings,
    );

    expect(
      blocks.map(
        ({
          actual,
          clippedStartMinutes,
          clippedEndMinutes,
          durationMinutes,
          topPx,
          heightPx,
        }) => ({
          id: actual.id,
          clippedStartMinutes,
          clippedEndMinutes,
          durationMinutes,
          topPx,
          heightPx,
        }),
      ),
    ).toEqual([
      {
        id: "early-clipped",
        clippedStartMinutes: 420,
        clippedEndMinutes: 450,
        durationMinutes: 30,
        topPx: 0,
        heightPx: 42,
      },
      {
        id: "late-clipped",
        clippedStartMinutes: 1_425,
        clippedEndMinutes: 1_440,
        durationMinutes: 15,
        topPx: 1_407,
        heightPx: 21,
      },
    ]);
  });
});

describe("calculatePlanNowIndicatorTopPx", () => {
  it("positions local time on the grid scale and excludes other days or hours", () => {
    expect(
      calculatePlanNowIndicatorTopPx(
        new Date(2026, 6, 15, 12, 30),
        date,
        timeZone,
        7,
        21,
        1.4,
      ),
    ).toBe(462);
    expect(
      calculatePlanNowIndicatorTopPx(
        new Date(2026, 6, 15, 6, 59),
        date,
        timeZone,
        7,
        21,
        1.4,
      ),
    ).toBeNull();
    expect(
      calculatePlanNowIndicatorTopPx(
        new Date(2026, 6, 16, 12, 30),
        date,
        timeZone,
        7,
        21,
        1.4,
      ),
    ).toBeNull();
  });
});
