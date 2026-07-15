import type { Result } from "../shared/result";

type ServiceWorkerDependencies = {
  openAppPage: () => Promise<unknown>;
  requestCachedToken: () => Promise<Result<string>>;
  requestInteractiveToken: () => Promise<Result<string>>;
  listPrimaryCalendarEvents: (
    token: string,
  ) => Promise<Result<{ eventCount: number }>>;
};

export default function registerServiceWorker(
  dependencies: ServiceWorkerDependencies,
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
          await dependencies.listPrimaryCalendarEvents(authResult.value),
        );
      });
      return true;
    }

    return false;
  });
}
