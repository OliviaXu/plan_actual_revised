import { getZonedTime } from "../shared/zoned-time";

export function formatMinuteOfDay(minutesSinceMidnight: number) {
  const hour = Math.floor(minutesSinceMidnight / 60) % 24;
  const minute = minutesSinceMidnight % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function formatHourOfDay(hour: number) {
  const normalizedHour = hour % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const clockHour = normalizedHour % 12 || 12;
  return `${clockHour} ${suffix}`;
}

export function formatDurationMinutes(durationMinutes: number) {
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

export function formatZonedTime(date: Date, timeZone: string) {
  return formatMinuteOfDay(
    getZonedTime(date, timeZone).minutesSinceMidnight,
  );
}
