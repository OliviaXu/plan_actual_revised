import {
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";

export function getRealChromeCdpUrl() {
  return process.env.REAL_CHROME_CDP_URL ?? "http://127.0.0.1:9225";
}

export async function requireConnectedCalendar(page: Page) {
  const connect = page.getByRole("button", { name: "Connect Calendar" });
  const logSlackTime = page.getByRole("button", { name: "Log Slack time" });

  await expect
    .poll(
      async () => {
        if (await logSlackTime.isVisible()) return "connected";
        if (await connect.isVisible()) return "disconnected";
        return "loading";
      },
      {
        message: "Calendar initialization did not settle",
        timeout: 30_000,
      },
    )
    .not.toBe("loading");

  if (await connect.isVisible()) {
    throw new Error(
      "Calendar is not connected. Complete Connect Calendar in the Chrome window opened by `npm run real:open`, then rerun this test.",
    );
  }
}

export async function connectToRealExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
}> {
  const cdpUrl = getRealChromeCdpUrl();
  const browser = await chromium.connectOverCDP(cdpUrl).catch(() => null);
  if (!browser) {
    throw new Error(
      `Could not connect to ${cdpUrl}. Run \`npm run real:open\` and leave that Chrome window open.`,
    );
  }

  const context = browser.contexts()[0];
  if (!context) {
    throw new Error(`No Chrome context was available at ${cdpUrl}.`);
  }

  const extensionPage = context
    .pages()
    .find((page) => page.url().startsWith("chrome-extension://"));
  const worker = context
    .serviceWorkers()
    .find((candidate) => candidate.url().startsWith("chrome-extension://"));
  const extensionUrl = extensionPage?.url() ?? worker?.url();
  if (!extensionUrl) {
    throw new Error(
      "The real Chrome profile has not loaded the extension. Run `npm run real:open` and load `dist` from chrome://extensions if needed.",
    );
  }

  return {
    context,
    extensionId: new URL(extensionUrl).host,
  };
}
