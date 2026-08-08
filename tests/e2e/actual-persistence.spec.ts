import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getExtensionLaunchOptions } from "./extension-launch-options";

test("Actual creation, editing, resizing, and deletion survive reloads", async () => {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "actual-persistence-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createRuntimeMessageHandlers } from "./runtime-message-handlers.js";

registerServiceWorker(createRuntimeMessageHandlers({
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => ({
    ok: true,
    value: { timeZone: "America/Los_Angeles", events: [] },
  }),
}, { now: () => new Date("2026-07-15T19:00:00.000Z") }));
`,
  );
  const context = await chromium.launchPersistentContext("", {
    ...getExtensionLaunchOptions(),
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
    await expect(page.getByRole("textbox", { name: "Title" })).toBeFocused();
    await page.keyboard.type("Discarded Actual");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("actual-block")).toHaveCount(0);

    await page.reload();

    await expect(page.getByTestId("actual-block")).toHaveCount(0);
    await page.getByRole("button", { name: "Add Actual" }).click();
    await expect(page.getByRole("textbox", { name: "Title" })).toBeFocused();
    await page.keyboard.type("First Actual");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.clock.setFixedTime(new Date("2026-07-15T13:00:00-07:00"));
    await page.getByRole("button", { name: "Add Actual" }).click();
    await page.getByRole("textbox", { name: "Title" }).fill("Second Actual");
    await page.getByRole("spinbutton", { name: "Duration" }).fill("45");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const actuals = page.getByTestId("actual-block");
    await expect(actuals).toHaveCount(2);
    await expect(actuals.filter({ hasText: "First Actual" })).toHaveCount(1);
    await expect(actuals.filter({ hasText: "Second Actual" })).toHaveCount(1);
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
    await expect(
      page.getByTestId("actual-block").filter({ hasText: "First Actual" }),
    ).toHaveCount(1);
    await expect(
      page.getByTestId("actual-block").filter({ hasText: "Second Actual" }),
    ).toHaveCount(1);

    await page.getByRole("button", { name: "Edit First Actual" }).click();
    const existingTitle = page.getByRole("textbox", { name: "Title" });
    await expect(existingTitle).toBeFocused();
    await expect
      .poll(() =>
        existingTitle.evaluate((input: HTMLInputElement) => ({
          start: input.selectionStart,
          end: input.selectionEnd,
        })),
      )
      .toEqual({
        start: "First Actual".length,
        end: "First Actual".length,
      });
    await existingTitle.fill("Edited Actual");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByTestId("actual-block").filter({ hasText: "Edited Actual" }),
    ).toHaveCount(1);

    await page.reload();

    await expect(
      page.getByTestId("actual-block").filter({ hasText: "Edited Actual" }),
    ).toHaveCount(1);

    const resizeHandle = page.getByRole("button", {
      name: "Resize Edited Actual",
    });
    const resizeHandleBox = await resizeHandle.boundingBox();
    if (!resizeHandleBox) throw new Error("Resize handle is not visible");
    const resizeX = resizeHandleBox.x + resizeHandleBox.width / 2;
    const resizeY = resizeHandleBox.y + resizeHandleBox.height / 2;
    await page.mouse.move(resizeX, resizeY);
    await page.mouse.down();
    await page.mouse.move(resizeX, resizeY + 21);
    await page.mouse.up();

    await expect(
      page.getByTestId("actual-block").filter({ hasText: "Edited Actual" }),
    ).toContainText("45m");

    await page.reload();

    await expect(
      page.getByTestId("actual-block").filter({ hasText: "Edited Actual" }),
    ).toContainText("45m");
    await page.getByRole("button", { name: "Edit Edited Actual" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("actual-block")).toHaveCount(1);

    await page.reload();

    await expect(page.getByTestId("actual-block")).toHaveCount(1);
    await expect(
      page.getByTestId("actual-block").filter({ hasText: "Second Actual" }),
    ).toHaveCount(1);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
