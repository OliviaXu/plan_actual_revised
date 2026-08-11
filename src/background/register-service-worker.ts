import type {
  CalendarInsertEvent,
} from "../calendar/calendar-event";
import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import type { Result } from "../shared/result";
import type { RuntimeMessage } from "../shared/runtime-messages";
import type { CurrentCalendarDayResult } from "./calendar-client";
import type { CalendarEvent } from "../calendar/calendar-event";

type ServiceWorkerHandlers = {
  openAppPage: () => Promise<unknown>;
  openCalendarSidePanel: (tabId: number) => Promise<unknown>;
  disableSidePanel: (tabId: number) => Promise<unknown>;
  connectCalendar: () => Promise<Result<{ status: "connected" }>>;
  listCurrentCalendarEvents: () => Promise<CurrentCalendarDayResult>;
  listCalendarEventsForDate: (
    date: string,
    timeZone: string,
  ) => Promise<Result<{ events: CalendarEvent[] }>>;
  insertCalendarEvent: (
    event: CalendarInsertEvent,
  ) => Promise<Result<{ eventId: string }>>;
  runCatchUp: (
    todayDate: string,
  ) => Promise<Result<CatchUpRunResult>>;
};

export default function registerServiceWorker(
  handlers: ServiceWorkerHandlers,
) {
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined && isGoogleCalendarUrl(tab.url)) {
      void handlers.openCalendarSidePanel(tab.id);
      return;
    }

    if (tab.id !== undefined) {
      void handlers.disableSidePanel(tab.id);
    }
    void handlers.openAppPage();
  });

  chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
    if (tab.url && !isGoogleCalendarUrl(tab.url)) {
      void handlers.disableSidePanel(tabId);
    }
  });

  chrome.runtime.onMessage.addListener(
    (message: RuntimeMessage, _sender, sendResponse) => {
      if (message?.type === "auth.requestInteractiveToken") {
        forwardRuntimeResponse(
          message.type,
          handlers.connectCalendar,
          sendResponse,
        );
        return true;
      }

      if (message?.type === "calendar.listEvents") {
        forwardRuntimeResponse(
          message.type,
          handlers.listCurrentCalendarEvents,
          sendResponse,
        );
        return true;
      }

      if (message?.type === "calendar.listEventsForDate") {
        forwardRuntimeResponse(
          message.type,
          () => handlers.listCalendarEventsForDate(message.date, message.timeZone),
          sendResponse,
        );
        return true;
      }

      if (message?.type === "calendar.insertEvent") {
        forwardRuntimeResponse(
          message.type,
          () => handlers.insertCalendarEvent(message.event),
          sendResponse,
        );
        return true;
      }

      if (message?.type === "catchUp.run") {
        forwardRuntimeResponse(
          message.type,
          () => handlers.runCatchUp(message.todayDate),
          sendResponse,
        );
        return true;
      }

      return false;
    },
  );
}

export function isGoogleCalendarUrl(url?: string) {
  if (!url) return false;
  try {
    return new URL(url).origin === "https://calendar.google.com";
  } catch {
    return false;
  }
}

function forwardRuntimeResponse(
  messageType: RuntimeMessage["type"],
  operation: () => Promise<unknown>,
  sendResponse: (response: unknown) => void,
) {
  let response: Promise<unknown>;
  try {
    response = operation();
  } catch (error) {
    sendInternalError(messageType, error, sendResponse);
    return;
  }

  void response.then(sendResponse, (error) => {
    sendInternalError(messageType, error, sendResponse);
  });
}

function sendInternalError(
  messageType: RuntimeMessage["type"],
  error: unknown,
  sendResponse: (response: unknown) => void,
) {
  console.error(
    "service-worker-request-failed",
    { messageType },
    error,
  );
  sendResponse({
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected background error occurred.",
    },
  });
}
