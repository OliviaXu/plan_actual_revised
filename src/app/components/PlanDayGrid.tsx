import type { CalendarEvent } from "../../calendar/calendar-event";
import {
  MILLISECONDS_PER_MINUTE,
  MINIMUM_PLAN_BLOCK_HEIGHT_PX,
  MINUTES_PER_HOUR,
} from "../../domain/plan-layout";
import { defaultSettings } from "../../domain/settings";

type PlanLoadStatus =
  | "loading"
  | "connecting"
  | "connected"
  | "error";

export function PlanDayGrid({
  events,
  status,
}: {
  events: CalendarEvent[];
  status: PlanLoadStatus;
}) {
  const timedEvents = events.filter((event) => event.kind === "timed");
  const gridHeight =
    (defaultSettings.dayEndHour - defaultSettings.dayStartHour) *
    MINUTES_PER_HOUR *
    defaultSettings.pixelsPerMinute;

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
      <div className="grid grid-cols-[var(--plan-grid-columns)]">
        <div className="relative border-r border-border" style={{ height: gridHeight }}>
          <span className="absolute right-2 top-0 text-xs text-muted-foreground">
            {formatHour(defaultSettings.dayStartHour)}
          </span>
          <span className="absolute bottom-0 right-2 text-xs text-muted-foreground">
            {formatHour(defaultSettings.dayEndHour)}
          </span>
        </div>
        <div className="relative" style={{ height: gridHeight }} data-testid="plan-column">
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
          {status === "connected" && timedEvents.length === 0 ? (
            <p
              className="absolute inset-x-4 top-6 text-sm text-muted-foreground"
              data-testid="plan-empty"
            >
              No timed events today
            </p>
          ) : null}
          {timedEvents.map((event) => {
            const start = new Date(event.start);
            const end = new Date(event.end);
            const startMinutes =
              start.getHours() * MINUTES_PER_HOUR + start.getMinutes();
            const durationMinutes =
              (end.getTime() - start.getTime()) / MILLISECONDS_PER_MINUTE;

            return (
              <article
                key={event.id}
                className="absolute inset-x-3 overflow-hidden rounded-sm border border-border bg-accent px-3 py-2 text-sm shadow-soft"
                data-calendar-event-id={event.id}
                style={{
                  top:
                    (startMinutes -
                      defaultSettings.dayStartHour * MINUTES_PER_HOUR) *
                    defaultSettings.pixelsPerMinute,
                  height: Math.max(
                    MINIMUM_PLAN_BLOCK_HEIGHT_PX,
                    durationMinutes * defaultSettings.pixelsPerMinute,
                  ),
                }}
              >
                <p className="truncate font-medium">
                  {event.summary ?? "Untitled event"}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour} ${suffix}`;
}
