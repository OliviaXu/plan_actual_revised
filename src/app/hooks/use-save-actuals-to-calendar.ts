import { useEffect, useState } from "react";

import type { DayRecord } from "../../domain/day-record";
import type { CatchUpRunResult } from "../../shared/catch-up-run-result";
import type { Result } from "../../shared/result";
import { sendRuntimeMessage } from "../../shared/runtime-messages";
import { syncDayActualsToCalendar } from "../../workflows/sync-day-actuals-to-calendar";
import {
  getCalendarSaveToastContent,
  getCatchUpToastContent,
  type DayPlannerToastContent,
} from "./use-day-planner-toast";
import { runtimeCalendarEventClient } from "../runtime-calendar-event-client";
import type { DayRecordLoadStatus } from "./use-day-record";

export type ActualsToCalendarSaveResult = {
  isSavingActualsToCalendar: boolean;
  saveActualsToCalendar: () => Promise<void>;
};

export function useSaveActualsToCalendar({
  calendarDate,
  dayRecord,
  persistDayRecord,
  dayRecordLoadStatus,
  now,
  onFeedback,
}: {
  calendarDate: string;
  dayRecord: DayRecord | null;
  persistDayRecord: (record: DayRecord) => Promise<void>;
  dayRecordLoadStatus: DayRecordLoadStatus;
  now: () => Date;
  onFeedback: (feedback: DayPlannerToastContent) => void;
}): ActualsToCalendarSaveResult {
  const [isSavingActualsToCalendar, setIsSavingActualsToCalendar] =
    useState(false);

  useEffect(() => {
    if (dayRecordLoadStatus !== "loaded") return;

    let active = true;
    void requestCatchUp(calendarDate).then((response) => {
      if (!active) return;
      const feedback = getCatchUpToastContent(response);
      if (feedback) onFeedback(feedback);
    });

    return () => {
      active = false;
    };
  }, [calendarDate, dayRecordLoadStatus, onFeedback]);

  async function saveActualsToCalendar() {
    if (!dayRecord || isSavingActualsToCalendar) return;

    setIsSavingActualsToCalendar(true);
    try {
      const result = await syncDayActualsToCalendar({
        record: dayRecord,
        now,
        persistDayRecord,
        ...runtimeCalendarEventClient,
      });
      onFeedback(getCalendarSaveToastContent(result));
    } finally {
      setIsSavingActualsToCalendar(false);
    }
  }

  return { isSavingActualsToCalendar, saveActualsToCalendar };
}

async function requestCatchUp(
  todayDate: string,
): Promise<Result<CatchUpRunResult>> {
  try {
    return await sendRuntimeMessage({ type: "catchUp.run", todayDate });
  } catch {
    return {
      ok: false,
      error: {
        code: "CATCH_UP_BOUNDARY_UNAVAILABLE",
        message: "Unable to reach the background service.",
      },
    };
  }
}
