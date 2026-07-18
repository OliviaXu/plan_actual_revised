import { DateTime } from "luxon";

export function getCalendarTime(instant: Date | number, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .map(({ type, value }) => [type, value]),
  );

  const hour = Number(values.hour);
  const minute = Number(values.minute);
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour,
    minute,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

export function getCalendarDayRange(localDate: string, timeZone: string) {
  const dayStart = DateTime.fromISO(localDate, { zone: timeZone }).startOf("day");
  const nextDayStart = dayStart.plus({ days: 1 }).startOf("day");
  return {
    date: localDate,
    timeMin: dayStart.toUTC().toJSDate().toISOString(),
    timeMax: nextDayStart.toUTC().toJSDate().toISOString(),
  };
}
