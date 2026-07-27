import { chromium, expect, test } from "@playwright/test";
import path from "node:path";

test("real Slack launch keeps its audit block in local Actual storage", async () => {
  const profileDirectory = process.env.REAL_CALENDAR_PROFILE_DIR;
  if (!profileDirectory) {
    throw new Error(
      "Set REAL_CALENDAR_PROFILE_DIR to a dedicated Chrome profile directory.",
    );
  }

  const context = await chromium.launchPersistentContext(profileDirectory, {
    headless: false,
    args: [
      `--disable-extensions-except=${path.resolve("dist")}`,
      `--load-extension=${path.resolve("dist")}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = worker.url().split("/")[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  const reason = `[PAR real Slack smoke ${Date.now()}]`;
  const originalRecords = await page.evaluate(async () => {
    const stored = await chrome.storage.local.get(null);
    return Object.fromEntries(
      Object.entries(stored).filter(([key]) => key.startsWith("dayRecord:")),
    );
  });

  try {
    const connect = page.getByRole("button", { name: "Connect Calendar" });
    if (await connect.isVisible()) {
      await connect.click();
      await expect(connect).toHaveCount(0, { timeout: 90_000 });
    }

    await page.getByRole("button", { name: "Log Slack time" }).click();
    await page
      .getByPlaceholder("attention is devotion :)")
      .fill(reason);
    await page.getByRole("button", { name: "Open Slack" }).click();

    await expect
      .poll(() =>
        page.evaluate(async (expectedReason) => {
          const stored = await chrome.storage.local.get(null);
          return Object.values(stored)
            .filter(
              (value): value is {
                actual?: Array<{ isSlack?: true; summary?: string }>;
              } =>
                typeof value === "object" &&
                value !== null &&
                Array.isArray(
                  (value as {
                    actual?: unknown;
                  }).actual,
                ),
            )
            .flatMap((record) => record.actual ?? [])
            .some(
              (actual) =>
                actual.summary === expectedReason && actual.isSlack === true,
            );
        }, reason),
      )
      .toBe(true);
  } finally {
    await page.evaluate(async (records) => {
      const stored = await chrome.storage.local.get(null);
      const currentDayRecordKeys = Object.keys(stored).filter((key) =>
        key.startsWith("dayRecord:"),
      );
      const originalDayRecordKeys = Object.keys(records);
      const addedKeys = currentDayRecordKeys.filter(
        (key) => !originalDayRecordKeys.includes(key),
      );
      if (addedKeys.length) {
        await chrome.storage.local.remove(addedKeys);
      }
      if (originalDayRecordKeys.length) {
        await chrome.storage.local.set(records);
      }
    }, originalRecords);
    await context.close();
  }
});
