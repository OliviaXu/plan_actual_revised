import type { Result } from "../shared/result";
import { getAuthStatus, type ConnectedAuth } from "./auth";
import {
  unknownMessageResult,
  type AuthStatusResponse,
  type AuthTokenResponse,
  type CalendarListEventsResponse,
} from "./messages";

type RuntimeMessageLike = {
  type?: string;
};

export type RuntimeDependencies = {
  requestInteractiveToken: () => Promise<Result<ConnectedAuth>>;
  listPrimaryCalendarEvents: (token: string) => Promise<CalendarListEventsResponse>;
  getCachedToken: () => string | undefined;
};

export async function handleRuntimeMessage(
  message: RuntimeMessageLike,
  dependencies: RuntimeDependencies,
): Promise<
  AuthStatusResponse | AuthTokenResponse | CalendarListEventsResponse | Result<never>
> {
  if (message.type === "auth.getStatus") {
    return getAuthStatus(dependencies.getCachedToken());
  }

  if (message.type === "auth.requestInteractiveToken") {
    const authResult = await dependencies.requestInteractiveToken();

    if (!authResult.ok) {
      return authResult;
    }

    return {
      ok: true,
      value: { status: "connected" },
    };
  }

  if (message.type === "calendar.listEvents") {
    const token = dependencies.getCachedToken();

    if (!token) {
      return {
        ok: false,
        error: {
          code: "AUTH_NOT_CONNECTED",
          message: "Connect Calendar before requesting events.",
          recoverable: true,
        },
      };
    }

    return dependencies.listPrimaryCalendarEvents(token);
  }

  return unknownMessageResult();
}
