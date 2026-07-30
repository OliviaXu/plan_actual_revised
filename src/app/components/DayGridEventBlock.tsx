import { formatMinuteOfDay } from "../../calendar/calendar-time";
import { resolveGoogleCalendarEventColor } from "../../calendar/google-calendar-colors";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type {
  DayEvent,
  EditableColumn,
  EditableEvent,
  PlanEvent,
} from "../../domain/day-event";
import {
  DAY_GRID_COLUMN_INSET_PX,
  DAY_GRID_LAYER_OFFSET_PX,
  type DayGridBlock,
} from "./day-grid-layout";

export function EditableGridBlock({
  block,
  column,
  frontZIndex,
  isFront,
  mutationsDisabled,
  onResizeStart,
  onSelect,
}: {
  block: DayGridBlock<EditableEvent>;
  column: EditableColumn;
  frontZIndex: number;
  isFront: boolean;
  mutationsDisabled?: boolean;
  onResizeStart: (event: EditableEvent, pointer: PointerEvent) => void;
  onSelect: () => void;
}) {
  const appearance = getDayGridBlockAppearance(
    block,
    isFront,
    frontZIndex,
  );

  return (
    <div
      className={appearance.className}
      data-actual-id={column === "actual" ? block.event.id : undefined}
      data-revised-id={column === "revised" ? block.event.id : undefined}
      data-overlap-group-index={block.overlapGroupIndex}
      data-overlap-layer-index={block.overlapLayerIndex}
      data-testid={`${column}-block`}
      style={appearance.style}
    >
      <button
        aria-label={`Edit ${block.event.summary || "Untitled event"}`}
        className="flex h-full w-full flex-col items-stretch justify-start px-2 py-px pb-2 text-left text-xs leading-4 disabled:cursor-default"
        disabled={mutationsDisabled}
        onClick={onSelect}
        type="button"
      >
        <DayGridBlockContent
          block={block}
          timeRangeTestId={`${column}-event-time-range`}
        />
      </button>
      <button
        aria-label={`Resize ${block.event.summary || "Untitled event"}`}
        className="absolute inset-x-0 bottom-0 z-10 flex h-2 cursor-ns-resize touch-none items-end justify-center disabled:cursor-default"
        disabled={mutationsDisabled}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onResizeStart(block.event, event.nativeEvent);
        }}
        type="button"
      >
        <span
          aria-hidden="true"
          className="mb-px h-px w-8 bg-current opacity-30"
        />
      </button>
    </div>
  );
}

export function PlanGridBlock({
  block,
  dragDisabled,
  frontZIndex,
  isFront,
  onBringToFront,
  onDragEnd,
  onDragStart,
  onGrabOffsetCapture,
}: {
  block: DayGridBlock<PlanEvent>;
  dragDisabled?: boolean;
  frontZIndex: number;
  isFront: boolean;
  onBringToFront: () => void;
  onDragEnd?: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onGrabOffsetCapture?: (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
}) {
  const appearance = getDayGridBlockAppearance(
    block,
    isFront,
    frontZIndex,
  );

  return (
    <button
      className={`${appearance.className} flex flex-col items-stretch justify-start px-2 py-px text-left text-xs leading-4`}
      data-calendar-event-id={block.event.id}
      data-overlap-group-index={block.overlapGroupIndex}
      data-overlap-layer-index={block.overlapLayerIndex}
      data-testid={`plan-event-${block.event.id}`}
      draggable={!dragDisabled}
      onClick={onBringToFront}
      onDragEnd={dragDisabled ? undefined : onDragEnd}
      onDragStart={dragDisabled ? undefined : onDragStart}
      onMouseDown={dragDisabled ? undefined : onGrabOffsetCapture}
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
    className: `absolute overflow-hidden rounded-sm border text-xs leading-4 shadow-soft ${
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
