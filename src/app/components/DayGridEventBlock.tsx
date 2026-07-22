import { resolveGoogleCalendarEventColor } from "../../calendar/google-calendar-colors";
import type {
  ActualEvent,
  DayEvent,
  PlanEvent,
} from "../../domain/day-event";
import {
  DAY_GRID_COLUMN_INSET_PX,
  DAY_GRID_LAYER_OFFSET_PX,
  type DayGridBlock,
} from "./day-grid-layout";

export function ActualGridBlock({
  block,
  frontZIndex,
  isFront,
  mutationsDisabled,
  onResizeStart,
  onSelect,
}: {
  block: DayGridBlock<ActualEvent>;
  frontZIndex: number;
  isFront: boolean;
  mutationsDisabled?: boolean;
  onResizeStart: (actual: ActualEvent, pointer: PointerEvent) => void;
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
      data-actual-id={block.event.id}
      data-overlap-group-index={block.overlapGroupIndex}
      data-overlap-layer-index={block.overlapLayerIndex}
      data-testid="actual-block"
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
          timeRangeTestId="actual-event-time-range"
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
      className={`${appearance.className} flex flex-col items-stretch justify-start px-2 py-px text-left text-xs leading-4`}
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

function formatMinuteOfDay(minutesSinceMidnight: number) {
  const hour = Math.floor(minutesSinceMidnight / 60) % 24;
  const minute = minutesSinceMidnight % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${String(minute).padStart(2, "0")} ${suffix}`;
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
