import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getExtensionLaunchOptions } from "./extension-launch-options";

async function createExtension() {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "daily-reflection-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createRuntimeMessageHandlers } from "./runtime-message-handlers.js";

let events = [];
registerServiceWorker(createRuntimeMessageHandlers({
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => ({
    ok: true,
    value: { timeZone: "America/Los_Angeles", events },
  }),
  insertPrimaryCalendarEvent: async (_token, event) => {
    await chrome.storage.local.set({ "test:lastReflectionInsert": event });
    events = [{
      kind: "allDay",
      id: event.id,
      summary: event.summary,
      description: event.description ?? null,
      colorId: null,
      startDate: event.start.date,
      endDate: event.end.date,
      isReflection: true,
    }];
    return { ok: true, value: undefined };
  },
  listDayRecords: async () => ({ records: [], invalidKeys: [] }),
  saveDayRecord: async () => undefined,
  deleteDayRecord: async () => undefined,
}, { now: () => new Date("2026-07-15T19:00:00.000Z") }));
`,
  );
  return extensionPath;
}

async function openExtension(extensionPath: string) {
  const context = await chromium.launchPersistentContext("", {
    ...getExtensionLaunchOptions(),
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = worker.url().split("/")[2];
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-07-15T12:00:00-07:00"));
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  return { context, page };
}

async function readStorage(
  page: import("@playwright/test").Page,
  key: string,
) {
  return page.evaluate(
    async (storageKey) =>
      (await chrome.storage.local.get(storageKey))[storageKey],
    key,
  );
}

test("persists and saves a manual daily reflection", async () => {
  const extensionPath = await createExtension();
  const { context, page } = await openExtension(extensionPath);
  try {
    await page.getByRole("button", { name: "Reflect on today" }).click();
    await page.getByLabel("What else moved forward?").fill(
      "Helped unblock the customer rollout.",
    );
    await page.getByLabel("How’s our weekly practice going?").fill(
      "Asked one question before proposing a fix.",
    );
    await page.getByLabel("Next experiment?").fill("Start offline.");

    await page.reload();
    await page.getByRole("button", { name: "Reflect on today" }).click();
    await expect(page.getByLabel("What else moved forward?")).toHaveValue(
      "Helped unblock the customer rollout.",
    );
    await page.getByRole("button", { name: "Save reflection" }).click();

    await expect(page.getByTestId("daily-reflection-toast")).toHaveText(
      "Reflection saved to Calendar",
    );
    await expect(page.getByRole("button", { name: "Reflect on today" }))
      .toHaveCount(0);
    expect(await readStorage(page, "test:lastReflectionInsert")).toEqual({
      id: "parreflection20260715",
      summary: "[Not set] Helped unblock the customer rollout.",
      description: [
        "Daily focus: Not set",
        "Outcome: Not set",
        "Reflection: Helped unblock the customer rollout.",
        "Weekly practice reflection: Asked one question before proposing a fix.",
        "Next experiment: Start offline.",
      ].join("\n"),
      start: { date: "2026-07-15" },
      end: { date: "2026-07-16" },
      visibility: "private",
      transparency: "transparent",
      reminders: { useDefault: false },
      extendedProperties: {
        private: { planActualRevisedReflection: "true" },
      },
    });

    await page.reload();
    await expect(page.getByRole("button", { name: "Reflect on today" }))
      .toHaveCount(0);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
