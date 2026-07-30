import { Plus } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
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
import { useEditableEventResize } from "../hooks/use-editable-event-resize";
import {
  EditableGridBlock,
  PlanGridBlock,
} from "./DayGridEventBlock";
import { DayGridTimeAxis } from "./DayGridTimeAxis";
import { SlackAuditPopover } from "./SlackAuditPopover";
import {
  calculateDroppedStartMinutes,
  type DayGridDragSourceColumn,
  type DayGridDropOperation,
  type DayGridDropTargetColumn,
} from "./day-grid-drag";

const DAY_TIME_AXIS_WIDTH = "4.5rem";
const DAY_GRID_TEMPLATE_COLUMNS =
  `${DAY_TIME_AXIS_WIDTH} repeat(3, minmax(0, 1fr))`;
const DAY_GRID_DROP_TARGET_CLASS_NAME = "bg-accent/15";
const readSystemTime = () => new Date();

type DayGridStatus =
  | "loading"
  | "connecting"
  | "connected"
  | "error";

type DayGridProps = {
  actuals?: ActualEvent[];
  revised?: RevisedEvent[];
  dragDisabled?: boolean;
  editableMutationsDisabled?: boolean;
  canAddActual?: boolean;
  planEvents: PlanEvent[];
  now?: () => Date;
  onAddActual?: () => void;
  onStartSlack?: (reason: string) => void;
  onEditEditable?: (column: EditableColumn, event: EditableEvent) => void;
  onEditableResizeEnd?: (
    column: EditableColumn,
    eventId: string,
    durationMinutes: number,
  ) => void;
  onDropEditable?: (operation: DayGridDropOperation) => void;
  status: DayGridStatus;
  date: string;
  timeZone: string;
};

export function DayGrid({
  actuals,
  revised,
  dragDisabled,
  editableMutationsDisabled,
  canAddActual,
  planEvents,
  now = readSystemTime,
  onAddActual,
  onStartSlack,
  onEditEditable,
  onEditableResizeEnd,
  onDropEditable,
  status,
  date,
  timeZone,
}: DayGridProps) {
  const [frontPlanId, setFrontPlanId] = useState<string | null>(null);
  const [frontActualId, setFrontActualId] = useState<string | null>(null);
  const [frontRevisedId, setFrontRevisedId] = useState<string | null>(null);
  const [dragSession, setDragSession] = useState<{
    sourceColumn: DayGridDragSourceColumn;
    sourceEventId: string;
    grabOffsetYPx: number;
  }>();
  const [dropPreview, setDropPreview] = useState<{
    targetColumn: DayGridDropTargetColumn;
    startMinutes: number;
  }>();
  const [currentTime, setCurrentTime] = useState(now);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const gridHeaderRef = useRef<HTMLDivElement>(null);
  const didAutoScrollRef = useRef(false);
  const pendingGrabRef = useRef<
    { sourceEventId: string; grabOffsetYPx: number } | undefined
  >(undefined);
  const {
    displayedEvents: displayedActuals,
    startResize: startActualResize,
  } = useEditableEventResize({
    events: actuals ?? [],
    disabled: editableMutationsDisabled,
    onResizeEnd: (eventId, durationMinutes) =>
      onEditableResizeEnd?.("actual", eventId, durationMinutes),
    settings: defaultSettings,
  });
  const {
    displayedEvents: displayedRevised,
    startResize: startRevisedResize,
  } = useEditableEventResize({
    events: revised ?? [],
    disabled: editableMutationsDisabled,
    onResizeEnd: (eventId, durationMinutes) =>
      onEditableResizeEnd?.("revised", eventId, durationMinutes),
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
  const revisedBlocks = calculateDayGridBlocks(
    displayedRevised,
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
  const gridStartMinutes = gridRange.startHour * 60;
  const gridEndMinutes = gridRange.endHour * 60;

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

  function clearDragState() {
    pendingGrabRef.current = undefined;
    setDragSession(undefined);
    setDropPreview(undefined);
  }

  function captureGrabOffset(
    event: ReactMouseEvent<HTMLButtonElement>,
    sourceEventId: string,
  ) {
    const blockViewportTopPx =
      event.currentTarget.getBoundingClientRect().top;
    pendingGrabRef.current = {
      sourceEventId,
      grabOffsetYPx: event.clientY - blockViewportTopPx,
    };
  }

  function startPlanDrag(
    event: ReactDragEvent<HTMLButtonElement>,
    sourceEventId: string,
  ) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", sourceEventId);
    const blockRect = event.currentTarget.getBoundingClientRect();
    const recordedGrab = pendingGrabRef.current;
    setDragSession({
      sourceColumn: "plan",
      sourceEventId,
      grabOffsetYPx:
        recordedGrab?.sourceEventId === sourceEventId
          ? recordedGrab.grabOffsetYPx
          : blockRect.height / 2,
    });
  }

  function getDroppedStartMinutes(
    event: ReactDragEvent<HTMLDivElement>,
  ) {
    if (!dragSession) return;

    const columnViewportTopPx =
      event.currentTarget.getBoundingClientRect().top;
    return calculateDroppedStartMinutes({
      pointerClientY: event.clientY,
      columnViewportTopPx,
      grabOffsetYPx: dragSession.grabOffsetYPx,
      gridStartMinutes,
      gridEndMinutes,
      pixelsPerMinute: defaultSettings.pixelsPerMinute,
      snapMinutes: defaultSettings.snapMinutes,
    });
  }

  function previewEditableDrop(
    event: ReactDragEvent<HTMLDivElement>,
    targetColumn: DayGridDropTargetColumn,
  ) {
    if (
      dragDisabled ||
      !dragSession ||
      dragSession.sourceColumn !== "plan"
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const startMinutes = getDroppedStartMinutes(event);
    if (startMinutes === undefined) return;
    setDropPreview({ targetColumn, startMinutes });
  }

  function finishEditableDrop(
    event: ReactDragEvent<HTMLDivElement>,
    targetColumn: DayGridDropTargetColumn,
  ) {
    if (
      dragDisabled ||
      !dragSession ||
      dragSession.sourceColumn !== "plan"
    ) {
      clearDragState();
      return;
    }

    event.preventDefault();
    const startMinutes = getDroppedStartMinutes(event);
    if (startMinutes !== undefined) {
      onDropEditable?.({
        sourceColumn: dragSession.sourceColumn,
        sourceEventId: dragSession.sourceEventId,
        targetColumn,
        startMinutes,
      });
    }
    clearDragState();
  }

  function clearDropPreviewOnLeave(
    event: ReactDragEvent<HTMLDivElement>,
  ) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setDropPreview(undefined);
  }

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
          <h2 className="border-l border-border px-4 py-2 text-sm font-semibold">
            Revised
          </h2>
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
                    actualBlocks.length,
                    revisedBlocks.length,
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
                  dragDisabled={dragDisabled}
                  frontZIndex={planBlocks.length}
                  isFront={frontPlanId === block.event.id}
                  key={block.event.id}
                  onBringToFront={() => setFrontPlanId(block.event.id)}
                  onDragEnd={clearDragState}
                  onDragStart={(event) =>
                    startPlanDrag(event, block.event.id)
                  }
                  onGrabOffsetCapture={(event) =>
                    captureGrabOffset(event, block.event.id)
                  }
                />
              ))}
            </div>
            <div
              className={`relative overflow-hidden border-l border-border ${
                dropPreview?.targetColumn === "actual"
                  ? DAY_GRID_DROP_TARGET_CLASS_NAME
                  : ""
              }`}
              data-testid="actual-column"
              onDragLeave={clearDropPreviewOnLeave}
              onDragOver={(event) => previewEditableDrop(event, "actual")}
              onDrop={(event) => finishEditableDrop(event, "actual")}
            >
              {dropPreview?.targetColumn === "actual" ? (
                <DropTimeIndicator
                  gridStartMinutes={gridStartMinutes}
                  startMinutes={dropPreview.startMinutes}
                />
              ) : null}
              {actualBlocks.map((block) => (
                <EditableGridBlock
                  block={block}
                  column="actual"
                  frontZIndex={actualBlocks.length}
                  isFront={frontActualId === block.event.id}
                  key={block.event.id}
                  mutationsDisabled={editableMutationsDisabled}
                  onResizeStart={(actual, pointer) => {
                    setFrontActualId(actual.id);
                    startActualResize(actual, pointer);
                  }}
                  onSelect={() => {
                    setFrontActualId(block.event.id);
                    onEditEditable?.("actual", block.event);
                  }}
                />
              ))}
            </div>
            <div
              className={`relative overflow-hidden border-l border-border ${
                dropPreview?.targetColumn === "revised"
                  ? DAY_GRID_DROP_TARGET_CLASS_NAME
                  : ""
              }`}
              data-testid="revised-column"
              onDragLeave={clearDropPreviewOnLeave}
              onDragOver={(event) => previewEditableDrop(event, "revised")}
              onDrop={(event) => finishEditableDrop(event, "revised")}
            >
              {dropPreview?.targetColumn === "revised" ? (
                <DropTimeIndicator
                  gridStartMinutes={gridStartMinutes}
                  startMinutes={dropPreview.startMinutes}
                />
              ) : null}
              {revisedBlocks.map((block) => (
                <EditableGridBlock
                  block={block}
                  column="revised"
                  frontZIndex={revisedBlocks.length}
                  isFront={frontRevisedId === block.event.id}
                  key={block.event.id}
                  mutationsDisabled={editableMutationsDisabled}
                  onResizeStart={(event, pointer) => {
                    setFrontRevisedId(event.id);
                    startRevisedResize(event, pointer);
                  }}
                  onSelect={() => {
                    setFrontRevisedId(block.event.id);
                    onEditEditable?.("revised", block.event);
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

function DropTimeIndicator({
  gridStartMinutes,
  startMinutes,
}: {
  gridStartMinutes: number;
  startMinutes: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex items-start"
      data-testid="drop-time-indicator"
      style={{
        top:
          (startMinutes - gridStartMinutes) *
          defaultSettings.pixelsPerMinute,
      }}
    >
      <span
        className={`shrink-0 px-1 text-[10px] font-medium text-now/80 ${
          startMinutes === gridStartMinutes ? "" : "-translate-y-full"
        }`}
      >
        {formatMinuteOfDay(startMinutes)}
      </span>
      <span
        aria-hidden="true"
        className="min-w-0 flex-1 border-t border-now/40"
        data-testid="drop-time-trace"
      />
    </div>
  );
}

function formatTime(date: Date, timeZone: string) {
  return formatMinuteOfDay(
    getCalendarTime(date, timeZone).minutesSinceMidnight,
  );
}
