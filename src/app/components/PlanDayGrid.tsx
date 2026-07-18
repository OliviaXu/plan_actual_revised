import type {
  CalendarEvent,
  TimedCalendarEvent,
} from "../../calendar/calendar-event";
import { resolveGoogleCalendarEventColor } from "../../calendar/google-calendar-colors";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  calculatePlanDayGridLayout,
  calculatePlanNowIndicatorTopPx,
  PLAN_EVENT_COLUMN_INSET_PX,
  PLAN_EVENT_LAYER_OFFSET_PX,
  type PlanDayGridBlock,
} from "./plan-day-grid-layout";
import { defaultSettings } from "../../domain/settings";
import type { ActualBlock } from "../../domain/day-record";
import { getCalendarTime } from "../../calendar/calendar-time";

const PLAN_TIME_AXIS_WIDTH = "4.5rem";
const PLAN_GRID_TEMPLATE_COLUMNS = `${PLAN_TIME_AXIS_WIDTH} minmax(0, 1fr) minmax(0, 1fr)`;
const readSystemTime = () => new Date();

type PlanLoadStatus =
  | "loading"
  | "connecting"
  | "connected"
  | "error";

export function PlanDayGrid({
  actuals,
  canAddActual,
  events,
  now = readSystemTime,
  onAddActual,
  status,
  date,
  timeZone,
}: {
  actuals?: ActualBlock[];
  canAddActual?: boolean;
  events: CalendarEvent[];
  now?: () => Date;
  onAddActual?: () => void;
  status: PlanLoadStatus;
  date: string;
  timeZone: string;
}) {
  const [frontEventId, setFrontEventId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(now);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const gridHeaderRef = useRef<HTMLDivElement>(null);
  const didAutoScrollRef = useRef(false);
  const eligibleTimedEvents = events.filter(
    (event): event is TimedCalendarEvent =>
      event.kind === "timed" &&
      !event.isExtensionActual &&
      !defaultSettings.hiddenPlanColorIds.includes(event.colorId ?? ""),
  );
  const layout = calculatePlanDayGridLayout(
    eligibleTimedEvents,
    date,
    timeZone,
    defaultSettings,
  );
  const hourHeightPx = 60 * defaultSettings.pixelsPerMinute;
  const nowIndicatorTopPx = calculatePlanNowIndicatorTopPx(
    currentTime,
    date,
    timeZone,
    layout.startHour,
    layout.endHour,
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
      aria-label="Plan day grid"
    >
      <div
        className="relative h-[calc(100vh-10rem)] min-h-80 overflow-y-auto [scrollbar-gutter:stable]"
        data-testid="plan-scroll-viewport"
        ref={scrollViewportRef}
      >
        <div
          className="sticky top-0 z-20 grid border-b border-border bg-muted"
          data-testid="plan-grid-header"
          ref={gridHeaderRef}
          style={{ gridTemplateColumns: PLAN_GRID_TEMPLATE_COLUMNS }}
        >
          <div
            className="border-r border-border px-3 py-2 text-xs font-medium uppercase text-muted-foreground"
            data-testid="plan-grid-header-axis"
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
          data-end-hour={layout.endHour}
          data-start-hour={layout.startHour}
          data-testid="plan-grid-body"
          style={{ height: layout.heightPx }}
        >
          {nowIndicatorTopPx !== null ? (
            <div
              className="pointer-events-none absolute right-0 border-t border-now"
              data-testid="plan-now-indicator"
              style={{
                left: PLAN_TIME_AXIS_WIDTH,
                top: nowIndicatorTopPx,
                zIndex: layout.blocks.length + 1,
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
            style={{ gridTemplateColumns: PLAN_GRID_TEMPLATE_COLUMNS }}
          >
            <div
              className="relative border-r border-border"
              data-testid="plan-grid-axis"
            >
              {layout.hourBoundaries.map((hour) => {
              const labelPosition =
                hour === layout.startHour
                  ? ""
                  : hour === layout.endHour
                    ? "-translate-y-full"
                    : "-translate-y-1/2";

              return (
                <div
                  className="pointer-events-none absolute inset-x-0"
                  data-testid={`plan-hour-marker-${hour}`}
                  key={hour}
                  style={{ top: (hour - layout.startHour) * hourHeightPx }}
                >
                  <span
                    className={`absolute right-0 top-0 w-2 border-t border-border ${
                      hour === layout.endHour ? "-translate-y-px" : ""
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
            <div className="relative" data-testid="plan-column">
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
              {status === "connected" && layout.blocks.length === 0 ? (
                <p
                  className="absolute inset-x-4 top-6 text-sm text-muted-foreground"
                  data-testid="plan-empty"
                >
                  No timed events today
                </p>
              ) : null}
              {layout.blocks.map((block) => (
                <PlanEventBlock
                  block={block}
                  frontZIndex={layout.blocks.length}
                  isFront={frontEventId === block.event.id}
                  key={block.event.id}
                  onBringToFront={() => setFrontEventId(block.event.id)}
                  timeZone={timeZone}
                />
              ))}
            </div>
            <div className="relative border-l border-border" data-testid="actual-column">
              {(actuals ?? []).map((actual) => (
                <ActualEventBlock
                  actual={actual}
                  key={actual.id}
                  startHour={layout.startHour}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActualEventBlock({
  actual,
  startHour,
}: {
  actual: ActualBlock;
  startHour: number;
}) {
  const color = resolveGoogleCalendarEventColor(actual.colorId);
  return (
    <div
      className="absolute inset-x-2 overflow-hidden rounded-sm border px-2 py-1 text-xs shadow-soft"
      data-actual-id={actual.id}
      data-testid="actual-block"
      style={{
        top: (actual.startMinutes - startHour * 60) * defaultSettings.pixelsPerMinute,
        height: Math.max(20, actual.durationMinutes * defaultSettings.pixelsPerMinute),
        ...(color
          ? { backgroundColor: `${color}40`, borderColor: `${color}80` }
          : {}),
      }}
    >
      <span className="font-medium">{actual.summary}</span>
      <span className="ml-2 text-muted-foreground">
        {formatDuration(actual.durationMinutes)}
      </span>
    </div>
  );
}

function formatHour(hour: number) {
  const normalizedHour = hour % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const clockHour = normalizedHour % 12 || 12;
  return `${clockHour} ${suffix}`;
}

function PlanEventBlock({
  block,
  frontZIndex,
  isFront,
  onBringToFront,
  timeZone,
}: {
  block: PlanDayGridBlock;
  frontZIndex: number;
  isFront: boolean;
  onBringToFront: () => void;
  timeZone: string;
}) {
  const eventColor = resolveGoogleCalendarEventColor(block.event.colorId);

  return (
    <button
      className={`absolute flex flex-col items-stretch justify-start overflow-hidden rounded-sm border px-2 py-px text-left text-xs leading-4 shadow-soft ${
        eventColor ? "" : "border-border bg-muted"
      }`}
      data-calendar-event-id={block.event.id}
      data-overlap-group-index={block.overlapGroupIndex}
      data-overlap-layer-index={block.overlapLayerIndex}
      data-testid={`plan-event-${block.event.id}`}
      onClick={onBringToFront}
      style={{
        top: block.topPx,
        height: block.heightPx,
        left:
          PLAN_EVENT_COLUMN_INSET_PX +
          block.overlapLayerIndex * PLAN_EVENT_LAYER_OFFSET_PX,
        right: PLAN_EVENT_COLUMN_INSET_PX,
        zIndex: isFront ? frontZIndex : block.overlapLayerIndex,
        ...(eventColor
          ? {
              backgroundColor: `${eventColor}40`,
              borderColor: `${eventColor}80`,
            }
          : {}),
      }}
      type="button"
    >
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span
          className="min-w-0 truncate font-medium"
          data-testid="plan-event-title"
        >
          {block.event.summary ?? "Untitled event"}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {formatDuration(block.durationMinutes)}
        </span>
      </span>
      {block.showTimeRange ? (
        <span
          className="block truncate text-muted-foreground"
          data-testid="plan-event-time-range"
        >
          {formatTime(block.clippedStart, timeZone)} – {formatTime(block.clippedEnd, timeZone)}
        </span>
      ) : null}
    </button>
  );
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
