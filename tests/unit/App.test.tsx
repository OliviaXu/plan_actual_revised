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

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
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
      "Unable to save Actual locally.",
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
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
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
    const save = screen.getByRole("button", {
      name: "Save Actual to calendar",
    });
    expect(save).toBeEnabled();

    finishWrite?.();
  });

  it("treats a rare storage read failure as an empty usable day", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return { ok: true, value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" } };
      }
      return unexpectedMessage(message);
    });
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
      new Error("profile storage unavailable"),
    );

    render(<App now={now} />);

    expect(await screen.findByTestId("actual-storage-error")).toHaveTextContent(
      "Unable to load Actuals from local storage.",
    );
    const add = screen.getByRole("button", { name: "Add Actual" });
    expect(add).toBeEnabled();
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

  it("keeps Actual creation disabled while Calendar is disconnected", async () => {
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

    expect(
      await screen.findByRole("button", { name: "Add Actual" }),
    ).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Actual" })).toBeVisible();
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

  async function openExistingActualDialog() {
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

    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Edit Actual" }),
      ).not.toBeInTheDocument(),
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
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
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(
      screen.getByRole("button", { name: "Save Actual to calendar" }),
    );

    expect(add).toBeDisabled();
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
