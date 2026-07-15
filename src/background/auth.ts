import type { Result } from "../shared/result";

const AUTH_TOKEN_REQUEST_TIMEOUT_MS = 60_000;
const AUTH_TOKEN_UNAVAILABLE_CODE = "AUTH_TOKEN_UNAVAILABLE";

type GetAuthToken = (
  details: chrome.identity.TokenDetails,
) => Promise<chrome.identity.GetAuthTokenResult>;

const getChromeAuthToken: GetAuthToken = (details) =>
  chrome.identity.getAuthToken(details);

export async function requestInteractiveToken(
  getAuthToken: GetAuthToken = getChromeAuthToken,
): Promise<Result<string>> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<Result<string>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        ok: false,
        error: {
          code: "AUTH_REQUEST_TIMED_OUT",
          message:
            "Google sign-in did not finish. Close the sign-in window and try again.",
        },
      });
    }, AUTH_TOKEN_REQUEST_TIMEOUT_MS);
  });

  const result = await Promise.race([
    requestToken(true, getAuthToken),
    timeout,
  ]);
  clearTimeout(timeoutId!);
  return result;
}

export function requestCachedToken(
  getAuthToken: GetAuthToken = getChromeAuthToken,
): Promise<Result<string>> {
  return requestToken(false, getAuthToken);
}

async function requestToken(
  interactive: boolean,
  getAuthToken: GetAuthToken,
): Promise<Result<string>> {
  try {
    const { token } = await getAuthToken({ interactive });

    return token
      ? { ok: true, value: token }
      : {
          ok: false,
          error: {
            code: AUTH_TOKEN_UNAVAILABLE_CODE,
            message: "Unable to get Google auth token.",
          },
        };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: AUTH_TOKEN_UNAVAILABLE_CODE,
        message:
          error instanceof Error
            ? error.message
            : "Unable to get Google auth token.",
      },
    };
  }
}
