import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DayPlanner } from "../../src/app/components/DayPlanner";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DayPlanner", () => {
  it("renders the interactive day canvas for a connected calendar day", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          value: { saved: 0, failed: 0, discarded: 0 },
        })),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    });

    render(
      <DayPlanner
        appSurface="standalone"
        calendarDay={{
          date: "2026-07-15",
          timeZone: "America/Los_Angeles",
        }}
        launchSlack={vi.fn()}
        now={() => new Date("2026-07-15T12:00:00-07:00")}
        planEvents={[]}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Day grid" }),
    ).toBeVisible();
  });

  it("keeps Focus and Practice compact while preserving space before the day grid", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          value: { saved: 0, failed: 0, discarded: 0 },
        })),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    });

    render(
      <DayPlanner
        appSurface="side-panel"
        calendarDay={{
          date: "2026-07-15",
          timeZone: "America/Los_Angeles",
        }}
        launchSlack={vi.fn()}
        now={() => new Date("2026-07-15T12:00:00-07:00")}
        planEvents={[]}
        weeklyPracticeState={{ status: "loaded", summary: undefined }}
      />,
    );

    await waitFor(() => expect(
      screen.getByRole("region", { name: "Day grid" }).parentElement,
    ).toHaveClass("gap-6"));

    expect(screen.getByTestId("daily-focus-banner").parentElement)
      .toHaveClass("gap-1");
  });

  it("does not mount an editable practice before Calendar resolves it", () => {
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    });

    render(
      <DayPlanner
        calendarDay={{
          date: "2026-07-15",
          timeZone: "America/Los_Angeles",
        }}
        launchSlack={vi.fn()}
        now={() => new Date("2026-07-15T12:00:00-07:00")}
        planEvents={[]}
      />,
    );

    expect(screen.queryByTestId("weekly-practice-banner"))
      .not.toBeInTheDocument();
  });
});
