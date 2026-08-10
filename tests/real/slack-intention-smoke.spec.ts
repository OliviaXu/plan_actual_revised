import { expect, test } from "@playwright/test";

import {
  connectToRealExtension,
  requireConnectedCalendar,
} from "./real-browser";

test("real Slack launch keeps its intention in local Actual storage", async () => {
  const { context, extensionId } = await connectToRealExtension();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await requireConnectedCalendar(page);
  const intention = `[PAR real Slack smoke ${Date.now()}]`;
  const originalRecords = await page.evaluate(async () => {
    const stored = await chrome.storage.local.get(null);
    return Object.fromEntries(
      Object.entries(stored).filter(([key]) => key.startsWith("dayRecord:")),
    );
  });

  try {
    await page.getByRole("button", { name: "Log Slack time" }).click();
    await page
      .getByPlaceholder("attention is devotion :)")
      .fill(intention);
    await page.getByRole("button", { name: "Open Slack" }).click();

    await expect
      .poll(() =>
        page.evaluate(async (expectedIntention) => {
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
                actual.summary === expectedIntention && actual.isSlack === true,
            );
        }, intention),
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
    await page.close();
  }
});
