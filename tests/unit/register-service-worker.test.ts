import { describe, expect, it, vi } from "vitest";

import registerServiceWorker from "../../src/background/register-service-worker";

const fixedNow = new Date(2026, 6, 15, 12);
const range = {
  timeMin: new Date(2026, 6, 15).toISOString(),
  timeMax: new Date(2026, 6, 16).toISOString(),
};
const now = () => new Date(fixedNow);

type MessageListener = (
  message: { type?: string; event?: unknown },
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean;

function installServiceWorker(
  overrides: Record<string, unknown> = {},
  clock: () => Date = now,
) {
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
    insertPrimaryCalendarEvent: vi.fn(async () => ({
      ok: true as const,
      value: { eventId: "calendar-actual-id" },
    })),
    ...overrides,
  };

  registerServiceWorker(dependencies, clock);

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

async function sendMessageWithEvent(
  listener: MessageListener,
  type: string,
  event: unknown,
) {
  const sendResponse = vi.fn();
  const keepsChannelOpen = listener({ type, event }, undefined, sendResponse);
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
    ).resolves.toMatchObject({
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
    ).resolves.toMatchObject({
      keepsChannelOpen: true,
      response: authFailure,
    });
  });

  it("lists today's Calendar events with a silently cached token", async () => {
    const { dependencies, messageListener } = installServiceWorker();

    await expect(
      sendMessage(messageListener, "calendar.listEvents"),
    ).resolves.toMatchObject({
      keepsChannelOpen: true,
      response: { ok: true, value: { events: [] } },
    });
    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenCalledWith(
      "token-123",
      range,
    );
  });

  it("reads the clock once when deriving a Calendar request range", async () => {
    const clock = vi.fn(now);
    const { messageListener } = installServiceWorker({}, clock);

    await sendMessage(messageListener, "calendar.listEvents");

    expect(clock).toHaveBeenCalledOnce();
  });

  it("derives a new local-day range for a later request after midnight", async () => {
    const clock = vi
      .fn()
      .mockReturnValueOnce(new Date(2026, 6, 15, 23, 59))
      .mockReturnValueOnce(new Date(2026, 6, 16, 0, 1));
    const { dependencies, messageListener } = installServiceWorker({}, clock);

    await sendMessage(messageListener, "calendar.listEvents");
    await sendMessage(messageListener, "calendar.listEvents");

    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenNthCalledWith(
      1,
      "token-123",
      {
        timeMin: new Date(2026, 6, 15).toISOString(),
        timeMax: new Date(2026, 6, 16).toISOString(),
      },
    );
    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenNthCalledWith(
      2,
      "token-123",
      {
        timeMin: new Date(2026, 6, 16).toISOString(),
        timeMax: new Date(2026, 6, 17).toISOString(),
      },
    );
  });

  it("logs Calendar load stats without a constant request reason", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { messageListener } = installServiceWorker();

    await sendMessage(messageListener, "calendar.listEvents");

    expect(log.mock.calls[0]?.[1]).not.toHaveProperty("reason");
    log.mockRestore();
  });

  it.each([
    { events: [], renderedTimedEventCount: 0 },
    {
      events: [
        {
          kind: "timed" as const,
          id: "private-event-id",
          summary: "Private meeting",
          colorId: null,
          start: "2026-07-15T09:00:00-07:00",
          end: "2026-07-15T10:00:00-07:00",
          timeZone: "America/Los_Angeles",
        },
      ],
      renderedTimedEventCount: 1,
    },
  ])(
    "logs one complete privacy-safe summary for %# event set",
    async ({ events, renderedTimedEventCount }) => {
      const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const { messageListener } = installServiceWorker({
        listPrimaryCalendarEvents: vi.fn(async () => ({
          ok: true as const,
          value: {
            events,
            stats: {
              pageCount: 2,
              rawEventCount: 3,
              calendarHttpAndJsonDurationMs: 4,
              normalizationDurationMs: 5,
            },
          },
        })),
      });

      await sendMessage(messageListener, "calendar.listEvents");

      expect(log).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith("calendar-plan-load", {
        ok: true,
        renderedTimedEventCount,
        pageCount: 2,
        rawEventCount: 3,
        calendarHttpAndJsonDurationMs: 4,
        normalizationDurationMs: 5,
        cachedAuthDurationMs: expect.any(Number),
        backgroundTotalDurationMs: expect.any(Number),
      });
      const summary = log.mock.calls[0]?.[1] as Record<string, unknown>;
      for (const durationName of [
        "calendarHttpAndJsonDurationMs",
        "normalizationDurationMs",
        "cachedAuthDurationMs",
        "backgroundTotalDurationMs",
      ]) {
        const duration = summary[durationName];
        expect(typeof duration).toBe("number");
        expect(Number.isFinite(duration)).toBe(true);
        expect(duration).toBeGreaterThanOrEqual(0);
      }
      const serializedLog = JSON.stringify(log.mock.calls);
      expect(serializedLog).not.toContain("token-123");
      expect(serializedLog).not.toContain("private-event-id");
      expect(serializedLog).not.toContain("Private meeting");
      log.mockRestore();
    },
  );

  it("coalesces simultaneous reads for the same local day", async () => {
    let resolveCalendar: ((value: unknown) => void) | undefined;
    const listPrimaryCalendarEvents = vi.fn(
      () => new Promise((resolve) => { resolveCalendar = resolve; }),
    );
    const { messageListener } = installServiceWorker({ listPrimaryCalendarEvents });
    const first = sendMessage(messageListener, "calendar.listEvents");
    const second = sendMessage(messageListener, "calendar.listEvents");

    await vi.waitFor(() => expect(listPrimaryCalendarEvents).toHaveBeenCalledOnce());
    resolveCalendar?.({ ok: true, value: { events: [] } });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ response: expect.objectContaining({ ok: true, value: expect.objectContaining({ events: [] }) }) }),
      expect.objectContaining({ response: expect.objectContaining({ ok: true, value: expect.objectContaining({ events: [] }) }) }),
    ]);
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
    ).resolves.toMatchObject({
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
    ).resolves.toMatchObject({
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

  it("inserts a Calendar event through cached auth", async () => {
    const event = { id: "calendar-event-id" };
    const { dependencies, messageListener } = installServiceWorker();

    await expect(
      sendMessageWithEvent(messageListener, "calendar.insertEvent", event),
    ).resolves.toMatchObject({
      keepsChannelOpen: true,
      response: { ok: true, value: { eventId: "calendar-actual-id" } },
    });
    expect(dependencies.insertPrimaryCalendarEvent).toHaveBeenCalledWith(
      "token-123",
      event,
    );
  });

  it("does not insert a Calendar event without cached auth", async () => {
    const { dependencies, messageListener } = installServiceWorker({
      requestCachedToken: vi.fn(async () => ({
        ok: false as const,
        error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "missing" },
      })),
    });

    await expect(
      sendMessageWithEvent(messageListener, "calendar.insertEvent", {}),
    ).resolves.toMatchObject({
      response: { ok: false, error: { code: "AUTH_NOT_CONNECTED" } },
    });
    expect(dependencies.insertPrimaryCalendarEvent).not.toHaveBeenCalled();
  });

  it("ignores messages outside its contract", async () => {
    const { messageListener } = installServiceWorker();

    await expect(sendMessage(messageListener, "unknown")).resolves.toEqual({
      keepsChannelOpen: false,
      response: undefined,
    });
  });
});
