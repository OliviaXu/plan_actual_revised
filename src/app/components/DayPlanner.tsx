import { Button } from "./ui/button";
import { Toast, type ToastAction } from "./ui/toast";
import { DayGrid } from "./DayGrid";
import { EventEditor } from "./EventEditor";
import {
  slackLaunchFailureToastContent,
  useDayPlannerToast,
} from "../hooks/use-day-planner-toast";
import { useSaveActualsToCalendar } from "../hooks/use-save-actuals-to-calendar";
import type { CalendarDay } from "../hooks/use-calendar-plan";
import { useDayRecord } from "../hooks/use-day-record";
import { useEditableEventController } from "../hooks/use-editable-event-controller";
import type { PlanEvent } from "../../domain/day-event";
import { defaultSettings } from "../../domain/settings";
import {
  useResponsiveDayGridLayoutMode,
  type AppSurface,
} from "../hooks/use-responsive-day-grid-layout-mode";

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
  const dayGridLayoutMode = useResponsiveDayGridLayoutMode(appSurface);
  const {
    dayRecord,
    loadStatus: dayRecordLoadStatus,
    persistDayRecord,
  } = useDayRecord(calendarDay);
  const toast = useDayPlannerToast();
  const calendarSave = useSaveActualsToCalendar({
    calendarDate: calendarDay.date,
    dayRecord,
    persistDayRecord,
    dayRecordLoadStatus,
    now,
    onFeedback: toast.show,
  });
  const editableMutationsDisabled =
    dayRecordLoadStatus === "loading" ||
    calendarSave.isSavingActualsToCalendar;
  const eventController = useEditableEventController({
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
          pending: calendarSave.isSavingActualsToCalendar,
          pendingLabel: "Retrying…",
          onClick: () => void calendarSave.saveActualsToCalendar(),
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
        onNewActual={eventController.openNewActualEditor}
        onStartSlack={eventController.startSlack}
        onEditEvent={eventController.openEventEditor}
        onResizeEvent={eventController.resizeEvent}
        onEventDrop={eventController.applyEventDrop}
      />
      {dayRecord?.actual.length ? (
        <footer className="flex items-center">
          <Button
            disabled={calendarSave.isSavingActualsToCalendar}
            onClick={() => void calendarSave.saveActualsToCalendar()}
            type="button"
          >
            {calendarSave.isSavingActualsToCalendar
              ? "Saving Actual"
              : "Save Actual to calendar"}
          </Button>
        </footer>
      ) : null}
      {eventController.editorState ? (
        <EventEditor
          column={eventController.editorState.column}
          event={eventController.editorState.event}
          mode={eventController.editorState.mode}
          onDelete={eventController.deleteEditorEvent}
          onDismiss={eventController.closeEditor}
          onSave={eventController.saveEditorDraft}
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
