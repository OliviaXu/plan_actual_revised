import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type SeededEvent =
  | {
      kind: "timed";
      id: string;
      summary: string | null;
      colorId: string | null;
      start: string;
      end: string;
      timeZone: string | null;
    }
  | {
      kind: "allDay";
      id: string;
      summary: string;
      colorId: string | null;
      startDate: string;
      endDate: string;
    };

function timedEvent(
  id: string,
  start: string,
  end: string,
  colorId: string | null,
  summary: string | null = id,
): SeededEvent {
  return {
    kind: "timed",
    id,
    summary,
    colorId,
    start,
    end,
    timeZone: "America/Los_Angeles",
  };
}

function allDayEvent(id: string, colorId: string): SeededEvent {
  return {
    kind: "allDay",
    id,
    summary: id,
    colorId,
    startDate: "2026-07-15",
    endDate: "2026-07-16",
  };
}

async function createSeededExtension(events: SeededEvent[]) {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "plan-eligibility-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";

registerServiceWorker({
  openAppPage: () => chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => ({
    ok: true,
    value: { timeZone: "America/Los_Angeles", events: ${JSON.stringify(events)} },
  }),
}, () => new Date("2026-07-15T19:00:00.000Z"));
`,
  );
  return extensionPath;
}

async function openExtension(extensionPath: string) {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = serviceWorker.url().split("/")[2];
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-07-15T12:00:00-07:00"));
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  return { context, page };
}

test("renders only eligible Plan events with Calendar color tokens", async () => {
  const extensionPath = await createSeededExtension([
    timedEvent(
      "visible-lavender",
      "2026-07-15T09:00:00-07:00",
      "2026-07-15T10:00:00-07:00",
      "1",
    ),
    timedEvent(
      "visible-grape",
      "2026-07-15T10:00:00-07:00",
      "2026-07-15T11:00:00-07:00",
      "3",
    ),
    timedEvent(
      "hidden-early",
      "2026-07-15T05:30:00-07:00",
      "2026-07-15T06:00:00-07:00",
      "2",
    ),
    timedEvent(
      "hidden-late",
      "2026-07-15T22:00:00-07:00",
      "2026-07-15T22:30:00-07:00",
      "10",
    ),
    allDayEvent("daily-focus", "5"),
    allDayEvent("weekly-learning", "4"),
    allDayEvent("unrelated-all-day", "9"),
    timedEvent(
      "untitled-default-color",
      "2026-07-15T11:00:00-07:00",
      "2026-07-15T11:30:00-07:00",
      null,
      null,
    ),
  ]);
  const { context, page } = await openExtension(extensionPath);

  try {
    const grid = page.getByTestId("day-grid-body");
    await expect(grid).toHaveAttribute("data-start-hour", "7");
    await expect(grid).toHaveAttribute("data-end-hour", "21");

    for (const excludedId of [
      "hidden-early",
      "hidden-late",
      "daily-focus",
      "weekly-learning",
      "unrelated-all-day",
    ]) {
      await expect(
        page.locator(`[data-calendar-event-id="${excludedId}"]`),
      ).toHaveCount(0);
    }

    const lavender = page.locator(
      '[data-calendar-event-id="visible-lavender"]',
    );
    const grape = page.locator('[data-calendar-event-id="visible-grape"]');
    const inheritedColor = page.locator(
      '[data-calendar-event-id="untitled-default-color"]',
    );
    await expect(inheritedColor).toContainText("Untitled event");

    await expect(lavender).toHaveCSS(
      "background-color",
      "rgba(121, 134, 203, 0.25)",
    );
    await expect(lavender).toHaveCSS(
      "border-color",
      "rgba(121, 134, 203, 0.5)",
    );
    await expect(grape).toHaveCSS(
      "background-color",
      "rgba(142, 36, 170, 0.25)",
    );
    await expect(inheritedColor).toHaveClass(/border-border/);
    await expect(inheritedColor).toHaveClass(/bg-muted/);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
