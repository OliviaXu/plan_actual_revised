import type { DayGridRange } from "./day-grid-layout";

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
              {formatHour(hour)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatHour(hour: number) {
  const normalizedHour = hour % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const clockHour = normalizedHour % 12 || 12;
  return `${clockHour} ${suffix}`;
}
