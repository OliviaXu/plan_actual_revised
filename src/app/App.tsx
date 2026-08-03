import { CalendarDays, CircleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./components/ui/button";
import { CalendarSurfaceTransition } from "./components/CalendarSurfaceTransition";
import { DayGrid } from "./components/DayGrid";
import type { DayGridDropOperation } from "./components/day-grid-drag";
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
import {
  appendEditableEvent,
  moveEditableEvent,
  type EditableEventAddition,
} from "../domain/day-record-edit";
import { buildPlanCopy } from "../domain/editable-event-drag";
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
import {
  useDayGridLayoutMode,
  type AppSurface,
} from "./side-panel-layout";

type EditableEventEditorState =
  | { mode: "create"; column: "actual"; event: ActualEvent }
  | { mode: "edit"; column: EditableColumn; event: EditableEvent };

const readSystemTime = () => new Date();
const openSlackProtocol = () => {
  window.open("slack://open", "_self");
};
const reloadAppPage = () => window.location.reload();
const defaultActualDurationMinutes = 30;

export function App({
  now = readSystemTime,
  launchSlack = openSlackProtocol,
  reloadPage = reloadAppPage,
  surface = "standalone",
}: {
  now?: () => Date;
  launchSlack?: () => void;
  reloadPage?: () => void;
  surface?: AppSurface;
}) {
  const sidePanel = surface === "side-panel";
  const dayGridLayoutMode = useDayGridLayoutMode(surface);
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
  const planEvents =
    calendarState.status === "connected" ? calendarState.planEvents : [];
  const dragDisabled =
    !calendarConnected ||
    actualLoadStatus === "loading" ||
    isSavingActualsToCalendar;
  const isCalendarCheckingIn =
    calendarState.status === "loading" ||
    calendarState.status === "connecting";
  const calendarSurfaceKey = isCalendarCheckingIn
    ? "check-in"
    : calendarState.status;

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

  function persistAddedEditableEvent(addition: EditableEventAddition) {
    void persistDayRecord(
      appendEditableEvent({
        record: dayRecord,
        day: calendarDay,
        addition,
        updatedAt: now().toISOString(),
      }),
    );
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
    persistAddedEditableEvent({ column: "actual", event: newActual });
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
      persistAddedEditableEvent({ column: "actual", event: newActual });
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

  function persistEditableDrop(operation: DayGridDropOperation) {
    if (dragDisabled) return;

    if (operation.sourceColumn === "plan") {
      const planEvent = planEvents.find(
        (event) => event.id === operation.sourceEventId,
      );
      if (!planEvent) return;

      const copiedEvent = buildPlanCopy(
        planEvent,
        operation.startMinutes,
        crypto.randomUUID(),
      );
      const addition: EditableEventAddition =
        operation.targetColumn === "actual"
          ? {
              column: "actual",
              event: { ...copiedEvent, saveDisposition: "unsaved" },
            }
          : { column: "revised", event: copiedEvent };
      persistAddedEditableEvent(addition);
      return;
    }

    if (!dayRecord) return;
    const movedRecord = moveEditableEvent({
      record: dayRecord,
      sourceColumn: operation.sourceColumn,
      sourceEventId: operation.sourceEventId,
      targetColumn: operation.targetColumn,
      startMinutes: operation.startMinutes,
      updatedAt: now().toISOString(),
      createId: () => crypto.randomUUID(),
    });
    if (movedRecord) {
      void persistDayRecord(movedRecord);
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

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-app-surface={surface}
    >
      <section className={sidePanel
        ? "flex w-full flex-col gap-3 px-2 py-3"
        : "mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8"}
      >
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
              <h1 className={sidePanel
                ? "text-lg font-semibold tracking-normal"
                : "text-2xl font-semibold tracking-normal"}
              >
                Plan / Actual / Revised
              </h1>
            </div>
          </div>
        </header>

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

        <CalendarSurfaceTransition surfaceKey={calendarSurfaceKey}>
          {isCalendarCheckingIn ? (
            <section
              aria-live="polite"
              className="grid w-fit grid-cols-[auto_1fr] items-start gap-x-2 py-1"
              data-testid="calendar-check-in"
              role="status"
            >
              <span aria-hidden="true" className="text-base leading-6">
                👋
              </span>
              <div className="min-w-0">
                <p className="calendar-check-in-greeting relative w-fit text-base font-medium leading-6">
                  Let’s shape today.
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Checking in with your calendar…
                </p>
              </div>
            </section>
          ) : calendarState.status === "disconnected" ? (
            <section className="py-1" aria-label="Calendar connection">
              {calendarState.errorMessage ? (
                <p
                  className="mb-3 text-sm font-medium text-destructive"
                  data-testid="calendar-error"
                  role="alert"
                >
                  {calendarState.errorMessage}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Connect Google Calendar to show today&apos;s plan
              </p>
              <Button
                className="mt-3"
                type="button"
                onClick={() => void connectCalendar()}
              >
                Connect Calendar
              </Button>
            </section>
          ) : calendarState.status === "error" ? (
            <section
              className="grid w-fit grid-cols-[auto_1fr] items-start gap-x-2 py-1"
              role="alert"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-1 h-4 w-4 text-destructive"
                data-testid="calendar-error-icon"
              />
              <div className="min-w-0">
                <h2 className="text-base font-medium leading-6">
                  Unable to load today&apos;s plan
                </h2>
                <p
                  className="mt-0.5 text-sm text-muted-foreground"
                  data-testid="calendar-error"
                >
                  {calendarState.message}
                </p>
                <Button
                  className="mt-3"
                  onClick={reloadPage}
                  type="button"
                >
                  Refresh page
                </Button>
              </div>
            </section>
          ) : (
            <DayGrid
              actuals={dayRecord?.actual ?? []}
              revised={dayRecord?.revised ?? []}
              dragDisabled={dragDisabled}
              editableMutationsDisabled={isSavingActualsToCalendar}
              canAddActual={canCreateActual}
              layoutMode={dayGridLayoutMode}
              planEvents={calendarState.planEvents}
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
              onDropEditable={persistEditableDrop}
              date={calendarDay.date}
              timeZone={calendarDay.timeZone}
            />
          )}
        </CalendarSurfaceTransition>

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
