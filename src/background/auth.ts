import type { Result } from "../shared/result";

const AUTH_TOKEN_REQUEST_TIMEOUT_MS = 60_000;

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

export function requestInteractiveToken(
  identity: ChromeIdentityBoundary = chrome.identity,
  timeoutMs = AUTH_TOKEN_REQUEST_TIMEOUT_MS,
): Promise<Result<ConnectedAuth>> {
  return requestToken(true, identity, timeoutMs);
}

export function requestCachedToken(
  identity: ChromeIdentityBoundary = chrome.identity,
  timeoutMs = AUTH_TOKEN_REQUEST_TIMEOUT_MS,
): Promise<Result<ConnectedAuth>> {
  return requestToken(false, identity, timeoutMs);
}

function requestToken(
  interactive: boolean,
  identity: ChromeIdentityBoundary,
  timeoutMs: number,
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

    identity.getAuthToken({ interactive }, (token?: string) => {
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
