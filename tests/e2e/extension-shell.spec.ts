import { test, expect, chromium } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function createExtensionPath(options?: { mockedBoundaries?: boolean }) {
  if (!options?.mockedBoundaries) {
    return path.resolve("dist");
  }

  const tempExtensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "plan-actual-revised-extension-"),
  );
  await fs.cp(path.resolve("dist"), tempExtensionPath, { recursive: true });
  await fs.writeFile(
    path.join(tempExtensionPath, "background/service-worker.js"),
    `
import { installRuntimeListeners } from "./service-worker-runtime.js";

let cachedToken;

async function readMock() {
  const stored = await chrome.storage.local.get("phase2BoundaryMock");
  return stored.phase2BoundaryMock;
}

installRuntimeListeners({
  openAppPage: () => chrome.tabs.create({
    url: chrome.runtime.getURL("index.html"),
  }),
  requestCachedToken: async () => cachedToken
    ? { ok: true, value: { status: "connected", token: cachedToken } }
    : {
        ok: false,
        error: {
          code: "AUTH_TOKEN_UNAVAILABLE",
          message: "No cached token.",
          recoverable: true,
        },
      },
  requestInteractiveToken: async () => {
    const mock = await readMock();

    if (mock?.auth?.ok === true) {
      cachedToken = mock.auth.token;
      return {
        ok: true,
        value: { status: "connected", token: mock.auth.token },
      };
    }

    if (mock?.auth?.ok === false) {
      return {
        ok: false,
        error: {
          code: "AUTH_TOKEN_UNAVAILABLE",
          message: mock.auth.message,
          recoverable: true,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: "AUTH_MOCK_MISSING",
        message: "Missing E2E auth mock.",
        recoverable: false,
      },
    };
  },
  listPrimaryCalendarEvents: async () => {
    const mock = await readMock();

    if (mock?.calendar?.ok === true) {
      return {
        ok: true,
        value: { eventCount: mock.calendar.eventCount },
      };
    }

    if (mock?.calendar?.ok === false) {
      return {
        ok: false,
        error: {
          code: "CALENDAR_LIST_FAILED",
          message: mock.calendar.message,
          recoverable: true,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: "CALENDAR_MOCK_MISSING",
        message: "Missing E2E Calendar mock.",
        recoverable: false,
      },
    };
  },
});
`,
  );

  return tempExtensionPath;
}

test("loads the extension app shell and receives background status", async () => {
  const extensionPath = await createExtensionPath();
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
  } finally {
    await context.close();
  }
});

test("connects to Calendar through mocked background auth and Calendar boundaries", async () => {
  const extensionPath = await createExtensionPath({ mockedBoundaries: true });
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
    await page.evaluate(() =>
      chrome.storage.local.set({
        phase2BoundaryMock: {
          auth: { ok: true, token: "test-token" },
          calendar: { ok: true, eventCount: 2 },
        },
      }),
    );
    await page.reload();

    await expect(page.getByTestId("calendar-status")).toHaveText(
      "Calendar disconnected",
    );
    await page.getByRole("button", { name: "Connect Calendar" }).click();

    await expect(page.getByTestId("calendar-status")).toHaveText(
      "Calendar connected",
    );
    await expect(page.getByTestId("calendar-result")).toHaveText(
      "Calendar returned 2 events",
    );
  } finally {
    await context.close();
  }
});

test("shows visible auth and Calendar failures from the background boundary", async () => {
  const extensionPath = await createExtensionPath({ mockedBoundaries: true });
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
    await page.evaluate(() =>
      chrome.storage.local.set({
        phase2BoundaryMock: {
          auth: {
            ok: false,
            message: "User cancelled Calendar access.",
          },
        },
      }),
    );
    await page.reload();

    await page.getByRole("button", { name: "Connect Calendar" }).click();
    await expect(page.getByTestId("calendar-status")).toHaveText(
      "Calendar error",
    );
    await expect(page.getByTestId("calendar-error")).toHaveText(
      "User cancelled Calendar access.",
    );

    await page.evaluate(() =>
      chrome.storage.local.set({
        phase2BoundaryMock: {
          auth: { ok: true, token: "test-token" },
          calendar: {
            ok: false,
            message: "Calendar API has not been used.",
          },
        },
      }),
    );
    await page.reload();

    await page.getByRole("button", { name: "Connect Calendar" }).click();
    await expect(page.getByTestId("calendar-status")).toHaveText(
      "Calendar error",
    );
    await expect(page.getByTestId("calendar-error")).toHaveText(
      "Calendar API has not been used.",
    );
  } finally {
    await context.close();
  }
});
