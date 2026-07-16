import { requestCachedToken, requestInteractiveToken } from "./auth";
import registerServiceWorker from "./register-service-worker";
import {
  insertPrimaryCalendarEvent,
  listPrimaryCalendarEvents,
} from "../calendar/google-calendar-client";

registerServiceWorker({
  openAppPage: () =>
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken,
  requestInteractiveToken,
  listPrimaryCalendarEvents,
  insertPrimaryCalendarEvent,
});
