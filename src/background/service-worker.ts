import { requestInteractiveToken } from "./auth";
import { installRuntimeListeners } from "./service-worker-runtime";
import { listPrimaryCalendarEvents } from "../calendar/google-calendar-client";

let cachedToken: string | undefined;

function openAppPage() {
  return chrome.tabs.create({
    url: chrome.runtime.getURL("index.html"),
  });
}

installRuntimeListeners({
  openAppPage,
  getCachedToken: () => cachedToken,
  requestInteractiveToken: async () => {
    const result = await requestInteractiveToken();

    if (result.ok) {
      cachedToken = result.value.token;
    }

    return result;
  },
  listPrimaryCalendarEvents: (token: string) =>
    listPrimaryCalendarEvents({ token }),
});
