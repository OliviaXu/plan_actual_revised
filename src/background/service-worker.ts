type AppHealthMessage = {
  type: "app.health";
};

chrome.runtime.onMessage.addListener(
  (
    message: AppHealthMessage,
    _sender,
    sendResponse: (response: unknown) => void,
  ) => {
    if (message?.type !== "app.health") {
      return false;
    }

    sendResponse({ ok: true, value: { status: "online" } });
    return false;
  },
);
