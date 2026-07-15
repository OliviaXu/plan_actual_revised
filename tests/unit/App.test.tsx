import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App";

type RuntimeHandler = (message: { type: string }) => Promise<unknown>;

function mockRuntime(handler: RuntimeHandler) {
  vi.stubGlobal("chrome", {
    runtime: { sendMessage: vi.fn(handler) },
  });
}

function unexpectedMessage(message: { type: string }): Promise<never> {
  return Promise.reject(
    new Error(`Unexpected runtime message: ${message.type}`),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App Calendar states", () => {
  it("starts disconnected without checking auth", () => {
    mockRuntime(unexpectedMessage);

    render(<App />);

    expect(screen.getByTestId("calendar-status")).toHaveTextContent(
      "Calendar disconnected",
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("shows connecting while interactive auth is pending", async () => {
    mockRuntime((message) => {
      if (message.type === "auth.requestInteractiveToken") {
        return new Promise(() => undefined);
      }

      return unexpectedMessage(message);
    });
    render(<App />);
    await screen.findByText("Calendar disconnected");

    fireEvent.click(screen.getByRole("button", { name: "Connect Calendar" }));

    expect(screen.getByTestId("calendar-status")).toHaveTextContent(
      "Connecting Calendar",
    );
  });

  it("shows the Calendar event count after connecting", async () => {
    mockRuntime((message) => {
      if (message.type === "auth.requestInteractiveToken") {
        return Promise.resolve({ ok: true, value: { status: "connected" } });
      }
      if (message.type === "calendar.listEvents") {
        return Promise.resolve({ ok: true, value: { eventCount: 2 } });
      }

      return unexpectedMessage(message);
    });
    render(<App />);
    await screen.findByText("Calendar disconnected");

    fireEvent.click(screen.getByRole("button", { name: "Connect Calendar" }));

    expect(await screen.findByTestId("calendar-status")).toHaveTextContent(
      "Calendar connected",
    );
    expect(screen.getByTestId("calendar-result")).toHaveTextContent(
      "Calendar returned 2 events",
    );
  });

  it("shows an interactive auth failure", async () => {
    mockRuntime((message) => {
      if (message.type === "auth.requestInteractiveToken") {
        return Promise.resolve({
          ok: false,
          error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "Access denied." },
        });
      }

      return unexpectedMessage(message);
    });
    render(<App />);
    await screen.findByText("Calendar disconnected");

    fireEvent.click(screen.getByRole("button", { name: "Connect Calendar" }));

    expect(await screen.findByTestId("calendar-error")).toHaveTextContent(
      "Access denied.",
    );
  });

  it("shows a Calendar API failure", async () => {
    mockRuntime((message) => {
      if (message.type === "auth.requestInteractiveToken") {
        return Promise.resolve({ ok: true, value: { status: "connected" } });
      }
      if (message.type === "calendar.listEvents") {
        return Promise.resolve({
          ok: false,
          error: { code: "CALENDAR_LIST_FAILED", message: "Calendar failed." },
        });
      }

      return unexpectedMessage(message);
    });
    render(<App />);
    await screen.findByText("Calendar disconnected");

    fireEvent.click(screen.getByRole("button", { name: "Connect Calendar" }));

    expect(await screen.findByTestId("calendar-error")).toHaveTextContent(
      "Calendar failed.",
    );
  });
});
