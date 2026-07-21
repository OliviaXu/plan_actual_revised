import { resolveGoogleCalendarEventColor } from "../../calendar/google-calendar-colors";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  calculateDayGridBlocks,
  calculateDayGridNowIndicatorTopPx,
  calculateDayGridRange,
  DAY_GRID_COLUMN_INSET_PX,
  DAY_GRID_LAYER_OFFSET_PX,
  type DayGridBlock,
} from "./day-grid-layout";
import { defaultSettings } from "../../domain/settings";
import type {
  ActualEvent,
  DayEvent,
  PlanEvent,
} from "../../domain/day-event";
import { getCalendarTime } from "../../calendar/calendar-time";

const DAY_TIME_AXIS_WIDTH = "4.5rem";
const DAY_GRID_TEMPLATE_COLUMNS = `${DAY_TIME_AXIS_WIDTH} minmax(0, 1fr) minmax(0, 1fr)`;
const readSystemTime = () => new Date();

type DayGridStatus =
  | "loading"
  | "connecting"
  | "connected"
  | "error";

export function DayGrid({
  actuals,
  canAddActual,
  planEvents,
  now = readSystemTime,
  onAddActual,
  onEditActual,
  status,
  date,
  timeZone,
}: {
  actuals?: ActualEvent[];
  canAddActual?: boolean;
  planEvents: PlanEvent[];
  now?: () => Date;
  onAddActual?: () => void;
  onEditActual?: (actualId: string) => void;
  status: DayGridStatus;
  date: string;
  timeZone: string;
}) {
  const [frontPlanId, setFrontPlanId] = useState<string | null>(null);
  const [frontActualId, setFrontActualId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(now);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const gridHeaderRef = useRef<HTMLDivElement>(null);
  const didAutoScrollRef = useRef(false);
  const gridRange = calculateDayGridRange(
    planEvents,
    defaultSettings,
  );
  const planBlocks = calculateDayGridBlocks(
    planEvents,
    gridRange.startHour,
    gridRange.endHour,
    defaultSettings,
  );
  const actualBlocks = calculateDayGridBlocks(
    actuals ?? [],
    gridRange.startHour,
    gridRange.endHour,
    defaultSettings,
  );
  const hourHeightPx = 60 * defaultSettings.pixelsPerMinute;
  const nowIndicatorTopPx = calculateDayGridNowIndicatorTopPx(
    currentTime,
    date,
    timeZone,
    gridRange.startHour,
    gridRange.endHour,
    defaultSettings.pixelsPerMinute,
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, [now]);

  useLayoutEffect(() => {
    const viewport = scrollViewportRef.current;
    const header = gridHeaderRef.current;
    if (
      status !== "connected" ||
      didAutoScrollRef.current ||
      nowIndicatorTopPx === null ||
      viewport === null ||
      header === null ||
      viewport.clientHeight === 0
    ) {
      return;
    }

    viewport.scrollTop = Math.max(
      0,
      header.offsetHeight + nowIndicatorTopPx - viewport.clientHeight * 0.3,
    );
    didAutoScrollRef.current = true;
  }, [nowIndicatorTopPx, status]);

  return (
    <section
      className="overflow-hidden rounded-md border border-border bg-white shadow-soft"
      aria-label="Day grid"
    >
      <div
        className="relative h-[calc(100vh-10rem)] min-h-80 overflow-y-auto [scrollbar-gutter:stable]"
        data-testid="plan-scroll-viewport"
        ref={scrollViewportRef}
      >
        <div
          className="sticky top-0 z-20 grid border-b border-border bg-muted"
          data-testid="day-grid-header"
          ref={gridHeaderRef}
          style={{ gridTemplateColumns: DAY_GRID_TEMPLATE_COLUMNS }}
        >
          <div
            className="border-r border-border px-3 py-2 text-xs font-medium uppercase text-muted-foreground"
            data-testid="day-grid-header-axis"
          >
            Time
          </div>
          <h2 className="px-4 py-2 text-sm font-semibold">Plan</h2>
          <div className="flex items-center justify-between border-l border-border px-4 py-2">
            <h2 className="text-sm font-semibold">Actual</h2>
            <button
              className="rounded-sm border border-border bg-white px-2 py-0.5 text-xs font-medium disabled:opacity-50"
              disabled={!canAddActual}
              onClick={onAddActual}
              type="button"
            >
              Add Actual
            </button>
          </div>
        </div>
        <div
          className="relative"
          data-end-hour={gridRange.endHour}
          data-start-hour={gridRange.startHour}
          data-testid="day-grid-body"
          style={{ height: gridRange.heightPx }}
        >
          {nowIndicatorTopPx !== null ? (
            <div
              className="pointer-events-none absolute right-0 border-t border-now"
              data-testid="plan-now-indicator"
              style={{
                left: DAY_TIME_AXIS_WIDTH,
                top: nowIndicatorTopPx,
                zIndex: Math.max(planBlocks.length, actualBlocks.length) + 1,
              }}
            >
              <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-now" />
              <span className="absolute right-2 top-0 -translate-y-full bg-white px-1 text-xs font-medium text-now">
                {formatTime(currentTime, timeZone)}
              </span>
            </div>
          ) : null}
          <div
            className="grid h-full"
            style={{ gridTemplateColumns: DAY_GRID_TEMPLATE_COLUMNS }}
          >
            <div
              className="relative border-r border-border"
              data-testid="day-grid-axis"
            >
              {gridRange.hourBoundaries.map((hour) => {
                const labelPosition =
                  hour === gridRange.startHour
                    ? ""
                    : hour === gridRange.endHour
                      ? "-translate-y-full"
                      : "-translate-y-1/2";

                return (
                  <div
                    className="pointer-events-none absolute inset-x-0"
                    data-testid={`plan-hour-marker-${hour}`}
                    key={hour}
                    style={{
                      top: (hour - gridRange.startHour) * hourHeightPx,
                    }}
                  >
                    <span
                      className={`absolute right-0 top-0 w-2 border-t border-border ${
                        hour === gridRange.endHour ? "-translate-y-px" : ""
                      }`}
                      data-testid="plan-hour-tick"
                    />
                    <span
                      className={`absolute right-3 text-xs text-muted-foreground ${labelPosition}`}
                    >
                      {formatHour(hour)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div
              className="relative overflow-hidden"
              data-testid="plan-column"
            >
              {status === "loading" ? (
                <p className="absolute inset-x-4 top-6 text-sm text-muted-foreground">
                  Loading today&apos;s plan
                </p>
              ) : null}
              {status === "connecting" ? (
                <p className="absolute inset-x-4 top-6 text-sm text-muted-foreground">
                  Connecting Google Calendar
                </p>
              ) : null}
              {status === "error" ? (
                <p
                  className="absolute inset-x-4 top-6 text-sm text-muted-foreground"
                  data-testid="plan-unavailable"
                >
                  Unable to load today&apos;s plan
                </p>
              ) : null}
              {status === "connected" && planBlocks.length === 0 ? (
                <p
                  className="absolute inset-x-4 top-6 text-sm text-muted-foreground"
                  data-testid="plan-empty"
                >
                  No timed events today
                </p>
              ) : null}
              {planBlocks.map((block) => (
                <PlanGridBlock
                  block={block}
                  frontZIndex={planBlocks.length}
                  isFront={frontPlanId === block.event.id}
                  key={block.event.id}
                  onBringToFront={() => setFrontPlanId(block.event.id)}
                />
              ))}
            </div>
            <div
              className="relative overflow-hidden border-l border-border"
              data-testid="actual-column"
            >
              {actualBlocks.map((block) => (
                <ActualGridBlock
                  block={block}
                  frontZIndex={actualBlocks.length}
                  isFront={frontActualId === block.event.id}
                  key={block.event.id}
                  onSelect={() => {
                    setFrontActualId(block.event.id);
                    onEditActual?.(block.event.id);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActualGridBlock({
  block,
  frontZIndex,
  isFront,
  onSelect,
}: {
  block: DayGridBlock<ActualEvent>;
  frontZIndex: number;
  isFront: boolean;
  onSelect: () => void;
}) {
  const appearance = getDayGridBlockAppearance(
    block,
    isFront,
    frontZIndex,
  );

  return (
    <button
      className={appearance.className}
      data-actual-id={block.event.id}
      data-overlap-group-index={block.overlapGroupIndex}
      data-overlap-layer-index={block.overlapLayerIndex}
      data-testid="actual-block"
      onClick={onSelect}
      style={appearance.style}
      type="button"
    >
      <DayGridBlockContent
        block={block}
        timeRangeTestId="actual-event-time-range"
      />
    </button>
  );
}

function formatMinuteOfDay(minutesSinceMidnight: number) {
  const hour = Math.floor(minutesSinceMidnight / 60) % 24;
  const minute = minutesSinceMidnight % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatHour(hour: number) {
  const normalizedHour = hour % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const clockHour = normalizedHour % 12 || 12;
  return `${clockHour} ${suffix}`;
}

function PlanGridBlock({
  block,
  frontZIndex,
  isFront,
  onBringToFront,
}: {
  block: DayGridBlock<PlanEvent>;
  frontZIndex: number;
  isFront: boolean;
  onBringToFront: () => void;
}) {
  const appearance = getDayGridBlockAppearance(
    block,
    isFront,
    frontZIndex,
  );

  return (
    <button
      className={appearance.className}
      data-calendar-event-id={block.event.id}
      data-overlap-group-index={block.overlapGroupIndex}
      data-overlap-layer-index={block.overlapLayerIndex}
      data-testid={`plan-event-${block.event.id}`}
      onClick={onBringToFront}
      style={appearance.style}
      type="button"
    >
      <DayGridBlockContent
        block={block}
        timeRangeTestId="plan-event-time-range"
        titleTestId="plan-event-title"
      />
    </button>
  );
}

function DayGridBlockContent({
  block,
  timeRangeTestId,
  titleTestId,
}: {
  block: DayGridBlock<DayEvent>;
  timeRangeTestId: string;
  titleTestId?: string;
}) {
  return (
    <>
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span
          className="min-w-0 truncate font-medium"
          data-testid={titleTestId}
        >
          {block.event.summary || "Untitled event"}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {formatDuration(block.durationMinutes)}
        </span>
      </span>
      {block.showTimeRange ? (
        <span
          className="block truncate text-muted-foreground"
          data-testid={timeRangeTestId}
        >
          {formatMinuteOfDay(block.clippedStartMinutes)} –{" "}
          {formatMinuteOfDay(block.clippedEndMinutes)}
        </span>
      ) : null}
    </>
  );
}

function getDayGridBlockAppearance(
  block: DayGridBlock<DayEvent>,
  isFront: boolean,
  frontZIndex: number,
) {
  const color = resolveGoogleCalendarEventColor(block.event.colorId);

  return {
    className: `absolute flex flex-col items-stretch justify-start overflow-hidden rounded-sm border px-2 py-px text-left text-xs leading-4 shadow-soft ${
      color ? "" : "border-border bg-muted"
    }`,
    style: {
      top: block.topPx,
      height: block.heightPx,
      left:
        DAY_GRID_COLUMN_INSET_PX +
        block.overlapLayerIndex * DAY_GRID_LAYER_OFFSET_PX,
      right: DAY_GRID_COLUMN_INSET_PX,
      zIndex: isFront ? frontZIndex : block.overlapLayerIndex,
      ...(color
        ? { backgroundColor: `${color}40`, borderColor: `${color}80` }
        : {}),
    },
  };
}

function formatDuration(durationMinutes: number) {
  const roundedMinutes = Math.round(durationMinutes);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function formatTime(date: Date, timeZone: string) {
  const { hour, minute } = getCalendarTime(date, timeZone);
  const minutes = String(minute).padStart(2, "0");
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${minutes} ${suffix}`;
}
