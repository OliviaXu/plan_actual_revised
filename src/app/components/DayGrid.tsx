import { Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  calculateDayGridBlocks,
  calculateDayGridNowIndicatorTopPx,
  calculateDayGridRange,
} from "./day-grid-layout";
import { defaultSettings } from "../../domain/settings";
import type { ActualEvent, PlanEvent } from "../../domain/day-event";
import { getCalendarTime } from "../../calendar/calendar-time";
import { useActualResize } from "../hooks/use-actual-resize";
import {
  ActualGridBlock,
  PlanGridBlock,
} from "./DayGridEventBlock";
import { DayGridTimeAxis } from "./DayGridTimeAxis";
import { SlackAuditPopover } from "./SlackAuditPopover";

const DAY_TIME_AXIS_WIDTH = "4.5rem";
const DAY_GRID_TEMPLATE_COLUMNS = `${DAY_TIME_AXIS_WIDTH} minmax(0, 1fr) minmax(0, 1fr)`;
const readSystemTime = () => new Date();

type DayGridStatus =
  | "loading"
  | "connecting"
  | "connected"
  | "error";

type DayGridProps = {
  actuals?: ActualEvent[];
  actualMutationsDisabled?: boolean;
  canAddActual?: boolean;
  planEvents: PlanEvent[];
  now?: () => Date;
  onAddActual?: () => void;
  onStartSlack?: (reason: string) => void;
  onEditActual?: (actualId: string) => void;
  onActualResizeEnd?: (actualId: string, durationMinutes: number) => void;
  status: DayGridStatus;
  date: string;
  timeZone: string;
};

export function DayGrid({
  actuals,
  actualMutationsDisabled,
  canAddActual,
  planEvents,
  now = readSystemTime,
  onAddActual,
  onStartSlack,
  onEditActual,
  onActualResizeEnd,
  status,
  date,
  timeZone,
}: DayGridProps) {
  const [frontPlanId, setFrontPlanId] = useState<string | null>(null);
  const [frontActualId, setFrontActualId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(now);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const gridHeaderRef = useRef<HTMLDivElement>(null);
  const didAutoScrollRef = useRef(false);
  const { displayedActuals, startActualResize } = useActualResize({
    actuals: actuals ?? [],
    disabled: actualMutationsDisabled,
    onResizeEnd: onActualResizeEnd,
    settings: defaultSettings,
  });
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
    displayedActuals,
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
            <div className="flex items-center gap-1.5">
              <button
                aria-label="Add Actual"
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-white text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
                disabled={!canAddActual}
                onClick={onAddActual}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
              </button>
              <SlackAuditPopover
                disabled={!canAddActual}
                onSubmit={(reason) => onStartSlack?.(reason)}
              />
            </div>
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
            <DayGridTimeAxis
              hourHeightPx={hourHeightPx}
              range={gridRange}
            />
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
                  mutationsDisabled={actualMutationsDisabled}
                  onResizeStart={(actual, pointer) => {
                    setFrontActualId(actual.id);
                    startActualResize(actual, pointer);
                  }}
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

function formatTime(date: Date, timeZone: string) {
  const { hour, minute } = getCalendarTime(date, timeZone);
  const minutes = String(minute).padStart(2, "0");
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${minutes} ${suffix}`;
}
