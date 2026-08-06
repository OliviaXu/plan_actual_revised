import { Plus } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  calculateDayGridBlocks,
  calculateDayGridNowIndicatorTopPx,
  calculateDayGridRange,
} from "./day-grid-layout";
import { defaultSettings } from "../../domain/settings";
import type {
  ActualEvent,
  EditableColumn,
  EditableEvent,
  PlanEvent,
  RevisedEvent,
} from "../../domain/day-event";
import {
  formatMinuteOfDay,
  getCalendarTime,
} from "../../calendar/calendar-time";
import { PlanEventBlock } from "./DayGridEventBlock";
import { DayGridTimeAxis } from "./DayGridTimeAxis";
import { EditableEventColumn } from "./EditableEventColumn";
import { SlackIntentionPopover } from "./SlackIntentionPopover";
import type { DayGridDropOperation } from "./day-grid-drag";
import type { DayGridLayoutMode } from "../hooks/use-responsive-day-grid-layout-mode";
import type { CalendarDay } from "../hooks/use-calendar-plan";
import { useDayGridDragDrop } from "../hooks/use-day-grid-drag-drop";

const DAY_TIME_AXIS_WIDTH = "4.5rem";
const REVEAL_RAIL_WIDTH = "23px";

type DayGridProps = {
  calendarDay: CalendarDay;
  now: () => Date;
  planEvents: PlanEvent[];
  actuals?: ActualEvent[];
  revised?: RevisedEvent[];
  layoutMode?: DayGridLayoutMode;
  mutationsDisabled?: boolean;
  onNewActual?: () => void;
  onStartSlack?: (intention: string) => void;
  onEditEvent?: (column: EditableColumn, event: EditableEvent) => void;
  onResizeEvent?: (
    column: EditableColumn,
    eventId: string,
    durationMinutes: number,
  ) => void;
  onEventDrop?: (operation: DayGridDropOperation) => void;
};

export function DayGrid({
  calendarDay,
  now,
  planEvents,
  actuals,
  revised,
  layoutMode = "full",
  mutationsDisabled,
  onNewActual,
  onStartSlack,
  onEditEvent,
  onResizeEvent,
  onEventDrop,
}: DayGridProps) {
  const [frontPlanId, setFrontPlanId] = useState<string | null>(null);
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
  const hourHeightPx = 60 * defaultSettings.pixelsPerMinute;
  const nowIndicatorTopPx = calculateDayGridNowIndicatorTopPx(
    currentTime,
    calendarDay.date,
    calendarDay.timeZone,
    gridRange.startHour,
    gridRange.endHour,
    defaultSettings.pixelsPerMinute,
  );
  const gridStartMinutes = gridRange.startHour * 60;
  const gridEndMinutes = gridRange.endHour * 60;
  const dragDrop = useDayGridDragDrop({
    gridStartMinutes,
    gridEndMinutes,
    disabled: mutationsDisabled,
    onDrop: onEventDrop,
    settings: defaultSettings,
  });
  const showPlan = layoutMode === "full";
  const showRevised = layoutMode !== "actual";
  const revealColumn = layoutMode === "actual"
    ? "revised"
    : layoutMode === "actual-revised"
      ? "plan"
      : undefined;
  const gridTemplateColumns = getDayGridTemplateColumns(layoutMode);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setCurrentTime(now()),
      60_000,
    );
    return () => window.clearInterval(intervalId);
  }, [now]);

  useLayoutEffect(() => {
    const viewport = scrollViewportRef.current;
    const header = gridHeaderRef.current;
    if (
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
  }, [nowIndicatorTopPx]);

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
          style={{ gridTemplateColumns }}
        >
          <div
            className="border-r border-border px-3 py-2 text-xs font-medium uppercase text-muted-foreground"
            data-testid="day-grid-header-axis"
          >
            Time
          </div>
          {showPlan ? (
            <h2 className="day-grid-column-enter px-4 py-2 text-sm font-semibold">
              Plan
            </h2>
          ) : null}
          {revealColumn === "plan" ? (
            <RevealRailHeader column="plan" />
          ) : null}
          <div className="flex items-center justify-between border-l border-border px-4 py-2">
            <h2 className="text-sm font-semibold">Actual</h2>
            <div className="flex items-center gap-1.5">
              <button
                aria-label="Add Actual"
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-white text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
                disabled={mutationsDisabled}
                onClick={onNewActual}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
              </button>
              <SlackIntentionPopover
                disabled={mutationsDisabled}
                onSubmit={(intention) => onStartSlack?.(intention)}
              />
            </div>
          </div>
          {showRevised ? (
            <h2 className="day-grid-column-enter border-l border-border px-4 py-2 text-sm font-semibold">
              Revised
            </h2>
          ) : null}
          {revealColumn === "revised" ? (
            <RevealRailHeader column="revised" />
          ) : null}
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
              className="pointer-events-none absolute right-0 flex items-start"
              data-testid="plan-now-indicator"
              style={{
                left: DAY_TIME_AXIS_WIDTH,
                top: nowIndicatorTopPx,
                zIndex:
                  Math.max(
                    planBlocks.length,
                    actuals?.length ?? 0,
                    revised?.length ?? 0,
                  ) + 1,
              }}
            >
              <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-now" />
              <span
                aria-hidden="true"
                className="min-w-0 flex-1 border-t border-now"
                data-testid="now-time-trace"
              />
              <span
                className={`mr-2 shrink-0 px-1 text-xs font-medium text-now ${
                  nowIndicatorTopPx === 0 ? "" : "-translate-y-full"
                }`}
              >
                {formatTime(currentTime, calendarDay.timeZone)}
              </span>
            </div>
          ) : null}
          <div
            className="grid h-full"
            style={{ gridTemplateColumns }}
          >
            <DayGridTimeAxis
              hourHeightPx={hourHeightPx}
              range={gridRange}
            />
            {showPlan ? (
              <div
                className="day-grid-column-enter relative overflow-hidden"
                data-testid="plan-column"
              >
                {planBlocks.length === 0 ? (
                  <p
                    className="absolute inset-x-4 top-6 text-sm text-muted-foreground"
                    data-testid="plan-empty"
                  >
                    No timed events today
                  </p>
                ) : null}
                {planBlocks.map((block) => (
                  <PlanEventBlock
                    block={block}
                    dragDisabled={mutationsDisabled}
                    frontZIndex={planBlocks.length}
                    isFront={frontPlanId === block.event.id}
                    key={block.event.id}
                    onBringToFront={() => setFrontPlanId(block.event.id)}
                    onDragEnd={dragDrop.clearDragState}
                    onDragStart={(event) =>
                      dragDrop.startDrag(event, "plan", block.event.id)
                    }
                    onGrabOffsetCapture={(event) =>
                      dragDrop.captureGrabOffset(
                        event,
                        "plan",
                        block.event.id,
                      )
                    }
                  />
                ))}
              </div>
            ) : null}
            {revealColumn === "plan" ? (
              <RevealRailBody column="plan" hourHeightPx={hourHeightPx} />
            ) : null}
            <EditableEventColumn
              column="actual"
              gridStartHour={gridRange.startHour}
              gridEndHour={gridRange.endHour}
              events={actuals ?? []}
              dragDrop={dragDrop}
              mutationsDisabled={mutationsDisabled}
              onEditEvent={onEditEvent}
              onResizeEvent={onResizeEvent}
            />
            {revealColumn === "revised" ? (
              <RevealRailBody column="revised" hourHeightPx={hourHeightPx} />
            ) : null}
            {showRevised ? (
              <EditableEventColumn
                column="revised"
                gridStartHour={gridRange.startHour}
                gridEndHour={gridRange.endHour}
                events={revised ?? []}
                dragDrop={dragDrop}
                mutationsDisabled={mutationsDisabled}
                onEditEvent={onEditEvent}
                onResizeEvent={onResizeEvent}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function getDayGridTemplateColumns(layoutMode: DayGridLayoutMode) {
  if (layoutMode === "actual") {
    return `${DAY_TIME_AXIS_WIDTH} minmax(0, 1fr) ${REVEAL_RAIL_WIDTH}`;
  }
  if (layoutMode === "actual-revised") {
    return `${DAY_TIME_AXIS_WIDTH} ${REVEAL_RAIL_WIDTH} repeat(2, minmax(0, 1fr))`;
  }
  return `${DAY_TIME_AXIS_WIDTH} repeat(3, minmax(0, 1fr))`;
}

function RevealRailHeader({ column }: { column: "plan" | "revised" }) {
  const label = column === "plan" ? "P" : "R";
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center border-l border-border bg-accent/45 py-2 text-xs font-medium"
      data-testid={`${column}-reveal-header`}
    >
      {label}
    </div>
  );
}

function RevealRailBody({
  column,
  hourHeightPx,
}: {
  column: "plan" | "revised";
  hourHeightPx: number;
}) {
  const columnLabel = column === "plan" ? "Plan" : "Revised";
  return (
    <div
      aria-label={`Widen the side panel to show ${columnLabel}`}
      className="relative flex cursor-help justify-center overflow-visible border-l border-border text-muted-foreground"
      data-testid={`${column}-reveal-rail`}
      style={{
        backgroundImage:
          "linear-gradient(to bottom, transparent calc(100% - 1px), hsl(var(--border)) calc(100% - 1px))",
        backgroundSize: `100% ${hourHeightPx}px`,
      }}
      title={`Drag the side panel wider to show ${columnLabel}`}
    >
      <span
        aria-hidden="true"
        className="sticky top-1/2 h-fit -translate-y-1/2 [writing-mode:vertical-rl]"
        data-testid={`${column}-reveal-grip`}
      >
        •••
      </span>
    </div>
  );
}

function formatTime(date: Date, timeZone: string) {
  return formatMinuteOfDay(
    getCalendarTime(date, timeZone).minutesSinceMidnight,
  );
}
