import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App";

function installChrome(events: unknown[] = []) {
  const stored: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(async (message: { type: string }) => {
        if (message.type === "calendar.listEvents") {
          return {
            ok: true,
            value: {
              date: "2026-07-15",
              timeZone: "America/Los_Angeles",
              events,
            },
          };
        }
        if (message.type === "calendar.listEventsForDate") {
          return { ok: true, value: { events: [] } };
        }
        if (message.type === "catchUp.run") {
          return { ok: true, value: { saved: 0, failed: 0, discarded: 0 } };
        }
        return { ok: true, value: undefined };
      }),
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(stored, items)),
        remove: vi.fn(async (key: string) => delete stored[key]),
      },
    },
  });
}

const now = () => new Date("2026-07-15T12:00:00-07:00");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App reflection entry point", () => {
  it("places the manual trigger above the daily focus and opens reflection", async () => {
    installChrome();
    render(<App launchSlack={vi.fn()} now={now} />);

    const trigger = await screen.findByRole("button", { name: "Reflect on today" });
    expect(screen.getByTestId("app-date-header")).not.toContainElement(trigger);
    expect(screen.getByTestId("daily-focus-banner").parentElement)
      .toContainElement(trigger);
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Reflect on Wednesday, July 15",
    );
  });

  it("omits the manual trigger from the side panel", async () => {
    installChrome();
    render(<App appSurface="side-panel" launchSlack={vi.fn()} now={now} />);
    await screen.findByRole("region", { name: "Day grid" });
    expect(screen.queryByRole("button", { name: "Reflect on today" }))
      .not.toBeInTheDocument();
  });

  it("hides the trigger when Calendar already contains today's reflection", async () => {
    installChrome([{
      kind: "allDay",
      id: "parreflection20260715",
      summary: "[Done] Frog",
      description: "Reflection: Done",
      colorId: null,
      startDate: "2026-07-15",
      endDate: "2026-07-16",
      isReflection: true,
    }]);
    render(<App launchSlack={vi.fn()} now={now} />);
    await screen.findByRole("region", { name: "Day grid" });
    await waitFor(() => expect(
      screen.queryByRole("button", { name: "Reflect on today" }),
    ).not.toBeInTheDocument());
  });
});
