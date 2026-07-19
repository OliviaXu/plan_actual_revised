import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function createSeededExtension(
  scenario: "authRetry" | "cached" | "disconnected" | "empty" | "error",
) {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "plan-read-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";

let connected = ${scenario === "disconnected" || scenario === "authRetry" ? "false" : "true"};
let authAttempts = 0;

registerServiceWorker({
  openAppPage: () => chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken: async () => connected
    ? { ok: true, value: "test-token" }
    : { ok: false, error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "No cached token." } },
  requestInteractiveToken: async () => {
    authAttempts += 1;
    if (${scenario === "authRetry" ? "true" : "false"} && authAttempts === 1) {
      return { ok: false, error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "Seeded access denied." } };
    }
    connected = true;
    return { ok: true, value: "test-token" };
  },
  listPrimaryCalendarEvents: async () => ${scenario === "error"
    ? `({ ok: false, error: { code: "CALENDAR_LIST_FAILED", message: "Seeded Calendar failure." } })`
    : scenario === "empty"
      ? `({ ok: true, value: { timeZone: "America/Los_Angeles", events: [] } })`
    : `({
      ok: true,
      value: {
        timeZone: "America/Los_Angeles",
        events: [{
          kind: "timed",
          id: "seeded-design-review",
          summary: "Seeded design review",
          colorId: "9",
          start: "2026-07-15T09:00:00-07:00",
          end: "2026-07-15T10:00:00-07:00",
          timeZone: "America/Los_Angeles",
        }],
      },
    })`},
}, () => new Date("2026-07-15T19:00:00.000Z"));
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
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = serviceWorker.url().split("/")[2];
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-07-15T12:00:00-07:00"));
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  return { context, page };
}

test("cached Calendar data reaches the Plan surface", async () => {
  const extensionPath = await createSeededExtension("cached");
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(page.getByText("Seeded design review")).toBeVisible();
    await expect(page.getByTestId("calendar-status")).toHaveCount(0);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("a disconnected user can connect and populate Plan", async () => {
  const extensionPath = await createSeededExtension("disconnected");
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(
      page.getByText("Connect Google Calendar to show today's plan"),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Plan day grid" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Actual", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Actual" })).toBeDisabled();
    await expect(page.getByTestId("plan-unavailable")).toBeVisible();
    await expect(page.getByTestId("plan-empty")).toHaveCount(0);
    await expect(page.getByTestId("calendar-error")).toHaveCount(0);
    await page.getByRole("button", { name: "Connect Calendar" }).click();
    await expect(page.getByText("Seeded design review")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Actual" })).toBeEnabled();
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("failed interactive auth remains recoverable", async () => {
  const extensionPath = await createSeededExtension("authRetry");
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(
      page.getByText("Connect Google Calendar to show today's plan"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Connect Calendar" }).click();
    await expect(page.getByTestId("calendar-error")).toHaveText(
      "Seeded access denied.",
    );
    await page.getByRole("button", { name: "Connect Calendar" }).click();
    await expect(page.getByText("Seeded design review")).toBeVisible();
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("an empty Calendar response renders the permanent Plan empty state", async () => {
  const extensionPath = await createSeededExtension("empty");
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(page.getByTestId("calendar-status")).toHaveCount(0);
    await expect(page.getByTestId("plan-empty")).toHaveText(
      "No timed events today",
    );
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("a Calendar failure remains visible beside the Plan surface", async () => {
  const extensionPath = await createSeededExtension("error");
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(page.getByTestId("calendar-error")).toHaveText(
      "Seeded Calendar failure.",
    );
    await expect(
      page.getByRole("heading", { name: "Plan", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
