type AppHealthMessage = {
  type: "app.health";
};

type AppOpenMessage = {
  type: "app.open";
};

type RuntimeMessage = AppHealthMessage | AppOpenMessage;

function openAppPage() {
  return chrome.tabs.create({
    url: chrome.runtime.getURL("index.html"),
  });
}

chrome.action.onClicked.addListener(() => {
  void openAppPage();
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

    if (message?.type === "app.open") {
      openAppPage()
        .then(() => {
          sendResponse({ ok: true, value: { opened: true } });
        })
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: {
              code: "APP_OPEN_FAILED",
              message:
                error instanceof Error ? error.message : "Unable to open app page",
              recoverable: true,
            },
          });
        });
      return true;
    }

    return false;
  },
);
