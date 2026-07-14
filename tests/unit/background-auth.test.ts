import { describe, expect, it, vi } from "vitest";

import { requestInteractiveToken } from "../../src/background/auth";

describe("requestInteractiveToken", () => {
  it("returns a connected auth result when Chrome identity provides a token", async () => {
    const getAuthToken = vi.fn((_details, callback) => callback("token-123"));

    await expect(requestInteractiveToken({ getAuthToken })).resolves.toEqual({
      ok: true,
      value: { status: "connected", token: "token-123" },
    });
  });

  it("normalizes Chrome identity failures", async () => {
    const getAuthToken = vi.fn((_details, callback) => callback(undefined));

    await expect(
      requestInteractiveToken({
        getAuthToken,
        getLastError: () => ({
          message: "The user did not approve access.",
        }),
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "AUTH_TOKEN_UNAVAILABLE",
        message: "The user did not approve access.",
        recoverable: true,
      },
    });
  });

  it("returns a recoverable error when Chrome leaves the auth request pending", async () => {
    vi.useFakeTimers();
    const getAuthToken = vi.fn(() => undefined);

    const result = requestInteractiveToken({ getAuthToken }, 1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUEST_TIMED_OUT",
        message: "Google sign-in did not finish. Close the sign-in window and try again.",
        recoverable: true,
      },
    });
    vi.useRealTimers();
  });
});
