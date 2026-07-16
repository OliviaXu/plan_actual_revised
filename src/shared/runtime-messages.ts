import type { CalendarEvent } from "../calendar/calendar-event";
import type { CalendarActualInput } from "../calendar/google-calendar-actual";
import type { Result } from "./result";

type RuntimeMessageMap = {
  "auth.requestInteractiveToken": {
    request: { type: "auth.requestInteractiveToken" };
    response: Result<{ status: "connected" }>;
  };
  "calendar.listEvents": {
    request: { type: "calendar.listEvents" };
    response: Result<{ events: CalendarEvent[] }>;
  };
  "calendar.insertActual": {
    request: { type: "calendar.insertActual"; input: CalendarActualInput };
    response: Result<{ eventId: string }>;
  };
};

export type RuntimeMessage = RuntimeMessageMap[keyof RuntimeMessageMap]["request"];

export function sendRuntimeMessage(
  message: RuntimeMessageMap["auth.requestInteractiveToken"]["request"],
): Promise<RuntimeMessageMap["auth.requestInteractiveToken"]["response"]>;
export function sendRuntimeMessage(
  message: RuntimeMessageMap["calendar.listEvents"]["request"],
): Promise<RuntimeMessageMap["calendar.listEvents"]["response"]>;
export function sendRuntimeMessage(
  message: RuntimeMessageMap["calendar.insertActual"]["request"],
): Promise<RuntimeMessageMap["calendar.insertActual"]["response"]>;
export function sendRuntimeMessage(message: RuntimeMessage) {
  return chrome.runtime.sendMessage(message);
}
