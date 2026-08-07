export function formatMinuteOfDay(minutesSinceMidnight: number) {
  const hour = Math.floor(minutesSinceMidnight / 60) % 24;
  const minute = minutesSinceMidnight % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}
