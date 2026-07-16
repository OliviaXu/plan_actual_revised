import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type Scenario = "ambiguous" | "insert" | "planMatch";

async function createExtension(scenario: Scenario) {
  const extensionPath = await fs.mkdtemp(path.join(os.tmpdir(), "actual-save-extension-"));
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";

const createdBlockIds = new Set();
let ambiguousReturned = false;

registerServiceWorker({
  openAppPage: () => chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => ({
    ok: true,
    value: { events: ${scenario === "planMatch" ? `[{
      kind: "timed",
      id: "matching-plan",
      summary: "Actual",
      colorId: "8",
      start: "2026-07-15T12:00:00-07:00",
      end: "2026-07-15T12:30:00-07:00",
      timeZone: "America/Los_Angeles",
    }]` : "[]"} },
  }),
  insertPrimaryCalendarActual: async (_token, input) => {
    const alreadyCreated = createdBlockIds.has(input.block.id);
    createdBlockIds.add(input.block.id);
    await chrome.storage.local.set({
      "test:lastInsert": input,
      "test:uniqueInsertCount": createdBlockIds.size,
      "test:insertAttemptCount": ((await chrome.storage.local.get("test:insertAttemptCount"))["test:insertAttemptCount"] || 0) + 1,
    });
    if (${scenario === "ambiguous" ? "true" : "false"} && !ambiguousReturned) {
      ambiguousReturned = true;
      return { ok: false, error: { code: "CALENDAR_ACTUAL_INSERT_FAILED", message: "Response lost." } };
    }
    return { ok: true, value: { eventId: "par" + input.block.id.replaceAll("-", "") } };
  },
});
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
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = worker.url().split("/")[2];
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-07-15T12:00:00-07:00"));
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  return { context, page };
}

async function readStorage(page: import("@playwright/test").Page, key: string) {
  return page.evaluate(async (storageKey) =>
    (await chrome.storage.local.get(storageKey))[storageKey], key);
}

test("an exact Plan match is classified once and never inserted", async () => {
  const extensionPath = await createExtension("planMatch");
  const { context, page } = await openExtension(extensionPath);
  try {
    await page.getByRole("button", { name: "Add Actual" }).click();
    await page.getByRole("button", { name: "Save Actual to calendar" }).click();
    await expect(page.getByTestId("actual-save-summary")).toContainText("1 matched Plan");
    await page.reload();
    await page.getByRole("button", { name: "Save Actual to calendar" }).click();
    await expect(page.getByTestId("actual-save-summary")).toHaveText("Nothing new to save");
    expect(await readStorage(page, "test:insertAttemptCount")).toBeUndefined();
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("a nonmatching Actual sends the complete save input and persists success", async () => {
  const extensionPath = await createExtension("insert");
  const { context, page } = await openExtension(extensionPath);
  try {
    await page.getByRole("button", { name: "Add Actual" }).click();
    await page.getByRole("button", { name: "Save Actual to calendar" }).click();
    await expect(page.getByTestId("actual-save-summary")).toContainText("Saved 1");
    expect(await readStorage(page, "test:lastInsert")).toMatchObject({
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      summaryPrefix: "[Actual]",
      defaultColorId: "8",
      block: {
        summary: "Actual",
        startMinutes: 720,
        durationMinutes: 30,
        colorId: "8",
      },
    });
    await page.reload();
    await expect(page.getByTestId("actual-block")).toContainText("Actual");
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("an ambiguous insert remains unsaved and retries without a duplicate", async () => {
  const extensionPath = await createExtension("ambiguous");
  const { context, page } = await openExtension(extensionPath);
  try {
    await page.getByRole("button", { name: "Add Actual" }).click();
    await page.getByRole("button", { name: "Save Actual to calendar" }).click();
    await expect(page.getByTestId("actual-save-summary")).toContainText("Failed 1");
    await page.reload();
    await page.getByRole("button", { name: "Save Actual to calendar" }).click();
    await expect(page.getByTestId("actual-save-summary")).toContainText("Saved 1");
    expect(await readStorage(page, "test:insertAttemptCount")).toBe(2);
    expect(await readStorage(page, "test:uniqueInsertCount")).toBe(1);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
