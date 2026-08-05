import { useCallback, useRef, useState } from "react";

import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import type { Result } from "../shared/result";
import type { SyncDayActualsResult } from "../workflows/sync-day-actuals-to-calendar";

export type DayPlannerToastContent = {
  source: "calendar-save" | "catch-up" | "slack-launch";
  message: string;
  tone: "plain" | "warning";
  durationMs?: number;
};

export type DayPlannerToast = DayPlannerToastContent & { id: number };

export type DayPlannerToastResult = {
  current: DayPlannerToast | undefined;
  show: (content: DayPlannerToastContent) => void;
  clear: () => void;
};

export const transientToastDurationMs = 5_000;

export const slackLaunchFailureToastContent: DayPlannerToastContent = {
  source: "slack-launch",
  message: "Slack may not have opened. Your time was still logged.",
  tone: "warning",
  durationMs: transientToastDurationMs,
};

export function useDayPlannerToast(): DayPlannerToastResult {
  const [current, setCurrent] = useState<DayPlannerToast>();
  const nextIdRef = useRef(0);

  const show = useCallback((content: DayPlannerToastContent) => {
    setCurrent({ id: ++nextIdRef.current, ...content });
  }, []);
  const clear = useCallback(() => setCurrent(undefined), []);

  return { current, show, clear };
}

export function getCalendarSaveToastContent(
  result: SyncDayActualsResult,
): DayPlannerToastContent {
  if (result.status === "nothingToSync") {
    return {
      source: "calendar-save",
      message: "Nothing new to save.",
      tone: "plain",
      durationMs: transientToastDurationMs,
    };
  }
  if (result.status === "planLookupFailed") {
    return {
      source: "calendar-save",
      message:
        `Unable to check Calendar. ${formatActualCount(result.failed)} ` +
        `${result.failed === 1 ? "wasn’t" : "weren’t"} saved.`,
      tone: "warning",
    };
  }

  const clauses: string[] = [];
  if (result.saved) {
    clauses.push(`Saved ${formatActualCount(result.saved)} to Calendar`);
  }
  if (result.matched) {
    clauses.push(`${formatActualCount(result.matched)} matched Plan`);
  }
  if (result.failed) {
    clauses.push(`${formatActualCount(result.failed)} couldn’t be saved`);
  }
  return {
    source: "calendar-save",
    message: `${clauses.join("; ")}.`,
    tone: result.failed ? "warning" : "plain",
    ...(!result.failed ? { durationMs: transientToastDurationMs } : {}),
  };
}

export function getCatchUpToastContent(
  response: Result<CatchUpRunResult>,
): DayPlannerToastContent | undefined {
  if (!response.ok) {
    return {
      source: "catch-up",
      message: `Catch-up unavailable: ${response.error.message}`,
      tone: "warning",
    };
  }

  const result = response.value;
  const clauses: string[] = [];
  if (result.saved) {
    clauses.push(
      `saved ${result.saved} ${result.saved === 1 ? "Actual" : "Actuals"} to Calendar`,
    );
  }
  if (result.failed) {
    clauses.push(
      `${result.failed} ${result.failed === 1 ? "Actual" : "Actuals"} ` +
        "couldn’t be saved",
    );
  }
  if (result.discarded) {
    clauses.push(
      `${result.discarded} older ` +
        `${result.discarded === 1 ? "Actual was" : "Actuals were"} discarded`,
    );
  }
  if (clauses.length === 0) return undefined;
  return {
    source: "catch-up",
    message: `Catch-up: ${clauses.join("; ")}.`,
    tone: result.failed || result.discarded ? "warning" : "plain",
    ...(result.failed || result.discarded
      ? {}
      : { durationMs: transientToastDurationMs }),
  };
}

function formatActualCount(count: number) {
  return `${count} ${count === 1 ? "Actual" : "Actuals"}`;
}
