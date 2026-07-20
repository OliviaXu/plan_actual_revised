import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "./components/ui/button";
import { PlanDayGrid } from "./components/PlanDayGrid";
import type { CalendarEvent, TimedCalendarEvent } from "../calendar/calendar-event";
import type { DayRecord } from "../domain/day-record";
import { defaultSettings } from "../domain/settings";
import { isExactPlanMatch } from "../domain/actual-save";
import {
  mapActualToCalendarEvent,
  type CalendarActualInput,
} from "../calendar/actual-calendar-event";
import type { CalendarInsertEvent } from "../calendar/calendar-event";
import type { Result } from "../shared/result";
import { sendRuntimeMessage } from "../shared/runtime-messages";
import {
  createDayRecordWriteQueue,
  loadDayRecord,
} from "../storage/day-record-storage";
import { getCalendarTime } from "../calendar/calendar-time";

type CalendarState =
  | { status: "loading" }
  | { status: "disconnected"; errorMessage?: string }
  | { status: "connecting" }
  | {
      status: "connected";
      events: CalendarEvent[];
    }
  | { status: "error"; message: string };

type CalendarDay = {
  date: string;
  timeZone: string;
};

const readSystemTime = () => new Date();
const defaultActualDurationMinutes = 30;

export function App({ now = readSystemTime }: { now?: () => Date }) {
  const [calendarState, setCalendarState] = useState<CalendarState>({
    status: "loading",
  });
  const [calendarDay, setCalendarDay] = useState<CalendarDay>(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      date: getCalendarTime(now(), timeZone).date,
      timeZone,
    };
  });
  const [dayRecordState, setDayRecordState] = useState<{
    key: string;
    record: DayRecord | null;
  }>();
  const [actualStorageError, setActualStorageError] = useState<string>();
  const [isSavingActualsToCalendar, setIsSavingActualsToCalendar] =
    useState(false);
  const [calendarSaveSummary, setCalendarSaveSummary] = useState<string>();
  const dayRecordWriteQueueRef = useRef<
    ReturnType<typeof createDayRecordWriteQueue>
  >(createDayRecordWriteQueue());
  const latestDayRecordWriteIdRef = useRef(0);

  const currentDate = now();
  const calendarDayKey = `${calendarDay.date}:${calendarDay.timeZone}`;
  const dayRecord =
    dayRecordState?.key === calendarDayKey ? dayRecordState.record : null;
  const actualLoadSettled = dayRecordState?.key === calendarDayKey;

  useEffect(() => {
    void loadCalendarEvents(setCalendarState, setCalendarDay);
  }, []);

  useEffect(() => {
    if (calendarState.status !== "connected") return;

    let active = true;
    void loadDayRecord(calendarDay.date)
      .then((record) => {
        if (!active) return;
        setDayRecordState({ key: calendarDayKey, record });
        setActualStorageError(undefined);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setActualStorageError(
          error instanceof Error
            ? error.message
            : "Unable to load Actuals from local storage.",
        );
        setDayRecordState({ key: calendarDayKey, record: null });
      });
    return () => {
      active = false;
    };
  }, [calendarDay, calendarDayKey, calendarState.status]);

  async function connectCalendar() {
    setCalendarState({ status: "connecting" });

    try {
      const authResponse = await sendRuntimeMessage({
        type: "auth.requestInteractiveToken",
      });

      if (!authResponse.ok) {
        setCalendarState({
          status: "disconnected",
          errorMessage: authResponse.error.message,
        });
        return;
      }

      await loadCalendarEvents(setCalendarState, setCalendarDay);
    } catch {
      setCalendarState({
        status: "disconnected",
        errorMessage: "Unable to reach the background Calendar boundary.",
      });
    }
  }

  function addActual() {
    if (
      calendarState.status !== "connected" ||
      !actualLoadSettled ||
      isSavingActualsToCalendar
    ) {
      return;
    }

    const createdAt = now();
    const minutes = getCalendarTime(
      createdAt,
      calendarDay.timeZone,
    ).minutesSinceMidnight;
    const startMinutes =
      Math.floor(minutes / defaultSettings.snapMinutes) *
      defaultSettings.snapMinutes;
    const lastPossibleStartMinutes =
      24 * 60 - defaultSettings.minimumBlockDurationMinutes;
    const boundedStartMinutes = Math.min(
      startMinutes,
      lastPossibleStartMinutes,
    );
    const durationMinutes = Math.min(
      defaultActualDurationMinutes,
      24 * 60 - boundedStartMinutes,
    );
    const newActual = {
      id: crypto.randomUUID(),
      summary: "Actual",
      startMinutes: boundedStartMinutes,
      durationMinutes,
      colorId: defaultSettings.defaultActualColorId,
      saveDisposition: "unsaved" as const,
    };
    const nextRecord: DayRecord = dayRecord
      ? {
          ...dayRecord,
          actual: [...dayRecord.actual, newActual],
          updatedAt: createdAt.toISOString(),
        }
      : {
          schemaVersion: 1,
          date: calendarDay.date,
          timezone: calendarDay.timeZone,
          actual: [newActual],
          updatedAt: createdAt.toISOString(),
        };

    void saveDayRecordLocally(nextRecord);
  }

  async function saveDayRecordLocally(record: DayRecord) {
    const writeId = ++latestDayRecordWriteIdRef.current;
    setDayRecordState({
      key: `${record.date}:${record.timezone}`,
      record,
    });
    setActualStorageError(undefined);

    try {
      await dayRecordWriteQueueRef.current(record);
      if (writeId === latestDayRecordWriteIdRef.current) {
        setActualStorageError(undefined);
      }
    } catch (error) {
      if (writeId === latestDayRecordWriteIdRef.current) {
        setActualStorageError(
          error instanceof Error
            ? error.message
            : "Unable to save Actual locally.",
        );
      }
    }
  }

  async function saveActualsToCalendar() {
    if (!dayRecord || isSavingActualsToCalendar) return;
    const unsaved = dayRecord.actual.filter(
      (actual) => (actual.saveDisposition ?? "unsaved") === "unsaved",
    );
    if (unsaved.length === 0) {
      setCalendarSaveSummary("Nothing new to save");
      return;
    }

    setIsSavingActualsToCalendar(true);
    setCalendarSaveSummary(undefined);
    let workingRecord = dayRecord;
    let savedCount = 0;
    let matchedCount = 0;
    let failedCount = 0;

    try {
      const planResponse = await requestFreshCalendarEvents();
      if (!planResponse.ok) {
        setCalendarSaveSummary(
          `Failed ${unsaved.length}: ${planResponse.error.message}`,
        );
        return;
      }

      const timedPlanEvents = planResponse.value.events.filter(
        (event): event is TimedCalendarEvent =>
          event.kind === "timed" && !event.isExtensionActual,
      );

      for (const actual of unsaved) {
        const attemptedAt = now().toISOString();
        if (
          timedPlanEvents.some((event) =>
            isExactPlanMatch(actual, workingRecord, event),
          )
        ) {
          workingRecord = updateActual(workingRecord, actual.id, {
            saveDisposition: "planMatched",
            lastSaveAttemptAt: attemptedAt,
            lastSaveError: undefined,
          }, attemptedAt);
          await saveDayRecordLocally(workingRecord);
          matchedCount += 1;
          continue;
        }

        const input: CalendarActualInput = {
          block: actual,
          date: workingRecord.date,
          timezone: workingRecord.timezone,
          summaryPrefix: defaultSettings.actualEventPrefix,
          defaultColorId: defaultSettings.defaultActualColorId,
        };
        const response = await insertCalendarEvent(mapActualToCalendarEvent(input));

        if (response.ok) {
          workingRecord = updateActual(workingRecord, actual.id, {
            saveDisposition: "calendarSaved",
            calendarEventId: response.value.eventId,
            lastSaveAttemptAt: attemptedAt,
            lastSaveError: undefined,
          }, attemptedAt);
          savedCount += 1;
        } else {
          workingRecord = updateActual(workingRecord, actual.id, {
            saveDisposition: "unsaved",
            lastSaveAttemptAt: attemptedAt,
            lastSaveError: response.error,
          }, attemptedAt);
          failedCount += 1;
        }
        await saveDayRecordLocally(workingRecord);
      }

      const parts = [];
      if (savedCount) parts.push(`Saved ${savedCount}`);
      if (matchedCount) parts.push(`${matchedCount} matched Plan`);
      if (failedCount) parts.push(`Failed ${failedCount}`);
      setCalendarSaveSummary(parts.join(", ") || "Nothing new to save");
    } finally {
      setIsSavingActualsToCalendar(false);
    }
  }

  const events =
    calendarState.status === "connected" ? calendarState.events : [];
  const errorMessage =
    calendarState.status === "error"
      ? calendarState.message
      : calendarState.status === "disconnected"
        ? calendarState.errorMessage
        : undefined;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-soft">
              <CalendarDays aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {currentDate.toLocaleDateString(undefined, {
                  timeZone: calendarDay.timeZone,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <h1 className="text-2xl font-semibold tracking-normal">
                Plan / Actual / Revised
              </h1>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <p
            className="rounded-md border border-destructive bg-white px-4 py-3 text-sm font-medium text-destructive"
            data-testid="calendar-error"
          >
            {errorMessage}
          </p>
        ) : null}

        {calendarState.status === "disconnected" ? (
          <section
            className="max-w-md rounded-md border border-border bg-white p-5 shadow-soft"
            aria-label="Calendar connection"
          >
            <p className="font-semibold">
              Connect Google Calendar to show today&apos;s plan
            </p>
            <Button
              className="mt-4"
              type="button"
              onClick={() => void connectCalendar()}
            >
              Connect Calendar
            </Button>
          </section>
        ) : null}

        {actualStorageError ? (
          <p
            className="rounded-md border border-destructive bg-white px-4 py-3 text-sm font-medium text-destructive"
            data-testid="actual-storage-error"
          >
            {actualStorageError}
          </p>
        ) : null}

        <PlanDayGrid
          actuals={dayRecord?.actual ?? []}
          canAddActual={
            calendarState.status === "connected" &&
            actualLoadSettled &&
            !isSavingActualsToCalendar
          }
          events={events}
          now={now}
          onAddActual={addActual}
          status={calendarState.status === "disconnected" ? "error" : calendarState.status}
          date={calendarDay.date}
          timeZone={calendarDay.timeZone}
        />

        {dayRecord?.actual.length ? (
          <footer className="flex items-center gap-4">
            <Button
              disabled={
                isSavingActualsToCalendar ||
                calendarState.status !== "connected"
              }
              onClick={() => void saveActualsToCalendar()}
              type="button"
            >
              {isSavingActualsToCalendar
                ? "Saving Actual"
                : "Save Actual to calendar"}
            </Button>
            {calendarSaveSummary ? (
              <p className="text-sm text-muted-foreground" data-testid="actual-save-summary">
                {calendarSaveSummary}
              </p>
            ) : null}
          </footer>
        ) : null}
      </section>
    </main>
  );
}

async function requestFreshCalendarEvents(): Promise<
  Result<{ events: CalendarEvent[] }>
> {
  try {
    return await sendRuntimeMessage({ type: "calendar.listEvents" });
  } catch {
    return calendarBoundaryUnavailable();
  }
}

async function insertCalendarEvent(
  event: CalendarInsertEvent,
): Promise<Result<{ eventId: string }>> {
  try {
    return await sendRuntimeMessage({ type: "calendar.insertEvent", event });
  } catch {
    return calendarBoundaryUnavailable();
  }
}

function calendarBoundaryUnavailable(): Result<never> {
  return {
    ok: false,
    error: {
      code: "CALENDAR_BOUNDARY_UNAVAILABLE",
      message: "Unable to reach the background Calendar boundary.",
    },
  };
}

function updateActual(
  record: DayRecord,
  actualId: string,
  changes: Partial<DayRecord["actual"][number]>,
  updatedAt: string,
): DayRecord {
  return {
    ...record,
    actual: record.actual.map((actual) =>
      actual.id === actualId ? { ...actual, ...changes } : actual,
    ),
    updatedAt,
  };
}

async function loadCalendarEvents(
  setCalendarState: (state: CalendarState) => void,
  setCalendarDay: (day: CalendarDay) => void,
) {
  setCalendarState({ status: "loading" });

  try {
    const response = await sendRuntimeMessage({
      type: "calendar.listEvents",
    });

    if (response.ok) {
      setCalendarDay({
        date: response.value.date,
        timeZone: response.value.timeZone,
      });
      setCalendarState({
        status: "connected",
        events: response.value.events,
      });
      return;
    }

    if (response.error.code === "AUTH_NOT_CONNECTED") {
      setCalendarState({ status: "disconnected" });
      return;
    }

    setCalendarState({ status: "error", message: response.error.message });
  } catch {
    setCalendarState({
      status: "error",
      message: "Unable to reach the background Calendar boundary.",
    });
  }
}
