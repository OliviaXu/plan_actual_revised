import { describe, expect, it, vi } from "vitest";

import { createCatchUpRequestHandler } from "../../src/background/catch-up-request";
import type { CatchUpDependencies } from "../../src/background/run-catch-up";
import type { CatchUpRunResult } from "../../src/shared/catch-up-run-result";

describe("createCatchUpRequestHandler", () => {
  it("coalesces overlapping catch-up requests into one worker run", async () => {
    let finishCatchUp: ((result: CatchUpRunResult) => void) | undefined;
    const catchUpRunner = vi.fn(
      (_today: string, _dependencies: CatchUpDependencies) =>
        new Promise<CatchUpRunResult>((resolve) => {
          finishCatchUp = resolve;
        }),
    );
    const runCatchUpRequest = createCatchUpRequestHandler(
      {
        listDayRecords: vi.fn(async () => ({ records: [], invalidKeys: [] })),
        saveDayRecord: vi.fn(async () => undefined),
        deleteDayRecord: vi.fn(async () => undefined),
        listCalendarEvents: vi.fn(),
        insertCalendarEvent: vi.fn(),
        now: () => new Date(2026, 6, 15, 12),
      },
      catchUpRunner,
    );

    const first = runCatchUpRequest("2026-07-16");
    const second = runCatchUpRequest("2026-07-15");

    expect(catchUpRunner).toHaveBeenCalledOnce();
    finishCatchUp?.({ saved: 1, failed: 0, discarded: 0 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, value: { saved: 1, failed: 0, discarded: 0 } },
      { ok: true, value: { saved: 1, failed: 0, discarded: 0 } },
    ]);
  });

  it("composes catch-up with its supplied dependencies", async () => {
    let receivedDependencies: CatchUpDependencies | undefined;
    const catchUpRunner = vi.fn(
      async (_today: string, dependencies: CatchUpDependencies) => {
        receivedDependencies = dependencies;
        return { saved: 0, failed: 0, discarded: 0 };
      },
    );
    const dependencies: CatchUpDependencies = {
      listDayRecords: vi.fn(async () => ({ records: [], invalidKeys: [] })),
      saveDayRecord: vi.fn(async () => undefined),
      deleteDayRecord: vi.fn(async () => undefined),
      listCalendarEvents: vi.fn(),
      insertCalendarEvent: vi.fn(),
      now: () => new Date(2026, 6, 15, 12),
    };
    const runCatchUpRequest = createCatchUpRequestHandler(
      dependencies,
      catchUpRunner,
    );

    await runCatchUpRequest("2026-07-15");

    expect(receivedDependencies).toBe(dependencies);
  });
});
