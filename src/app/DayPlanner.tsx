import { Button } from "./components/ui/button";
import { Toast, type ToastAction } from "./components/ui/toast";
import { DayGrid } from "./components/DayGrid";
import { EditableEventDialog } from "./components/EditableEventDialog";
import {
  slackLaunchFailureToastContent,
  useDayPlannerToast,
} from "./day-planner-toast";
import { useActualCalendarSync } from "./hooks/use-actual-calendar-sync";
import type { CalendarDay } from "./hooks/use-calendar-plan";
import { useDayRecord } from "./hooks/use-day-record";
import { useEditableDayEvents } from "./hooks/use-editable-day-events";
import type { PlanEvent } from "../domain/day-event";
import { defaultSettings } from "../domain/settings";
import {
  useDayGridLayoutMode,
  type AppSurface,
} from "./side-panel-layout";

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
    loadStatus: dayRecordLoadStatus,
    persistDayRecord,
  } = useDayRecord(calendarDay);
  const toast = useDayPlannerToast();
  const calendarSync = useActualCalendarSync({
    calendarDate: calendarDay.date,
    dayRecord,
    persistDayRecord,
    dayRecordLoadStatus,
    now,
    onFeedback: toast.show,
  });
  const editableMutationsDisabled =
    dayRecordLoadStatus === "loading" ||
    calendarSync.isSavingActualsToCalendar;
  const editableDay = useEditableDayEvents({
    calendarDay,
    dayRecord,
    persistDayRecord,
    mutationsDisabled: editableMutationsDisabled,
    now,
    planEvents,
    launchSlack,
    onSlackLaunchFailure: () =>
      toast.show(slackLaunchFailureToastContent),
  });
  const toastAction: ToastAction | undefined =
    toast.current?.source === "calendar-save" &&
      toast.current.tone === "warning"
      ? {
          label: "Retry save",
          pending: calendarSync.isSavingActualsToCalendar,
          pendingLabel: "Retrying…",
          onClick: () => void calendarSync.saveActualsToCalendar(),
        }
      : undefined;

  return (
    <div
      className={sidePanel
        ? "flex min-w-0 flex-col gap-3"
        : "flex min-w-0 flex-col gap-6"}
    >
      <DayGrid
        calendarDay={calendarDay}
        now={now}
        planEvents={planEvents}
        actuals={dayRecord?.actual ?? []}
        revised={dayRecord?.revised ?? []}
        layoutMode={dayGridLayoutMode}
        mutationsDisabled={editableMutationsDisabled}
        onAddActual={editableDay.openNewActualEditor}
        onStartSlack={editableDay.startSlack}
        onEditEditable={editableDay.openEventEditor}
        onEditableResizeEnd={editableDay.resizeEditableEvent}
        onDropEditable={editableDay.applyEventDrop}
      />
      {dayRecord?.actual.length ? (
        <footer className="flex items-center">
          <Button
            disabled={calendarSync.isSavingActualsToCalendar}
            onClick={() => void calendarSync.saveActualsToCalendar()}
            type="button"
          >
            {calendarSync.isSavingActualsToCalendar
              ? "Saving Actual"
              : "Save Actual to calendar"}
          </Button>
        </footer>
      ) : null}
      {editableDay.editorState ? (
        <EditableEventDialog
          column={editableDay.editorState.column}
          event={editableDay.editorState.event}
          mode={editableDay.editorState.mode}
          onDelete={editableDay.deleteEditorEvent}
          onDismiss={editableDay.closeEditor}
          onSave={editableDay.saveEditorDraft}
          paletteColorIds={defaultSettings.actualPaletteColorIds}
        />
      ) : null}
      {toast.current ? (
        <Toast
          action={toastAction}
          durationMs={toast.current.durationMs}
          key={toast.current.id}
          message={toast.current.message}
          onDismiss={toast.clear}
          onDurationEnd={toast.clear}
          testId={`${toast.current.source}-toast`}
          tone={toast.current.tone}
        />
      ) : null}
    </div>
  );
}
