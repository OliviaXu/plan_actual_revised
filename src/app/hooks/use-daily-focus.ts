import { useState } from "react";

import {
  mapDailyFocusToCalendarEvent,
  findDailyFocusCalendarEvent,
} from "../../calendar/calendar-event-mapping";
import { runtimeCalendarEventClient } from "../runtime-calendar-event-client";
import {
  transientToastDurationMs,
  type DayPlannerToastContent,
} from "./use-day-planner-toast";

export type DailyFocusController = {
  dailyFocusSummary: string | null | undefined;
  draft: string;
  isSaving: boolean;
  setDraft: (draft: string) => void;
  submitDailyFocus: () => Promise<void>;
};

export function useDailyFocus({
  calendarDate,
  initialSummary,
  onFeedback,
}: {
  calendarDate: string;
  initialSummary: string | null | undefined;
  onFeedback: (feedback: DayPlannerToastContent) => void;
}): DailyFocusController {
  const [dailyFocusSummary, setDailyFocusSummary] =
    useState<string | null | undefined>(initialSummary);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submitDailyFocus() {
    const summary = draft.trim();
    if (!summary || dailyFocusSummary !== undefined || isSaving) return;

    setIsSaving(true);
    const insertResponse = await runtimeCalendarEventClient.insertCalendarEvent(
      mapDailyFocusToCalendarEvent({
        date: calendarDate,
        summary,
      }),
    );

    try {
      if (insertResponse.ok) {
        setDailyFocusSummary(summary);
        onFeedback(committedDailyFocusFeedback);
        return;
      }

      const calendarResponse =
        await runtimeCalendarEventClient.listCalendarEvents();
      if (calendarResponse.ok) {
        const reconciledEvent = findDailyFocusCalendarEvent(
          calendarResponse.value.events,
          calendarDate,
        );
        if (reconciledEvent) {
          setDailyFocusSummary(reconciledEvent.summary);
          return;
        }
      }

      onFeedback({
        source: "daily-focus",
        message: "Unable to confirm today’s focus in Calendar.",
        tone: "warning",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return {
    dailyFocusSummary,
    draft,
    isSaving,
    setDraft,
    submitDailyFocus,
  };
}

const committedDailyFocusFeedback: DayPlannerToastContent = {
  source: "daily-focus",
  message: "Daily focus saved to calendar",
  tone: "plain",
  durationMs: transientToastDurationMs,
};
