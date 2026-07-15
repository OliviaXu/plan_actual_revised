import type { Result } from "../shared/result";
import type {
  CalendarEvent,
  CalendarEventRange,
} from "../calendar/calendar-event";

type ServiceWorkerDependencies = {
  openAppPage: () => Promise<unknown>;
  requestCachedToken: () => Promise<Result<string>>;
  requestInteractiveToken: () => Promise<Result<string>>;
  listPrimaryCalendarEvents: (
    token: string,
    range: CalendarEventRange,
  ) => Promise<Result<{ events: CalendarEvent[] }>>;
};

export default function registerServiceWorker(
  dependencies: ServiceWorkerDependencies,
  now: () => Date = () => new Date(),
) {
  chrome.action.onClicked.addListener(() => {
    void dependencies.openAppPage();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "auth.requestInteractiveToken") {
      void dependencies.requestInteractiveToken().then((result) => {
        sendResponse(
          result.ok
            ? { ok: true, value: { status: "connected" } }
            : result,
        );
      });
      return true;
    }

    if (message?.type === "calendar.listEvents") {
      const range = getLocalDayRange(now());

      void dependencies.requestCachedToken().then(async (authResult) => {
        if (!authResult.ok) {
          sendResponse({
            ok: false,
            error: {
              code: "AUTH_NOT_CONNECTED",
              message: "Connect Calendar before requesting events.",
            },
          });
          return;
        }

        sendResponse(
          await dependencies.listPrimaryCalendarEvents(authResult.value, range),
        );
      });
      return true;
    }

    return false;
  });
}

function getLocalDayRange(now: Date): CalendarEventRange {
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timeMax = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };
}
