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
  const tomorrow = new Date(`${localDate}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return {
    date: localDate,
    timeMin: localMidnight(localDate, timeZone).toISOString(),
    timeMax: localMidnight(tomorrow.toISOString().slice(0, 10), timeZone).toISOString(),
  };
}

function localMidnight(date: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;

  // Date cannot construct an IANA-zoned time, so converge from a UTC guess.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = getCalendarTime(candidate, timeZone);
    const [localYear, localMonth, localDay] = local.date.split("-").map(Number);
    const represented = Date.UTC(
      localYear,
      localMonth - 1,
      localDay,
      local.hour,
      local.minute,
    );
    const correction = target - represented;
    candidate += correction;
    if (correction === 0) break;
  }

  return new Date(candidate);
}
