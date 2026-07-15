import { describe, expect, it, vi } from "vitest";

import { handleRuntimeMessage } from "../../src/background/message-handlers";

describe("handleRuntimeMessage", () => {
  it("routes Phase 2 auth and Calendar messages through injected boundaries", async () => {
    const requestInteractiveToken = vi.fn(async () => ({
      ok: true as const,
      value: { status: "connected" as const, token: "token-123" },
    }));
    const requestCachedToken = vi.fn(async () => ({
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
          requestCachedToken,
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
          requestCachedToken,
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
    expect(requestCachedToken).toHaveBeenCalledTimes(1);
  });

  it("reports connected status from Chrome's silent token cache", async () => {
    await expect(
      handleRuntimeMessage(
        { type: "auth.getStatus" },
        {
          requestCachedToken: vi.fn(async () => ({
            ok: true as const,
            value: { status: "connected" as const, token: "token-123" },
          })),
          requestInteractiveToken: vi.fn(),
          listPrimaryCalendarEvents: vi.fn(),
        },
      ),
    ).resolves.toEqual({
      ok: true,
      value: { status: "connected" },
    });
  });

  it("requires explicit auth before Calendar list requests", async () => {
    await expect(
      handleRuntimeMessage(
        { type: "calendar.listEvents" },
        {
          requestCachedToken: vi.fn(async () => ({
            ok: false as const,
            error: {
              code: "AUTH_TOKEN_UNAVAILABLE",
              message: "OAuth2 not granted or revoked.",
              recoverable: true,
            },
          })),
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
          requestCachedToken: vi.fn(),
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
