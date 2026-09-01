import { DateTime } from "luxon";

import type { ReflectionSession } from "../domain/reflection-session";
import type { CalendarEvent, CalendarInsertEvent } from "./calendar-event";

const outcomeLabels = {
  done: "Done",
  madeProgress: "Made Progress",
  didntGetTo: "Didn't get to",
  notSet: "Not set",
} as const;

export function reflectionCalendarEventId(date: string) {
  return `parreflection${date.replaceAll("-", "")}`;
}

export function mapReflectionToCalendarEvent(
  session: ReflectionSession,
): CalendarInsertEvent {
  if (!session.outcome || !session.detail.trim()) {
    throw new Error("A completed reflection requires an outcome and detail.");
  }
  const outcome = outcomeLabels[session.outcome];
  const titleSubject = session.focusSummary?.trim() || session.detail.trim();
  const description = [
    `Daily focus: ${session.focusSummary?.trim() || "Not set"}`,
    `Outcome: ${outcome}`,
    `Reflection: ${session.detail.trim()}`,
    ...(session.weeklyPracticeSummary?.trim()
      ? [`Weekly practice: ${session.weeklyPracticeSummary.trim()}`]
      : []),
    ...(session.weeklyPracticeReflection.trim()
      ? [`Weekly practice reflection: ${session.weeklyPracticeReflection.trim()}`]
      : []),
    ...(session.nextExperiment.trim()
      ? [`Next experiment: ${session.nextExperiment.trim()}`]
      : []),
    ...(session.nextFrog.trim()
      ? [`Next frog: ${session.nextFrog.trim()}`]
      : []),
  ].join("\n");

  return {
    id: reflectionCalendarEventId(session.date),
    summary: truncateTitle(`[${outcome}] ${titleSubject}`),
    description,
    start: { date: session.date },
    end: {
      date: DateTime.fromISO(session.date, { zone: "utc" })
        .plus({ days: 1 })
        .toISODate()!,
    },
    visibility: "private",
    transparency: "transparent",
    reminders: { useDefault: false },
    extendedProperties: {
      private: { planActualRevisedReflection: "true" },
    },
  };
}

export function findReflectionCalendarEvent(
  events: CalendarEvent[],
  date: string,
) {
  return events.find(
    (event) => event.kind === "allDay" &&
      event.startDate === date &&
      event.isReflection,
  );
}

function truncateTitle(title: string) {
  const characters = Array.from(title);
  return characters.length <= 80
    ? title
    : `${characters.slice(0, 79).join("")}…`;
}
