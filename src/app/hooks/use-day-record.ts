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

export function useDayRecord(calendarDay?: CalendarDay) {
  const [dayRecordState, setDayRecordState] = useState<DayRecordState>();
  const [storageError, setStorageError] = useState<string>();
  const writeQueueRef = useRef<
    ReturnType<typeof createDayRecordWriteQueue>
  >(createDayRecordWriteQueue());
  const latestWriteIdRef = useRef(0);
  const calendarDate = calendarDay?.date;
  const calendarDayKey = calendarDay
    ? `${calendarDay.date}:${calendarDay.timeZone}`
    : undefined;
  const dayRecord =
    calendarDayKey && dayRecordState?.key === calendarDayKey
      ? dayRecordState.record
      : null;
  const loadSettled = Boolean(
    calendarDayKey && dayRecordState?.key === calendarDayKey,
  );

  useEffect(() => {
    if (!calendarDate || !calendarDayKey) return;

    let active = true;
    void loadDayRecord(calendarDate)
      .then((record) => {
        if (!active) return;
        setDayRecordState({ key: calendarDayKey, record });
        setStorageError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStorageError(
          error instanceof Error
            ? error.message
            : "Unable to load local changes.",
        );
        setDayRecordState({ key: calendarDayKey, record: null });
      });

    return () => {
      active = false;
    };
  }, [calendarDate, calendarDayKey]);

  async function persistDayRecord(record: DayRecord) {
    const writeId = ++latestWriteIdRef.current;
    setDayRecordState({
      key: `${record.date}:${record.timezone}`,
      record,
    });
    setStorageError(undefined);

    try {
      await writeQueueRef.current(record);
      if (writeId === latestWriteIdRef.current) {
        setStorageError(undefined);
      }
    } catch (error) {
      if (writeId === latestWriteIdRef.current) {
        setStorageError(
          error instanceof Error
            ? error.message
            : "Unable to save local changes.",
        );
      }
    }
  }

  return {
    dayRecord,
    loadSettled,
    storageError,
    persistDayRecord,
  };
}
