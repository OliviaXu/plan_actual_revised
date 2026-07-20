import type { ActualEvent, PlanEvent } from "../../domain/day-event";
import type { AppSettings } from "../../domain/settings";
import { getCalendarTime } from "../../calendar/calendar-time";

const MINUTES_PER_HOUR = 60;

export const MINIMUM_PLAN_BLOCK_HEIGHT_PX = 20;
export const PLAN_BLOCK_TIME_RANGE_MINIMUM_HEIGHT_PX = 40;
export const PLAN_EVENT_COLUMN_INSET_PX = 12;
export const PLAN_EVENT_LAYER_OFFSET_PX = 12;

type PlanGridSettings = Pick<
  AppSettings,
  "dayStartHour" | "dayEndHour" | "pixelsPerMinute"
>;

export type PlanDayGridBlock = {
  event: PlanEvent;
  clippedStartMinutes: number;
  clippedEndMinutes: number;
  durationMinutes: number;
  topPx: number;
  heightPx: number;
  showTimeRange: boolean;
  overlapGroupIndex: number;
  overlapLayerIndex: number;
};

export type PlanDayGridLayout = {
  startHour: number;
  endHour: number;
  heightPx: number;
  hourBoundaries: number[];
  blocks: PlanDayGridBlock[];
};

export type ActualDayGridBlock = {
  actual: ActualEvent;
  clippedStartMinutes: number;
  clippedEndMinutes: number;
  durationMinutes: number;
  topPx: number;
  heightPx: number;
  showTimeRange: boolean;
  overlapGroupIndex: number;
  overlapLayerIndex: number;
};

export function calculatePlanDayGridLayout(
  events: PlanEvent[],
  settings: PlanGridSettings,
): PlanDayGridLayout {
  const visibleEvents = events.flatMap((event) => {
    const eventEndMinutes = event.startMinutes + event.durationMinutes;
    if (eventEndMinutes <= 0 || event.startMinutes >= 24 * MINUTES_PER_HOUR) {
      return [];
    }
    return [{
      event,
      clippedStartMinutes: Math.max(0, event.startMinutes),
      clippedEndMinutes: Math.min(
        24 * MINUTES_PER_HOUR,
        eventEndMinutes,
      ),
    }];
  });
  const startHour = Math.min(
    settings.dayStartHour,
    ...visibleEvents.map(({ clippedStartMinutes }) =>
      Math.floor(clippedStartMinutes / MINUTES_PER_HOUR),
    ),
  );
  const endHour = Math.max(
    settings.dayEndHour,
    ...visibleEvents.map(({ clippedEndMinutes }) =>
      Math.ceil(clippedEndMinutes / MINUTES_PER_HOUR),
    ),
  );
  const rangeHeightPx = roundPixel(
    (endHour - startHour) *
      MINUTES_PER_HOUR *
      settings.pixelsPerMinute,
  );
  const hourBoundaries = Array.from(
    { length: endHour - startHour + 1 },
    (_, index) => startHour + index,
  );
  const positionedBlocks = visibleEvents.map(
    ({ event, clippedStartMinutes, clippedEndMinutes }) => {
      const durationMinutes = clippedEndMinutes - clippedStartMinutes;
      const heightPx = roundPixel(
        Math.max(
          MINIMUM_PLAN_BLOCK_HEIGHT_PX,
          durationMinutes * settings.pixelsPerMinute,
        ),
      );

      return {
        event,
        clippedStartMinutes,
        clippedEndMinutes,
        durationMinutes,
        topPx: roundPixel(
          (clippedStartMinutes - startHour * MINUTES_PER_HOUR) *
            settings.pixelsPerMinute,
        ),
        heightPx,
        showTimeRange:
          heightPx >= PLAN_BLOCK_TIME_RANGE_MINIMUM_HEIGHT_PX,
      };
    },
  );
  const blocks = assignOverlapLayers(positionedBlocks, (block) => ({
    id: block.event.id,
    start: block.clippedStartMinutes,
    end: block.clippedEndMinutes,
  }));
  const heightPx = Math.max(
    rangeHeightPx,
    ...blocks.map(({ topPx, heightPx }) => topPx + heightPx),
  );

  return {
    startHour,
    endHour,
    heightPx,
    hourBoundaries,
    blocks,
  };
}

export function calculateActualDayGridLayout(
  actuals: ActualEvent[],
  startHour: number,
  endHour: number,
  settings: PlanGridSettings,
): ActualDayGridBlock[] {
  const rangeStartMinutes = Math.max(0, startHour * MINUTES_PER_HOUR);
  const rangeEndMinutes = Math.min(
    24 * MINUTES_PER_HOUR,
    endHour * MINUTES_PER_HOUR,
  );
  const positionedBlocks = actuals.flatMap((actual) => {
    const actualEndMinutes = actual.startMinutes + actual.durationMinutes;
    if (
      actualEndMinutes <= rangeStartMinutes ||
      actual.startMinutes >= rangeEndMinutes
    ) {
      return [];
    }

    const clippedStartMinutes = Math.max(
      actual.startMinutes,
      rangeStartMinutes,
    );
    const clippedEndMinutes = Math.min(
      actualEndMinutes,
      rangeEndMinutes,
    );
    const durationMinutes = clippedEndMinutes - clippedStartMinutes;
    const heightPx = roundPixel(
      Math.max(
        MINIMUM_PLAN_BLOCK_HEIGHT_PX,
        durationMinutes * settings.pixelsPerMinute,
      ),
    );

    return [
      {
        actual,
        clippedStartMinutes,
        clippedEndMinutes,
        durationMinutes,
        topPx: roundPixel(
          (clippedStartMinutes - rangeStartMinutes) *
            settings.pixelsPerMinute,
        ),
        heightPx,
        showTimeRange:
          heightPx >= PLAN_BLOCK_TIME_RANGE_MINIMUM_HEIGHT_PX,
      },
    ];
  });

  return assignOverlapLayers(positionedBlocks, (block) => ({
    id: block.actual.id,
    start: block.clippedStartMinutes,
    end: block.clippedEndMinutes,
  }));
}

export function calculatePlanNowIndicatorTopPx(
  currentTime: Date,
  date: string,
  timeZone: string,
  startHour: number,
  endHour: number,
  pixelsPerMinute: number,
) {
  const current = getCalendarTime(currentTime, timeZone);
  if (current.date !== date) return null;

  const currentMinuteOfDay = current.minutesSinceMidnight;
  if (
    currentMinuteOfDay < startHour * MINUTES_PER_HOUR ||
    currentMinuteOfDay > endHour * MINUTES_PER_HOUR
  ) {
    return null;
  }

  return roundPixel(
    (currentMinuteOfDay - startHour * MINUTES_PER_HOUR) * pixelsPerMinute,
  );
}

function assignOverlapLayers<T>(
  blocks: T[],
  getInterval: (block: T) => { id: string; start: number; end: number },
): Array<T & Pick<PlanDayGridBlock, "overlapGroupIndex" | "overlapLayerIndex">> {
  const sortedBlocks = [...blocks].sort(
    (left, right) => {
      const leftInterval = getInterval(left);
      const rightInterval = getInterval(right);
      return (
        leftInterval.start - rightInterval.start ||
        rightInterval.end - leftInterval.end ||
        leftInterval.id.localeCompare(rightInterval.id)
      );
    },
  );
  let overlapGroupIndex = -1;
  let overlapGroupEnd = Number.NEGATIVE_INFINITY;
  let layerOccupiedUntil: number[] = [];

  return sortedBlocks.map((block) => {
    const { start, end } = getInterval(block);

    if (start >= overlapGroupEnd) {
      overlapGroupIndex += 1;
      overlapGroupEnd = end;
      layerOccupiedUntil = [];
    } else {
      overlapGroupEnd = Math.max(overlapGroupEnd, end);
    }

    // A 9–10, B 9:30–10:30, C 10–11: C reuses A's layer.
    // D 10–11 then overlaps B and C, so it adds a third layer.
    const availableLayerIndex = layerOccupiedUntil.findIndex(
      (occupiedUntil) => occupiedUntil <= start,
    );
    const overlapLayerIndex =
      availableLayerIndex === -1
        ? layerOccupiedUntil.length
        : availableLayerIndex;
    layerOccupiedUntil[overlapLayerIndex] = end;

    return { ...block, overlapGroupIndex, overlapLayerIndex };
  });
}

function roundPixel(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
