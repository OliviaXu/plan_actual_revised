import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getExtensionLaunchOptions } from "./extension-launch-options";

type Scenario = "success" | "retry" | "expired";

type SeedActual = {
  id: string;
  summary: string;
  startMinutes: number;
  durationMinutes: number;
  colorId: string;
  saveDisposition: "unsaved" | "calendarSaved" | "planMatched";
};

function actual(
  id: string,
  saveDisposition: SeedActual["saveDisposition"] = "unsaved",
): SeedActual {
  return {
    id,
    summary: id,
    startMinutes: 9 * 60,
    durationMinutes: 30,
    colorId: "8",
    saveDisposition,
  };
}

function dayRecord(date: string, actuals: SeedActual[]) {
  return {
    schemaVersion: 1,
    date,
    timezone: "America/Los_Angeles",
    actual: actuals,
    updatedAt: `${date}T18:00:00.000Z`,
  };
}

async function createExtension(scenario: Scenario) {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "catch-up-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createServiceWorkerOperations } from "./compose-service-worker.js";

const listDayRecords = async () => {
  const stored = await chrome.storage.local.get(null);
  return {
    records: Object.entries(stored)
      .filter(([key]) => key.startsWith("dayRecord:"))
      .map(([, record]) => record),
    invalidKeys: [],
  };
};
const saveDayRecord = async (record) =>
  chrome.storage.local.set({ ["dayRecord:" + record.date]: record });
const deleteDayRecord = async (date) =>
  chrome.storage.local.remove("dayRecord:" + date);

registerServiceWorker(createServiceWorkerOperations({
  openAppPage: () => chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => ({
    ok: true,
    value: { timeZone: "America/Los_Angeles", events: [] },
  }),
  insertPrimaryCalendarEvent: async (_token, event) => {
    const stored = await chrome.storage.local.get("test:insertAttempts");
    const attempts = stored["test:insertAttempts"] || {};
    attempts[event.id] = (attempts[event.id] || 0) + 1;
    await chrome.storage.local.set({
      "test:insertAttempts": attempts,
      "test:lastInsert": event,
    });
    const shouldFail =
      (${JSON.stringify(scenario)} === "retry" && attempts[event.id] === 1) ||
      (${JSON.stringify(scenario)} === "expired" && event.summary.includes("expired"));
    return shouldFail
      ? { ok: false, error: { code: "CALENDAR_EVENT_INSERT_FAILED", message: "Mock insert failed." } }
      : { ok: true, value: { eventId: event.id } };
  },
  listDayRecords,
  saveDayRecord,
  deleteDayRecord,
}, () => new Date("2026-07-15T19:00:00.000Z")));
`,
  );
  return extensionPath;
}

async function openExtension(
  extensionPath: string,
  records: Record<string, unknown>,
) {
  const context = await chromium.launchPersistentContext("", {
    ...getExtensionLaunchOptions(),
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate((seed) => chrome.storage.local.set(seed), records);
  const extensionId = worker.url().split("/")[2];
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-07-15T12:00:00-07:00"));
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  return { context, page };
}

async function readStorage(
  page: import("@playwright/test").Page,
  key: string,
): Promise<unknown> {
  return page.evaluate(
    async (storageKey) =>
      (await chrome.storage.local.get(storageKey))[storageKey],
    key,
  );
}

test("saves yesterday and removes it without retrying terminal blocks", async () => {
  const extensionPath = await createExtension("success");
  const yesterdayKey = "dayRecord:2026-07-14";
  const { context, page } = await openExtension(extensionPath, {
    [yesterdayKey]: dayRecord("2026-07-14", [
      actual("unsaved-yesterday"),
      actual("saved-yesterday", "calendarSaved"),
      actual("matched-yesterday", "planMatched"),
    ]),
  });

  try {
    await expect(page.getByTestId("catch-up-toast")).toHaveText(
      "Catch-up: saved 1 Actual to Calendar.",
    );
    expect(await readStorage(page, yesterdayKey)).toBeUndefined();
    const attempts = await readStorage(
      page,
      "test:insertAttempts",
    ) as Record<string, number>;
    expect(Object.values(attempts)).toEqual([1]);
    expect(await readStorage(page, "test:lastInsert")).toMatchObject({
      summary: "[Actual] unsaved-yesterday",
      start: {
        dateTime: "2026-07-14T09:00:00",
        timeZone: "America/Los_Angeles",
      },
    });
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("keeps a retained failure and retries it after a future page load", async () => {
  const extensionPath = await createExtension("retry");
  const yesterdayKey = "dayRecord:2026-07-14";
  const { context, page } = await openExtension(extensionPath, {
    [yesterdayKey]: dayRecord("2026-07-14", [actual("retry-yesterday")]),
  });

  try {
    await expect(page.getByTestId("catch-up-toast")).toContainText(
      "Catch-up: 1 Actual couldn’t be saved.",
    );
    expect(await readStorage(page, yesterdayKey)).toMatchObject({
      actual: [{
        id: "retry-yesterday",
        saveDisposition: "unsaved",
        lastSaveError: { code: "CALENDAR_EVENT_INSERT_FAILED" },
      }],
    });

    await expect(
      page.getByRole("button", { name: "Retry catch-up" }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("catch-up-toast")).toHaveText(
      "Catch-up: saved 1 Actual to Calendar.",
    );
    expect(await readStorage(page, yesterdayKey)).toBeUndefined();
    expect(Object.values(
      await readStorage(page, "test:insertAttempts") as Record<string, number>,
    )).toEqual([2]);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("processes an expired record once, deletes it, and reports discarded work", async () => {
  const extensionPath = await createExtension("expired");
  const records = {
    "dayRecord:2026-07-14": dayRecord("2026-07-14", [actual("recent-one")]),
    "dayRecord:2026-07-13": dayRecord("2026-07-13", [actual("recent-two")]),
    "dayRecord:2026-07-12": dayRecord("2026-07-12", [actual("expired-oldest")]),
  };
  const { context, page } = await openExtension(extensionPath, records);

  try {
    await expect(page.getByTestId("catch-up-toast")).toHaveText(
      "Catch-up: saved 2 Actuals to Calendar; 1 older Actual was discarded.",
    );
    for (const key of Object.keys(records)) {
      expect(await readStorage(page, key)).toBeUndefined();
    }
    expect(Object.values(
      await readStorage(page, "test:insertAttempts") as Record<string, number>,
    )).toEqual([1, 1, 1]);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
