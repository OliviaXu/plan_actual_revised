import { describe, expect, it } from "vitest";

import type { TimedCalendarEvent } from "../../src/calendar/calendar-event";
import type { ActualBlock } from "../../src/domain/day-record";
import { defaultSettings } from "../../src/domain/settings";
import {
  calculateActualDayGridLayout,
  calculatePlanDayGridLayout,
  calculatePlanNowIndicatorTopPx,
  MINIMUM_PLAN_BLOCK_HEIGHT_PX,
} from "../../src/app/components/plan-day-grid-layout";

const date = "2026-07-15";
const timeZone = "America/Los_Angeles";

function timedEvent(
  id: string,
  start: string,
  end: string,
): TimedCalendarEvent {
  return {
    kind: "timed",
    id,
    summary: id,
    colorId: null,
    start,
    end,
    timeZone: "America/Los_Angeles",
  };
}

function actualBlock(
  id: string,
  startMinutes: number,
  durationMinutes: number,
): ActualBlock {
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
  it("positions events in the Calendar timezone instead of the browser timezone", () => {
    const layout = calculatePlanDayGridLayout(
      [
        timedEvent(
          "tokyo-morning",
          "2026-07-15T01:00:00.000Z",
          "2026-07-15T02:00:00.000Z",
        ),
      ],
      "2026-07-15",
      "Asia/Tokyo",
      defaultSettings,
    );

    expect(layout.blocks[0]).toMatchObject({
      durationMinutes: 60,
      topPx: 252,
    });
  });

  it("uses the configured range and exact time geometry by default", () => {
    const layout = calculatePlanDayGridLayout(
      [
        timedEvent(
          "design-review",
          "2026-07-15T09:00:00-07:00",
          "2026-07-15T10:00:00-07:00",
        ),
      ],
      date,
      timeZone,
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
        timedEvent(
          "early",
          "2026-07-15T06:30:00-07:00",
          "2026-07-15T07:00:00-07:00",
        ),
        timedEvent(
          "late",
          "2026-07-15T21:15:00-07:00",
          "2026-07-15T21:30:00-07:00",
        ),
      ],
      date,
      timeZone,
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
      [
        timedEvent(
          "ends-at-nine",
          "2026-07-15T20:30:00-07:00",
          "2026-07-15T21:00:00-07:00",
        ),
      ],
      date,
      timeZone,
      defaultSettings,
    );

    expect(layout.endHour).toBe(21);
  });

  it("positions event starts at minute precision", () => {
    const layout = calculatePlanDayGridLayout(
      [
        timedEvent(
          "sub-minute-start",
          "2026-07-15T09:00:30-07:00",
          "2026-07-15T10:00:30-07:00",
        ),
      ],
      date,
      timeZone,
      defaultSettings,
    );

    expect(layout.blocks[0]).toMatchObject({ topPx: 168 });
  });

  it("applies the named minimum height and the time-range threshold", () => {
    const belowThreshold = calculatePlanDayGridLayout(
      [
        timedEvent(
          "short",
          "2026-07-15T10:00:00-07:00",
          "2026-07-15T10:05:00-07:00",
        ),
      ],
      date,
      timeZone,
      defaultSettings,
    ).blocks[0];
    const atThreshold = calculatePlanDayGridLayout(
      [
        timedEvent(
          "threshold",
          "2026-07-15T10:00:00-07:00",
          "2026-07-15T10:20:00-07:00",
        ),
      ],
      date,
      timeZone,
      { ...defaultSettings, pixelsPerMinute: 2 },
    ).blocks[0];

    expect(belowThreshold?.heightPx).toBe(MINIMUM_PLAN_BLOCK_HEIGHT_PX);
    expect(belowThreshold?.showTimeRange).toBe(false);
    expect(atThreshold?.heightPx).toBe(40);
    expect(atThreshold?.showTimeRange).toBe(true);
  });

  it("allows enough bottom space to show a minimum-height boundary block", () => {
    const layout = calculatePlanDayGridLayout(
      [
        timedEvent(
          "ends-at-boundary",
          "2026-07-15T20:55:00-07:00",
          "2026-07-15T21:00:00-07:00",
        ),
      ],
      date,
      timeZone,
      defaultSettings,
    );

    expect(layout.endHour).toBe(21);
    expect(layout.heightPx).toBe(1_189);
    expect(layout.blocks[0]).toMatchObject({ topPx: 1_169, heightPx: 20 });
  });

  it("discards malformed, non-positive, and out-of-day events", () => {
    const layout = calculatePlanDayGridLayout(
      [
        timedEvent("malformed", "not-a-date", "still-not-a-date"),
        timedEvent(
          "zero",
          "2026-07-15T09:00:00-07:00",
          "2026-07-15T09:00:00-07:00",
        ),
        timedEvent(
          "negative",
          "2026-07-15T10:00:00-07:00",
          "2026-07-15T09:00:00-07:00",
        ),
        timedEvent(
          "yesterday",
          "2026-07-14T09:00:00-07:00",
          "2026-07-14T10:00:00-07:00",
        ),
      ],
      date,
      timeZone,
      defaultSettings,
    );

    expect(layout.blocks).toEqual([]);
    expect(layout.startHour).toBe(7);
    expect(layout.endHour).toBe(21);
  });

  it("clips events at both local-midnight boundaries", () => {
    const layout = calculatePlanDayGridLayout(
      [
        timedEvent(
          "from-yesterday",
          "2026-07-14T23:30:00-07:00",
          "2026-07-15T00:30:00-07:00",
        ),
        timedEvent(
          "into-tomorrow",
          "2026-07-15T23:30:00-07:00",
          "2026-07-16T00:30:00-07:00",
        ),
      ],
      date,
      timeZone,
      defaultSettings,
    );

    expect(layout.startHour).toBe(0);
    expect(layout.endHour).toBe(24);
    expect(layout.blocks.map((block) => ({
      id: block.event.id,
      start: block.clippedStart.toISOString(),
      end: block.clippedEnd.toISOString(),
      durationMinutes: block.durationMinutes,
      topPx: block.topPx,
      heightPx: block.heightPx,
    }))).toEqual([
      {
        id: "from-yesterday",
        start: "2026-07-15T07:00:00.000Z",
        end: "2026-07-15T07:30:00.000Z",
        durationMinutes: 30,
        topPx: 0,
        heightPx: 42,
      },
      {
        id: "into-tomorrow",
        start: "2026-07-16T06:30:00.000Z",
        end: "2026-07-16T07:00:00.000Z",
        durationMinutes: 30,
        topPx: 1_974,
        heightPx: 42,
      },
    ]);
  });

  it("assigns deterministic layers within transitive overlap groups", () => {
    const layout = calculatePlanDayGridLayout(
      [
        timedEvent(
          "chain-end",
          "2026-07-15T10:00:00-07:00",
          "2026-07-15T11:00:00-07:00",
        ),
        timedEvent(
          "chain-middle",
          "2026-07-15T09:30:00-07:00",
          "2026-07-15T10:30:00-07:00",
        ),
        timedEvent(
          "chain-start",
          "2026-07-15T09:00:00-07:00",
          "2026-07-15T10:00:00-07:00",
        ),
        timedEvent(
          "separate",
          "2026-07-15T13:00:00-07:00",
          "2026-07-15T14:00:00-07:00",
        ),
      ],
      date,
      timeZone,
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
        timedEvent(
          "shorter",
          "2026-07-15T09:00:00-07:00",
          "2026-07-15T10:00:00-07:00",
        ),
        timedEvent(
          "longer",
          "2026-07-15T09:00:00-07:00",
          "2026-07-15T11:00:00-07:00",
        ),
        timedEvent(
          "touching-shorter",
          "2026-07-15T10:00:00-07:00",
          "2026-07-15T10:30:00-07:00",
        ),
      ],
      date,
      timeZone,
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
        actualBlock("chain-end", 600, 60),
        actualBlock("chain-middle", 570, 60),
        actualBlock("chain-start", 540, 60),
        actualBlock("separate", 780, 60),
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
        actualBlock("before", 300, 60),
        actualBlock("early-clipped", 390, 60),
        actualBlock("late-clipped", 1_425, 60),
        actualBlock("after", 1_440, 30),
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
