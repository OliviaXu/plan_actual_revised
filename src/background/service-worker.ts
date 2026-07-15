import { requestCachedToken, requestInteractiveToken } from "./auth";
import { installRuntimeListeners } from "./service-worker-runtime";
import { listPrimaryCalendarEvents } from "../calendar/google-calendar-client";

function openAppPage() {
  return chrome.tabs.create({
    url: chrome.runtime.getURL("index.html"),
  });
}

installRuntimeListeners({
  openAppPage,
  requestCachedToken,
  requestInteractiveToken,
  listPrimaryCalendarEvents: (token: string) =>
    listPrimaryCalendarEvents({ token }),
});
