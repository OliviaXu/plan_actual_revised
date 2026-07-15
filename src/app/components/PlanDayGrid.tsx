import type {
  CalendarEvent,
  TimedCalendarEvent,
} from "../../calendar/calendar-event";
import { planEventColorClassName } from "../../design/google-calendar-colors";
import {
  calculatePlanDayGridLayout,
  type PlanDayGridBlock,
} from "./plan-day-grid-layout";
import { defaultSettings } from "../../domain/settings";

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
      <div className="grid grid-cols-[var(--plan-grid-columns)] border-b border-border bg-muted">
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
        <div className="grid h-full grid-cols-[var(--plan-grid-columns)]">
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
              <PlanEventBlock block={block} key={block.event.id} />
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

function PlanEventBlock({ block }: { block: PlanDayGridBlock }) {
  return (
    <article
      className={`absolute inset-x-3 overflow-hidden rounded-sm border px-2 py-px text-xs leading-4 shadow-soft ${planEventColorClassName(block.event.colorId)}`}
      data-calendar-event-id={block.event.id}
      data-testid={`plan-event-${block.event.id}`}
      style={{ top: block.topPx, height: block.heightPx }}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium">
          {block.event.summary ?? "Untitled event"}
        </p>
        <span className="shrink-0 text-muted-foreground">
          {formatDuration(block.durationMinutes)}
        </span>
      </div>
      {block.showTimeRange ? (
        <p
          className="truncate text-muted-foreground"
          data-testid="plan-event-time-range"
        >
          {formatTime(block.clippedStart)} – {formatTime(block.clippedEnd)}
        </p>
      ) : null}
    </article>
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
