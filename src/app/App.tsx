import { CalendarDays, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./components/ui/button";
import { DayGrid } from "./components/DayGrid";
import {
  EditableEventDialog,
  type EditableEventDraft,
} from "./components/EditableEventDialog";
import type {
  ActualEvent,
  EditableColumn,
  EditableEvent,
  RevisedEvent,
} from "../domain/day-event";
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
import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import { sendRuntimeMessage } from "../shared/runtime-messages";

type EditableEventEditorState =
  | { mode: "create"; column: "actual"; event: ActualEvent }
  | { mode: "edit"; column: EditableColumn; event: EditableEvent };

const readSystemTime = () => new Date();
const openSlackProtocol = () => {
  window.open("slack://open", "_self");
};
const defaultActualDurationMinutes = 30;

export function App({
  now = readSystemTime,
  launchSlack = openSlackProtocol,
}: {
  now?: () => Date;
  launchSlack?: () => void;
}) {
  const { calendarState, calendarDay, connectCalendar } =
    useCalendarPlan(now);
  const calendarConnected = calendarState.status === "connected";
  const canonicalCalendarDay = calendarConnected ? calendarDay : undefined;
  const {
    dayRecord,
    loadStatus: actualLoadStatus,
    storageError: actualStorageError,
    persistDayRecord,
  } = useDayRecord(canonicalCalendarDay);
  const [isSavingActualsToCalendar, setIsSavingActualsToCalendar] =
    useState(false);
  const [calendarSaveSummary, setCalendarSaveSummary] = useState<string>();
  const [slackLaunchWarning, setSlackLaunchWarning] = useState(false);
  const [catchUpFeedback, setCatchUpFeedback] = useState<{
    message: string;
    warning: boolean;
  }>();
  const [editableEventEditorState, setEditableEventEditorState] =
    useState<EditableEventEditorState>();
  const currentDate = now();
  const editableEventTarget = editableEventEditorState?.event;
  const canCreateActual =
    calendarConnected &&
    actualLoadStatus !== "loading" &&
    !isSavingActualsToCalendar;

  useEffect(() => {
    if (!calendarConnected || actualLoadStatus !== "loaded") return;

    let active = true;
    void sendRuntimeMessage({
      type: "catchUp.run",
      todayDate: calendarDay.date,
    })
      .then((response) => {
        if (!active) return;
        if (!response.ok) {
          setCatchUpFeedback({
            message: `Catch-up unavailable: ${response.error.message}`,
            warning: true,
          });
          return;
        }
        setCatchUpFeedback(getCatchUpFeedback(response.value));
      })
      .catch(() => {
        if (!active) return;
        setCatchUpFeedback({
          message: "Catch-up unavailable: unable to reach the background service.",
          warning: true,
        });
      });

    return () => {
      active = false;
    };
  }, [actualLoadStatus, calendarConnected, calendarDay.date]);

  function buildNewActual({
    summary,
    requestedDurationMinutes,
    colorId,
    isSlack,
    createdAt,
  }: {
    summary: string;
    requestedDurationMinutes: number;
    colorId: string;
    isSlack?: true;
    createdAt: Date;
  }): ActualEvent {
    return {
      id: crypto.randomUUID(),
      summary,
      ...getNewActualTiming(
        createdAt,
        calendarDay.timeZone,
        requestedDurationMinutes,
      ),
      colorId,
      ...(isSlack ? { isSlack: true } : {}),
      saveDisposition: "unsaved",
    };
  }

  function appendActual(actual: ActualEvent, updatedAt: Date) {
    const updatedAtIso = updatedAt.toISOString();
    const nextRecord: DayRecord = dayRecord
      ? {
          ...dayRecord,
          actual: [...dayRecord.actual, actual],
          updatedAt: updatedAtIso,
        }
      : {
          schemaVersion: 1,
          date: calendarDay.date,
          timezone: calendarDay.timeZone,
          actual: [actual],
          revised: [],
          updatedAt: updatedAtIso,
        };

    void persistDayRecord(nextRecord);
  }

  function addActual() {
    if (!canCreateActual) return;

    const newActual = buildNewActual({
      summary: "Untitled",
      requestedDurationMinutes: defaultActualDurationMinutes,
      colorId: defaultSettings.defaultActualColorId,
      createdAt: now(),
    });
    setEditableEventEditorState({
      mode: "create",
      column: "actual",
      event: newActual,
    });
  }

  function startSlack(reason: string) {
    if (!canCreateActual) return;

    const createdAt = now();
    const newActual = buildNewActual({
      summary: reason,
      requestedDurationMinutes: defaultSettings.slackDefaultDurationMinutes,
      colorId: defaultSettings.slackColorId,
      isSlack: true,
      createdAt,
    });
    appendActual(newActual, createdAt);
    setSlackLaunchWarning(false);
    try {
      launchSlack();
    } catch {
      setSlackLaunchWarning(true);
    }
  }

  function saveEditableEventDraft(draft: EditableEventDraft) {
    if (!editableEventEditorState || !editableEventTarget) {
      setEditableEventEditorState(undefined);
      return;
    }
    if (editableEventEditorState.mode === "create") {
      const newActual = {
        ...editableEventEditorState.event,
        ...draft,
      };
      appendActual(newActual, now());
      setEditableEventEditorState(undefined);
      return;
    }
    if (!dayRecord) {
      setEditableEventEditorState(undefined);
      return;
    }
    if (
      draft.summary === editableEventTarget.summary &&
      draft.durationMinutes === editableEventTarget.durationMinutes &&
      draft.colorId === editableEventTarget.colorId
    ) {
      setEditableEventEditorState(undefined);
      return;
    }

    let editedDayRecord: DayRecord;
    if (editableEventEditorState.column === "actual") {
      const editedActual = buildEditedActual(
        editableEventTarget as ActualEvent,
        draft,
        () => crypto.randomUUID(),
      );
      editedDayRecord = {
        ...dayRecord,
        actual: dayRecord.actual.map((actual) =>
          actual.id === editableEventTarget.id ? editedActual : actual,
        ),
      };
    } else {
      const editedRevised: RevisedEvent = {
        ...editableEventTarget,
        ...draft,
      };
      editedDayRecord = {
        ...dayRecord,
        revised: dayRecord.revised.map((event) =>
          event.id === editableEventTarget.id ? editedRevised : event,
        ),
      };
    }
    void persistDayRecord({
      ...editedDayRecord,
      updatedAt: now().toISOString(),
    });
    setEditableEventEditorState(undefined);
  }

  function deleteEditableEventTarget() {
    if (
      editableEventEditorState?.mode !== "edit" ||
      !dayRecord ||
      !editableEventTarget
    ) {
      setEditableEventEditorState(undefined);
      return;
    }

    const column = editableEventEditorState.column;
    void persistDayRecord({
      ...dayRecord,
      [column]: dayRecord[column].filter(
        (event) => event.id !== editableEventTarget.id,
      ),
      updatedAt: now().toISOString(),
    });
    setEditableEventEditorState(undefined);
  }

  function persistResizedEditableEvent(
    column: EditableColumn,
    eventId: string,
    durationMinutes: number,
  ) {
    if (!dayRecord || isSavingActualsToCalendar) return;

    const event = dayRecord[column].find((candidate) =>
      candidate.id === eventId
    );
    if (!event || event.durationMinutes === durationMinutes) return;

    let editedDayRecord: DayRecord;
    if (column === "actual") {
      const resizedActual = buildEditedActual(
        event as ActualEvent,
        {
          summary: event.summary,
          durationMinutes,
          colorId: event.colorId,
        },
        () => crypto.randomUUID(),
      );
      editedDayRecord = {
        ...dayRecord,
        actual: dayRecord.actual.map((actual) =>
          actual.id === eventId ? resizedActual : actual,
        ),
      };
    } else {
      editedDayRecord = {
        ...dayRecord,
        revised: dayRecord.revised.map((revised) =>
          revised.id === eventId
            ? { ...revised, durationMinutes }
            : revised,
        ),
      };
    }
    void persistDayRecord({
      ...editedDayRecord,
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

        {catchUpFeedback ? (
          <p
            className={
              catchUpFeedback.warning
                ? "rounded-md border border-destructive bg-white px-4 py-3 text-sm font-medium text-destructive"
                : "rounded-md border border-border bg-white px-4 py-3 text-sm text-muted-foreground"
            }
            data-testid="catch-up-summary"
            role={catchUpFeedback.warning ? "alert" : "status"}
          >
            {catchUpFeedback.message}
          </p>
        ) : null}

        {calendarState.status !== "disconnected" ? (
          <DayGrid
            actuals={dayRecord?.actual ?? []}
            revised={dayRecord?.revised ?? []}
            editableMutationsDisabled={isSavingActualsToCalendar}
            canAddActual={canCreateActual}
            planEvents={planEvents}
            now={now}
            onAddActual={addActual}
            onStartSlack={startSlack}
            onEditEditable={(column, event) =>
              setEditableEventEditorState({
                mode: "edit",
                column,
                event,
              })
            }
            onEditableResizeEnd={persistResizedEditableEvent}
            status={calendarState.status}
            date={calendarDay.date}
            timeZone={calendarDay.timeZone}
          />
        ) : null}

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
      {editableEventTarget && editableEventEditorState ? (
        <EditableEventDialog
          column={editableEventEditorState.column}
          event={editableEventTarget}
          mode={editableEventEditorState.mode}
          onDelete={deleteEditableEventTarget}
          onDismiss={() => setEditableEventEditorState(undefined)}
          onSave={saveEditableEventDraft}
          paletteColorIds={defaultSettings.actualPaletteColorIds}
        />
      ) : null}
      {slackLaunchWarning ? (
        <div
          className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-md border border-border bg-white px-4 py-3 text-sm shadow-soft"
          role="alert"
        >
          <span>Slack may not have opened. Your time was still logged.</span>
          <button
            aria-label="Dismiss Slack warning"
            className="-mr-1 rounded-sm p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => setSlackLaunchWarning(false)}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </main>
  );
}

function getNewActualTiming(
  createdAt: Date,
  timeZone: string,
  requestedDurationMinutes: number,
) {
  const minutes = getCalendarTime(
    createdAt,
    timeZone,
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
  return {
    startMinutes: boundedStartMinutes,
    durationMinutes: Math.min(
      requestedDurationMinutes,
      24 * 60 - boundedStartMinutes,
    ),
  };
}

function getCatchUpFeedback(
  result: CatchUpRunResult,
): { message: string; warning: boolean } | undefined {
  const clauses: string[] = [];
  if (result.saved) {
    clauses.push(
      `saved ${result.saved} ${result.saved === 1 ? "Actual" : "Actuals"} to Calendar`,
    );
  }
  if (result.failed) {
    clauses.push(
      `${result.failed} ${result.failed === 1 ? "Actual" : "Actuals"} ` +
        "couldn't be saved and will be retried next time",
    );
  }
  if (result.discarded) {
    clauses.push(
      `${result.discarded} older ` +
        `${result.discarded === 1 ? "Actual was" : "Actuals were"} discarded`,
    );
  }
  if (clauses.length === 0) return undefined;
  return {
    message: `Catch-up: ${clauses.join("; ")}.`,
    warning: Boolean(result.failed || result.discarded),
  };
}
