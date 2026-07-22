import { CalendarDays } from "lucide-react";
import { useState } from "react";

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
} from "./workflows/save-actuals-to-calendar";
import { useCalendarPlan } from "./hooks/use-calendar-plan";
import { useDayRecord } from "./hooks/use-day-record";
import { getCalendarTime } from "../calendar/calendar-time";

type ActualEditorState =
  | { mode: "create"; proposedActual: ActualEvent }
  | { mode: "edit"; targetId: string };

const readSystemTime = () => new Date();
const defaultActualDurationMinutes = 30;

export function App({ now = readSystemTime }: { now?: () => Date }) {
  const { calendarState, calendarDay, connectCalendar } =
    useCalendarPlan(now);
  const calendarConnected = calendarState.status === "connected";
  const canonicalCalendarDay = calendarConnected ? calendarDay : undefined;
  const {
    dayRecord,
    loadSettled: actualLoadSettled,
    storageError: actualStorageError,
    persistDayRecord,
  } = useDayRecord(canonicalCalendarDay);
  const [isSavingActualsToCalendar, setIsSavingActualsToCalendar] =
    useState(false);
  const [calendarSaveSummary, setCalendarSaveSummary] = useState<string>();
  const [actualEditorState, setActualEditorState] =
    useState<ActualEditorState>();
  const currentDate = now();
  const actualEditTarget =
    actualEditorState?.mode === "create"
      ? actualEditorState.proposedActual
      : dayRecord?.actual.find(
          (actual) => actual.id === actualEditorState?.targetId,
        );

  function addActual() {
    if (
      !calendarConnected ||
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

  function persistResizedActual(actualId: string, durationMinutes: number) {
    if (!dayRecord || isSavingActualsToCalendar) return;

    const actual = dayRecord.actual.find((event) => event.id === actualId);
    if (!actual || actual.durationMinutes === durationMinutes) return;

    const resizedActual = buildEditedActual(
      actual,
      {
        summary: actual.summary,
        durationMinutes,
        colorId: actual.colorId,
      },
      () => crypto.randomUUID(),
    );
    void persistDayRecord({
      ...dayRecord,
      actual: dayRecord.actual.map((event) =>
        event.id === actualId ? resizedActual : event,
      ),
      updatedAt: now().toISOString(),
    });
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
          actualMutationsDisabled={isSavingActualsToCalendar}
          canAddActual={
            calendarConnected &&
            actualLoadSettled &&
            !isSavingActualsToCalendar
          }
          planEvents={planEvents}
          now={now}
          onAddActual={addActual}
          onEditActual={(targetId) =>
            setActualEditorState({ mode: "edit", targetId })
          }
          onActualResizeEnd={persistResizedActual}
          status={calendarState.status === "disconnected" ? "error" : calendarState.status}
          date={calendarDay.date}
          timeZone={calendarDay.timeZone}
        />

        {dayRecord?.actual.length ? (
          <footer className="flex items-center gap-4">
            <Button
              disabled={
                isSavingActualsToCalendar ||
                !calendarConnected
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
