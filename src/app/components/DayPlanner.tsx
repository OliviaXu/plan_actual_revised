import { Button } from "./ui/button";
import { DayGrid } from "./DayGrid";
import { EventEditor } from "./EventEditor";
import {
  slackLaunchFailureToastContent,
  type DayPlannerToastContent,
} from "../hooks/use-day-planner-toast";
import { useSaveActualsToCalendar } from "../hooks/use-save-actuals-to-calendar";
import type { CalendarDay } from "../hooks/use-calendar-plan";
import { useDayRecord } from "../hooks/use-day-record";
import { useEditableEventController } from "../hooks/use-editable-event-controller";
import type { PlanEvent } from "../../domain/day-event";
import { defaultSettings } from "../../config/settings";
import {
  useResponsiveDayGridLayoutMode,
  type AppSurface,
} from "../hooks/use-responsive-day-grid-layout-mode";

export function DayPlanner({
  appSurface = "standalone",
  calendarDay,
  launchSlack,
  now,
  onFeedback,
  planEvents,
}: {
  appSurface?: AppSurface;
  calendarDay: CalendarDay;
  launchSlack: () => void;
  now: () => Date;
  onFeedback: (feedback: DayPlannerToastContent) => void;
  planEvents: PlanEvent[];
}) {
  const dayGridLayoutMode = useResponsiveDayGridLayoutMode(appSurface);
  const {
    dayRecord,
    loadStatus: dayRecordLoadStatus,
    persistDayRecord,
  } = useDayRecord(calendarDay);
  const calendarSave = useSaveActualsToCalendar({
    calendarDate: calendarDay.date,
    dayRecord,
    persistDayRecord,
    dayRecordLoadStatus,
    now,
    onFeedback,
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
      onFeedback(slackLaunchFailureToastContent),
  });

  return (
    <div
      className="flex min-w-0 flex-col gap-6"
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
              ? "Saving…"
              : "Save to Calendar"}
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
    </div>
  );
}
