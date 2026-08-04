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
import type { DayGridLayoutMode } from "../side-panel-layout";

const DAY_TIME_AXIS_WIDTH = "4.5rem";
const REVEAL_RAIL_WIDTH = "23px";
const DAY_GRID_DROP_TARGET_CLASS_NAME = "bg-accent/15";
const readSystemTime = () => new Date();

type DayCanvasProps = {
  actuals?: ActualEvent[];
  revised?: RevisedEvent[];
  dragDisabled?: boolean;
  editableMutationsDisabled?: boolean;
  canAddActual?: boolean;
  layoutMode?: DayGridLayoutMode;
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
  date: string;
  timeZone: string;
};

export function DayCanvas({
  actuals,
  revised,
  dragDisabled,
  editableMutationsDisabled,
  canAddActual,
  layoutMode = "full",
  planEvents,
  now = readSystemTime,
  onAddActual,
  onStartSlack,
  onEditEditable,
  onEditableResizeEnd,
  onDropEditable,
  date,
  timeZone,
}: DayCanvasProps) {
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
    {
      sourceColumn: DayGridDragSourceColumn;
      sourceEventId: string;
      grabOffsetYPx: number;
    } | undefined
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
  const showPlan = layoutMode === "full";
  const showRevised = layoutMode !== "actual";
  const revealColumn = layoutMode === "actual"
    ? "revised"
    : layoutMode === "actual-revised"
      ? "plan"
      : undefined;
  const gridTemplateColumns = getDayGridTemplateColumns(layoutMode);

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(now()), 60_000);
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

  function clearDragState() {
    pendingGrabRef.current = undefined;
    setDragSession(undefined);
    setDropPreview(undefined);
  }

  function captureGrabOffset(
    event: ReactMouseEvent<HTMLButtonElement>,
    sourceColumn: DayGridDragSourceColumn,
    sourceEventId: string,
  ) {
    const blockViewportTopPx =
      event.currentTarget.getBoundingClientRect().top;
    pendingGrabRef.current = {
      sourceColumn,
      sourceEventId,
      grabOffsetYPx: event.clientY - blockViewportTopPx,
    };
  }

  function startDrag(
    event: ReactDragEvent<HTMLButtonElement>,
    sourceColumn: DayGridDragSourceColumn,
    sourceEventId: string,
  ) {
    event.dataTransfer.effectAllowed =
      sourceColumn === "plan" ? "copy" : "move";
    event.dataTransfer.setData("text/plain", sourceEventId);
    const blockRect = event.currentTarget.getBoundingClientRect();
    const recordedGrab = pendingGrabRef.current;
    setDragSession({
      sourceColumn,
      sourceEventId,
      grabOffsetYPx:
        recordedGrab?.sourceColumn === sourceColumn &&
        recordedGrab.sourceEventId === sourceEventId
          ? recordedGrab.grabOffsetYPx
          : blockRect.height / 2,
    });
  }

  function getDroppedStartMinutes(
    event: ReactDragEvent<HTMLDivElement>,
    grabOffsetYPx: number,
  ) {
    const columnViewportTopPx =
      event.currentTarget.getBoundingClientRect().top;
    return calculateDroppedStartMinutes({
      pointerClientY: event.clientY,
      columnViewportTopPx,
      grabOffsetYPx,
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
      !dragSession
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect =
      dragSession.sourceColumn === "plan" ? "copy" : "move";
    const startMinutes = getDroppedStartMinutes(
      event,
      dragSession.grabOffsetYPx,
    );
    setDropPreview({ targetColumn, startMinutes });
  }

  function finishEditableDrop(
    event: ReactDragEvent<HTMLDivElement>,
    targetColumn: DayGridDropTargetColumn,
  ) {
    if (
      dragDisabled ||
      !dragSession
    ) {
      clearDragState();
      return;
    }

    event.preventDefault();
    const startMinutes = getDroppedStartMinutes(
      event,
      dragSession.grabOffsetYPx,
    );
    onDropEditable?.({
      sourceColumn: dragSession.sourceColumn,
      sourceEventId: dragSession.sourceEventId,
      targetColumn,
      startMinutes,
    });
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
                  <PlanGridBlock
                    block={block}
                    dragDisabled={dragDisabled}
                    frontZIndex={planBlocks.length}
                    isFront={frontPlanId === block.event.id}
                    key={block.event.id}
                    onBringToFront={() => setFrontPlanId(block.event.id)}
                    onDragEnd={clearDragState}
                    onDragStart={(event) =>
                      startDrag(event, "plan", block.event.id)
                    }
                    onGrabOffsetCapture={(event) =>
                      captureGrabOffset(event, "plan", block.event.id)
                    }
                  />
                ))}
              </div>
            ) : null}
            {revealColumn === "plan" ? (
              <RevealRailBody column="plan" hourHeightPx={hourHeightPx} />
            ) : null}
            <div
              className={`day-grid-column-enter relative overflow-hidden border-l border-border ${
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
                  dragDisabled={dragDisabled}
                  frontZIndex={actualBlocks.length}
                  isFront={frontActualId === block.event.id}
                  key={block.event.id}
                  mutationsDisabled={editableMutationsDisabled}
                  onDragEnd={clearDragState}
                  onDragStart={(event) =>
                    startDrag(event, "actual", block.event.id)
                  }
                  onGrabOffsetCapture={(event) =>
                    captureGrabOffset(event, "actual", block.event.id)
                  }
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
            {revealColumn === "revised" ? (
              <RevealRailBody column="revised" hourHeightPx={hourHeightPx} />
            ) : null}
            {showRevised ? (
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
                  dragDisabled={dragDisabled}
                  frontZIndex={revisedBlocks.length}
                  isFront={frontRevisedId === block.event.id}
                  key={block.event.id}
                  mutationsDisabled={editableMutationsDisabled}
                  onDragEnd={clearDragState}
                  onDragStart={(event) =>
                    startDrag(event, "revised", block.event.id)
                  }
                  onGrabOffsetCapture={(event) =>
                    captureGrabOffset(event, "revised", block.event.id)
                  }
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
