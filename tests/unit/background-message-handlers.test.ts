import { describe, expect, it, vi } from "vitest";

import { handleRuntimeMessage } from "../../src/background/message-handlers";

describe("handleRuntimeMessage", () => {
  it("routes Phase 2 auth and Calendar messages through injected boundaries", async () => {
    const requestInteractiveToken = vi.fn(async () => ({
      ok: true as const,
      value: { status: "connected" as const, token: "token-123" },
    }));
    const listPrimaryCalendarEvents = vi.fn(async () => ({
      ok: true as const,
      value: { eventCount: 3 },
    }));

    await expect(
      handleRuntimeMessage(
        { type: "auth.requestInteractiveToken" },
        {
          getCachedToken: () => undefined,
          requestInteractiveToken,
          listPrimaryCalendarEvents,
        },
      ),
    ).resolves.toEqual({
      ok: true,
      value: { status: "connected" },
    });

    await expect(
      handleRuntimeMessage(
        { type: "calendar.listEvents" },
        {
          getCachedToken: () => "token-123",
          requestInteractiveToken,
          listPrimaryCalendarEvents,
        },
      ),
    ).resolves.toEqual({
      ok: true,
      value: { eventCount: 3 },
    });

    expect(listPrimaryCalendarEvents).toHaveBeenCalledWith("token-123");
    expect(requestInteractiveToken).toHaveBeenCalledTimes(1);
  });

  it("requires explicit auth before Calendar list requests", async () => {
    await expect(
      handleRuntimeMessage(
        { type: "calendar.listEvents" },
        {
          getCachedToken: () => undefined,
          requestInteractiveToken: vi.fn(),
          listPrimaryCalendarEvents: vi.fn(),
        },
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "AUTH_NOT_CONNECTED",
        message: "Connect Calendar before requesting events.",
        recoverable: true,
      },
    });
  });

  it("returns a normalized error for unknown messages", async () => {
    await expect(
      handleRuntimeMessage(
        { type: "nope" },
        {
          getCachedToken: () => undefined,
          requestInteractiveToken: vi.fn(),
          listPrimaryCalendarEvents: vi.fn(),
        },
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "UNKNOWN_MESSAGE",
        message: "Unsupported runtime message.",
        recoverable: false,
      },
    });
  });
});
