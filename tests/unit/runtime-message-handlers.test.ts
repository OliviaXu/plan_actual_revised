import { describe, expect, it, vi } from "vitest";

import { createRuntimeMessageHandlers } from "../../src/background/runtime-message-handlers";
import type { CatchUpDependencies } from "../../src/background/run-catch-up";
import type { CatchUpRunResult } from "../../src/shared/catch-up-run-result";

function dependencies() {
  return {
    requestCachedToken: vi.fn(async () => ({
      ok: true as const,
      value: "token-123",
    })),
    requestInteractiveToken: vi.fn(async () => ({
      ok: true as const,
      value: "token-123",
    })),
    listPrimaryCalendarEvents: vi.fn(),
    insertPrimaryCalendarEvent: vi.fn(),
    listDayRecords: vi.fn(async () => ({ records: [], invalidKeys: [] })),
    saveDayRecord: vi.fn(async () => undefined),
    deleteDayRecord: vi.fn(async () => undefined),
  };
}

describe("createRuntimeMessageHandlers", () => {
  it("translates successful interactive auth into a connected response", async () => {
    const operations = createRuntimeMessageHandlers(dependencies());

    await expect(operations.connectCalendar()).resolves.toEqual({
      ok: true,
      value: { status: "connected" },
    });
  });

  it("forwards an interactive auth failure", async () => {
    const authFailure = {
      ok: false as const,
      error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "Access denied." },
    };
    const operations = createRuntimeMessageHandlers({
      ...dependencies(),
      requestInteractiveToken: vi.fn(async () => authFailure),
    });

    await expect(operations.connectCalendar()).resolves.toBe(authFailure);
  });

  it("lets overlapping dates share the first catch-up run", async () => {
    let finishCatchUp: ((result: CatchUpRunResult) => void) | undefined;
    const catchUpRunner = vi.fn(
      (_today: string, _dependencies: CatchUpDependencies) =>
        new Promise<CatchUpRunResult>((resolve) => {
          finishCatchUp = resolve;
        }),
    );
    const handlers = createRuntimeMessageHandlers(dependencies(), {
      catchUpRunner,
    });

    const first = handlers.runCatchUp("2026-07-16");
    const second = handlers.runCatchUp("2026-07-15");

    expect(catchUpRunner).toHaveBeenCalledOnce();
    expect(catchUpRunner).toHaveBeenCalledWith(
      "2026-07-16",
      expect.anything(),
    );
    finishCatchUp?.({ saved: 1, failed: 0, discarded: 0 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, value: { saved: 1, failed: 0, discarded: 0 } },
      { ok: true, value: { saved: 1, failed: 0, discarded: 0 } },
    ]);
  });

  it("composes catch-up with its supplied dependencies", async () => {
    let receivedDependencies: CatchUpDependencies | undefined;
    const catchUpRunner = vi.fn(
      async (_today: string, supplied: CatchUpDependencies) => {
        receivedDependencies = supplied;
        return { saved: 0, failed: 0, discarded: 0 };
      },
    );
    const deps = dependencies();
    const handlers = createRuntimeMessageHandlers(deps, {
      now: () => new Date(2026, 6, 15, 12),
      catchUpRunner,
    });

    await handlers.runCatchUp("2026-07-15");

    expect(receivedDependencies).toMatchObject({
      listDayRecords: deps.listDayRecords,
      saveDayRecord: deps.saveDayRecord,
      deleteDayRecord: deps.deleteDayRecord,
    });
  });

  it("lets unexpected catch-up failures reach the service-worker boundary", async () => {
    const failure = new Error("Catch-up crashed.");
    const handlers = createRuntimeMessageHandlers(dependencies(), {
      catchUpRunner: vi.fn(async () => {
        throw failure;
      }),
    });

    await expect(handlers.runCatchUp("2026-07-15")).rejects.toBe(failure);
  });
});
