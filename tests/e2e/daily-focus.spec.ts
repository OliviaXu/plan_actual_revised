import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getExtensionLaunchOptions } from "./extension-launch-options";

type Scenario = "empty" | "existing" | "failure";

async function createExtension(scenario: Scenario) {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "daily-focus-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createRuntimeMessageHandlers } from "./runtime-message-handlers.js";

let insertAttempts = 0;
let listCount = 0;
let events = ${scenario === "existing" ? `[{
  kind: "allDay",
  id: "manual-focus",
  summary: "Existing hard thing",
  description: "Do the uncomfortable first step",
  colorId: "5",
  startDate: "2026-07-15",
  endDate: "2026-07-16",
}, {
  kind: "allDay",
  id: "second-manual-focus",
  summary: "Ignored second focus",
  description: null,
  colorId: "5",
  startDate: "2026-07-15",
  endDate: "2026-07-16",
}]` : "[]"};

registerServiceWorker(createRuntimeMessageHandlers({
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => {
    listCount += 1;
    await chrome.storage.local.set({ "test:focusListCount": listCount });
    return { ok: true, value: { timeZone: "America/Los_Angeles", events } };
  },
  insertPrimaryCalendarEvent: async (_token, event) => {
    insertAttempts += 1;
    await chrome.storage.local.set({
      "test:lastFocusInsert": event,
      "test:focusInsertAttempts": insertAttempts,
    });
    if (${scenario === "failure" ? "true" : "false"} && insertAttempts === 1) {
      return { ok: false, error: { code: "CALENDAR_EVENT_INSERT_FAILED", message: "Seeded focus failure." } };
    }
    events = [{
      kind: "allDay",
      id: event.id,
      summary: event.summary,
      description: null,
      colorId: event.colorId ?? null,
      startDate: event.start.date,
      endDate: event.end.date,
    }];
    return { ok: true, value: { eventId: event.id } };
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

test("commits one daily focus, trusts creation, and reloads it from Calendar", async () => {
  const extensionPath = await createExtension("empty");
  const { context, page } = await openExtension(extensionPath);

  try {
    const input = page.getByPlaceholder(
      "struggling is how learning happens",
    );
    await expect(input).toBeVisible();
    await input.fill("  Write the difficult proposal  ");
    await input.press("Enter");

    await expect(page.getByText("Write the difficult proposal")).toBeVisible();
    await expect(page.getByTestId("daily-focus-toast")).toHaveText(
      "Daily focus saved to calendar",
    );
    await expect(input).toHaveCount(0);
    expect(await readStorage(page, "test:lastFocusInsert")).toEqual({
      id: "parfocus20260715",
      summary: "Write the difficult proposal",
      start: { date: "2026-07-15" },
      end: { date: "2026-07-16" },
      colorId: "5",
      visibility: "private",
      transparency: "transparent",
      reminders: { useDefault: false },
    });
    // One current-day read plus the isolated Monday practice read.
    expect(await readStorage(page, "test:focusListCount")).toBe(2);

    await page.reload();
    await expect(page.getByText("Write the difficult proposal")).toBeVisible();
    expect(await readStorage(page, "test:focusListCount")).toBe(4);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("shows only the first canonical configured-color focus", async () => {
  const extensionPath = await createExtension("existing");
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(page.getByText("Existing hard thing")).toBeVisible();
    await expect(
      page.getByText("Do the uncomfortable first step"),
    ).toHaveCount(0);
    await expect(page.getByText("Ignored second focus")).toHaveCount(0);
    await expect(
      page.getByPlaceholder("struggling is how learning happens"),
    ).toHaveCount(0);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("reconciles a failed save and restores the ordinary form when absent", async () => {
  const extensionPath = await createExtension("failure");
  const { context, page } = await openExtension(extensionPath);

  try {
    const input = page.getByPlaceholder(
      "struggling is how learning happens",
    );
    await input.fill("Ship the hard thing");
    await input.press("Enter");

    await expect(page.getByTestId("daily-focus-toast")).toHaveText(
      "Unable to confirm today’s focus in Calendar.",
    );
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue("Ship the hard thing");
    await expect(page.getByRole("button", { name: /retry/i })).toHaveCount(0);
    // Initial current-day + Monday reads, then daily-focus reconciliation.
    expect(await readStorage(page, "test:focusListCount")).toBe(3);

    await input.press("Enter");
    await expect(page.getByText("Ship the hard thing")).toBeVisible();
    await expect(input).toHaveCount(0);
    expect(await readStorage(page, "test:focusInsertAttempts")).toBe(2);
    expect(await readStorage(page, "test:focusListCount")).toBe(3);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
