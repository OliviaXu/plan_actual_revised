import { useEffect, useState } from "react";
import { DateTime } from "luxon";

import {
  findDailyFocusCalendarEvent,
  findWeeklyPracticeCalendarEvent,
  getWeeklyPracticeMonday,
  isWeeklyPracticeVisible,
  mapCalendarEventsToPlanEvents,
} from "../../calendar/calendar-event-mapping";
import { findReflectionCalendarEvent } from "../../calendar/reflection-calendar-event-mapping";
import type { PlanEvent } from "../../domain/day-event";
import { defaultSettings } from "../../config/settings";
import { getZonedTime } from "../../shared/zoned-time";
import { runtimeCalendarEventClient } from "../runtime-calendar-event-client";
import type { WeeklyPracticeState } from "./use-weekly-practice";

export type CalendarState =
  | { status: "loading" }
  | { status: "disconnected"; errorMessage?: string }
  | { status: "connecting" }
  | {
      status: "connected";
      planEvents: PlanEvent[];
      dailyFocusSummary: string | null | undefined;
      dailyReflectionExists: boolean;
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

    const authResponse = await runtimeCalendarEventClient.requestInteractiveToken();

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
  }

  return {
    calendarState,
    calendarDay,
    connectCalendar,
  };
}

async function requestCalendarPlan(): Promise<CalendarPlanLoadResult> {
  const response = await runtimeCalendarEventClient.listCalendarEvents();
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
        dailyReflectionExists: Boolean(findReflectionCalendarEvent(
          response.value.events,
          response.value.date,
        )),
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
}

async function loadWeeklyPractice(
  calendarDay: CalendarDay,
): Promise<WeeklyPracticeState> {
  const mondayDate = getWeeklyPracticeMonday(calendarDay.date);
  const response = await runtimeCalendarEventClient.listCalendarEventsForDate(
    mondayDate,
    calendarDay.timeZone,
  );
  if (!response.ok) return { status: "error" };
  const event = findWeeklyPracticeCalendarEvent(response.value.events, mondayDate);
  return event
    ? { status: "loaded", summary: event.summary }
    : { status: "loaded", summary: undefined };
}
