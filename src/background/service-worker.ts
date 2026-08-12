import { requestCachedToken, requestInteractiveToken } from "./auth";
import registerServiceWorker from "./register-service-worker";
import { createRuntimeMessageHandlers } from "./runtime-message-handlers";
import {
  insertPrimaryCalendarEvent,
  listPrimaryCalendarEvents,
} from "../calendar/google-calendar-client";
import {
  deleteDayRecord,
  listDayRecords,
  saveDayRecord,
} from "../storage/day-record-storage";
import { createChromeSurfaceHandlers } from "./chrome-surface-handlers";

const chromeSurfaceHandlers = createChromeSurfaceHandlers({
  findAppTabs: async () => {
    const tabs = await chrome.tabs.query({
      url: chrome.runtime.getURL("index.html"),
    });
    return tabs.map((tab) => ({ id: tab.id!, windowId: tab.windowId }));
  },
  createAppTab: () =>
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  activateAppTab: (tabId) => chrome.tabs.update(tabId, { active: true }),
  focusWindow: (windowId) => chrome.windows.update(windowId, { focused: true }),
  setSidePanelOptions: (options) => chrome.sidePanel.setOptions(options),
  openSidePanel: (options) => chrome.sidePanel.open(options),
  disableSidePanel: (options) => chrome.sidePanel.setOptions(options),
});

registerServiceWorker({
  ...createRuntimeMessageHandlers({
    requestCachedToken,
    requestInteractiveToken,
    listPrimaryCalendarEvents,
    insertPrimaryCalendarEvent,
    listDayRecords,
    saveDayRecord,
    deleteDayRecord,
  }),
  ...chromeSurfaceHandlers,
});
