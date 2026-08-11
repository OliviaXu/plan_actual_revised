import { useState } from "react";

import {
  findWeeklyPracticeCalendarEvent,
  getWeeklyPracticeMonday,
  mapWeeklyPracticeToCalendarEvent,
} from "../../calendar/calendar-event-mapping";
import type { CalendarDay } from "./use-calendar-plan";
import { runtimeCalendarEventClient } from "../runtime-calendar-event-client";
import {
  transientToastDurationMs,
  type DayPlannerToastContent,
} from "./use-day-planner-toast";

export type WeeklyPracticeState =
  | { status: "error" }
  | { status: "loaded"; summary: string | null | undefined };

export function useWeeklyPractice({
  calendarDay,
  initialSummary,
  onFeedback,
}: {
  calendarDay: CalendarDay;
  initialSummary: string | null | undefined;
  onFeedback: (feedback: DayPlannerToastContent) => void;
}) {
  const mondayDate = getWeeklyPracticeMonday(calendarDay.date);
  const [weeklyPracticeSummary, setWeeklyPracticeSummary] =
    useState<string | null | undefined>(initialSummary);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submitWeeklyPractice() {
    const summary = draft.trim();
    if (
      !summary ||
      weeklyPracticeSummary !== undefined ||
      isSaving
    ) return;
    setIsSaving(true);
    const insertResponse = await runtimeCalendarEventClient.insertCalendarEvent(
      mapWeeklyPracticeToCalendarEvent({ mondayDate, summary }),
    );
    try {
      if (insertResponse.ok) {
        setWeeklyPracticeSummary(summary);
        onFeedback({
          source: "weekly-practice",
          message: "Weekly practice saved to calendar",
          tone: "plain",
          durationMs: transientToastDurationMs,
        });
        return;
      }
      const response = await runtimeCalendarEventClient.listCalendarEventsForDate(
        mondayDate,
        calendarDay.timeZone,
      );
      const event = response.ok
        ? findWeeklyPracticeCalendarEvent(response.value.events, mondayDate)
        : undefined;
      if (event) {
        setWeeklyPracticeSummary(event.summary);
        return;
      }
      onFeedback({
        source: "weekly-practice",
        message: "Unable to confirm this week’s practice in Calendar.",
        tone: "warning",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return {
    summary: weeklyPracticeSummary,
    draft,
    isSaving,
    setDraft,
    submitWeeklyPractice,
  };
}
