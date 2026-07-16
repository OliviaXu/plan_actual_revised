import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App";

type RuntimeMessage = {
  type: string;
  input?: unknown;
};
type RuntimeHandler = (message: RuntimeMessage) => Promise<unknown>;

const timedEvent = {
  kind: "timed" as const,
  id: "design-review",
  summary: "Design review",
  colorId: "9",
  start: "2026-07-15T09:00:00-07:00",
  end: "2026-07-15T10:00:00-07:00",
  timeZone: "America/Los_Angeles",
};
const now = () => new Date("2026-07-15T12:00:00-07:00");

function mockRuntime(handler: RuntimeHandler) {
  const stored: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    runtime: { sendMessage: vi.fn(handler) },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(stored, items);
        }),
      },
    },
  });

  return stored;
}

function unexpectedMessage(message: RuntimeMessage): Promise<never> {
  return Promise.reject(
    new Error(`Unexpected runtime message: ${message.type}`),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App Plan loading", () => {
  it("silently loads today's Calendar events through cached auth", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [timedEvent] } };
      }

      return unexpectedMessage(message);
    });

    render(<App now={now} />);

    expect(screen.getByText("Loading today's plan")).toBeVisible();
    expect(await screen.findByText("Design review")).toBeVisible();
    expect(screen.queryByTestId("calendar-status")).not.toBeInTheDocument();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "calendar.listEvents",
    });
  });

  it("loads only once while the mounted page remains open", async () => {
    let currentTime = new Date("2026-07-15T23:59:00-07:00");
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [timedEvent] } };
      }
      return unexpectedMessage(message);
    });

    render(<App now={() => currentTime} />);
    await screen.findByText("Design review");
    currentTime = new Date("2026-07-16T00:01:00-07:00");
    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh Calendar request when a new app page mounts", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [timedEvent] } };
      }
      return unexpectedMessage(message);
    });

    const firstPage = render(<App now={now} />);
    await screen.findByText("Design review");
    firstPage.unmount();

    render(<App now={now} />);
    await screen.findByText("Design review");

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("shows Connect without an error when cached auth is unavailable", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: false,
          error: {
            code: "AUTH_NOT_CONNECTED",
            message: "Connect Calendar before requesting events.",
          },
        };
      }

      return unexpectedMessage(message);
    });

    render(<App now={now} />);

    expect(
      await screen.findByText("Connect Google Calendar to show today's plan"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Connect Calendar" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Plan day grid" })).toBeVisible();
    expect(
      screen.queryByText(
        "Sign in to load today's events into this read-only column.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("calendar-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("calendar-error")).not.toBeInTheDocument();
  });

  it("connects interactively and refetches today's events", async () => {
    let listAttempts = 0;
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        listAttempts += 1;
        return listAttempts === 1
          ? {
              ok: false,
              error: {
                code: "AUTH_NOT_CONNECTED",
                message: "Connect Calendar before requesting events.",
              },
            }
          : { ok: true, value: { events: [timedEvent] } };
      }
      if (message.type === "auth.requestInteractiveToken") {
        return { ok: true, value: { status: "connected" } };
      }

      return unexpectedMessage(message);
    });

    render(<App now={now} />);
    await screen.findByText("Connect Google Calendar to show today's plan");

    fireEvent.click(screen.getByRole("button", { name: "Connect Calendar" }));

    expect(await screen.findByText("Design review")).toBeVisible();
    expect(listAttempts).toBe(2);
  });

  it("keeps interactive auth errors recoverable and retries Plan loading", async () => {
    let authAttempts = 0;
    let listAttempts = 0;
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        listAttempts += 1;
        return listAttempts === 1
          ? {
              ok: false,
              error: {
                code: "AUTH_NOT_CONNECTED",
                message: "Connect Calendar before requesting events.",
              },
            }
          : { ok: true, value: { events: [timedEvent] } };
      }
      if (message.type === "auth.requestInteractiveToken") {
        authAttempts += 1;
        return authAttempts === 1
          ? {
              ok: false,
              error: {
                code: "AUTH_TOKEN_UNAVAILABLE",
                message: "Access denied.",
              },
            }
          : { ok: true, value: { status: "connected" } };
      }

      return unexpectedMessage(message);
    });

    render(<App now={now} />);
    await screen.findByText("Connect Google Calendar to show today's plan");

    fireEvent.click(screen.getByRole("button", { name: "Connect Calendar" }));

    expect(await screen.findByTestId("calendar-error")).toHaveTextContent(
      "Access denied.",
    );
    expect(
      screen.getByRole("button", { name: "Connect Calendar" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Connect Calendar" }));

    expect(await screen.findByText("Design review")).toBeVisible();
    expect(authAttempts).toBe(2);
    expect(listAttempts).toBe(2);
  });

  it("renders a connected empty Plan state", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [] } };
      }

      return unexpectedMessage(message);
    });

    render(<App now={now} />);

    expect(await screen.findByTestId("plan-empty")).toHaveTextContent(
      "No timed events today",
    );
  });

  it("keeps the Plan surface usable when Calendar fails", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: false,
          error: { code: "CALENDAR_LIST_FAILED", message: "Calendar failed." },
        };
      }

      return unexpectedMessage(message);
    });

    render(<App now={now} />);

    expect(await screen.findByTestId("calendar-error")).toHaveTextContent(
      "Calendar failed.",
    );
    expect(screen.getByRole("heading", { name: "Plan" })).toBeVisible();
    expect(screen.getByTestId("plan-unavailable")).toHaveTextContent(
      "Unable to load today's plan",
    );
    expect(screen.queryByTestId("plan-empty")).not.toBeInTheDocument();
  });
});

describe("App Actual persistence", () => {
  it("hydrates an existing Actual before allowing creation", async () => {
    const stored = mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [] } };
      }
      return unexpectedMessage(message);
    });
    stored["dayRecord:2026-07-15"] = {
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual: [{
        id: "restored-actual",
        summary: "Restored Actual",
        startMinutes: 600,
        durationMinutes: 30,
        colorId: "8",
      }],
      updatedAt: "2026-07-15T17:00:00.000Z",
    };

    render(<App now={now} />);

    expect(await screen.findByText("Restored Actual")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Actual" })).toBeDisabled();
  });

  it("persists a new Actual before rendering it", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [] } };
      }
      return unexpectedMessage(message);
    });
    vi.stubGlobal("crypto", { randomUUID: () => "new-actual-id" });

    render(<App now={now} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    fireEvent.click(add);

    expect(await screen.findByText("Actual")).toBeVisible();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({
        schemaVersion: 1,
        date: "2026-07-15",
        timezone: "America/Los_Angeles",
        actual: [expect.objectContaining({
          id: "new-actual-id",
          startMinutes: 720,
          durationMinutes: 30,
          colorId: "8",
        })],
      }),
    });
  });

  it("does not render a new Actual when persistence fails", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [] } };
      }
      return unexpectedMessage(message);
    });
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(
      new Error("quota exceeded"),
    );

    render(<App now={now} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Actual" }));

    expect(await screen.findByTestId("actual-storage-error")).toHaveTextContent(
      "Unable to save Actual locally.",
    );
    expect(screen.queryByTestId("actual-block")).not.toBeInTheDocument();
  });

  it("keeps Actual available while Calendar is disconnected", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: false,
          error: { code: "AUTH_NOT_CONNECTED", message: "Not connected." },
        };
      }
      return unexpectedMessage(message);
    });

    render(<App now={now} />);

    expect(await screen.findByRole("button", { name: "Add Actual" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Actual" })).toBeVisible();
  });
});

describe("App Actual Calendar saving", () => {
  function seedUnsavedActual(stored: Record<string, unknown>) {
    stored["dayRecord:2026-07-15"] = {
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual: [{
        id: "actual-to-save",
        summary: "Design review",
        startMinutes: 540,
        durationMinutes: 60,
        colorId: "9",
        saveDisposition: "unsaved",
      }],
      updatedAt: "2026-07-15T17:00:00.000Z",
    };
  }

  it("permanently classifies an exact Plan match without inserting", async () => {
    const handler = vi.fn(async (message: RuntimeMessage) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [timedEvent] } };
      }
      return unexpectedMessage(message);
    });
    const stored = mockRuntime(handler);
    seedUnsavedActual(stored);

    render(<App now={now} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save Actual to calendar" }));

    expect(await screen.findByTestId("actual-save-summary")).toHaveTextContent(
      "1 matched Plan",
    );
    expect(stored["dayRecord:2026-07-15"]).toMatchObject({
      actual: [{ saveDisposition: "planMatched" }],
    });
    expect(handler).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "calendar.insertEvent" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Actual to calendar" }));
    expect(handler.mock.calls.filter(([message]) => message.type === "calendar.insertEvent")).toHaveLength(0);
  });

  it("saves a nonmatching Actual and persists its Calendar disposition", async () => {
    const handler = vi.fn(async (message: RuntimeMessage) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [] } };
      }
      if (message.type === "calendar.insertEvent") {
        return { ok: true, value: { eventId: "calendar-actual-id" } };
      }
      return unexpectedMessage(message);
    });
    const stored = mockRuntime(handler);
    seedUnsavedActual(stored);

    render(<App now={now} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save Actual to calendar" }));

    expect(await screen.findByTestId("actual-save-summary")).toHaveTextContent(
      "Saved 1",
    );
    expect(stored["dayRecord:2026-07-15"]).toMatchObject({
      actual: [{
        saveDisposition: "calendarSaved",
        calendarEventId: "calendar-actual-id",
        lastSaveError: undefined,
      }],
    });
    expect(handler).toHaveBeenCalledWith({
      type: "calendar.insertEvent",
      event: expect.objectContaining({
        id: "paractualtosave",
        summary: "[Actual] Design review",
      }),
    });
  });

  it("keeps a failed Actual unsaved with a durable normalized error", async () => {
    const handler = vi.fn(async (message: RuntimeMessage) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [] } };
      }
      if (message.type === "calendar.insertEvent") {
        return { ok: false, error: {
          code: "CALENDAR_EVENT_INSERT_FAILED",
          message: "Response lost.",
        } };
      }
      return unexpectedMessage(message);
    });
    const stored = mockRuntime(handler);
    seedUnsavedActual(stored);

    render(<App now={now} />);
    const save = await screen.findByRole("button", { name: "Save Actual to calendar" });
    fireEvent.click(save);

    expect(await screen.findByTestId("actual-save-summary")).toHaveTextContent(
      "Failed 1",
    );
    expect(stored["dayRecord:2026-07-15"]).toMatchObject({
      actual: [{
        saveDisposition: "unsaved",
        lastSaveAttemptAt: expect.any(String),
        lastSaveError: {
          code: "CALENDAR_EVENT_INSERT_FAILED",
          message: "Response lost.",
        },
      }],
    });
  });

  it("persists a runtime transport failure as a failed Calendar attempt", async () => {
    const handler = vi.fn(async (message: RuntimeMessage) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [] } };
      }
      if (message.type === "calendar.insertEvent") {
        throw new Error("The message port closed.");
      }
      return unexpectedMessage(message);
    });
    const stored = mockRuntime(handler);
    seedUnsavedActual(stored);

    render(<App now={now} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Save Actual to calendar" }),
    );

    expect(await screen.findByTestId("actual-save-summary")).toHaveTextContent(
      "Failed 1",
    );
    expect(screen.queryByTestId("actual-storage-error")).not.toBeInTheDocument();
    expect(stored["dayRecord:2026-07-15"]).toMatchObject({
      actual: [{
        saveDisposition: "unsaved",
        lastSaveAttemptAt: expect.any(String),
        lastSaveError: {
          code: "CALENDAR_BOUNDARY_UNAVAILABLE",
          message: "Unable to reach the background Calendar boundary.",
        },
      }],
    });
  });
});
