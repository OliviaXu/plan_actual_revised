import type { Result } from "../shared/result";
import type { ConnectedAuth } from "./auth";
import { handleRuntimeMessage } from "./message-handlers";
import type { CalendarListEventsResponse, RuntimeMessage } from "./messages";

export type ServiceWorkerRuntimeDependencies = {
  openAppPage: () => Promise<unknown>;
  getCachedToken: () => string | undefined;
  requestInteractiveToken: () => Promise<Result<ConnectedAuth>>;
  listPrimaryCalendarEvents: (token: string) => Promise<CalendarListEventsResponse>;
};

export function installRuntimeListeners(
  dependencies: ServiceWorkerRuntimeDependencies,
) {
  chrome.action.onClicked.addListener(() => {
    void dependencies.openAppPage();
  });

  chrome.runtime.onMessage.addListener(
    (
      message: RuntimeMessage,
      _sender,
      sendResponse: (response: unknown) => void,
    ) => {
      if (message?.type === "app.health") {
        sendResponse({ ok: true, value: { status: "online" } });
        return false;
      }

      void handleRuntimeMessage(message, {
        getCachedToken: dependencies.getCachedToken,
        requestInteractiveToken: dependencies.requestInteractiveToken,
        listPrimaryCalendarEvents: dependencies.listPrimaryCalendarEvents,
      }).then(sendResponse);

      return true;
    },
  );
}
