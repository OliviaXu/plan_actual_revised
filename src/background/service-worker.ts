import { requestCachedToken, requestInteractiveToken } from "./auth";
import registerServiceWorker from "./register-service-worker";
import { createServiceWorkerOperations } from "./compose-service-worker";
import {
  insertPrimaryCalendarEvent,
  listPrimaryCalendarEvents,
} from "../calendar/google-calendar-client";
import {
  deleteDayRecord,
  listDayRecords,
  saveDayRecord,
} from "../storage/day-record-storage";
import { createChromeSurfaceOperations } from "./chrome-surface-operations";

const chromeSurfaceOperations = createChromeSurfaceOperations({
  openAppPage: () =>
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  setSidePanelOptions: (options) => chrome.sidePanel.setOptions(options),
  openSidePanel: (options) => chrome.sidePanel.open(options),
  disableSidePanel: (options) => chrome.sidePanel.setOptions(options),
});

registerServiceWorker({
  ...createServiceWorkerOperations({
    openAppPage: () =>
      chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
    requestCachedToken,
    requestInteractiveToken,
    listPrimaryCalendarEvents,
    insertPrimaryCalendarEvent,
    listDayRecords,
    saveDayRecord,
    deleteDayRecord,
  }),
  ...chromeSurfaceOperations,
});
