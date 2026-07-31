import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App";
import type { ActualEvent } from "../../src/domain/day-event";

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

function mockRuntime(
  handler: RuntimeHandler,
  catchUpHandler: RuntimeHandler = async () => ({
    ok: true,
    value: {
      saved: 0,
      failed: 0,
      discarded: 0,
    },
  }),
) {
  const stored: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn((message: RuntimeMessage) =>
        message.type === "catchUp.run"
          ? catchUpHandler(message)
          : handler(message),
      ),
    },
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

function dragDataTransfer() {
  return {
    dropEffect: "none",
    effectAllowed: "none",
    getData: vi.fn(),
    setData: vi.fn(),
  } as unknown as DataTransfer;
}

function fireDragEvent(
  target: Element,
  type: "dragstart" | "dragover" | "drop",
  clientY: number,
  transfer: DataTransfer,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY,
  });
  Object.defineProperty(event, "dataTransfer", { value: transfer });
  fireEvent(target, event);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App Plan loading", () => {
  it("silently loads today's Calendar events through cached auth", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [timedEvent], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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
        return { ok: true, value: { events: [timedEvent], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
      }
      return unexpectedMessage(message);
    });

    render(<App now={() => currentTime} />);
    await screen.findByText("Design review");
    currentTime = new Date("2026-07-16T00:01:00-07:00");
    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));

    expect(vi.mocked(chrome.runtime.sendMessage).mock.calls.filter(
      ([message]) =>
        (message as unknown as RuntimeMessage).type === "calendar.listEvents",
    )).toHaveLength(1);
  });

  it("starts a fresh Calendar request when a new app page mounts", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [timedEvent], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
      }
      return unexpectedMessage(message);
    });

    const firstPage = render(<App now={now} />);
    await screen.findByText("Design review");
    firstPage.unmount();

    render(<App now={now} />);
    await screen.findByText("Design review");

    expect(vi.mocked(chrome.runtime.sendMessage).mock.calls.filter(
      ([message]) =>
        (message as unknown as RuntimeMessage).type === "calendar.listEvents",
    )).toHaveLength(2);
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
    expect(
      screen.queryByRole("region", { name: "Day grid" }),
    ).not.toBeInTheDocument();
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
          : { ok: true, value: { events: [timedEvent], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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
          : { ok: true, value: { events: [timedEvent], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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

describe("App catch-up", () => {
  it("starts catch-up after Calendar and canonical local storage load succeed", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });

    render(<App now={now} />);

    await waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "catchUp.run",
      todayDate: "2026-07-15",
    }));
  });

  it("does not run catch-up when the initial Calendar load fails", async () => {
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
    await screen.findByTestId("calendar-error");

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "catchUp.run" }),
    );
  });

  it("does not run catch-up when the canonical local read fails", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
      new Error("read failed"),
    );

    render(<App now={now} />);
    await screen.findByTestId("actual-storage-error");

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "catchUp.run" }),
    );
  });

  it("keeps Actual interactive while catch-up runs and shows its result", async () => {
    let finishCatchUp: ((value: unknown) => void) | undefined;
    mockRuntime(
      async (message) => {
        if (message.type === "calendar.listEvents") {
          return {
            ok: true,
            value: {
              events: [],
              date: "2026-07-15",
              timeZone: "America/Los_Angeles",
            },
          };
        }
        return unexpectedMessage(message);
      },
      async () => new Promise((resolve) => {
        finishCatchUp = resolve;
      }),
    );

    render(<App now={now} />);

    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    expect(screen.queryByTestId("catch-up-summary")).not.toBeInTheDocument();

    finishCatchUp?.({
      ok: true,
      value: {
        saved: 2,
        failed: 1,
        discarded: 0,
      },
    });

    expect(await screen.findByTestId("catch-up-summary")).toHaveTextContent(
      "Catch-up: saved 2 Actuals to Calendar; 1 Actual couldn't be saved and will be retried next time.",
    );
    expect(screen.getByTestId("catch-up-summary")).toHaveRole("alert");
    expect(add).toBeEnabled();
  });

  it("keeps a no-op catch-up silent", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });

    render(<App now={now} />);
    await waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "catchUp.run" }),
    ));

    expect(screen.queryByTestId("catch-up-summary")).not.toBeInTheDocument();
  });
});

describe("App Actual persistence", () => {
  it("waits for Plan before hydrating or enabling Actual creation", async () => {
    let resolveCalendar: ((value: unknown) => void) | undefined;
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return new Promise((resolve) => {
          resolveCalendar = resolve;
        });
      }
      return unexpectedMessage(message);
    });

    render(<App now={now} />);

    const add = await screen.findByRole("button", { name: "Add Actual" });
    expect(add).toBeDisabled();
    expect(chrome.storage.local.get).not.toHaveBeenCalled();

    resolveCalendar?.({
      ok: true,
      value: { events: [], date: "2026-07-15", timeZone: "Asia/Tokyo" },
    });

    await screen.findByTestId("plan-empty");
    await waitFor(() => expect(add).toBeEnabled());
    expect(chrome.storage.local.get).toHaveBeenCalledWith(
      "dayRecord:2026-07-15",
    );
  });

  it("creates and stores Actuals in the primary Calendar timezone", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: { events: [], timeZone: "Asia/Tokyo", date: "2026-07-15" },
        };
      }
      return unexpectedMessage(message);
    });
    vi.stubGlobal("crypto", { randomUUID: () => "tokyo-actual" });

    render(<App now={() => new Date("2026-07-15T01:00:00.000Z")} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({
        date: "2026-07-15",
        timezone: "Asia/Tokyo",
        actual: [expect.objectContaining({ startMinutes: 600 })],
      }),
    });
  });

  it("appends a new Actual at the current snapped time", async () => {
    const stored = mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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
    vi.stubGlobal("crypto", { randomUUID: () => "appended-actual" });

    render(<App now={now} />);

    expect(await screen.findByText("Restored Actual")).toBeVisible();
    const add = screen.getByRole("button", { name: "Add Actual" });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findAllByTestId("actual-block")).toHaveLength(2);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({
        actual: [
          expect.objectContaining({ id: "restored-actual" }),
          expect.objectContaining({
            id: "appended-actual",
            startMinutes: 720,
            durationMinutes: 30,
          }),
        ],
      }),
    });
  });

  it("naturally layers a newly saved exact-time Actual above the older Actual", async () => {
    const stored = mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
    stored["dayRecord:2026-07-15"] = {
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual: [{
        id: "z-existing-actual",
        summary: "Existing Actual",
        startMinutes: 720,
        durationMinutes: 30,
        colorId: "8",
      }],
      updatedAt: "2026-07-15T18:00:00.000Z",
    };
    vi.stubGlobal("crypto", { randomUUID: () => "a-new-actual" });

    render(<App now={now} />);
    expect(await screen.findByText("Existing Actual")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add Actual" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const newBlock = (await screen.findAllByTestId("actual-block")).find(
      (block) => block.getAttribute("data-actual-id") === "a-new-actual",
    );
    expect(newBlock).toHaveAttribute("data-overlap-layer-index", "1");
    expect(newBlock).toHaveStyle({ zIndex: "1" });
  });

  it("shortens a new Actual to the time remaining before midnight", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
      }
      return unexpectedMessage(message);
    });

    render(<App now={() => new Date("2026-07-15T23:52:00-07:00")} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({
        actual: [
          expect.objectContaining({
            startMinutes: 1430,
            durationMinutes: 10,
          }),
        ],
      }),
    });
  });

  it("uses a five-minute 11:55 PM block when fewer than five minutes remain", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
      }
      return unexpectedMessage(message);
    });

    render(<App now={() => new Date("2026-07-15T23:58:00-07:00")} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({
        actual: [
          expect.objectContaining({
            startMinutes: 1435,
            durationMinutes: 5,
          }),
        ],
      }),
    });
  });

  it("does not create or persist a new Actual until Save", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
      }
      return unexpectedMessage(message);
    });
    vi.stubGlobal("crypto", { randomUUID: () => "new-actual-id" });

    render(<App now={now} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);

    expect(screen.queryByTestId("actual-block")).not.toBeInTheDocument();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByTestId("actual-block")).toHaveTextContent("Untitled");
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

  it("keeps a failed optimistic Actual visible and lets Calendar saving retry storage", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
      }
      if (message.type === "calendar.insertEvent") {
        return { ok: true, value: { eventId: "calendar-actual-id" } };
      }
      return unexpectedMessage(message);
    });
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(
      new Error("quota exceeded"),
    );

    render(<App now={now} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByTestId("actual-storage-error")).toHaveTextContent(
      "Unable to save local changes.",
    );
    expect(screen.getByTestId("actual-block")).toHaveTextContent("Untitled");
    const save = screen.getByRole("button", {
      name: "Save Actual to calendar",
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(screen.queryByTestId("actual-storage-error")).not.toBeInTheDocument(),
    );
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId("actual-save-summary")).toHaveTextContent(
      "Saved 1",
    );
  });

  it("allows Calendar saving while an optimistic Actual write is pending", async () => {
    let finishWrite: (() => void) | undefined;
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [timedEvent], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
      }
      return unexpectedMessage(message);
    });
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );

    render(<App now={now} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByTestId("actual-block")).toBeVisible();
    expect(screen.getByTestId("plan-event-design-review")).toHaveAttribute(
      "draggable",
      "true",
    );
    const save = screen.getByRole("button", {
      name: "Save Actual to calendar",
    });
    expect(save).toBeEnabled();

    finishWrite?.();
  });

  it("treats a rare storage read failure as an empty usable day", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [timedEvent], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
      }
      return unexpectedMessage(message);
    });
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
      new Error("profile storage unavailable"),
    );

    render(<App now={now} />);

    expect(await screen.findByTestId("actual-storage-error")).toHaveTextContent(
      "Unable to load local changes.",
    );
    const add = screen.getByRole("button", { name: "Add Actual" });
    expect(add).toBeEnabled();
    expect(screen.getByTestId("plan-event-design-review")).toHaveAttribute(
      "draggable",
      "true",
    );
    fireEvent.click(add);

    expect(screen.queryByTestId("actual-block")).not.toBeInTheDocument();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByTestId("actual-block")).toHaveTextContent("Untitled");
    await waitFor(() =>
      expect(screen.queryByTestId("actual-storage-error")).not.toBeInTheDocument(),
    );
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it("hides Actual creation while Calendar is disconnected", async () => {
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

    await screen.findByRole("button", { name: "Connect Calendar" });
    expect(
      screen.queryByRole("button", { name: "Add Actual" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Actual" }),
    ).not.toBeInTheDocument();
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });
});

describe("App new Actual dialog", () => {
  async function openNewActualDialog() {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });

    render(<App now={now} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    return within(
      await screen.findByRole("dialog", { name: "Edit Actual" }),
    );
  }

  async function openExistingActualDialog(
    actualOverrides: Partial<ActualEvent> = {},
  ) {
    const stored = mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
    stored["dayRecord:2026-07-15"] = {
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual: [
        {
          id: "existing-actual",
          summary: "Existing title",
          startMinutes: 720,
          durationMinutes: 30,
          colorId: "8",
          saveDisposition: "unsaved",
          ...actualOverrides,
        },
      ],
      updatedAt: "2026-07-15T19:00:00.000Z",
    };

    render(<App now={now} />);
    const existingBlock = await screen.findByText("Existing title");
    fireEvent.click(existingBlock.closest("button")!);
    return within(
      await screen.findByRole("dialog", { name: "Edit Actual" }),
    );
  }

  it("opens on creation with the Untitled title focused and selected", async () => {
    const dialog = await openNewActualDialog();
    const title = dialog.getByRole("textbox", { name: "Title" });

    expect(dialog.getByText("Edit Actual")).toHaveClass("sr-only");
    expect(dialog.queryByText("Title")).not.toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(title).toHaveClass("cursor-text", "border-b", "caret-primary");
    expect(title).not.toHaveClass("hover:bg-muted/50", "focus:bg-muted/50");
    expect(
      within(title.parentElement!).queryByTestId("title-edit-indicator"),
    ).not.toBeInTheDocument();
    expect(dialog.getByRole("spinbutton", { name: "Duration" })).toHaveClass(
      "w-16",
    );
    expect(title).toHaveValue("Untitled");
    expect(title).toHaveFocus();
    expect(title).toHaveProperty("selectionStart", 0);
    expect(title).toHaveProperty("selectionEnd", "Untitled".length);
    expect(screen.queryByTestId("actual-block")).not.toBeInTheDocument();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    fireEvent.input(title, { target: { value: "Typed immediately" } });
    expect(title).toHaveValue("Typed immediately");
  });

  it("rejects a blank title and non-whole duration without writing", async () => {
    const dialog = await openNewActualDialog();
    const title = dialog.getByRole("textbox", { name: "Title" });
    const duration = dialog.getByRole("spinbutton", { name: "Duration" });

    fireEvent.change(title, { target: { value: "   " } });
    fireEvent.change(duration, { target: { value: "1.5" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    expect(dialog.getByText("Title is required.")).toBeVisible();
    expect(
      dialog.getByText("Duration must be a positive whole number."),
    ).toBeVisible();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("dismisses a changed new draft without creating a block", async () => {
    const dialog = await openNewActualDialog();
    fireEvent.change(dialog.getByRole("textbox", { name: "Title" }), {
      target: { value: "Discarded title" },
    });

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Edit Actual" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId("actual-block")).not.toBeInTheDocument();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("discards a changed draft when the backdrop is clicked", async () => {
    const dialog = await openNewActualDialog();
    fireEvent.change(dialog.getByRole("textbox", { name: "Title" }), {
      target: { value: "Discarded title" },
    });

    fireEvent.click(screen.getByTestId("dialog-overlay"));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Edit Actual" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId("actual-block")).not.toBeInTheDocument();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("creates the default new Actual when Save is clicked without changes", async () => {
    const dialog = await openNewActualDialog();
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Edit Actual" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("actual-block")).toHaveTextContent("Untitled");
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it("saves title and duration while preserving an untouched out-of-palette color", async () => {
    const dialog = await openNewActualDialog();
    fireEvent.change(dialog.getByRole("textbox", { name: "Title" }), {
      target: { value: "Deep work" },
    });
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Duration" }), {
      target: { value: "45" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1),
    );
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({
        actual: [
          expect.objectContaining({
            summary: "Deep work",
            durationMinutes: 45,
            colorId: "8",
          }),
        ],
      }),
    });
  });

  it("clears a selected palette color when its swatch is clicked again", async () => {
    const dialog = await openNewActualDialog();
    const swatch = dialog.getByRole("button", { name: "Color 11" });

    fireEvent.click(swatch);
    expect(swatch).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(swatch);
    expect(swatch).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1),
    );
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({
        actual: [expect.objectContaining({ colorId: "" })],
      }),
    });
  });

  it("visibly selects and persists a different palette color", async () => {
    const dialog = await openNewActualDialog();
    const swatch = dialog.getByRole("button", { name: "Color 6" });

    fireEvent.click(swatch);

    expect(swatch).toHaveAttribute("aria-pressed", "true");
    expect(
      within(swatch).getByTestId("selected-color-indicator"),
    ).toBeInTheDocument();

    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1),
    );
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({
        actual: [expect.objectContaining({ colorId: "6" })],
      }),
    });
  });

  it("opens an existing Actual and persists its edited title", async () => {
    const dialog = await openExistingActualDialog();
    const title = dialog.getByRole("textbox", { name: "Title" });

    expect(title).toHaveFocus();
    expect(title).toHaveProperty("selectionStart", "Existing title".length);
    expect(title).toHaveProperty("selectionEnd", "Existing title".length);
    fireEvent.change(title, {
      target: { value: "Edited title" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        "dayRecord:2026-07-15": expect.objectContaining({
          actual: [
            expect.objectContaining({
              id: "existing-actual",
              summary: "Edited title",
            }),
          ],
        }),
      }),
    );
    expect(screen.getByText("Edited title")).toBeVisible();
  });

  it("closes an unchanged existing Actual without writing", async () => {
    const dialog = await openExistingActualDialog();
    const createId = vi.fn(() => "replacement-id");
    vi.stubGlobal("crypto", { randomUUID: createId });

    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Edit Actual" }),
      ).not.toBeInTheDocument(),
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(createId).not.toHaveBeenCalled();
  });

  it("gives a meaningfully edited Calendar-saved Actual a fresh identity", async () => {
    const dialog = await openExistingActualDialog({
      saveDisposition: "calendarSaved",
      calendarEventId: "calendar-event-id",
      lastSaveAttemptAt: "2026-07-15T19:00:00.000Z",
      lastSaveError: { code: "STALE", message: "Stale error" },
    });
    vi.stubGlobal("crypto", { randomUUID: () => "replacement-id" });

    fireEvent.change(dialog.getByRole("spinbutton", { name: "Duration" }), {
      target: { value: "45" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        "dayRecord:2026-07-15": expect.objectContaining({
          actual: [
            {
              id: "replacement-id",
              summary: "Existing title",
              startMinutes: 720,
              durationMinutes: 45,
              colorId: "8",
              saveDisposition: "unsaved",
            },
          ],
        }),
      }),
    );
  });

  it("persists a released Calendar-saved resize once with a fresh identity", async () => {
    const stored = mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
    stored["dayRecord:2026-07-15"] = {
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual: [
        {
          id: "calendar-saved-actual",
          summary: "Resizable Actual",
          startMinutes: 540,
          durationMinutes: 30,
          colorId: "8",
          saveDisposition: "calendarSaved",
          calendarEventId: "calendar-event-id",
          lastSaveAttemptAt: "2026-07-15T19:00:00.000Z",
        },
      ],
      updatedAt: "2026-07-15T19:00:00.000Z",
    };
    vi.stubGlobal("crypto", { randomUUID: () => "resized-actual-id" });

    render(<App now={now} />);
    const handle = await screen.findByRole("button", {
      name: "Resize Resizable Actual",
    });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 3 });
    fireEvent.pointerMove(window, { clientY: 121, pointerId: 3 });

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Edit Actual" }))
      .not.toBeInTheDocument();

    fireEvent.pointerUp(window, { clientY: 121, pointerId: 3 });

    await waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1),
    );
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({
        actual: [
          {
            id: "resized-actual-id",
            summary: "Resizable Actual",
            startMinutes: 540,
            durationMinutes: 45,
            colorId: "8",
            saveDisposition: "unsaved",
          },
        ],
      }),
    });
  });

  it("deletes the local block without touching Calendar", async () => {
    const dialog = await openExistingActualDialog();
    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByTestId("actual-block")).not.toBeInTheDocument(),
    );
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      "dayRecord:2026-07-15": expect.objectContaining({ actual: [] }),
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "calendar.deleteEvent" }),
    );
  });
});

describe("App Slack audit", () => {
  function connectCalendar() {
    return mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
  }

  it("uses compact accessible icon controls in the Actual header", async () => {
    connectCalendar();

    render(<App now={now} launchSlack={vi.fn()} />);

    const addActual = await screen.findByRole("button", {
      name: "Add Actual",
    });
    const logSlack = screen.getByRole("button", {
      name: "Log Slack time",
    });
    expect(addActual).toHaveAttribute("aria-label", "Add Actual");
    expect(logSlack).toHaveAttribute("aria-label", "Log Slack time");
    expect(within(addActual).queryByText("Add Actual")).not.toBeInTheDocument();
    expect(within(logSlack).queryByText("Slack")).not.toBeInTheDocument();
    expect(within(logSlack).getByTestId("slack-mark-icon")).toBeVisible();
    expect(logSlack).toHaveClass("text-muted-foreground");
  });

  it("disables Slack submission until a reason is entered", async () => {
    connectCalendar();
    const launchSlack = vi.fn();

    render(<App now={now} launchSlack={launchSlack} />);
    const logSlack = await screen.findByRole("button", {
      name: "Log Slack time",
    });
    await waitFor(() => expect(logSlack).toBeEnabled());
    fireEvent.click(logSlack);
    const popover = await screen.findByRole("dialog", {
      name: "Log Slack time",
    });
    const reason = within(popover).getByPlaceholderText(
      "attention is devotion :)",
    );
    const submit = within(popover).getByRole("button", {
      name: "Open Slack",
    });

    expect(submit).toBeDisabled();
    expect(submit).toHaveClass("disabled:opacity-50");
    fireEvent.change(reason, { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.change(reason, { target: { value: "Check release channel" } });
    expect(submit).toBeEnabled();
    expect(screen.queryByText("Reason is required.")).not.toBeInTheDocument();
    expect(launchSlack).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(screen.queryByTestId("actual-block")).not.toBeInTheDocument();
  });

  it("logs a normal Slack-marked Actual and launches from the submit click", async () => {
    const stored = connectCalendar();
    const launchSlack = vi.fn();
    vi.stubGlobal("crypto", { randomUUID: () => "slack-actual-id" });

    render(<App now={now} launchSlack={launchSlack} />);
    const logSlack = await screen.findByRole("button", {
      name: "Log Slack time",
    });
    await waitFor(() => expect(logSlack).toBeEnabled());
    fireEvent.click(logSlack);

    const popover = await screen.findByRole("dialog", {
      name: "Log Slack time",
    });
    expect(popover).toHaveClass("w-56", "p-3");
    expect(within(popover).getByText("What are you up to?")).toBeVisible();
    const reason = within(popover).getByPlaceholderText(
      "attention is devotion :)",
    );
    expect(reason).toHaveFocus();
    expect(reason).toHaveClass("border-b", "bg-transparent");
    expect(reason).not.toHaveClass("rounded-sm");
    expect(
      within(popover).getByRole("button", { name: "Open Slack" }),
    ).toHaveClass("h-8");
    expect(
      within(popover).getByRole("button", { name: "Open Slack" }),
    ).not.toHaveClass("w-full");
    fireEvent.change(reason, {
      target: { value: "  Check release channel  " },
    });
    fireEvent.click(within(popover).getByRole("button", {
      name: "Open Slack",
    }));

    expect(launchSlack).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", {
      name: "Log Slack time",
    })).not.toBeInTheDocument();
    const block = await screen.findByTestId("actual-block");
    expect(block).toHaveTextContent("Check release channel");
    expect(block).toHaveTextContent("15m");
    expect(block).toHaveStyle({ zIndex: "0" });
    expect(stored["dayRecord:2026-07-15"]).toMatchObject({
      actual: [{
        id: "slack-actual-id",
        summary: "Check release channel",
        startMinutes: 720,
        durationMinutes: 15,
        colorId: "1",
        isSlack: true,
        saveDisposition: "unsaved",
      }],
    });
  });

  it("keeps the Slack Actual and warns when launching throws", async () => {
    const stored = connectCalendar();
    const launchSlack = vi.fn(() => {
      throw new Error("Protocol blocked");
    });

    render(<App now={now} launchSlack={launchSlack} />);
    const logSlack = await screen.findByRole("button", {
      name: "Log Slack time",
    });
    await waitFor(() => expect(logSlack).toBeEnabled());
    fireEvent.click(logSlack);
    fireEvent.change(screen.getByPlaceholderText("attention is devotion :)"), {
      target: { value: "Incident response" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Slack" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Slack may not have opened. Your time was still logged.",
    );
    expect(screen.getByTestId("actual-block")).toHaveTextContent(
      "Incident response",
    );
    expect(stored["dayRecord:2026-07-15"]).toMatchObject({
      actual: [{ isSlack: true }],
    });
  });

  it("bounds a late-night Slack Actual at midnight", async () => {
    const stored = connectCalendar();

    render(
      <App
        now={() => new Date("2026-07-15T23:58:00-07:00")}
        launchSlack={vi.fn()}
      />,
    );
    const logSlack = await screen.findByRole("button", {
      name: "Log Slack time",
    });
    await waitFor(() => expect(logSlack).toBeEnabled());
    fireEvent.click(logSlack);
    fireEvent.change(screen.getByPlaceholderText("attention is devotion :)"), {
      target: { value: "Late check" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Slack" }));

    expect(stored["dayRecord:2026-07-15"]).toMatchObject({
      actual: [{ startMinutes: 1435, durationMinutes: 5 }],
    });
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

  it("disables Actual creation until Calendar saving finishes", async () => {
    let listRequests = 0;
    let finishCalendarRefresh: ((value: unknown) => void) | undefined;
    const stored = mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        listRequests += 1;
        if (listRequests === 1) {
          return {
            ok: true,
            value: {
              events: [timedEvent],
              date: "2026-07-15",
              timeZone: "America/Los_Angeles",
            },
          };
        }
        return new Promise((resolve) => {
          finishCalendarRefresh = resolve;
        });
      }
      return unexpectedMessage(message);
    });
    seedUnsavedActual(stored);

    render(<App now={now} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    const resize = await screen.findByRole("button", {
      name: "Resize Design review",
    });
    const planBlock = screen.getByTestId("plan-event-design-review");
    await waitFor(() => expect(add).toBeEnabled());
    expect(resize).toBeEnabled();
    expect(planBlock).toHaveAttribute("draggable", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Save Actual to calendar" }),
    );

    expect(add).toBeDisabled();
    expect(resize).toBeDisabled();
    expect(planBlock).toHaveAttribute("draggable", "false");
    finishCalendarRefresh?.({
      ok: true,
      value: {
        events: [timedEvent],
        date: "2026-07-15",
        timeZone: "America/Los_Angeles",
      },
    });

    expect(await screen.findByTestId("actual-save-summary")).toHaveTextContent(
      "1 matched Plan",
    );
    await waitFor(() => expect(add).toBeEnabled());
    expect(resize).toBeEnabled();
    expect(planBlock).toHaveAttribute("draggable", "true");
  });

  it("permanently classifies an exact Plan match without inserting", async () => {
    const handler = vi.fn(async (message: RuntimeMessage) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [timedEvent], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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

describe("App Revised persistence", () => {
  it("edits, resizes, and deletes Revised blocks without offering Calendar Save", async () => {
    const stored = mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
    stored["dayRecord:2026-07-15"] = {
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual: [],
      revised: [{
        id: "revised-1",
        summary: "Original Revised",
        startMinutes: 720,
        durationMinutes: 30,
        colorId: "6",
        sourceCalendarEventId: "plan-1",
      }],
      updatedAt: "2026-07-15T19:00:00.000Z",
    };

    render(<App now={now} />);

    expect(await screen.findByText("Original Revised")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save Actual to calendar" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Original Revised" }),
    );
    const dialog = within(
      await screen.findByRole("dialog", { name: "Edit Revised" }),
    );
    fireEvent.change(dialog.getByRole("textbox", { name: "Title" }), {
      target: { value: "Edited Revised" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Edited Revised")).toBeVisible();
    expect(stored["dayRecord:2026-07-15"]).toMatchObject({
      actual: [],
      revised: [{
        id: "revised-1",
        summary: "Edited Revised",
        sourceCalendarEventId: "plan-1",
      }],
    });

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Resize Edited Revised" }),
      { clientY: 100, pointerId: 8 },
    );
    fireEvent.pointerMove(window, { clientY: 121, pointerId: 8 });
    fireEvent.pointerUp(window, { clientY: 121, pointerId: 8 });

    await waitFor(() =>
      expect(stored["dayRecord:2026-07-15"]).toMatchObject({
        revised: [{ durationMinutes: 45 }],
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Edited Revised" }),
    );
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Edit Revised" }))
        .getByRole("button", { name: "Delete" }),
    );

    await waitFor(() =>
      expect(stored["dayRecord:2026-07-15"]).toMatchObject({
        actual: [],
        revised: [],
      }),
    );
    expect(screen.queryByTestId("revised-block")).not.toBeInTheDocument();
  });
});

describe("App Plan copy dragging", () => {
  it("disables Plan dragging until the canonical storage read settles", async () => {
    let finishRead: ((value: Record<string, unknown>) => void) | undefined;
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [timedEvent],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );

    render(<App now={now} />);
    const planBlock = await screen.findByTestId(
      "plan-event-design-review",
    );
    expect(planBlock).toHaveAttribute("draggable", "false");

    finishRead?.({});
    await waitFor(() =>
      expect(planBlock).toHaveAttribute("draggable", "true")
    );
  });

  it("copies Plan into Actual and Revised with distinct identities and provenance", async () => {
    const stored = mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [timedEvent],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
    const ids = ["actual-copy", "revised-copy"];
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => ids.shift() ?? "unexpected-id"),
    });

    render(<App now={now} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    const planBlock = screen.getByTestId("plan-event-design-review");
    vi.spyOn(planBlock, "getBoundingClientRect").mockReturnValue({
      top: 168,
      bottom: 252,
      left: 0,
      right: 200,
      width: 200,
      height: 84,
      x: 0,
      y: 168,
      toJSON: () => undefined,
    });

    for (const [targetTestId, clientY] of [
      ["actual-column", 399],
      ["revised-column", 483],
    ] as const) {
      const target = screen.getByTestId(targetTestId);
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
        top: 0,
        bottom: 1_176,
        left: 200,
        right: 400,
        width: 200,
        height: 1_176,
        x: 200,
        y: 0,
        toJSON: () => undefined,
      });
      const transfer = dragDataTransfer();
      fireDragEvent(planBlock, "dragstart", 210, transfer);
      fireDragEvent(target, "dragover", clientY, transfer);
      fireDragEvent(target, "drop", clientY, transfer);
    }

    await waitFor(() =>
      expect(stored["dayRecord:2026-07-15"]).toEqual({
        schemaVersion: 1,
        date: "2026-07-15",
        timezone: "America/Los_Angeles",
        actual: [{
          id: "actual-copy",
          summary: "Design review",
          startMinutes: 675,
          durationMinutes: 60,
          colorId: "9",
          sourceCalendarEventId: "design-review",
          saveDisposition: "unsaved",
        }],
        revised: [{
          id: "revised-copy",
          summary: "Design review",
          startMinutes: 735,
          durationMinutes: 60,
          colorId: "9",
          sourceCalendarEventId: "design-review",
        }],
        updatedAt: "2026-07-15T19:00:00.000Z",
      }),
    );
  });

  it("keeps a failed Plan copy visible and surfaces the storage warning", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [timedEvent],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(
      new Error("quota exceeded"),
    );

    render(<App now={now} />);
    const add = await screen.findByRole("button", { name: "Add Actual" });
    await waitFor(() => expect(add).toBeEnabled());
    const planBlock = screen.getByTestId("plan-event-design-review");
    vi.spyOn(planBlock, "getBoundingClientRect").mockReturnValue({
      top: 168,
      bottom: 252,
      left: 0,
      right: 200,
      width: 200,
      height: 84,
      x: 0,
      y: 168,
      toJSON: () => undefined,
    });
    const actualColumn = screen.getByTestId("actual-column");
    vi.spyOn(actualColumn, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 1_176,
      left: 200,
      right: 400,
      width: 200,
      height: 1_176,
      x: 200,
      y: 0,
      toJSON: () => undefined,
    });
    const transfer = dragDataTransfer();

    fireDragEvent(planBlock, "dragstart", 210, transfer);
    fireDragEvent(actualColumn, "drop", 399, transfer);

    expect(await screen.findByTestId("actual-block")).toHaveTextContent(
      "Design review",
    );
    expect(await screen.findByTestId("actual-storage-error"))
      .toHaveTextContent("Unable to save local changes.");
  });
});

describe("App editable dragging", () => {
  function seedEditableRecord(
    stored: Record<string, unknown>,
    actual: ActualEvent[],
  ) {
    stored["dayRecord:2026-07-15"] = {
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual,
      revised: [],
      updatedAt: "2026-07-15T18:00:00.000Z",
    };
  }

  function connectWithTimedPlan() {
    return mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            events: [timedEvent],
            date: "2026-07-15",
            timeZone: "America/Los_Angeles",
          },
        };
      }
      return unexpectedMessage(message);
    });
  }

  function mockDragRect(
    element: Element,
    top: number,
    left: number,
    width = 200,
    height = 42,
  ) {
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      top,
      bottom: top + height,
      left,
      right: left + width,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => undefined,
    });
  }

  it("moves an untouched Actual to Revised and back without changing its ID", async () => {
    const stored = connectWithTimedPlan();
    seedEditableRecord(stored, [{
      id: "movable-actual",
      summary: "Movable",
      startMinutes: 600,
      durationMinutes: 30,
      colorId: "8",
      sourceCalendarEventId: "plan-source",
      isSlack: true,
      saveDisposition: "unsaved",
    }]);

    render(<App now={now} />);
    const actualSource = await screen.findByRole("button", {
      name: "Edit Movable",
    });
    mockDragRect(actualSource, 252, 200);
    const revisedTarget = screen.getByTestId("revised-column");
    mockDragRect(revisedTarget, 0, 400, 200, 1_176);
    let transfer = dragDataTransfer();

    fireEvent.mouseDown(actualSource, { clientY: 273 });
    fireDragEvent(actualSource, "dragstart", 273, transfer);
    fireDragEvent(revisedTarget, "drop", 441, transfer);

    await waitFor(() =>
      expect(stored["dayRecord:2026-07-15"]).toMatchObject({
        actual: [],
        revised: [{
          id: "movable-actual",
          startMinutes: 720,
          sourceCalendarEventId: "plan-source",
          isSlack: true,
        }],
      }),
    );

    const revisedSource = await screen.findByRole("button", {
      name: "Edit Movable",
    });
    mockDragRect(revisedSource, 420, 400);
    const actualTarget = screen.getByTestId("actual-column");
    mockDragRect(actualTarget, 0, 200, 200, 1_176);
    transfer = dragDataTransfer();
    fireEvent.mouseDown(revisedSource, { clientY: 441 });
    fireDragEvent(revisedSource, "dragstart", 441, transfer);
    fireDragEvent(actualTarget, "drop", 462, transfer);

    await waitFor(() =>
      expect(stored["dayRecord:2026-07-15"]).toEqual({
        schemaVersion: 1,
        date: "2026-07-15",
        timezone: "America/Los_Angeles",
        actual: [{
          id: "movable-actual",
          summary: "Movable",
          startMinutes: 735,
          durationMinutes: 30,
          colorId: "8",
          sourceCalendarEventId: "plan-source",
          isSlack: true,
          saveDisposition: "unsaved",
        }],
        revised: [],
        updatedAt: "2026-07-15T19:00:00.000Z",
      }),
    );
  });

  it("repositions a Calendar-saved Actual under a fresh unsaved ID", async () => {
    const stored = connectWithTimedPlan();
    seedEditableRecord(stored, [{
      id: "saved-actual",
      summary: "Saved Actual",
      startMinutes: 600,
      durationMinutes: 30,
      colorId: "8",
      saveDisposition: "calendarSaved",
      calendarEventId: "calendar-event",
      lastSaveAttemptAt: "2026-07-15T18:30:00.000Z",
    }]);
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "fresh-actual"),
    });

    render(<App now={now} />);
    const source = await screen.findByRole("button", {
      name: "Edit Saved Actual",
    });
    mockDragRect(source, 252, 200);
    const target = screen.getByTestId("actual-column");
    mockDragRect(target, 0, 200, 200, 1_176);
    const transfer = dragDataTransfer();

    fireEvent.mouseDown(source, { clientY: 273 });
    fireDragEvent(source, "dragstart", 273, transfer);
    fireDragEvent(target, "drop", 357, transfer);

    await waitFor(() =>
      expect(stored["dayRecord:2026-07-15"]).toMatchObject({
        actual: [{
          id: "fresh-actual",
          summary: "Saved Actual",
          startMinutes: 660,
          saveDisposition: "unsaved",
        }],
        revised: [],
      }),
    );
    const savedRecord = stored["dayRecord:2026-07-15"] as {
      actual: ActualEvent[];
    };
    expect(savedRecord.actual[0]).not.toHaveProperty("calendarEventId");
    expect(savedRecord.actual[0]).not.toHaveProperty("lastSaveAttemptAt");
  });
});
