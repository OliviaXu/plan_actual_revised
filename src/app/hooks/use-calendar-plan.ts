import { useEffect, useState } from "react";

import { getCalendarTime } from "../../calendar/calendar-time";
import type { PlanEvent } from "../../domain/day-event";
import { toPlanEvents } from "../../domain/plan-event";
import { defaultSettings } from "../../domain/settings";
import { sendRuntimeMessage } from "../../shared/runtime-messages";

export type CalendarState =
  | { status: "loading" }
  | { status: "disconnected"; errorMessage?: string }
  | { status: "connecting" }
  | { status: "connected"; planEvents: PlanEvent[] }
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
      date: getCalendarTime(now(), timeZone).date,
      timeZone,
    };
  });

  useEffect(() => {
    let active = true;
    void requestCalendarPlan().then((result) => {
      if (!active) return;
      if (result.calendarDay) setCalendarDay(result.calendarDay);
      setCalendarState(result.calendarState);
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
      return {
        calendarDay: {
          date: response.value.date,
          timeZone: response.value.timeZone,
        },
        calendarState: {
          status: "connected",
          planEvents: toPlanEvents(
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
