import { describe, expect, it } from "vitest";

import {
  normalizeReflectionSession,
  type ReflectionSession,
} from "../../src/domain/reflection-session";

const session: ReflectionSession = {
  schemaVersion: 1,
  date: "2026-07-15",
  focusSummary: "Write the difficult proposal",
  weeklyPracticeSummary: "Ask one better question",
  outcome: "madeProgress",
  detail: "The outline is clear now.",
  weeklyPracticeReflection: "I paused before offering advice.",
  nextExperiment: "Start without Slack.",
  nextFrog: "Finish the first draft.",
  snoozedUntil: "2026-07-15T23:45:00.000Z",
};

describe("ReflectionSession", () => {
  it("normalizes a persisted in-progress session", () => {
    expect(normalizeReflectionSession(session)).toEqual(session);
  });

  it("accepts an untouched draft with frozen missing context", () => {
    expect(normalizeReflectionSession({
      schemaVersion: 1,
      date: "2026-07-15",
      focusSummary: null,
      weeklyPracticeSummary: null,
      detail: "",
      weeklyPracticeReflection: "",
      nextExperiment: "",
      nextFrog: "",
      snoozedUntil: null,
    })).toEqual({
      schemaVersion: 1,
      date: "2026-07-15",
      focusSummary: null,
      weeklyPracticeSummary: null,
      detail: "",
      weeklyPracticeReflection: "",
      nextExperiment: "",
      nextFrog: "",
      snoozedUntil: null,
    });
  });

  it.each([
    { ...session, schemaVersion: 2 },
    { ...session, date: "July 15" },
    { ...session, focusSummary: undefined },
    { ...session, outcome: "almost" },
    { ...session, snoozedUntil: "later" },
  ])("rejects malformed persisted data", (value) => {
    expect(normalizeReflectionSession(value)).toBeNull();
  });
});
