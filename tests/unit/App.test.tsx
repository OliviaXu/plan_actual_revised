import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App";

type RuntimeMessage = {
  type: string;
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
  vi.stubGlobal("chrome", {
    runtime: { sendMessage: vi.fn(handler) },
  });
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
      screen.queryByRole("region", { name: "Plan day grid" }),
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
