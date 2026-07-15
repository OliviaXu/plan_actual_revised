import type {
  CalendarEvent,
  TimedCalendarEvent,
} from "../../calendar/calendar-event";
import type { AppSettings } from "../../domain/settings";

const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_MINUTE = 60_000;

export const MINIMUM_PLAN_BLOCK_HEIGHT_PX = 20;
export const PLAN_BLOCK_TIME_RANGE_MINIMUM_HEIGHT_PX = 40;

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
};

export type PlanDayGridLayout = {
  startHour: number;
  endHour: number;
  heightPx: number;
  hourBoundaries: number[];
  blocks: PlanDayGridBlock[];
};

export function calculatePlanDayGridLayout(
  events: CalendarEvent[],
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
    if (event.kind !== "timed") {
      return [];
    }

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
  const blocks = clippedEvents.map(
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
