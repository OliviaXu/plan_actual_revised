import { describe, expect, it, vi } from "vitest";

import { installRuntimeListeners } from "../../src/background/service-worker-runtime";

function installWithMockedChrome() {
  let actionClickListener: (() => void) | undefined;
  let messageListener:
    | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean)
    | undefined;

  vi.stubGlobal("chrome", {
    action: {
      onClicked: {
        addListener: vi.fn((listener: () => void) => {
          actionClickListener = listener;
        }),
      },
    },
    runtime: {
      onMessage: {
        addListener: vi.fn(
          (
            listener: (
              message: unknown,
              sender: unknown,
              sendResponse: (response: unknown) => void,
            ) => boolean,
          ) => {
            messageListener = listener;
          },
        ),
      },
    },
  });

  const openAppPage = vi.fn(async () => undefined);

  installRuntimeListeners({
    openAppPage,
    getCachedToken: () => undefined,
    requestInteractiveToken: vi.fn(),
    listPrimaryCalendarEvents: vi.fn(),
  });

  if (!actionClickListener || !messageListener) {
    throw new Error("Runtime listeners were not installed.");
  }

  return { actionClickListener, messageListener, openAppPage };
}

describe("installRuntimeListeners", () => {
  it("opens the app from the browser action click", () => {
    const { actionClickListener, openAppPage } = installWithMockedChrome();

    actionClickListener();

    expect(openAppPage).toHaveBeenCalledTimes(1);
  });

  it("does not keep a runtime-only app open message", async () => {
    const { messageListener, openAppPage } = installWithMockedChrome();
    const sendResponse = vi.fn();

    const keepsMessageChannelOpen = messageListener(
      { type: "app.open" },
      undefined,
      sendResponse,
    );
    await Promise.resolve();

    expect(keepsMessageChannelOpen).toBe(true);
    expect(openAppPage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: "UNKNOWN_MESSAGE",
        message: "Unsupported runtime message.",
        recoverable: false,
      },
    });
  });
});
