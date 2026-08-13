import { Button } from "./ui/button";
import { Toast, type ToastAction } from "./ui/toast";
import { DayGrid } from "./DayGrid";
import { IntentionBanner } from "./IntentionBanner";
import { EventEditor } from "./EventEditor";
import {
  slackLaunchFailureToastContent,
  useDayPlannerToast,
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
import { useDailyFocus } from "../hooks/use-daily-focus";
import {
  useWeeklyPractice,
  type WeeklyPracticeState,
} from "../hooks/use-weekly-practice";
import {
  isWeeklyPracticeVisible,
} from "../../calendar/calendar-event-mapping";

export function DayPlanner({
  appSurface = "standalone",
  calendarDay,
  dailyFocusSummary,
  launchSlack,
  now,
  planEvents,
  weeklyPracticeState,
}: {
  appSurface?: AppSurface;
  calendarDay: CalendarDay;
  dailyFocusSummary?: string | null;
  launchSlack: () => void;
  now: () => Date;
  planEvents: PlanEvent[];
  weeklyPracticeState?: WeeklyPracticeState;
}) {
  const dayGridLayoutMode = useResponsiveDayGridLayoutMode(appSurface);
  const {
    dayRecord,
    loadStatus: dayRecordLoadStatus,
    persistDayRecord,
  } = useDayRecord(calendarDay);
  const toast = useDayPlannerToast();
  const dailyFocus = useDailyFocus({
    calendarDate: calendarDay.date,
    initialSummary: dailyFocusSummary,
    onFeedback: toast.show,
  });
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
      className="flex min-w-0 flex-col gap-6"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <IntentionBanner
          kind="daily-focus"
          draft={dailyFocus.draft}
          summary={dailyFocus.dailyFocusSummary}
          isSaving={dailyFocus.isSaving}
          onDraftChange={dailyFocus.setDraft}
          onSubmit={() => void dailyFocus.submitDailyFocus()}
        />
        {isWeeklyPracticeVisible(calendarDay.date) &&
        weeklyPracticeState?.status === "loaded" ? (
          <WeeklyPracticeController
            calendarDay={calendarDay}
            initialSummary={weeklyPracticeState.summary}
            onFeedback={toast.show}
          />
        ) : null}
      </div>
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

function WeeklyPracticeController({
  calendarDay,
  initialSummary,
  onFeedback,
}: {
  calendarDay: CalendarDay;
  initialSummary: string | null | undefined;
  onFeedback: (feedback: DayPlannerToastContent) => void;
}) {
  const weeklyPractice = useWeeklyPractice({
    calendarDay,
    initialSummary,
    onFeedback,
  });

  return (
    <IntentionBanner
      kind="weekly-practice"
      draft={weeklyPractice.draft}
      summary={weeklyPractice.summary}
      isSaving={weeklyPractice.isSaving}
      onDraftChange={weeklyPractice.setDraft}
      onSubmit={() => void weeklyPractice.submitWeeklyPractice()}
    />
  );
}
