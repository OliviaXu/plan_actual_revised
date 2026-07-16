import { requestCachedToken, requestInteractiveToken } from "./auth";
import registerServiceWorker from "./register-service-worker";
import { listPrimaryCalendarEvents } from "../calendar/google-calendar-client";
import { insertPrimaryCalendarActual } from "../calendar/google-calendar-actual";

registerServiceWorker({
  openAppPage: () =>
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken,
  requestInteractiveToken,
  listPrimaryCalendarEvents,
  insertPrimaryCalendarActual,
});
