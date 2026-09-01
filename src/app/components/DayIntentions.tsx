import { NotebookPen } from "lucide-react";
import { useState } from "react";

import { isWeeklyPracticeVisible } from "../../calendar/calendar-event-mapping";
import { IconButton } from "./ui/button";
import { DailyReflectionDialog } from "./DailyReflectionDialog";
import { IntentionBanner } from "./IntentionBanner";
import { useDailyFocus } from "../hooks/use-daily-focus";
import { useDailyReflection } from "../hooks/use-daily-reflection";
import type { CalendarDay } from "../hooks/use-calendar-plan";
import {
  useWeeklyPractice,
  type WeeklyPracticeState,
} from "../hooks/use-weekly-practice";
import type { AppSurface } from "../hooks/use-responsive-day-grid-layout-mode";
import type { DayPlannerToastContent } from "../hooks/use-day-planner-toast";

export function DayIntentions({
  appSurface,
  calendarDay,
  dailyFocusSummary,
  dailyReflectionExists,
  now,
  onFeedback,
  weeklyPracticeState,
}: {
  appSurface: AppSurface;
  calendarDay: CalendarDay;
  dailyFocusSummary: string | null | undefined;
  dailyReflectionExists: boolean;
  now: () => Date;
  onFeedback: (feedback: DayPlannerToastContent) => void;
  weeklyPracticeState?: WeeklyPracticeState;
}) {
  const [reflectionExists, setReflectionExists] = useState(
    dailyReflectionExists,
  );
  const dailyFocus = useDailyFocus({
    calendarDate: calendarDay.date,
    initialSummary: dailyFocusSummary,
    onFeedback,
  });
  const loadedWeeklyPracticeSummary =
    weeklyPracticeState?.status === "loaded"
      ? weeklyPracticeState.summary
      : undefined;
  const weeklyPractice = useWeeklyPractice({
    calendarDay,
    loadedSummary: loadedWeeklyPracticeSummary,
    onFeedback,
  });
  const reflection = useDailyReflection({
    calendarDate: calendarDay.date,
    calendarTimeZone: calendarDay.timeZone,
    dailyFocusSummary: dailyFocus.dailyFocusSummary,
    weeklyPracticeSummary: weeklyPractice.summary,
    reflectionExists,
    enabled: appSurface !== "side-panel",
    now,
    onCompleted: (date) => {
      if (date === calendarDay.date) setReflectionExists(true);
    },
    onFeedback,
  });

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="relative">
        {appSurface !== "side-panel" && reflection.canShowManualTrigger ? (
          <IconButton
            aria-label="Reflect on today"
            className="absolute -top-5 left-0 z-10 border border-amber-200 bg-amber-50 text-amber-800 shadow-sm hover:bg-amber-100 hover:text-amber-950"
            onClick={() => void reflection.openManualReflection()}
            tone="muted"
          >
            <NotebookPen aria-hidden="true" className="h-4 w-4" />
          </IconButton>
        ) : null}
        <IntentionBanner
          kind="daily-focus"
          draft={dailyFocus.draft}
          summary={dailyFocus.dailyFocusSummary}
          isSaving={dailyFocus.isSaving}
          onDraftChange={dailyFocus.setDraft}
          onSubmit={() => void dailyFocus.submitDailyFocus()}
        />
      </div>
      {isWeeklyPracticeVisible(calendarDay.date) &&
      weeklyPracticeState?.status === "loaded" ? (
        <IntentionBanner
          kind="weekly-practice"
          draft={weeklyPractice.draft}
          summary={weeklyPractice.summary}
          isSaving={weeklyPractice.isSaving}
          onDraftChange={weeklyPractice.setDraft}
          onSubmit={() => void weeklyPractice.submitWeeklyPractice()}
        />
      ) : null}
      {reflection.isOpen && reflection.session ? (
        <DailyReflectionDialog
          isSaving={reflection.isSaving}
          onChange={(change) => void reflection.updateSession(change)}
          onSave={() => void reflection.save()}
          onSnooze={() => void reflection.snooze()}
          session={reflection.session}
        />
      ) : null}
    </div>
  );
}
