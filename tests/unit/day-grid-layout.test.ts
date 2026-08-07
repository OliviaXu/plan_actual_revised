import { describe, expect, it } from "vitest";

import type { ActualEvent, PlanEvent } from "../../src/domain/day-event";
import { defaultSettings } from "../../src/config/settings";
import {
  calculateDayGridBlocks,
  calculateDayGridNowIndicatorTopPx,
  calculateDayGridRange,
  MINIMUM_DAY_GRID_BLOCK_HEIGHT_PX,
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

describe("calculateDayGridRange", () => {
  it("uses the configured range and exact time geometry by default", () => {
    const range = calculateDayGridRange(
      [planEvent("design-review", 540, 60)],
      defaultSettings,
    );

    expect(range.startHour).toBe(7);
    expect(range.endHour).toBe(21);
    expect(range.heightPx).toBe(1_176);
    expect(range.hourBoundaries).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    ]);
  });

  it("expands and rounds the range to whole-hour boundaries", () => {
    const range = calculateDayGridRange(
      [
        planEvent("early", 390, 30),
        planEvent("late", 1_275, 15),
      ],
      defaultSettings,
    );

    expect(range.startHour).toBe(6);
    expect(range.endHour).toBe(22);
    expect(range.heightPx).toBe(1_344);
  });

  it("does not expand an event ending exactly at the configured end hour", () => {
    const range = calculateDayGridRange(
      [planEvent("ends-at-nine", 1_230, 30)],
      defaultSettings,
    );

    expect(range.endHour).toBe(21);
  });

  it("keeps its exact range height when a minimum-height block would overflow", () => {
    const range = calculateDayGridRange(
      [planEvent("ends-at-boundary", 1_255, 5)],
      defaultSettings,
    );

    expect(range.endHour).toBe(21);
    expect(range.heightPx).toBe(1_176);
  });

  it("derives the complete-day range from crossing-midnight Plan events", () => {
    const range = calculateDayGridRange(
      [
        planEvent("from-yesterday", -30, 60),
        planEvent("into-tomorrow", 1_410, 60),
      ],
      defaultSettings,
    );

    expect(range.startHour).toBe(0);
    expect(range.endHour).toBe(24);
  });
});

describe("calculateDayGridBlocks", () => {
  it("positions Plan events using a separately calculated range", () => {
    const blocks = calculateDayGridBlocks(
      [planEvent("design-review", 540, 60)],
      7,
      21,
      defaultSettings,
    );

    expect(blocks[0]).toMatchObject({
      durationMinutes: 60,
      topPx: 168,
      heightPx: 84,
      showTimeRange: true,
    });
  });

  it("applies the named minimum height and the time-range threshold", () => {
    const belowThreshold = calculateDayGridBlocks(
      [planEvent("short", 600, 5)],
      7,
      21,
      defaultSettings,
    )[0];
    const atThreshold = calculateDayGridBlocks(
      [planEvent("threshold", 600, 20)],
      7,
      21,
      { ...defaultSettings, pixelsPerMinute: 2 },
    )[0];

    expect(belowThreshold?.heightPx).toBe(MINIMUM_DAY_GRID_BLOCK_HEIGHT_PX);
    expect(belowThreshold?.showTimeRange).toBe(false);
    expect(atThreshold?.heightPx).toBe(40);
    expect(atThreshold?.showTimeRange).toBe(true);
  });

  it("clips crossing-midnight Plan events to the supplied range", () => {
    const blocks = calculateDayGridBlocks(
      [
        planEvent("from-yesterday", -30, 60),
        planEvent("into-tomorrow", 1_410, 60),
      ],
      0,
      24,
      defaultSettings,
    );

    expect(blocks.map((block) => ({
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
    const blocks = calculateDayGridBlocks(
      [
        planEvent("chain-end", 600, 60),
        planEvent("chain-middle", 570, 60),
        planEvent("chain-start", 540, 60),
        planEvent("separate", 780, 60),
      ],
      7,
      21,
      defaultSettings,
    );

    expect(
      blocks.map(({ event, overlapGroupIndex, overlapLayerIndex }) => ({
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
    const blocks = calculateDayGridBlocks(
      [
        planEvent("shorter", 540, 60),
        planEvent("longer", 540, 120),
        planEvent("touching-shorter", 600, 30),
      ],
      7,
      21,
      defaultSettings,
    );

    expect(blocks.map(({ event, overlapLayerIndex }) => ({
      id: event.id,
      overlapLayerIndex,
    }))).toEqual([
      { id: "longer", overlapLayerIndex: 0 },
      { id: "shorter", overlapLayerIndex: 1 },
      { id: "touching-shorter", overlapLayerIndex: 1 },
    ]);
  });

  it("keeps insertion order for exact timing ties so newer Actuals layer above", () => {
    const blocks = calculateDayGridBlocks(
      [
        actualEvent("z-older", 720, 30),
        actualEvent("a-newer", 720, 30),
      ],
      7,
      21,
      defaultSettings,
    );

    expect(blocks.map(({ event, overlapLayerIndex }) => ({
      id: event.id,
      overlapLayerIndex,
    }))).toEqual([
      { id: "z-older", overlapLayerIndex: 0 },
      { id: "a-newer", overlapLayerIndex: 1 },
    ]);
  });

  it("uses the same geometry for Plan and Actual events", () => {
    const planBlock = calculateDayGridBlocks(
      [planEvent("plan", 540, 60)],
      7,
      21,
      defaultSettings,
    )[0];
    const actualBlock = calculateDayGridBlocks(
      [actualEvent("actual", 540, 60)],
      7,
      21,
      defaultSettings,
    )[0];

    expect({ ...actualBlock, event: undefined }).toEqual({
      ...planBlock,
      event: undefined,
    });
  });

  it("uses the same deterministic overlap groups and reusable layers as Plan", () => {
    const blocks = calculateDayGridBlocks(
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
        ({ event, overlapGroupIndex, overlapLayerIndex }) => ({
          id: event.id,
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
    const blocks = calculateDayGridBlocks(
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
          event,
          clippedStartMinutes,
          clippedEndMinutes,
          durationMinutes,
          topPx,
          heightPx,
        }) => ({
          id: event.id,
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

describe("calculateDayGridNowIndicatorTopPx", () => {
  it("positions local time on the grid scale and excludes other days or hours", () => {
    expect(
      calculateDayGridNowIndicatorTopPx(
        new Date(2026, 6, 15, 12, 30),
        date,
        timeZone,
        7,
        21,
        1.4,
      ),
    ).toBe(462);
    expect(
      calculateDayGridNowIndicatorTopPx(
        new Date(2026, 6, 15, 6, 59),
        date,
        timeZone,
        7,
        21,
        1.4,
      ),
    ).toBeNull();
    expect(
      calculateDayGridNowIndicatorTopPx(
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
