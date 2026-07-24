import type { CalendarInsertEvent } from "../calendar/calendar-event";
import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import type { Result } from "../shared/result";
import type { RuntimeMessage } from "../shared/runtime-messages";
import type { CalendarResult } from "./calendar-operations";

type ServiceWorkerOperations = {
  openAppPage: () => Promise<unknown>;
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
  chrome.action.onClicked.addListener(() => {
    void operations.openAppPage();
  });

  chrome.runtime.onMessage.addListener(
    (message: RuntimeMessage, _sender, sendResponse) => {
      if (message?.type === "auth.requestInteractiveToken") {
        void operations.connectCalendar().then(sendResponse);
        return true;
      }

      if (message?.type === "calendar.listEvents") {
        void operations.listCurrentCalendarEvents().then(sendResponse);
        return true;
      }

      if (message?.type === "calendar.insertEvent") {
        void operations.insertCalendarEvent(message.event).then(sendResponse);
        return true;
      }

      if (message?.type === "catchUp.run") {
        void operations.runCatchUp(message.todayDate).then(sendResponse);
        return true;
      }

      return false;
    },
  );
}
