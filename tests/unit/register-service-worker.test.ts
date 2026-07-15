import { describe, expect, it, vi } from "vitest";

import registerServiceWorker from "../../src/background/register-service-worker";

const fixedNow = new Date(2026, 6, 15, 12);
const range = {
  timeMin: new Date(2026, 6, 15).toISOString(),
  timeMax: new Date(2026, 6, 16).toISOString(),
};
const now = () => new Date(fixedNow);

type MessageListener = (
  message: { type?: string },
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean;

function installServiceWorker(overrides: Record<string, unknown> = {}) {
  let actionListener: (() => void) | undefined;
  let messageListener: MessageListener | undefined;

  vi.stubGlobal("chrome", {
    action: {
      onClicked: {
        addListener: (listener: () => void) => {
          actionListener = listener;
        },
      },
    },
    runtime: {
      onMessage: {
        addListener: (listener: MessageListener) => {
          messageListener = listener;
        },
      },
    },
  });

  const dependencies = {
    openAppPage: vi.fn(async () => undefined),
    requestCachedToken: vi.fn(async () => ({
      ok: true as const,
      value: "token-123",
    })),
    requestInteractiveToken: vi.fn(async () => ({
      ok: true as const,
      value: "token-123",
    })),
    listPrimaryCalendarEvents: vi.fn(async () => ({
      ok: true as const,
      value: { events: [] },
    })),
    ...overrides,
  };

  registerServiceWorker(dependencies, now);

  if (!actionListener || !messageListener) {
    throw new Error("Service-worker listeners were not installed.");
  }

  return { actionListener, dependencies, messageListener };
}

async function sendMessage(listener: MessageListener, type: string) {
  const sendResponse = vi.fn();
  const keepsChannelOpen = listener({ type }, undefined, sendResponse);

  if (keepsChannelOpen) {
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  }

  return { keepsChannelOpen, response: sendResponse.mock.calls[0]?.[0] };
}

describe("registerServiceWorker", () => {
  it("opens the app from the extension action", () => {
    const { actionListener, dependencies } = installServiceWorker();

    actionListener();

    expect(dependencies.openAppPage).toHaveBeenCalledOnce();
  });

  it("uses interactive auth only for the explicit connect message", async () => {
    const { dependencies, messageListener } = installServiceWorker();

    await expect(
      sendMessage(messageListener, "auth.requestInteractiveToken"),
    ).resolves.toEqual({
      keepsChannelOpen: true,
      response: { ok: true, value: { status: "connected" } },
    });
    expect(dependencies.requestInteractiveToken).toHaveBeenCalledOnce();
  });

  it("forwards an interactive auth failure", async () => {
    const authFailure = {
      ok: false as const,
      error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "Access denied." },
    };
    const { messageListener } = installServiceWorker({
      requestInteractiveToken: vi.fn(async () => authFailure),
    });

    await expect(
      sendMessage(messageListener, "auth.requestInteractiveToken"),
    ).resolves.toEqual({
      keepsChannelOpen: true,
      response: authFailure,
    });
  });

  it("lists today's Calendar events with a silently cached token", async () => {
    const { dependencies, messageListener } = installServiceWorker();

    await expect(
      sendMessage(messageListener, "calendar.listEvents"),
    ).resolves.toEqual({
      keepsChannelOpen: true,
      response: { ok: true, value: { events: [] } },
    });
    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenCalledWith(
      "token-123",
      range,
    );
  });

  it("forwards a Calendar API failure", async () => {
    const calendarFailure = {
      ok: false as const,
      error: { code: "CALENDAR_LIST_FAILED", message: "Calendar failed." },
    };
    const { messageListener } = installServiceWorker({
      listPrimaryCalendarEvents: vi.fn(async () => calendarFailure),
    });

    await expect(
      sendMessage(messageListener, "calendar.listEvents"),
    ).resolves.toEqual({
      keepsChannelOpen: true,
      response: calendarFailure,
    });
  });

  it("does not call Calendar when no cached token is available", async () => {
    const requestCachedToken = vi.fn(async () => ({
      ok: false as const,
      error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "No cached token." },
    }));
    const { dependencies, messageListener } = installServiceWorker({
      requestCachedToken,
    });

    await expect(
      sendMessage(messageListener, "calendar.listEvents"),
    ).resolves.toEqual({
      keepsChannelOpen: true,
      response: {
        ok: false,
        error: {
          code: "AUTH_NOT_CONNECTED",
          message: "Connect Calendar before requesting events.",
        },
      },
    });
    expect(dependencies.listPrimaryCalendarEvents).not.toHaveBeenCalled();
  });

  it("ignores messages outside its contract", async () => {
    const { messageListener } = installServiceWorker();

    await expect(sendMessage(messageListener, "unknown")).resolves.toEqual({
      keepsChannelOpen: false,
      response: undefined,
    });
  });
});
