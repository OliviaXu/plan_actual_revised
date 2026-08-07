import { useState } from "react";

import { getZonedTime } from "../../shared/zoned-time";
import { buildEditedActual } from "../../domain/actual-event-edit";
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
import { defaultSettings } from "../../config/settings";
import type { DayGridDropOperation } from "./use-day-grid-drag-drop";
import type { EventEditorDraft } from "../components/EventEditor";
import type { CalendarDay } from "./use-calendar-plan";

export type EventEditorState =
  | { mode: "create"; column: "actual"; event: ActualEvent }
  | { mode: "edit"; column: EditableColumn; event: EditableEvent };

export type EditableEventController = {
  editorState: EventEditorState | undefined;
  openNewActualEditor: () => void;
  openEventEditor: (
    column: EditableColumn,
    event: EditableEvent,
  ) => void;
  saveEditorDraft: (draft: EventEditorDraft) => void;
  deleteEditorEvent: () => void;
  closeEditor: () => void;
  startSlack: (intention: string) => void;
  resizeEvent: (
    column: EditableColumn,
    eventId: string,
    durationMinutes: number,
  ) => void;
  applyEventDrop: (operation: DayGridDropOperation) => void;
};

const defaultActualDurationMinutes = 30;

export function useEditableEventController({
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
}): EditableEventController {
  const [editorState, setEditorState] =
    useState<EventEditorState>();

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

  function addEvent(addition: EditableEventAddition) {
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

  function startSlack(intention: string) {
    if (mutationsDisabled) return;

    const newActual = buildNewActual({
      summary: intention,
      requestedDurationMinutes: defaultSettings.slackDefaultDurationMinutes,
      colorId: defaultSettings.slackColorId,
      isSlack: true,
      createdAt: now(),
    });
    addEvent({ column: "actual", event: newActual });
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

  function saveEditorDraft(draft: EventEditorDraft) {
    if (!editorState) {
      closeEditor();
      return;
    }
    const editorEvent = editorState.event;
    if (editorState.mode === "create") {
      addEvent({
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

  function resizeEvent(
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

      const copiedEvent: EditableEvent = {
        id: crypto.randomUUID(),
        summary: planEvent.summary,
        startMinutes: operation.startMinutes,
        durationMinutes: planEvent.durationMinutes,
        colorId: planEvent.colorId,
        sourceCalendarEventId: planEvent.id,
      };
      const addition: EditableEventAddition =
        operation.targetColumn === "actual"
          ? {
              column: "actual",
              event: { ...copiedEvent, saveDisposition: "unsaved" },
            }
          : { column: "revised", event: copiedEvent };
      addEvent(addition);
      return;
    }

    if (!dayRecord) return;
    const nextDayRecord = moveEditableEvent({
      record: dayRecord,
      sourceColumn: operation.sourceColumn,
      sourceEventId: operation.sourceEventId,
      targetColumn: operation.targetColumn,
      startMinutes: operation.startMinutes,
      updatedAt: now().toISOString(),
      createId: () => crypto.randomUUID(),
    });
    if (nextDayRecord) {
      void persistDayRecord(nextDayRecord);
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
    resizeEvent,
    applyEventDrop,
  };
}

function getNewActualTiming(
  createdAt: Date,
  timeZone: string,
  requestedDurationMinutes: number,
) {
  const minutes = getZonedTime(createdAt, timeZone).minutesSinceMidnight;
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
