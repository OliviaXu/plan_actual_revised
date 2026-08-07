import type { DayGridRange } from "./day-grid-layout";
import { formatHourOfDay } from "../format-time";

export function DayGridTimeAxis({
  hourHeightPx,
  range,
}: {
  hourHeightPx: number;
  range: DayGridRange;
}) {
  return (
    <div
      className="relative border-r border-border"
      data-testid="day-grid-axis"
    >
      {range.hourBoundaries.map((hour) => {
        const labelPosition =
          hour === range.startHour
            ? ""
            : hour === range.endHour
              ? "-translate-y-full"
              : "-translate-y-1/2";

        return (
          <div
            className="pointer-events-none absolute inset-x-0"
            data-testid={`plan-hour-marker-${hour}`}
            key={hour}
            style={{
              top: (hour - range.startHour) * hourHeightPx,
            }}
          >
            <span
              className={`absolute right-0 top-0 w-2 border-t border-border ${
                hour === range.endHour ? "-translate-y-px" : ""
              }`}
              data-testid="plan-hour-tick"
            />
            <span
              className={`absolute right-3 text-xs text-muted-foreground ${labelPosition}`}
            >
              {formatHourOfDay(hour)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
