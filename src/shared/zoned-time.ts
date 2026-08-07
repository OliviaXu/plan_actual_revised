import { DateTime } from "luxon";

export type ZonedTime = {
  date: string;
  hour: number;
  minute: number;
  minutesSinceMidnight: number;
};

export type ZonedDayRange = {
  start: Date;
  end: Date;
};

export function getZonedTime(
  instant: Date | number,
  timeZone: string,
): ZonedTime {
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

export function getZonedDayRange(
  date: string,
  timeZone: string,
): ZonedDayRange {
  const start = DateTime.fromISO(date, { zone: timeZone }).startOf("day");
  const end = start.plus({ days: 1 }).startOf("day");
  return {
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
  };
}
