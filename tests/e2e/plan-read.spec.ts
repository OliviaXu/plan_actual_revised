import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function createSeededExtension(
  scenario:
    | "authRetry"
    | "cached"
    | "disconnected"
    | "empty"
    | "error"
    | "slowDisconnected",
) {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "plan-read-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createServiceWorkerOperations } from "./compose-service-worker.js";

let connected = ${scenario === "disconnected" || scenario === "slowDisconnected" || scenario === "authRetry" ? "false" : "true"};
let authAttempts = 0;

registerServiceWorker(createServiceWorkerOperations({
  openAppPage: () => chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken: async () => {
    ${scenario === "slowDisconnected" ? "await new Promise((resolve) => setTimeout(resolve, 700));" : ""}
    return connected
      ? { ok: true, value: "test-token" }
      : { ok: false, error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "No cached token." } };
  },
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
}, () => new Date("2026-07-15T19:00:00.000Z")));
`,
  );
  return extensionPath;
}

async function openExtension(
  extensionPath: string,
  options: { reducedMotion?: "reduce" } = {},
) {
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
  if (options.reducedMotion) {
    await page.emulateMedia({ reducedMotion: options.reducedMotion });
  }
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
      page.getByRole("region", { name: "Day grid" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Actual", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Actual" })).toHaveCount(0);
    await expect(page.getByTestId("plan-unavailable")).toHaveCount(0);
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

test("a slow cached-auth check crossfades into the flat Connect prompt", async () => {
  const extensionPath = await createSeededExtension("slowDisconnected");
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(page.getByTestId("calendar-check-in")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Day grid" }),
    ).toHaveCount(0);

    const connection = page.getByRole("region", {
      name: "Calendar connection",
    });
    await expect(connection).toBeVisible();
    await expect(connection).not.toHaveClass(/border|bg-white|shadow-soft/);
    await expect(page.getByTestId("calendar-surface-outgoing")).toHaveCount(0);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("reduced motion hides the outgoing check-in immediately", async () => {
  const extensionPath = await createSeededExtension("slowDisconnected");
  const { context, page } = await openExtension(extensionPath, {
    reducedMotion: "reduce",
  });

  try {
    await expect(page.getByTestId("calendar-check-in")).toBeVisible();
    const outgoingDisplay = page.evaluate(() =>
      new Promise<string>((resolve) => {
        const observer = new MutationObserver(() => {
          const outgoing = document.querySelector(
            '[data-testid="calendar-surface-outgoing"]',
          );
          if (!outgoing) return;
          observer.disconnect();
          resolve(getComputedStyle(outgoing).display);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(() => {
          observer.disconnect();
          resolve("not observed");
        }, 2_000);
      }),
    );

    await expect(
      page.getByRole("region", { name: "Calendar connection" }),
    ).toBeVisible();
    expect(await outgoingDisplay).toBe("none");
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

test("a Calendar failure replaces the Plan surface with a flat error", async () => {
  const extensionPath = await createSeededExtension("error");
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(page.getByTestId("calendar-error")).toHaveText(
      "Seeded Calendar failure.",
    );
    await expect(
      page.getByRole("heading", { name: "Plan", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Unable to load today's plan" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh page" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Day grid" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
