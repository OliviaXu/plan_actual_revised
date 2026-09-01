import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../../src/calendar/calendar-event";
import {
  findReflectionCalendarEvent,
  mapReflectionToCalendarEvent,
  reflectionCalendarEventId,
} from "../../src/calendar/reflection-calendar-event-mapping";
import type { ReflectionSession } from "../../src/domain/reflection-session";

function session(overrides: Partial<ReflectionSession> = {}): ReflectionSession {
  return {
    schemaVersion: 1,
    date: "2026-07-15",
    focusSummary: "Write the difficult proposal",
    weeklyPracticeSummary: "Ask one better question",
    outcome: "done",
    detail: "Protected the first hour and finished it.",
    weeklyPracticeReflection: "I listened before proposing a fix.",
    nextExperiment: "Start offline.",
    nextFrog: "Review the launch risks.",
    snoozedUntil: null,
    ...overrides,
  };
}

describe("reflection Calendar mapping", () => {
  it("uses a deterministic ID and readable private all-day event", () => {
    expect(reflectionCalendarEventId("2026-07-15"))
      .toBe("parreflection20260715");
    expect(mapReflectionToCalendarEvent(session())).toEqual({
      id: "parreflection20260715",
      summary: "[Done] Write the difficult proposal",
      description: [
        "Daily focus: Write the difficult proposal",
        "Outcome: Done",
        "Reflection: Protected the first hour and finished it.",
        "Weekly practice: Ask one better question",
        "Weekly practice reflection: I listened before proposing a fix.",
        "Next experiment: Start offline.",
        "Next frog: Review the launch risks.",
      ].join("\n"),
      start: { date: "2026-07-15" },
      end: { date: "2026-07-16" },
      visibility: "private",
      transparency: "transparent",
      reminders: { useDefault: false },
      extendedProperties: {
        private: { planActualRevisedReflection: "true" },
      },
    });
  });

  it("uses required detail for a missing focus and omits unanswered sections", () => {
    expect(mapReflectionToCalendarEvent(session({
      focusSummary: null,
      weeklyPracticeSummary: null,
      outcome: "notSet",
      detail: "Helped unblock the customer rollout.",
      weeklyPracticeReflection: "",
      nextExperiment: "",
      nextFrog: "",
    }))).toMatchObject({
      summary: "[Not set] Helped unblock the customer rollout.",
      description: [
        "Daily focus: Not set",
        "Outcome: Not set",
        "Reflection: Helped unblock the customer rollout.",
      ].join("\n"),
    });
  });

  it("truncates long titles to 80 Unicode characters", () => {
    const event = mapReflectionToCalendarEvent(session({
      focusSummary: "🐸".repeat(80),
    }));
    expect(Array.from(event.summary)).toHaveLength(80);
    expect(event.summary.endsWith("…")).toBe(true);
  });

  it("finds only a marked reflection on the requested date", () => {
    const events: CalendarEvent[] = [{
      kind: "allDay",
      id: "parreflection20260715",
      summary: "[Done] Frog",
      description: "Reflection: Good day",
      colorId: null,
      startDate: "2026-07-15",
      endDate: "2026-07-16",
      isReflection: true,
    }];
    expect(findReflectionCalendarEvent(events, "2026-07-15"))
      .toMatchObject({ id: "parreflection20260715" });
    expect(findReflectionCalendarEvent(events, "2026-07-16"))
      .toBeUndefined();
  });
});
