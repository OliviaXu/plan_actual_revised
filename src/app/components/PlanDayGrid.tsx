import type {
  CalendarEvent,
  TimedCalendarEvent,
} from "../../calendar/calendar-event";
import { useState } from "react";
import { planEventColorClassName } from "../../design/google-calendar-colors";
import {
  calculatePlanDayGridLayout,
  PLAN_EVENT_COLUMN_INSET_PX,
  PLAN_EVENT_LAYER_OFFSET_PX,
  type PlanDayGridBlock,
} from "./plan-day-grid-layout";
import { defaultSettings } from "../../domain/settings";

const PLAN_GRID_TEMPLATE_COLUMNS = "4.5rem minmax(0, 1fr)";

type PlanLoadStatus =
  | "loading"
  | "connecting"
  | "connected"
  | "error";

export function PlanDayGrid({
  events,
  status,
  today,
}: {
  events: CalendarEvent[];
  status: PlanLoadStatus;
  today: Date;
}) {
  const [frontEventId, setFrontEventId] = useState<string | null>(null);
  const eligibleTimedEvents = events.filter(
    (event): event is TimedCalendarEvent =>
      event.kind === "timed" &&
      !defaultSettings.hiddenPlanColorIds.includes(event.colorId ?? ""),
  );
  const layout = calculatePlanDayGridLayout(
    eligibleTimedEvents,
    today,
    defaultSettings,
  );
  const hourHeightPx = 60 * defaultSettings.pixelsPerMinute;

  return (
    <section
      className="overflow-hidden rounded-md border border-border bg-white shadow-soft"
      aria-label="Plan day grid"
    >
      <div
        className="grid border-b border-border bg-muted"
        style={{ gridTemplateColumns: PLAN_GRID_TEMPLATE_COLUMNS }}
      >
        <div className="border-r border-border px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
          Time
        </div>
        <h2 className="px-4 py-2 text-sm font-semibold">Plan</h2>
      </div>
      <div
        className="relative"
        data-end-hour={layout.endHour}
        data-start-hour={layout.startHour}
        data-testid="plan-grid-body"
        style={{ height: layout.heightPx }}
      >
        <div
          className="grid h-full"
          style={{ gridTemplateColumns: PLAN_GRID_TEMPLATE_COLUMNS }}
        >
          <div className="relative border-r border-border">
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
              />
            ))}
          </div>
        </div>
      </div>
    </section>
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
}: {
  block: PlanDayGridBlock;
  frontZIndex: number;
  isFront: boolean;
  onBringToFront: () => void;
}) {
  return (
    <button
      className={`absolute flex flex-col items-stretch justify-start overflow-hidden rounded-sm border px-2 py-px text-left text-xs leading-4 shadow-soft ${planEventColorClassName(block.event.colorId)}`}
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
          {formatTime(block.clippedStart)} – {formatTime(block.clippedEnd)}
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

function formatTime(date: Date) {
  const hour = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${minutes} ${suffix}`;
}
