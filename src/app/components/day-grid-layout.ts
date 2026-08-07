import type { DayEvent, PlanEvent } from "../../domain/day-event";
import type { AppSettings } from "../../config/settings";
import { getZonedTime } from "../../shared/zoned-time";

const MINUTES_PER_HOUR = 60;

export const MINIMUM_DAY_GRID_BLOCK_HEIGHT_PX = 20;
export const DAY_GRID_BLOCK_TIME_RANGE_MINIMUM_HEIGHT_PX = 40;
export const DAY_GRID_COLUMN_INSET_PX = 12;
export const DAY_GRID_LAYER_OFFSET_PX = 12;

type DayGridSettings = Pick<
  AppSettings,
  "dayStartHour" | "dayEndHour" | "pixelsPerMinute"
>;

type OverlapPlacement = {
  overlapGroupIndex: number;
  overlapLayerIndex: number;
};

export type DayGridBlock<T extends DayEvent> = {
  event: T;
  clippedStartMinutes: number;
  clippedEndMinutes: number;
  durationMinutes: number;
  topPx: number;
  heightPx: number;
  showTimeRange: boolean;
} & OverlapPlacement;

export type DayGridRange = {
  startHour: number;
  endHour: number;
  heightPx: number;
  hourBoundaries: number[];
};

export function calculateDayGridRange(
  planEvents: PlanEvent[],
  settings: DayGridSettings,
): DayGridRange {
  const visibleEvents = planEvents.flatMap((event) => {
    const eventEndMinutes = event.startMinutes + event.durationMinutes;
    if (eventEndMinutes <= 0 || event.startMinutes >= 24 * MINUTES_PER_HOUR) {
      return [];
    }
    return [{
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
  return {
    startHour,
    endHour,
    heightPx: rangeHeightPx,
    hourBoundaries,
  };
}

export function calculateDayGridBlocks<T extends DayEvent>(
  events: T[],
  startHour: number,
  endHour: number,
  settings: DayGridSettings,
): DayGridBlock<T>[] {
  const rangeStartMinutes = Math.max(0, startHour * MINUTES_PER_HOUR);
  const rangeEndMinutes = Math.min(
    24 * MINUTES_PER_HOUR,
    endHour * MINUTES_PER_HOUR,
  );
  const positionedBlocks = events.flatMap((event) => {
    const eventEndMinutes = event.startMinutes + event.durationMinutes;
    if (
      eventEndMinutes <= rangeStartMinutes ||
      event.startMinutes >= rangeEndMinutes
    ) {
      return [];
    }

    const clippedStartMinutes = Math.max(
      event.startMinutes,
      rangeStartMinutes,
    );
    const clippedEndMinutes = Math.min(
      eventEndMinutes,
      rangeEndMinutes,
    );
    const durationMinutes = clippedEndMinutes - clippedStartMinutes;
    const heightPx = roundPixel(
      Math.max(
        MINIMUM_DAY_GRID_BLOCK_HEIGHT_PX,
        durationMinutes * settings.pixelsPerMinute,
      ),
    );

    return [
      {
        event,
        clippedStartMinutes,
        clippedEndMinutes,
        durationMinutes,
        topPx: roundPixel(
          (clippedStartMinutes - rangeStartMinutes) *
            settings.pixelsPerMinute,
        ),
        heightPx,
        showTimeRange:
          heightPx >= DAY_GRID_BLOCK_TIME_RANGE_MINIMUM_HEIGHT_PX,
      },
    ];
  });

  return assignOverlapLayers(positionedBlocks, (block) => ({
    start: block.clippedStartMinutes,
    end: block.clippedEndMinutes,
  }));
}

export function calculateDayGridNowIndicatorTopPx(
  currentTime: Date,
  date: string,
  timeZone: string,
  startHour: number,
  endHour: number,
  pixelsPerMinute: number,
) {
  const current = getZonedTime(currentTime, timeZone);
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
  getInterval: (block: T) => { start: number; end: number },
): Array<T & OverlapPlacement> {
  const sortedBlocks = blocks
    .map((block, inputIndex) => ({ block, inputIndex }))
    .sort((left, right) => {
      const leftInterval = getInterval(left.block);
      const rightInterval = getInterval(right.block);
      return (
        leftInterval.start - rightInterval.start ||
        rightInterval.end - leftInterval.end ||
        left.inputIndex - right.inputIndex
      );
    })
    .map(({ block }) => block);
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
