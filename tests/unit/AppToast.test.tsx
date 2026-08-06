import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  App as ProductionApp,
  type AppProps,
} from "../../src/app/App";

type TestAppProps = Omit<AppProps, "launchSlack"> & {
  launchSlack?: () => void;
};

function App({ launchSlack = vi.fn(), ...props }: TestAppProps) {
  return <ProductionApp {...props} launchSlack={launchSlack} />;
}

type RuntimeMessage = { type: string; input?: unknown };
type RuntimeHandler = (message: RuntimeMessage) => Promise<unknown>;

const now = () => new Date("2026-07-15T12:00:00-07:00");

function mockRuntime(
  handler: RuntimeHandler,
  catchUpHandler: RuntimeHandler = async () => ({
    ok: true,
    value: { saved: 0, failed: 0, discarded: 0 },
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

function connectedCalendar(message: RuntimeMessage) {
  if (message.type === "calendar.listEvents") {
    return Promise.resolve({
      ok: true,
      value: {
        events: [],
        date: "2026-07-15",
        timeZone: "America/Los_Angeles",
      },
    });
  }
  return Promise.reject(new Error(`Unexpected message: ${message.type}`));
}

function seedUnsavedActual(stored: Record<string, unknown>) {
  stored["dayRecord:2026-07-15"] = {
    schemaVersion: 1,
    date: "2026-07-15",
    timezone: "America/Los_Angeles",
    actual: [{
      id: "actual-to-save",
      summary: "Write proposal",
      startMinutes: 720,
      durationMinutes: 30,
      colorId: "8",
      saveDisposition: "unsaved",
    }],
    revised: [],
    updatedAt: "2026-07-15T19:00:00.000Z",
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App operation toasts", () => {
  it("retries a failed manual save from a persistent toast and replaces it with success", async () => {
    let insertAttempts = 0;
    const stored = mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return connectedCalendar(message);
      }
      if (message.type === "calendar.insertEvent") {
        insertAttempts += 1;
        return insertAttempts === 1
          ? {
              ok: false,
              error: {
                code: "CALENDAR_EVENT_INSERT_FAILED",
                message: "Response lost.",
              },
            }
          : { ok: true, value: { eventId: "calendar-actual-id" } };
      }
      throw new Error(`Unexpected message: ${message.type}`);
    });
    seedUnsavedActual(stored);

    render(<App now={now} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Save Actual to calendar" }),
    );

    const failedToast = await screen.findByTestId("calendar-save-toast");
    expect(failedToast).toHaveRole("alert");
    expect(failedToast).toHaveTextContent("1 Actual couldn’t be saved.");
    expect(screen.queryByTestId("actual-save-summary")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(screen.getByTestId("calendar-save-toast"))
      .toHaveTextContent("Saved 1 Actual to Calendar."));
    expect(screen.getByTestId("calendar-save-toast")).toHaveRole("status");
    expect(insertAttempts).toBe(2);
  });

  it("leaves retained catch-up work for a future page load without offering retry", async () => {
    const catchUpHandler = vi.fn().mockResolvedValue({
      ok: true,
      value: { saved: 0, failed: 1, discarded: 0 },
    });
    mockRuntime(connectedCalendar, catchUpHandler);

    render(<App now={now} />);

    const failedToast = await screen.findByTestId("catch-up-toast");
    expect(failedToast).toHaveRole("alert");
    expect(failedToast).toHaveTextContent(
      "Catch-up: 1 Actual couldn’t be saved.",
    );
    expect(
      screen.queryByRole("button", { name: "Retry catch-up" }),
    ).not.toBeInTheDocument();
    expect(catchUpHandler).toHaveBeenCalledOnce();
  });

  it("does not offer a retry for discarded-only catch-up feedback", async () => {
    mockRuntime(
      connectedCalendar,
      vi.fn().mockResolvedValue({
        ok: true,
        value: { saved: 0, failed: 0, discarded: 1 },
      }),
    );

    render(<App now={now} />);

    const toast = await screen.findByTestId("catch-up-toast");
    expect(toast).toHaveTextContent("1 older Actual was discarded.");
    expect(
      screen.queryByRole("button", { name: "Retry catch-up" }),
    ).not.toBeInTheDocument();
  });

  it("keeps Calendar connection and Plan-load failures out of the toast", async () => {
    mockRuntime(async (message) => {
      if (message.type === "calendar.listEvents") {
        return {
          ok: false,
          error: { code: "CALENDAR_LIST_FAILED", message: "Calendar failed." },
        };
      }
      throw new Error(`Unexpected message: ${message.type}`);
    });

    render(<App now={now} />);

    expect(await screen.findByTestId("calendar-error")).toHaveTextContent(
      "Calendar failed.",
    );
    expect(screen.queryByTestId("calendar-save-toast")).not.toBeInTheDocument();
    expect(screen.queryByTestId("catch-up-toast")).not.toBeInTheDocument();
    expect(screen.queryByTestId("slack-launch-toast")).not.toBeInTheDocument();
  });
});
