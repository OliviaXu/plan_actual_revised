import { describe, expect, it, vi } from "vitest";

import registerServiceWorker from "../../src/background/register-service-worker";

type MessageListener = (
  message: { type?: string; event?: unknown; todayDate?: string },
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

  const operations = {
    openAppPage: vi.fn(async () => undefined),
    connectCalendar: vi.fn(async () => ({
      ok: true as const,
      value: { status: "connected" as const },
    })),
    listCurrentCalendarEvents: vi.fn(async () => ({
      ok: true as const,
      value: {
        events: [],
        date: "2026-07-15",
        timeZone: "America/Los_Angeles",
      },
    })),
    insertCalendarEvent: vi.fn(async () => ({
      ok: true as const,
      value: { eventId: "calendar-actual-id" },
    })),
    runCatchUp: vi.fn(async () => ({
      ok: true as const,
      value: { saved: 0, failed: 0, discarded: 0 },
    })),
    ...overrides,
  };

  registerServiceWorker(operations);

  if (!actionListener || !messageListener) {
    throw new Error("Service-worker listeners were not installed.");
  }

  return { actionListener, messageListener, operations };
}

async function sendMessage(
  listener: MessageListener,
  message: { type?: string; event?: unknown; todayDate?: string },
) {
  const sendResponse = vi.fn();
  const keepsChannelOpen = listener(message, undefined, sendResponse);

  if (keepsChannelOpen) {
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  }

  return { keepsChannelOpen, response: sendResponse.mock.calls[0]?.[0] };
}

describe("registerServiceWorker", () => {
  it("opens the app from the extension action", () => {
    const { actionListener, operations } = installServiceWorker();

    actionListener();

    expect(operations.openAppPage).toHaveBeenCalledOnce();
  });

  it("routes interactive authentication and forwards its response", async () => {
    const authFailure = {
      ok: false as const,
      error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "Access denied." },
    };
    const { messageListener, operations } = installServiceWorker({
      connectCalendar: vi.fn(async () => authFailure),
    });

    await expect(
      sendMessage(messageListener, {
        type: "auth.requestInteractiveToken",
      }),
    ).resolves.toEqual({
      keepsChannelOpen: true,
      response: authFailure,
    });
    expect(operations.connectCalendar).toHaveBeenCalledOnce();
  });

  it("does not log expected operation failures as internal errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const expectedFailure = {
      ok: false as const,
      error: { code: "CALENDAR_LIST_FAILED", message: "Calendar failed." },
    };
    const { messageListener } = installServiceWorker({
      listCurrentCalendarEvents: vi.fn(async () => expectedFailure),
    });

    try {
      await expect(
        sendMessage(messageListener, { type: "calendar.listEvents" }),
      ).resolves.toEqual({
        keepsChannelOpen: true,
        response: expectedFailure,
      });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("logs unexpected operation failures and returns an internal error", async () => {
    const failure = new Error("Calendar client crashed.");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { messageListener } = installServiceWorker({
      listCurrentCalendarEvents: vi.fn(async () => {
        throw failure;
      }),
    });

    try {
      await expect(
        sendMessage(messageListener, { type: "calendar.listEvents" }),
      ).resolves.toEqual({
        keepsChannelOpen: true,
        response: {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected background error occurred.",
          },
        },
      });
      expect(log).toHaveBeenCalledWith(
        "service-worker-request-failed",
        { messageType: "calendar.listEvents" },
        failure,
      );
    } finally {
      log.mockRestore();
    }
  });

  it("routes current Calendar reads", async () => {
    const { messageListener, operations } = installServiceWorker();

    await expect(
      sendMessage(messageListener, { type: "calendar.listEvents" }),
    ).resolves.toMatchObject({
      keepsChannelOpen: true,
      response: { ok: true, value: { events: [] } },
    });
    expect(operations.listCurrentCalendarEvents).toHaveBeenCalledOnce();
  });

  it("routes Calendar inserts with their event", async () => {
    const event = { id: "calendar-event-id" };
    const { messageListener, operations } = installServiceWorker();

    await sendMessage(messageListener, {
      type: "calendar.insertEvent",
      event,
    });

    expect(operations.insertCalendarEvent).toHaveBeenCalledWith(event);
  });

  it("routes catch-up with its requested date", async () => {
    const { messageListener, operations } = installServiceWorker();

    await sendMessage(messageListener, {
      type: "catchUp.run",
      todayDate: "2026-07-15",
    });

    expect(operations.runCatchUp).toHaveBeenCalledWith("2026-07-15");
  });

  it("ignores messages outside its contract", async () => {
    const { messageListener } = installServiceWorker();

    await expect(
      sendMessage(messageListener, { type: "unknown" }),
    ).resolves.toEqual({
      keepsChannelOpen: false,
      response: undefined,
    });
  });
});
