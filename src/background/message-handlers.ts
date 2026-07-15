import type { Result } from "../shared/result";
import type { ConnectedAuth } from "./auth";
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
  requestCachedToken: () => Promise<Result<ConnectedAuth>>;
  listPrimaryCalendarEvents: (token: string) => Promise<CalendarListEventsResponse>;
};

export async function handleRuntimeMessage(
  message: RuntimeMessageLike,
  dependencies: RuntimeDependencies,
): Promise<
  AuthStatusResponse | AuthTokenResponse | CalendarListEventsResponse | Result<never>
> {
  if (message.type === "auth.getStatus") {
    const authResult = await dependencies.requestCachedToken();

    return {
      ok: true,
      value: { status: authResult.ok ? "connected" : "disconnected" },
    };
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
    const authResult = await dependencies.requestCachedToken();

    if (!authResult.ok) {
      return {
        ok: false,
        error: {
          code: "AUTH_NOT_CONNECTED",
          message: "Connect Calendar before requesting events.",
          recoverable: true,
        },
      };
    }

    return dependencies.listPrimaryCalendarEvents(authResult.value.token);
  }

  return unknownMessageResult();
}
