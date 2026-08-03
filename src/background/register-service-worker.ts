import type { CalendarInsertEvent } from "../calendar/calendar-event";
import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import type { Result } from "../shared/result";
import type { RuntimeMessage } from "../shared/runtime-messages";
import type { CalendarResult } from "./calendar-operations";

type ServiceWorkerOperations = {
  openAppPage: () => Promise<unknown>;
  openCalendarSidePanel: (tabId: number) => Promise<unknown>;
  disableSidePanel: (tabId: number) => Promise<unknown>;
  connectCalendar: () => Promise<Result<{ status: "connected" }>>;
  listCurrentCalendarEvents: () => Promise<CalendarResult>;
  insertCalendarEvent: (
    event: CalendarInsertEvent,
  ) => Promise<Result<{ eventId: string }>>;
  runCatchUp: (
    todayDate: string,
  ) => Promise<Result<CatchUpRunResult>>;
};

export default function registerServiceWorker(
  operations: ServiceWorkerOperations,
) {
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined && isGoogleCalendarUrl(tab.url)) {
      void operations.openCalendarSidePanel?.(tab.id);
      return;
    }

    if (tab.id !== undefined) {
      void operations.disableSidePanel?.(tab.id);
    }
    void operations.openAppPage();
  });

  chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
    if (tab.url && !isGoogleCalendarUrl(tab.url)) {
      void operations.disableSidePanel?.(tabId);
    }
  });

  chrome.runtime.onMessage.addListener(
    (message: RuntimeMessage, _sender, sendResponse) => {
      if (message?.type === "auth.requestInteractiveToken") {
        forwardRuntimeResponse(
          message.type,
          operations.connectCalendar,
          sendResponse,
        );
        return true;
      }

      if (message?.type === "calendar.listEvents") {
        forwardRuntimeResponse(
          message.type,
          operations.listCurrentCalendarEvents,
          sendResponse,
        );
        return true;
      }

      if (message?.type === "calendar.insertEvent") {
        forwardRuntimeResponse(
          message.type,
          () => operations.insertCalendarEvent(message.event),
          sendResponse,
        );
        return true;
      }

      if (message?.type === "catchUp.run") {
        forwardRuntimeResponse(
          message.type,
          () => operations.runCatchUp(message.todayDate),
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
