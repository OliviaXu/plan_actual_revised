import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DayPlanner } from "../../src/app/DayPlanner";

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
});
