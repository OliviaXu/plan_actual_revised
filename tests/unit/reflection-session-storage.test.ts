import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearReflectionSession,
  loadReflectionSession,
  saveReflectionSession,
} from "../../src/storage/reflection-session-storage";
import type { ReflectionSession } from "../../src/domain/reflection-session";

const session: ReflectionSession = {
  schemaVersion: 1,
  date: "2026-07-15",
  focusSummary: null,
  weeklyPracticeSummary: null,
  outcome: "notSet",
  detail: "Moved the rollout forward.",
  weeklyPracticeReflection: "",
  nextExperiment: "",
  nextFrog: "",
  snoozedUntil: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("reflection session storage", () => {
  it("loads, saves, and clears the dedicated session", async () => {
    const get = vi.fn().mockResolvedValue({ reflectionSession: session });
    const set = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: { local: { get, set, remove } } });

    await expect(loadReflectionSession()).resolves.toEqual(session);
    await saveReflectionSession(session);
    await clearReflectionSession();

    expect(get).toHaveBeenCalledWith("reflectionSession");
    expect(set).toHaveBeenCalledWith({ reflectionSession: session });
    expect(remove).toHaveBeenCalledWith("reflectionSession");
  });

  it("rejects an invalid stored session", async () => {
    vi.stubGlobal("chrome", {
      storage: { local: { get: vi.fn().mockResolvedValue({
        reflectionSession: { schemaVersion: 9 },
      }) } },
    });
    await expect(loadReflectionSession()).rejects.toThrow(
      "Stored reflection uses an invalid format.",
    );
  });
});
