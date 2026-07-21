import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "./components/ui/button";
import { DayGrid } from "./components/DayGrid";
import {
  ActualEditDialog,
  type ActualDraft,
} from "./components/ActualEditDialog";
import type { ActualEvent } from "../domain/day-event";
import type { DayRecord } from "../domain/day-record";
import { defaultSettings } from "../domain/settings";
import { buildEditedActual } from "../domain/actual-edit";
import {
  runtimeCalendarEventClient,
  saveActualsToCalendar,
} from "./save-actuals-to-calendar";
import { useCalendarPlan } from "./use-calendar-plan";
import {
  createDayRecordWriteQueue,
  loadDayRecord,
} from "../storage/day-record-storage";
import { getCalendarTime } from "../calendar/calendar-time";

type ActualEditorState =
  | { mode: "create"; proposedActual: ActualEvent }
  | { mode: "edit"; targetId: string };

const readSystemTime = () => new Date();
const defaultActualDurationMinutes = 30;

export function App({ now = readSystemTime }: { now?: () => Date }) {
  const { calendarState, calendarDay, connectCalendar } =
    useCalendarPlan(now);
  const [dayRecordState, setDayRecordState] = useState<{
    key: string;
    record: DayRecord | null;
  }>();
  const [actualStorageError, setActualStorageError] = useState<string>();
  const [isSavingActualsToCalendar, setIsSavingActualsToCalendar] =
    useState(false);
  const [calendarSaveSummary, setCalendarSaveSummary] = useState<string>();
  const [actualEditorState, setActualEditorState] =
    useState<ActualEditorState>();
  const dayRecordWriteQueueRef = useRef<
    ReturnType<typeof createDayRecordWriteQueue>
  >(createDayRecordWriteQueue());
  const latestDayRecordWriteIdRef = useRef(0);

  const currentDate = now();
  const calendarDayKey = `${calendarDay.date}:${calendarDay.timeZone}`;
  const dayRecord =
    dayRecordState?.key === calendarDayKey ? dayRecordState.record : null;
  const actualLoadSettled = dayRecordState?.key === calendarDayKey;
  const actualEditTarget =
    actualEditorState?.mode === "create"
      ? actualEditorState.proposedActual
      : dayRecord?.actual.find(
          (actual) => actual.id === actualEditorState?.targetId,
        );

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
      summary: "Untitled",
      startMinutes: boundedStartMinutes,
      durationMinutes,
      colorId: defaultSettings.defaultActualColorId,
      saveDisposition: "unsaved" as const,
    };
    setActualEditorState({ mode: "create", proposedActual: newActual });
  }

  function saveActualDraft(draft: ActualDraft) {
    if (!actualEditorState || !actualEditTarget) {
      setActualEditorState(undefined);
      return;
    }
    const updatedAt = now().toISOString();
    if (actualEditorState.mode === "create") {
      const newActual = { ...actualEditorState.proposedActual, ...draft };
      const nextRecord: DayRecord = dayRecord
        ? {
            ...dayRecord,
            actual: [...dayRecord.actual, newActual],
            updatedAt,
          }
        : {
            schemaVersion: 1,
            date: calendarDay.date,
            timezone: calendarDay.timeZone,
            actual: [newActual],
            updatedAt,
          };

      void persistDayRecord(nextRecord);
      setActualEditorState(undefined);
      return;
    }
    if (!dayRecord) {
      setActualEditorState(undefined);
      return;
    }
    if (
      draft.summary === actualEditTarget.summary &&
      draft.durationMinutes === actualEditTarget.durationMinutes &&
      draft.colorId === actualEditTarget.colorId
    ) {
      setActualEditorState(undefined);
      return;
    }

    const editedActual = buildEditedActual(
      actualEditTarget,
      draft,
      () => crypto.randomUUID(),
    );
    void persistDayRecord({
      ...dayRecord,
      actual: dayRecord.actual.map((actual) =>
        actual.id === actualEditTarget.id ? editedActual : actual,
      ),
      updatedAt,
    });
    setActualEditorState(undefined);
  }

  function deleteActualEditTarget() {
    if (
      actualEditorState?.mode !== "edit" ||
      !dayRecord ||
      !actualEditTarget
    ) {
      setActualEditorState(undefined);
      return;
    }

    const updatedAt = now().toISOString();
    void persistDayRecord({
      ...dayRecord,
      actual: dayRecord.actual.filter(
        (actual) => actual.id !== actualEditTarget.id,
      ),
      updatedAt,
    });
    setActualEditorState(undefined);
  }

  async function persistDayRecord(record: DayRecord) {
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

  async function handleSaveActualsToCalendar() {
    if (!dayRecord || isSavingActualsToCalendar) return;

    setIsSavingActualsToCalendar(true);
    setCalendarSaveSummary(undefined);

    try {
      const result = await saveActualsToCalendar({
        record: dayRecord,
        now,
        persistDayRecord,
        ...runtimeCalendarEventClient,
      });
      setCalendarSaveSummary(result.summary);
    } finally {
      setIsSavingActualsToCalendar(false);
    }
  }

  const planEvents =
    calendarState.status === "connected" ? calendarState.planEvents : [];
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

        <DayGrid
          actuals={dayRecord?.actual ?? []}
          canAddActual={
            calendarState.status === "connected" &&
            actualLoadSettled &&
            !isSavingActualsToCalendar
          }
          planEvents={planEvents}
          now={now}
          onAddActual={addActual}
          onEditActual={(targetId) =>
            setActualEditorState({ mode: "edit", targetId })
          }
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
              onClick={() => void handleSaveActualsToCalendar()}
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
      {actualEditTarget ? (
        <ActualEditDialog
          actual={actualEditTarget}
          onDelete={
            actualEditorState?.mode === "edit"
              ? deleteActualEditTarget
              : undefined
          }
          onDismiss={() => setActualEditorState(undefined)}
          onSave={saveActualDraft}
          paletteColorIds={defaultSettings.actualPaletteColorIds}
          titleFocusMode={
            actualEditorState?.mode === "create" ? "selectAll" : "caretEnd"
          }
        />
      ) : null}
    </main>
  );
}
