import type { CalendarEvent, CalendarInsertEvent } from "../calendar/calendar-event";
import type { Result } from "./result";

type RuntimeMessageMap = {
  "auth.requestInteractiveToken": {
    request: { type: "auth.requestInteractiveToken" };
    response: Result<{ status: "connected" }>;
  };
  "calendar.listEvents": {
    request: { type: "calendar.listEvents" };
    response: Result<{ events: CalendarEvent[]; date: string; timeZone: string }>;
  };
  "calendar.insertEvent": {
    request: { type: "calendar.insertEvent"; event: CalendarInsertEvent };
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
  message: RuntimeMessageMap["calendar.insertEvent"]["request"],
): Promise<RuntimeMessageMap["calendar.insertEvent"]["response"]>;
export function sendRuntimeMessage(message: RuntimeMessage) {
  return chrome.runtime.sendMessage(message);
}
