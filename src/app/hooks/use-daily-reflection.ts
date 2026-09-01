import { DateTime } from "luxon";
import { useEffect, useRef, useState } from "react";

import {
  findReflectionCalendarEvent,
  mapReflectionToCalendarEvent,
} from "../../calendar/reflection-calendar-event-mapping";
import type { ReflectionSession } from "../../domain/reflection-session";
import {
  clearReflectionSession,
  loadReflectionSession,
  saveReflectionSession,
} from "../../storage/reflection-session-storage";
import { runtimeCalendarEventClient } from "../runtime-calendar-event-client";
import {
  transientToastDurationMs,
  type DayPlannerToastContent,
} from "./use-day-planner-toast";
import { getZonedTime } from "../../shared/zoned-time";

type ReflectionSessionChange = Partial<Pick<
  ReflectionSession,
  | "outcome"
  | "detail"
  | "weeklyPracticeReflection"
  | "nextExperiment"
  | "nextFrog"
>>;

export function useDailyReflection({
  calendarDate,
  calendarTimeZone,
  dailyFocusSummary,
  weeklyPracticeSummary,
  reflectionExists,
  now,
  onCompleted,
  onFeedback,
  enabled = true,
}: {
  calendarDate: string;
  calendarTimeZone: string;
  dailyFocusSummary: string | null | undefined;
  weeklyPracticeSummary: string | null | undefined;
  reflectionExists: boolean;
  now: () => Date;
  onCompleted: (date: string) => void;
  onFeedback: (feedback: DayPlannerToastContent) => void;
  enabled?: boolean;
}) {
  const [loadStatus, setLoadStatus] = useState<"loading" | "loaded">("loading");
  const [session, setSession] = useState<ReflectionSession | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const storageMutation = useRef(Promise.resolve());
  const currentWeekday = DateTime.fromISO(calendarDate, { zone: "utc" }).weekday;
  const isCalendarDateCurrent =
    calendarDate === getZonedTime(now(), calendarTimeZone).date;
  const canShowManualTrigger = loadStatus === "loaded" &&
    enabled && Boolean(
      session || (isCalendarDateCurrent && currentWeekday <= 5 && !reflectionExists),
    );

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadReflectionSession()
      .then(async (storedSession) => {
        if (!active) return;
        if (storedSession?.date === calendarDate && reflectionExists) {
          await clearReflectionSession();
          if (!active) return;
          setSession(null);
        } else {
          setSession(storedSession);
        }
      })
      .catch(() => {
        if (!active) return;
        onFeedback({
          source: "daily-reflection",
          message: "Unable to load the saved reflection.",
          tone: "warning",
        });
      })
      .finally(() => {
        if (active) setLoadStatus("loaded");
      });
    return () => {
      active = false;
    };
  }, [calendarDate, enabled, reflectionExists, onFeedback]);

  async function openManualReflection() {
    if (session) {
      setIsOpen(true);
      return;
    }
    if (!canShowManualTrigger) return;
    const focusSummary = normalizedSummary(dailyFocusSummary);
    const nextSession: ReflectionSession = {
      schemaVersion: 1,
      date: calendarDate,
      focusSummary,
      weeklyPracticeSummary: normalizedSummary(weeklyPracticeSummary),
      ...(focusSummary ? {} : { outcome: "notSet" as const }),
      detail: "",
      weeklyPracticeReflection: "",
      nextExperiment: "",
      nextFrog: "",
      snoozedUntil: null,
    };
    setSession(nextSession);
    setIsOpen(true);
    await persist(nextSession);
  }

  async function updateSession(change: ReflectionSessionChange) {
    if (!session) return;
    const nextSession = { ...session, ...change };
    setSession(nextSession);
    await persist(nextSession);
  }

  async function snooze() {
    if (!session) return;
    const nextSession = {
      ...session,
      snoozedUntil: new Date(now().getTime() + 15 * 60_000).toISOString(),
    };
    setSession(nextSession);
    setIsOpen(false);
    await persist(nextSession);
  }

  async function save() {
    if (!session || isSaving) return;
    setIsSaving(true);
    try {
      const insertResponse = await runtimeCalendarEventClient.insertCalendarEvent(
        mapReflectionToCalendarEvent(session),
      );
      if (insertResponse.ok) {
        await complete(session.date);
        return;
      }
      const calendarResponse =
        await runtimeCalendarEventClient.listCalendarEventsForDate(
          session.date,
          calendarTimeZone,
        );
      const reconciled = calendarResponse.ok
        ? findReflectionCalendarEvent(calendarResponse.value.events, session.date)
        : undefined;
      if (reconciled) {
        await complete(session.date);
        return;
      }
      onFeedback({
        source: "daily-reflection",
        message: "Reflection couldn’t be saved to Calendar.",
        tone: "warning",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function complete(date: string) {
    await queueStorageMutation(clearReflectionSession);
    setSession(null);
    setIsOpen(false);
    onCompleted(date);
    onFeedback({
      source: "daily-reflection",
      message: "Reflection saved to Calendar",
      tone: "plain",
      durationMs: transientToastDurationMs,
    });
  }

  async function persist(nextSession: ReflectionSession) {
    try {
      await queueStorageMutation(() => saveReflectionSession(nextSession));
    } catch {
      onFeedback({
        source: "daily-reflection",
        message: "Unable to save the reflection draft locally.",
        tone: "warning",
      });
    }
  }

  function queueStorageMutation(mutation: () => Promise<void>) {
    const currentMutation = storageMutation.current.then(mutation, mutation);
    storageMutation.current = currentMutation.catch(() => undefined);
    return currentMutation;
  }

  return {
    canShowManualTrigger,
    isOpen,
    isSaving,
    loadStatus,
    openManualReflection,
    save,
    session,
    snooze,
    updateSession,
  };
}

function normalizedSummary(summary: string | null | undefined) {
  return summary?.trim() || null;
}
