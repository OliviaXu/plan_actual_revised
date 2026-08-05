import { useState } from "react";

import { getCalendarTime } from "../../calendar/calendar-time";
import { buildEditedActual } from "../../domain/actual-edit";
import type {
  ActualEvent,
  EditableColumn,
  EditableEvent,
  PlanEvent,
  RevisedEvent,
} from "../../domain/day-event";
import type { DayRecord } from "../../domain/day-record";
import {
  appendEditableEvent,
  moveEditableEvent,
  type EditableEventAddition,
} from "../../domain/day-record-edit";
import { buildPlanCopy } from "../../domain/editable-event-drag";
import { defaultSettings } from "../../domain/settings";
import type { DayGridDropOperation } from "../components/day-grid-drag";
import type { EditableEventDraft } from "../components/EditableEventDialog";
import type { CalendarDay } from "./use-calendar-plan";

export type EditableEventEditorState =
  | { mode: "create"; column: "actual"; event: ActualEvent }
  | { mode: "edit"; column: EditableColumn; event: EditableEvent };

export type EditableDayEventsResult = {
  editorState: EditableEventEditorState | undefined;
  openNewActualEditor: () => void;
  openEventEditor: (
    column: EditableColumn,
    event: EditableEvent,
  ) => void;
  saveEditorDraft: (draft: EditableEventDraft) => void;
  deleteEditorEvent: () => void;
  closeEditor: () => void;
  startSlack: (reason: string) => void;
  resizeEditableEvent: (
    column: EditableColumn,
    eventId: string,
    durationMinutes: number,
  ) => void;
  applyEventDrop: (operation: DayGridDropOperation) => void;
};

const defaultActualDurationMinutes = 30;

export function useEditableDayEvents({
  calendarDay,
  dayRecord,
  persistDayRecord,
  mutationsDisabled,
  now,
  planEvents,
  launchSlack,
  onSlackLaunchFailure,
}: {
  calendarDay: CalendarDay;
  dayRecord: DayRecord | null;
  persistDayRecord: (record: DayRecord) => Promise<void>;
  mutationsDisabled: boolean;
  now: () => Date;
  planEvents: PlanEvent[];
  launchSlack: () => void;
  onSlackLaunchFailure: () => void;
}): EditableDayEventsResult {
  const [editorState, setEditorState] =
    useState<EditableEventEditorState>();

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

  function addEditableEvent(addition: EditableEventAddition) {
    void persistDayRecord(
      appendEditableEvent({
        record: dayRecord,
        day: calendarDay,
        addition,
        updatedAt: now().toISOString(),
      }),
    );
  }

  function openNewActualEditor() {
    if (mutationsDisabled) return;

    const newActual = buildNewActual({
      summary: "Untitled",
      requestedDurationMinutes: defaultActualDurationMinutes,
      colorId: defaultSettings.defaultActualColorId,
      createdAt: now(),
    });
    setEditorState({
      mode: "create",
      column: "actual",
      event: newActual,
    });
  }

  function startSlack(reason: string) {
    if (mutationsDisabled) return;

    const newActual = buildNewActual({
      summary: reason,
      requestedDurationMinutes: defaultSettings.slackDefaultDurationMinutes,
      colorId: defaultSettings.slackColorId,
      isSlack: true,
      createdAt: now(),
    });
    addEditableEvent({ column: "actual", event: newActual });
    try {
      launchSlack();
    } catch {
      onSlackLaunchFailure();
    }
  }

  function openEventEditor(
    column: EditableColumn,
    event: EditableEvent,
  ) {
    setEditorState({ mode: "edit", column, event });
  }

  function closeEditor() {
    setEditorState(undefined);
  }

  function saveEditorDraft(draft: EditableEventDraft) {
    if (!editorState) {
      closeEditor();
      return;
    }
    const editorEvent = editorState.event;
    if (editorState.mode === "create") {
      addEditableEvent({
        column: "actual",
        event: { ...editorState.event, ...draft },
      });
      closeEditor();
      return;
    }
    if (!dayRecord) {
      closeEditor();
      return;
    }
    if (
      draft.summary === editorEvent.summary &&
      draft.durationMinutes === editorEvent.durationMinutes &&
      draft.colorId === editorEvent.colorId
    ) {
      closeEditor();
      return;
    }

    let nextDayRecord: DayRecord;
    if (editorState.column === "actual") {
      const editedActual = buildEditedActual(
        editorEvent as ActualEvent,
        draft,
        () => crypto.randomUUID(),
      );
      nextDayRecord = {
        ...dayRecord,
        actual: dayRecord.actual.map((actual) =>
          actual.id === editorEvent.id ? editedActual : actual,
        ),
      };
    } else {
      const editedRevised: RevisedEvent = { ...editorEvent, ...draft };
      nextDayRecord = {
        ...dayRecord,
        revised: dayRecord.revised.map((event) =>
          event.id === editorEvent.id ? editedRevised : event,
        ),
      };
    }
    void persistDayRecord({
      ...nextDayRecord,
      updatedAt: now().toISOString(),
    });
    closeEditor();
  }

  function deleteEditorEvent() {
    if (editorState?.mode !== "edit" || !dayRecord) {
      closeEditor();
      return;
    }

    const editorEvent = editorState.event;
    const column = editorState.column;
    void persistDayRecord({
      ...dayRecord,
      [column]: dayRecord[column].filter(
        (event) => event.id !== editorEvent.id,
      ),
      updatedAt: now().toISOString(),
    });
    closeEditor();
  }

  function resizeEditableEvent(
    column: EditableColumn,
    eventId: string,
    durationMinutes: number,
  ) {
    if (!dayRecord || mutationsDisabled) return;

    const event = dayRecord[column].find(
      (candidate) => candidate.id === eventId,
    );
    if (!event || event.durationMinutes === durationMinutes) return;

    let nextDayRecord: DayRecord;
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
      nextDayRecord = {
        ...dayRecord,
        actual: dayRecord.actual.map((actual) =>
          actual.id === eventId ? resizedActual : actual,
        ),
      };
    } else {
      nextDayRecord = {
        ...dayRecord,
        revised: dayRecord.revised.map((revised) =>
          revised.id === eventId
            ? { ...revised, durationMinutes }
            : revised,
        ),
      };
    }
    void persistDayRecord({
      ...nextDayRecord,
      updatedAt: now().toISOString(),
    });
  }

  function applyEventDrop(operation: DayGridDropOperation) {
    if (mutationsDisabled) return;

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
      addEditableEvent(addition);
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

  return {
    editorState,
    openNewActualEditor,
    openEventEditor,
    saveEditorDraft,
    deleteEditorEvent,
    closeEditor,
    startSlack,
    resizeEditableEvent,
    applyEventDrop,
  };
}

function getNewActualTiming(
  createdAt: Date,
  timeZone: string,
  requestedDurationMinutes: number,
) {
  const minutes = getCalendarTime(createdAt, timeZone).minutesSinceMidnight;
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
