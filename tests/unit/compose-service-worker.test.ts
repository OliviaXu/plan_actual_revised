import { describe, expect, it, vi } from "vitest";

import { createServiceWorkerOperations } from "../../src/background/compose-service-worker";

describe("createServiceWorkerOperations", () => {
  it("translates successful interactive auth into a connected response", async () => {
    const operations = createServiceWorkerOperations({
      openAppPage: vi.fn(async () => undefined),
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
    });

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
    const operations = createServiceWorkerOperations({
      openAppPage: vi.fn(async () => undefined),
      requestCachedToken: vi.fn(),
      requestInteractiveToken: vi.fn(async () => authFailure),
      listPrimaryCalendarEvents: vi.fn(),
      insertPrimaryCalendarEvent: vi.fn(),
      listDayRecords: vi.fn(async () => ({ records: [], invalidKeys: [] })),
      saveDayRecord: vi.fn(async () => undefined),
      deleteDayRecord: vi.fn(async () => undefined),
    });

    await expect(operations.connectCalendar()).resolves.toBe(authFailure);
  });
});
