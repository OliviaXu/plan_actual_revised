import { useEffect, useState } from "react";
import { DateTime } from "luxon";

import {
  findDailyFocusCalendarEvent,
  findWeeklyPracticeCalendarEvent,
  getWeeklyPracticeMonday,
  isWeeklyPracticeVisible,
  mapCalendarEventsToPlanEvents,
} from "../../calendar/calendar-event-mapping";
import type { PlanEvent } from "../../domain/day-event";
import { defaultSettings } from "../../config/settings";
import { getZonedTime } from "../../shared/zoned-time";
import { sendRuntimeMessage } from "../../shared/runtime-messages";
import type { WeeklyPracticeState } from "./use-weekly-practice";

export type CalendarState =
  | { status: "loading" }
  | { status: "disconnected"; errorMessage?: string }
  | { status: "connecting" }
  | {
      status: "connected";
      planEvents: PlanEvent[];
      dailyFocusSummary: string | null | undefined;
      weeklyPracticeState?: WeeklyPracticeState;
    }
  | { status: "error"; message: string };

export type CalendarDay = {
  date: string;
  timeZone: string;
};

type CalendarPlanLoadResult = {
  calendarState: CalendarState;
  calendarDay?: CalendarDay;
};

export function useCalendarPlan(now: () => Date) {
  const [calendarState, setCalendarState] = useState<CalendarState>({
    status: "loading",
  });
  const [calendarDay, setCalendarDay] = useState<CalendarDay>(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      date: getZonedTime(now(), timeZone).date,
      timeZone,
    };
  });

  function setWeeklyPracticeState(weeklyPracticeState: WeeklyPracticeState) {
    setCalendarState((current) => current.status === "connected"
      ? { ...current, weeklyPracticeState }
      : current);
  }

  useEffect(() => {
    let active = true;
    void requestCalendarPlan().then((result) => {
      if (!active) return;
      if (result.calendarDay) setCalendarDay(result.calendarDay);
      setCalendarState(result.calendarState);
      if (
        result.calendarDay &&
        result.calendarState.status === "connected" &&
        result.calendarState.weeklyPracticeState === undefined &&
        isWeeklyPracticeVisible(result.calendarDay.date)
      ) {
        void loadWeeklyPractice(result.calendarDay).then(setWeeklyPracticeState);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function connectCalendar() {
    setCalendarState({ status: "connecting" });

    try {
      const authResponse = await sendRuntimeMessage({
        type: "auth.requestInteractiveToken",
      });

      if (!authResponse.ok) {
        setCalendarState({
          status: "disconnected",
          errorMessage: authResponse.error.message,
        });
        return;
      }

      setCalendarState({ status: "loading" });
      const result = await requestCalendarPlan();
      if (result.calendarDay) setCalendarDay(result.calendarDay);
      setCalendarState(result.calendarState);
      if (
        result.calendarDay &&
        result.calendarState.status === "connected" &&
        result.calendarState.weeklyPracticeState === undefined &&
        isWeeklyPracticeVisible(result.calendarDay.date)
      ) {
        void loadWeeklyPractice(result.calendarDay).then(setWeeklyPracticeState);
      }
    } catch {
      setCalendarState({
        status: "disconnected",
        errorMessage: "Unable to reach the background Calendar boundary.",
      });
    }
  }

  return { calendarState, calendarDay, connectCalendar };
}

async function requestCalendarPlan(): Promise<CalendarPlanLoadResult> {
  try {
    const response = await sendRuntimeMessage({ type: "calendar.listEvents" });
    if (response.ok) {
      const isMonday = DateTime.fromISO(response.value.date, {
        zone: "utc",
      }).weekday === 1;
      const weeklyPracticeEvent = isMonday
        ? findWeeklyPracticeCalendarEvent(
            response.value.events,
            response.value.date,
          )
        : undefined;
      return {
        calendarDay: {
          date: response.value.date,
          timeZone: response.value.timeZone,
        },
        calendarState: {
          status: "connected",
          dailyFocusSummary: findDailyFocusCalendarEvent(
            response.value.events,
            response.value.date,
          )?.summary,
          ...(isMonday
            ? {
                weeklyPracticeState: {
                  status: "loaded" as const,
                  summary: weeklyPracticeEvent?.summary,
                },
              }
            : {}),
          planEvents: mapCalendarEventsToPlanEvents(
            response.value.events,
            response.value.date,
            response.value.timeZone,
            defaultSettings.hiddenPlanColorIds,
          ),
        },
      };
    }

    if (response.error.code === "AUTH_NOT_CONNECTED") {
      return { calendarState: { status: "disconnected" } };
    }

    return {
      calendarState: {
        status: "error",
        message: response.error.message,
      },
    };
  } catch {
    return {
      calendarState: {
        status: "error",
        message: "Unable to reach the background Calendar boundary.",
      },
    };
  }
}

async function loadWeeklyPractice(
  calendarDay: CalendarDay,
): Promise<WeeklyPracticeState> {
  const mondayDate = getWeeklyPracticeMonday(calendarDay.date);
  try {
    const response = await sendRuntimeMessage({
      type: "calendar.listEventsForDate",
      date: mondayDate,
      timeZone: calendarDay.timeZone,
    });
    if (!response.ok) return { status: "error" };
    const event = findWeeklyPracticeCalendarEvent(response.value.events, mondayDate);
    return event
      ? { status: "loaded", summary: event.summary }
      : { status: "loaded", summary: undefined };
  } catch {
    return { status: "error" };
  }
}
