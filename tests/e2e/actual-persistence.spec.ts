import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("multiple created Actuals survive a full extension-page reload", async () => {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "actual-persistence-extension-"),
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
    value: { timeZone: "America/Los_Angeles", events: [] },
  }),
}, () => new Date("2026-07-15T19:00:00.000Z"));
`,
  );
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

  try {
    await page.goto(`chrome-extension://${extensionId}/index.html`);
    await page.getByRole("button", { name: "Add Actual" }).click();
    await page.getByRole("button", { name: "Add Actual" }).click();
    const actuals = page.getByTestId("actual-block");
    await expect(actuals).toHaveCount(2);
    const actualIds = await actuals.evaluateAll((blocks) =>
      blocks.map((block) => block.getAttribute("data-actual-id")),
    );
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const stored = await chrome.storage.local.get(
            "dayRecord:2026-07-15",
          );
          const dayRecord = stored["dayRecord:2026-07-15"] as
            | { actual?: unknown[] }
            | undefined;
          return dayRecord?.actual?.length;
        }),
      )
      .toBe(2);

    await page.reload();

    await expect(page.getByTestId("actual-block")).toHaveCount(2);
    await expect
      .poll(() =>
        page.getByTestId("actual-block").evaluateAll((blocks) =>
          blocks.map((block) => block.getAttribute("data-actual-id")),
        ),
      )
      .toEqual(actualIds);
    await expect(page.getByTestId("actual-block").first()).toContainText(
      "Actual",
    );
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
