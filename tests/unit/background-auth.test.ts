import { describe, expect, it, vi } from "vitest";

import {
  requestCachedToken,
  requestInteractiveToken,
} from "../../src/background/auth";

describe("Calendar auth", () => {
  it("returns a connected auth result when Chrome identity provides a token", async () => {
    const getAuthToken = vi.fn(async () => ({ token: "token-123" }));

    await expect(requestInteractiveToken(getAuthToken)).resolves.toEqual({
      ok: true,
      value: "token-123",
    });
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: true });
  });

  it("requests Chrome's cached token without allowing auth UI", async () => {
    const getAuthToken = vi.fn(async () => ({ token: "token-123" }));

    await expect(requestCachedToken(getAuthToken)).resolves.toEqual({
      ok: true,
      value: "token-123",
    });
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: false });
  });

  it("normalizes Chrome identity failures", async () => {
    const getAuthToken = vi.fn(async () => {
      throw new Error("The user did not approve access.");
    });

    await expect(requestInteractiveToken(getAuthToken)).resolves.toEqual({
      ok: false,
      error: {
        code: "AUTH_TOKEN_UNAVAILABLE",
        message: "The user did not approve access.",
      },
    });
  });

  it("normalizes a cancelled request that returns no token", async () => {
    const getAuthToken = vi.fn(async () => ({}));

    await expect(requestInteractiveToken(getAuthToken)).resolves.toEqual({
      ok: false,
      error: {
        code: "AUTH_TOKEN_UNAVAILABLE",
        message: "Unable to get Google auth token.",
      },
    });
  });

  it("times out when Chrome leaves interactive auth pending", async () => {
    vi.useFakeTimers();
    const getAuthToken = vi.fn(() => new Promise<never>(() => undefined));

    const result = requestInteractiveToken(getAuthToken);
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(result).resolves.toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUEST_TIMED_OUT",
        message: "Google sign-in did not finish. Close the sign-in window and try again.",
      },
    });
    vi.useRealTimers();
  });
});
