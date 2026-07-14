import type { Result } from "../shared/result";

export type ConnectedAuth = {
  status: "connected";
  token: string;
};

export type ChromeIdentityBoundary = {
  getAuthToken: (
    details: chrome.identity.TokenDetails,
    callback: (token?: string) => void,
  ) => void;
  getLastError?: () => chrome.runtime.LastError | undefined;
};

export function getAuthStatus(cachedToken?: string): Result<{
  status: "connected" | "disconnected";
}> {
  return {
    ok: true,
    value: { status: cachedToken ? "connected" : "disconnected" },
  };
}

export function requestInteractiveToken(
  identity: ChromeIdentityBoundary = chrome.identity,
  timeoutMs = 60_000,
): Promise<Result<ConnectedAuth>> {
  return new Promise((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      resolve({
        ok: false,
        error: {
          code: "AUTH_REQUEST_TIMED_OUT",
          message:
            "Google sign-in did not finish. Close the sign-in window and try again.",
          recoverable: true,
        },
      });
    }, timeoutMs);

    identity.getAuthToken({ interactive: true }, (token?: string) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      const lastError =
        identity.getLastError?.() ??
        (typeof chrome === "undefined" ? undefined : chrome.runtime.lastError);

      if (lastError || !token) {
        resolve({
          ok: false,
          error: {
            code: "AUTH_TOKEN_UNAVAILABLE",
            message: lastError?.message ?? "Unable to get Google auth token.",
            recoverable: true,
          },
        });
        return;
      }

      resolve({
        ok: true,
        value: { status: "connected", token },
      });
    });
  });
}
