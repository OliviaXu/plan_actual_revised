import { expect, chromium, test } from "@playwright/test";
import path from "node:path";

test("a created Actual survives a full extension-page reload", async () => {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${path.resolve("dist")}`,
      `--load-extension=${path.resolve("dist")}`,
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
    const actual = page.getByTestId("actual-block");
    await expect(actual).toContainText("Actual");
    const actualId = await actual.getAttribute("data-actual-id");

    await page.reload();

    await expect(page.getByTestId("actual-block")).toHaveAttribute(
      "data-actual-id",
      actualId ?? "missing-id",
    );
    await expect(page.getByTestId("actual-block")).toContainText("Actual");
  } finally {
    await context.close();
  }
});
