import type {
  TimedCalendarEvent,
} from "../../calendar/calendar-event";
import type { AppSettings } from "../../domain/settings";

const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_MINUTE = 60_000;

export const MINIMUM_PLAN_BLOCK_HEIGHT_PX = 20;
export const PLAN_BLOCK_TIME_RANGE_MINIMUM_HEIGHT_PX = 40;
export const PLAN_EVENT_COLUMN_INSET_PX = 12;
export const PLAN_EVENT_LAYER_OFFSET_PX = 12;

type PlanGridSettings = Pick<
  AppSettings,
  "dayStartHour" | "dayEndHour" | "pixelsPerMinute"
>;

export type PlanDayGridBlock = {
  event: TimedCalendarEvent;
  clippedStart: Date;
  clippedEnd: Date;
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

export function calculatePlanDayGridLayout(
  events: TimedCalendarEvent[],
  today: Date,
  settings: PlanGridSettings,
): PlanDayGridLayout {
  const dayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const dayEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
  );

  const clippedEvents = events.flatMap((event) => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    if (
      !Number.isFinite(eventStart.getTime()) ||
      !Number.isFinite(eventEnd.getTime()) ||
      eventEnd <= eventStart ||
      eventEnd <= dayStart ||
      eventStart >= dayEnd
    ) {
      return [];
    }

    const clippedStart = eventStart < dayStart ? dayStart : eventStart;
    const clippedEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
    const clippedStartMinuteOfDay = minuteOfDay(clippedStart, dayEnd);
    const clippedEndMinuteOfDay = minuteOfDay(clippedEnd, dayEnd);

    return [
      {
        event,
        clippedStart,
        clippedEnd,
        clippedStartMinuteOfDay,
        clippedEndMinuteOfDay,
      },
    ];
  });

  const startHour = Math.min(
    settings.dayStartHour,
    ...clippedEvents.map(({ clippedStartMinuteOfDay }) =>
      Math.floor(clippedStartMinuteOfDay / MINUTES_PER_HOUR),
    ),
  );
  const endHour = Math.max(
    settings.dayEndHour,
    ...clippedEvents.map(({ clippedEndMinuteOfDay }) =>
      Math.ceil(clippedEndMinuteOfDay / MINUTES_PER_HOUR),
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
  const positionedBlocks = clippedEvents.map(
    ({ event, clippedStart, clippedEnd, clippedStartMinuteOfDay }) => {
      const durationMinutes =
        (clippedEnd.getTime() - clippedStart.getTime()) /
        MILLISECONDS_PER_MINUTE;
      const heightPx = roundPixel(
        Math.max(
          MINIMUM_PLAN_BLOCK_HEIGHT_PX,
          durationMinutes * settings.pixelsPerMinute,
        ),
      );

      return {
        event,
        clippedStart,
        clippedEnd,
        durationMinutes,
        topPx: roundPixel(
          (clippedStartMinuteOfDay - startHour * MINUTES_PER_HOUR) *
            settings.pixelsPerMinute,
        ),
        heightPx,
        showTimeRange:
          heightPx >= PLAN_BLOCK_TIME_RANGE_MINIMUM_HEIGHT_PX,
      };
    },
  );
  const blocks = assignOverlapLayers(positionedBlocks);
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

function assignOverlapLayers(
  blocks: Omit<PlanDayGridBlock, "overlapGroupIndex" | "overlapLayerIndex">[],
): PlanDayGridBlock[] {
  const sortedBlocks = [...blocks].sort(
    (left, right) =>
      left.clippedStart.getTime() - right.clippedStart.getTime() ||
      right.clippedEnd.getTime() - left.clippedEnd.getTime() ||
      left.event.id.localeCompare(right.event.id),
  );
  let overlapGroupIndex = -1;
  let overlapGroupEnd = Number.NEGATIVE_INFINITY;
  let layerOccupiedUntil: number[] = [];

  return sortedBlocks.map((block) => {
    const start = block.clippedStart.getTime();
    const end = block.clippedEnd.getTime();

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

function minuteOfDay(date: Date, dayEnd: Date) {
  if (date.getTime() === dayEnd.getTime()) {
    return 24 * MINUTES_PER_HOUR;
  }

  return (
    date.getHours() * MINUTES_PER_HOUR +
    date.getMinutes() +
    date.getSeconds() / 60 +
    date.getMilliseconds() / MILLISECONDS_PER_MINUTE
  );
}
