import { chromium, expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getExtensionLaunchOptions } from "./extension-launch-options";

type Scenario = "empty" | "existing" | "monday-failure" | "weekend";

async function createExtension(scenario: Scenario) {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "weekly-practice-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  const now = scenario === "weekend"
    ? "2026-07-18T19:00:00.000Z"
    : "2026-07-15T19:00:00.000Z";
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createRuntimeMessageHandlers } from "./runtime-message-handlers.js";

let mondayFailures = ${scenario === "monday-failure" ? "1" : "0"};
let mondayEvents = ${scenario === "existing" ? `[{
  kind: "allDay", id: "manual-practice", summary: "Practice deep listening",
  colorId: "4", startDate: "2026-07-13", endDate: "2026-07-14",
}]` : "[]"};

registerServiceWorker(createRuntimeMessageHandlers({
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async (_token, range) => {
    const monday = range.timeMin.startsWith("2026-07-13");
    await chrome.storage.local.set({ "test:lastPracticeRange": range });
    if (monday && mondayFailures > 0) {
      mondayFailures -= 1;
      return { ok: false, error: { code: "SEEDED", message: "Monday failed" } };
    }
    return { ok: true, value: {
      timeZone: "America/Los_Angeles",
      events: monday ? mondayEvents : [],
    } };
  },
  insertPrimaryCalendarEvent: async (_token, event) => {
    await chrome.storage.local.set({ "test:lastPracticeInsert": event });
    mondayEvents = [{
      kind: "allDay", id: event.id, summary: event.summary,
      colorId: event.colorId ?? null, startDate: event.start.date, endDate: event.end.date,
    }];
    return { ok: true, value: { eventId: event.id } };
  },
  listDayRecords: async () => ({ records: [], invalidKeys: [] }),
  saveDayRecord: async () => undefined,
  deleteDayRecord: async () => undefined,
}, { now: () => new Date("${now}") }));
`,
  );
  return extensionPath;
}

async function openExtension(extensionPath: string, scenario: Scenario) {
  const context = await chromium.launchPersistentContext("", {
    ...getExtensionLaunchOptions(),
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(
    scenario === "weekend" ? "2026-07-18T12:00:00-07:00" : "2026-07-15T12:00:00-07:00",
  ));
  await page.goto(`chrome-extension://${worker.url().split("/")[2]}/index.html`);
  return { context, page };
}

test("loads Monday only, creates practice, and reloads it", async () => {
  const extensionPath = await createExtension("empty");
  const { context, page } = await openExtension(extensionPath, "empty");
  try {
    const input = page.getByPlaceholder("practice");
    await input.fill("  Concise writing  ");
    await input.press("Enter");
    await expect(page.getByText("Concise writing")).toBeVisible();
    await expect(page.getByTestId("weekly-practice-toast")).toHaveText(
      "Weekly practice saved to calendar",
    );
    expect(await page.evaluate(async () =>
      (await chrome.storage.local.get("test:lastPracticeInsert"))["test:lastPracticeInsert"],
    )).toEqual({
      id: "parpractice20260713",
      summary: "Concise writing",
      start: { date: "2026-07-13" },
      end: { date: "2026-07-14" },
      colorId: "4",
      visibility: "private",
      transparency: "transparent",
      reminders: { useDefault: false },
    });
    await page.reload();
    await expect(page.getByText("Concise writing")).toBeVisible();
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("keeps the planner usable and hides practice when Monday fails", async () => {
  const extensionPath = await createExtension("monday-failure");
  const { context, page } = await openExtension(extensionPath, "monday-failure");
  try {
    await expect(page.getByRole("region", { name: "Day grid" })).toBeVisible();
    await expect(page.getByTestId("weekly-practice-banner")).toHaveCount(0);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("hides practice and skips its Monday read on weekends", async () => {
  const extensionPath = await createExtension("weekend");
  const { context, page } = await openExtension(extensionPath, "weekend");
  try {
    await expect(page.getByTestId("weekly-practice-banner")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Day grid" })).toBeVisible();
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
