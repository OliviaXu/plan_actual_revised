import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "./components/ui/button";
import { Toast, type ToastAction } from "./components/ui/toast";
import { DayCanvas } from "./components/DayCanvas";
import type { DayGridDropOperation } from "./components/day-grid-drag";
import {
  EditableEventDialog,
  type EditableEventDraft,
} from "./components/EditableEventDialog";
import type {
  ActualEvent,
  EditableColumn,
  EditableEvent,
  PlanEvent,
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
import { runtimeCalendarEventClient } from "./runtime-calendar-event-client";
import type { CalendarDay } from "./hooks/use-calendar-plan";
import { useDayRecord } from "./hooks/use-day-record";
import { getCalendarTime } from "../calendar/calendar-time";
import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import type { Result } from "../shared/result";
import { sendRuntimeMessage } from "../shared/runtime-messages";
import {
  syncDayActualsToCalendar,
  type SyncDayActualsResult,
} from "../workflows/sync-day-actuals-to-calendar";
import {
  useDayGridLayoutMode,
  type AppSurface,
} from "./side-panel-layout";

type EditableEventEditorState =
  | { mode: "create"; column: "actual"; event: ActualEvent }
  | { mode: "edit"; column: EditableColumn; event: EditableEvent };

type AppToast = {
  id: number;
  source: "calendar-save" | "catch-up" | "slack-launch";
  message: string;
  tone: "plain" | "warning";
  durationMs?: number;
};

type AppToastContent = Omit<AppToast, "id">;

const defaultActualDurationMinutes = 30;
const transientToastDurationMs = 5_000;

export function DayPlanner({
  appSurface = "standalone",
  calendarDay,
  launchSlack,
  now,
  planEvents,
}: {
  appSurface?: AppSurface;
  calendarDay: CalendarDay;
  launchSlack: () => void;
  now: () => Date;
  planEvents: PlanEvent[];
}) {
  const sidePanel = appSurface === "side-panel";
  const dayGridLayoutMode = useDayGridLayoutMode(appSurface);
  const {
    dayRecord,
    loadStatus: actualLoadStatus,
    persistDayRecord,
  } = useDayRecord(calendarDay);
  const [isSavingActualsToCalendar, setIsSavingActualsToCalendar] =
    useState(false);
  const [toast, setToast] = useState<AppToast>();
  const nextToastIdRef = useRef(0);
  const [editableEventEditorState, setEditableEventEditorState] =
    useState<EditableEventEditorState>();
  const editableEventTarget = editableEventEditorState?.event;
  const canCreateActual =
    actualLoadStatus !== "loading" &&
    !isSavingActualsToCalendar;
  const dragDisabled =
    actualLoadStatus === "loading" ||
    isSavingActualsToCalendar;

  const showToast = useCallback((content: AppToastContent) => {
    setToast({ id: ++nextToastIdRef.current, ...content });
  }, []);
  const clearToast = useCallback(() => setToast(undefined), []);
  useEffect(() => {
    if (actualLoadStatus !== "loaded") return;

    let active = true;
    void requestCatchUp(calendarDay.date).then((response) => {
      if (!active) return;
      const feedback = getCatchUpToast(response);
      if (feedback) showToast(feedback);
    });

    return () => {
      active = false;
    };
  }, [actualLoadStatus, calendarDay.date, showToast]);

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
    try {
      launchSlack();
    } catch {
      showToast({
        source: "slack-launch",
        message: "Slack may not have opened. Your time was still logged.",
        tone: "warning",
        durationMs: transientToastDurationMs,
      });
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

    try {
      const result = await syncDayActualsToCalendar({
        record: dayRecord,
        now,
        persistDayRecord,
        ...runtimeCalendarEventClient,
      });
      showToast(getCalendarSaveToast(result));
    } finally {
      setIsSavingActualsToCalendar(false);
    }
  }

  const toastAction: ToastAction | undefined =
    toast?.source === "calendar-save" && toast.tone === "warning"
      ? {
          label: "Retry save",
          pending: isSavingActualsToCalendar,
          pendingLabel: "Retrying…",
          onClick: () => void handleSaveActualsToCalendar(),
        }
      : undefined;

  return (
    <div
      className={sidePanel
        ? "flex min-w-0 flex-col gap-3"
        : "flex min-w-0 flex-col gap-6"}
    >
      <DayCanvas
        actuals={dayRecord?.actual ?? []}
        revised={dayRecord?.revised ?? []}
        dragDisabled={dragDisabled}
        editableMutationsDisabled={isSavingActualsToCalendar}
        canAddActual={canCreateActual}
        layoutMode={dayGridLayoutMode}
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
        onDropEditable={persistEditableDrop}
        date={calendarDay.date}
        timeZone={calendarDay.timeZone}
      />
      {dayRecord?.actual.length ? (
        <footer className="flex items-center">
          <Button
            disabled={isSavingActualsToCalendar}
            onClick={() => void handleSaveActualsToCalendar()}
            type="button"
          >
            {isSavingActualsToCalendar
              ? "Saving Actual"
              : "Save Actual to calendar"}
          </Button>
        </footer>
      ) : null}
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
      {toast ? (
        <Toast
          action={toastAction}
          durationMs={toast.durationMs}
          key={toast.id}
          message={toast.message}
          onDismiss={clearToast}
          onDurationEnd={clearToast}
          testId={`${toast.source}-toast`}
          tone={toast.tone}
        />
      ) : null}
    </div>
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

function getCalendarSaveToast(result: SyncDayActualsResult): AppToastContent {
  if (result.status === "nothingToSync") {
    return {
      source: "calendar-save",
      message: "Nothing new to save.",
      tone: "plain",
      durationMs: transientToastDurationMs,
    };
  }
  if (result.status === "planLookupFailed") {
    return {
      source: "calendar-save",
      message:
        `Unable to check Calendar. ${formatActualCount(result.failed)} ` +
        `${result.failed === 1 ? "wasn’t" : "weren’t"} saved.`,
      tone: "warning",
    };
  }

  const clauses: string[] = [];
  if (result.saved) {
    clauses.push(`Saved ${formatActualCount(result.saved)} to Calendar`);
  }
  if (result.matched) {
    clauses.push(`${formatActualCount(result.matched)} matched Plan`);
  }
  if (result.failed) {
    clauses.push(`${formatActualCount(result.failed)} couldn’t be saved`);
  }
  return {
    source: "calendar-save",
    message: `${clauses.join("; ")}.`,
    tone: result.failed ? "warning" : "plain",
    ...(!result.failed ? { durationMs: transientToastDurationMs } : {}),
  };
}

function getCatchUpToast(
  response: Result<CatchUpRunResult>,
): AppToastContent | undefined {
  if (!response.ok) {
    return {
      source: "catch-up",
      message: `Catch-up unavailable: ${response.error.message}`,
      tone: "warning",
    };
  }

  const result = response.value;
  const clauses: string[] = [];
  if (result.saved) {
    clauses.push(
      `saved ${result.saved} ${result.saved === 1 ? "Actual" : "Actuals"} to Calendar`,
    );
  }
  if (result.failed) {
    clauses.push(
      `${result.failed} ${result.failed === 1 ? "Actual" : "Actuals"} ` +
        "couldn’t be saved",
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
    source: "catch-up",
    message: `Catch-up: ${clauses.join("; ")}.`,
    tone: result.failed || result.discarded ? "warning" : "plain",
    ...(result.failed || result.discarded
      ? {}
      : { durationMs: transientToastDurationMs }),
  };
}

function formatActualCount(count: number) {
  return `${count} ${count === 1 ? "Actual" : "Actuals"}`;
}

async function requestCatchUp(
  todayDate: string,
): Promise<Result<CatchUpRunResult>> {
  try {
    return await sendRuntimeMessage({ type: "catchUp.run", todayDate });
  } catch {
    return {
      ok: false,
      error: {
        code: "CATCH_UP_BOUNDARY_UNAVAILABLE",
        message: "Unable to reach the background service.",
      },
    };
  }
}
