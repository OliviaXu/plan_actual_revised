import type { DayRecord } from "./day-record";

export function selectCatchUpRecords(
  records: DayRecord[],
  today: string,
): {
  retained: DayRecord[];
  expired: DayRecord[];
  deletable: DayRecord[];
  ignored: DayRecord[];
} {
  const historical = records.filter((record) => record.date < today);
  const nonempty = historical
    .filter((record) => record.actual.length > 0)
    .sort((left, right) => right.date.localeCompare(left.date));

  return {
    retained: nonempty.slice(0, 2),
    expired: nonempty.slice(2),
    deletable: historical.filter((record) => record.actual.length === 0),
    ignored: records.filter((record) => record.date >= today),
  };
}
