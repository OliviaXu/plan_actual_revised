import type { AppError, Result } from "../shared/result";

export type AppHealthMessage = {
  type: "app.health";
};

export type AuthGetStatusMessage = {
  type: "auth.getStatus";
};

export type AuthRequestInteractiveTokenMessage = {
  type: "auth.requestInteractiveToken";
};

export type CalendarListEventsMessage = {
  type: "calendar.listEvents";
};

export type RuntimeMessage =
  | AppHealthMessage
  | AuthGetStatusMessage
  | AuthRequestInteractiveTokenMessage
  | CalendarListEventsMessage;

export type AuthStatusResponse = Result<{
  status: "connected" | "disconnected";
}>;

export type AuthTokenResponse = Result<{
  status: "connected";
}>;

export type CalendarListEventsResponse = Result<{
  eventCount: number;
}>;

export function unknownMessageResult(): Result<never> {
  return {
    ok: false,
    error: {
      code: "UNKNOWN_MESSAGE",
      message: "Unsupported runtime message.",
      recoverable: false,
    },
  };
}

export function errorResult(error: AppError): Result<never> {
  return { ok: false, error };
}
