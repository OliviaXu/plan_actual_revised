import { useEffect, useRef, useState } from "react";

import type { DayRecord } from "../../domain/day-record";
import {
  createDayRecordWriteQueue,
  loadDayRecord,
} from "../../storage/day-record-storage";
import type { CalendarDay } from "./use-calendar-plan";

type DayRecordState = {
  key: string;
  record: DayRecord | null;
};

type DayRecordLoadState = {
  key: string;
  status: Exclude<DayRecordLoadStatus, "loading">;
};

export type DayRecordLoadStatus = "loading" | "loaded" | "failed";

export function useDayRecord(calendarDay?: CalendarDay) {
  const [dayRecordState, setDayRecordState] = useState<DayRecordState>();
  const [loadState, setLoadState] = useState<DayRecordLoadState>();
  const writeQueueRef = useRef<
    ReturnType<typeof createDayRecordWriteQueue>
  >(createDayRecordWriteQueue());
  const calendarDate = calendarDay?.date;
  const calendarDayKey = calendarDay
    ? `${calendarDay.date}:${calendarDay.timeZone}`
    : undefined;
  const activeDayRecordState =
    calendarDayKey &&
    dayRecordState?.key === calendarDayKey
      ? dayRecordState
      : undefined;
  const dayRecord = activeDayRecordState?.record ?? null;
  const loadStatus: DayRecordLoadStatus =
    calendarDayKey && loadState?.key === calendarDayKey
      ? loadState.status
      : "loading";

  useEffect(() => {
    if (!calendarDate || !calendarDayKey) return;

    let active = true;
    void loadDayRecord(calendarDate)
      .then((record) => {
        if (!active) return;
        setDayRecordState({
          key: calendarDayKey,
          record,
        });
        setLoadState({ key: calendarDayKey, status: "loaded" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("day-record-load-failed", {
          date: calendarDate,
          error,
        });
        setDayRecordState({
          key: calendarDayKey,
          record: null,
        });
        setLoadState({ key: calendarDayKey, status: "failed" });
      });

    return () => {
      active = false;
    };
  }, [calendarDate, calendarDayKey]);

  async function persistDayRecord(record: DayRecord) {
    const recordKey = `${record.date}:${record.timezone}`;
    setDayRecordState({ key: recordKey, record });

    try {
      await writeQueueRef.current(record);
    } catch (error) {
      console.error("day-record-write-failed", {
        date: record.date,
        error,
      });
    }
  }

  return {
    dayRecord,
    loadStatus,
    persistDayRecord,
  };
}
