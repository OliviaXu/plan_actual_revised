import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DayPlanner } from "../../src/app/components/DayPlanner";

const dayPlannerPropsWithoutFeedback: Omit<
  ComponentProps<typeof DayPlanner>,
  "onFeedback"
> = {
  calendarDay: { date: "2026-07-15", timeZone: "America/Los_Angeles" },
  launchSlack: vi.fn(),
  now: () => new Date("2026-07-15T12:00:00-07:00"),
  planEvents: [],
};

// @ts-expect-error DayPlanner operations must report feedback to its owner.
const invalidDayPlannerProps: ComponentProps<typeof DayPlanner> =
  dayPlannerPropsWithoutFeedback;
void invalidDayPlannerProps;

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
        onFeedback={vi.fn()}
        planEvents={[]}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Day grid" }),
    ).toBeVisible();
  });

  it("renders the day grid without owning daily intentions", async () => {
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
        onFeedback={vi.fn()}
        planEvents={[]}
      />,
    );

    await waitFor(() => expect(
      screen.getByRole("region", { name: "Day grid" }).parentElement,
    ).toHaveClass("gap-6"));

    expect(screen.queryByTestId("daily-focus-banner"))
      .not.toBeInTheDocument();
    expect(screen.queryByTestId("weekly-practice-banner"))
      .not.toBeInTheDocument();
  });

  it("does not expose daily intentions in its standalone contract", () => {
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
        onFeedback={vi.fn()}
        planEvents={[]}
      />,
    );

    expect(screen.queryByTestId("weekly-practice-banner"))
      .not.toBeInTheDocument();
  });
});
