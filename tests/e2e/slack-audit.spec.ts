import { chromium, expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getExtensionLaunchOptions } from "./extension-launch-options";

async function createExtension() {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "slack-audit-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createServiceWorkerOperations } from "./compose-service-worker.js";

registerServiceWorker(createServiceWorkerOperations({
  openAppPage: () => chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => ({
    ok: true,
    value: { timeZone: "America/Los_Angeles", events: [] },
  }),
  insertPrimaryCalendarEvent: async (_token, event) => {
    await chrome.storage.local.set({ "test:lastInsert": event });
    return { ok: true, value: { eventId: event.id } };
  },
}, () => new Date("2026-07-15T19:00:00.000Z")));
`,
  );
  return extensionPath;
}

async function openExtension(
  extensionPath: string,
  launchBehavior: "capture" | "throw",
) {
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
  await page.addInitScript((behavior) => {
    const target = window as typeof window & {
      __slackAttempts?: Array<{ active: boolean; url: string }>;
    };
    target.__slackAttempts = [];
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        target.__slackAttempts?.push({
          active: navigator.userActivation?.isActive ?? false,
          url: String(url),
        });
        if (behavior === "throw") {
          throw new Error("Protocol blocked");
        }
        return window;
      },
    });
  }, launchBehavior);
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

test("Slack audit validates, launches from the click, persists, and saves as an Actual", async () => {
  const extensionPath = await createExtension();
  const { context, page } = await openExtension(extensionPath, "capture");

  try {
    const addActual = page.getByRole("button", { name: "Add Actual" });
    const logSlack = page.getByRole("button", { name: "Log Slack time" });
    await expect(addActual).toBeEnabled();
    await expect(logSlack).toBeEnabled();
    await expect(addActual).not.toContainText("Add Actual");
    await expect(logSlack).not.toContainText("Slack");

    await logSlack.click();
    const submitSlack = page.getByRole("button", { name: "Open Slack" });
    await expect(submitSlack).toBeDisabled();
    await expect(submitSlack).toHaveClass(/disabled:opacity-50/);
    await page.getByPlaceholder("attention is devotion :)").fill("   ");
    await expect(submitSlack).toBeDisabled();
    expect(await readStorage(page, "dayRecord:2026-07-15")).toBeUndefined();
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __slackAttempts?: unknown[] })
            .__slackAttempts,
      ),
    ).toEqual([]);

    await page
      .getByPlaceholder("attention is devotion :)")
      .fill("Check release channel");
    await expect(submitSlack).toBeEnabled();
    await submitSlack.click();

    await expect(page.getByTestId("actual-block")).toContainText(
      "Check release channel",
    );
    await expect
      .poll(() => readStorage(page, "dayRecord:2026-07-15"))
      .toMatchObject({
        actual: [{
          summary: "Check release channel",
          startMinutes: 720,
          durationMinutes: 15,
          colorId: "1",
          isSlack: true,
          saveDisposition: "unsaved",
        }],
      });
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & {
            __slackAttempts?: Array<{ active: boolean; url: string }>;
          }).__slackAttempts,
      ),
    ).toEqual([{ active: true, url: "slack://open" }]);

    await page.reload();
    await expect(page.getByTestId("actual-block")).toContainText(
      "Check release channel",
    );
    await page
      .getByRole("button", { name: "Save Actual to calendar" })
      .click();
    await expect(page.getByTestId("actual-save-summary")).toContainText(
      "Saved 1",
    );
    expect(await readStorage(page, "test:lastInsert")).toMatchObject({
      summary: "[s] Check release channel",
      extendedProperties: {
        private: { planActualRevisedActual: "true" },
      },
    });
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("a synchronous Slack launch failure keeps the logged Actual", async () => {
  const extensionPath = await createExtension();
  const { context, page } = await openExtension(extensionPath, "throw");

  try {
    await page.getByRole("button", { name: "Log Slack time" }).click();
    await page
      .getByPlaceholder("attention is devotion :)")
      .fill("Incident response");
    await page.getByRole("button", { name: "Open Slack" }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Slack may not have opened.",
      }),
    ).toContainText(
      "Slack may not have opened. Your time was still logged.",
    );
    await expect(page.getByTestId("actual-block")).toContainText(
      "Incident response",
    );
    await expect
      .poll(() => readStorage(page, "dayRecord:2026-07-15"))
      .toMatchObject({ actual: [{ isSlack: true }] });
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
