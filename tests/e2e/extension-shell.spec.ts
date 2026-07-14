import { test, expect, chromium } from "@playwright/test";
import path from "node:path";

test("loads the extension app shell and receives background status", async () => {
  const extensionPath = path.resolve("dist");
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    const serviceWorker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extensionId = serviceWorker.url().split("/")[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/index.html`);

    await expect(
      page.getByRole("heading", { name: "Plan / Actual / Revised" }),
    ).toBeVisible();
    await expect(page.getByTestId("background-status")).toHaveText("Background online");
    await expect(page.getByTestId("day-range")).toHaveText("7:00-21:00");

    const background = await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: "app.health" }),
    );

    expect(background).toEqual({ ok: true, value: { status: "online" } });

    const launchedPagePromise = context.waitForEvent("page");
    const launchResponse = await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: "app.open" }),
    );
    const launchedPage = await launchedPagePromise;

    expect(launchResponse).toEqual({ ok: true, value: { opened: true } });
    await expect(launchedPage).toHaveURL(
      `chrome-extension://${extensionId}/index.html`,
    );
    await expect(
      launchedPage.getByRole("heading", { name: "Plan / Actual / Revised" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
