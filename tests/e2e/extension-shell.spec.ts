import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getExtensionLaunchOptions } from "./extension-launch-options";

async function openExtension(extensionPath: string) {
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
  await page.goto(`chrome-extension://${extensionId}/index.html`);

  return { context, page };
}

async function createHappyPathExtension() {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "plan-actual-revised-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createRuntimeMessageHandlers } from "./runtime-message-handlers.js";

let token;

registerServiceWorker(createRuntimeMessageHandlers({
  requestCachedToken: async () => token
    ? { ok: true, value: token }
    : { ok: false, error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "No cached token." } },
  requestInteractiveToken: async () => {
    token = "test-token";
    return { ok: true, value: token };
  },
  listPrimaryCalendarEvents: async () => ({
    ok: true,
    value: {
      timeZone: "America/Los_Angeles",
      events: [{
        kind: "timed",
        id: "phase-two-event",
        summary: "Phase 2 boundary event",
        colorId: null,
        start: "2026-07-15T09:00:00-07:00",
        end: "2026-07-15T10:00:00-07:00",
        timeZone: "America/Los_Angeles",
      }],
    },
  }),
}, { now: () => new Date("2026-07-15T19:00:00.000Z") }));
`,
  );

  return extensionPath;
}

test("loads the production extension and renders its app shell", async () => {
  const { context, page } = await openExtension(path.resolve("dist"));

  try {
    await expect(
      page.getByRole("heading", { name: "Plan / Actual / Revised" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("connects through the real UI and service-worker router", async () => {
  const extensionPath = await createHappyPathExtension();
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(
      page.getByText("Connect Google Calendar to show today's plan"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Connect Calendar" }).click();

    await expect(page.getByText("Phase 2 boundary event")).toBeVisible();
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
