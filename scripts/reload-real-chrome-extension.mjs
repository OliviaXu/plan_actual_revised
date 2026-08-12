import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { findExtensionPage } from "./real-chrome-extension.mjs";

/* global chrome */
const cdpUrl =
  process.env.REAL_CHROME_CDP_URL ??
  `http://127.0.0.1:${process.env.REAL_CHROME_CDP_PORT ?? "9225"}`;

const browser = await chromium.connectOverCDP(cdpUrl).catch(() => null);
if (!browser) {
  throw new Error(
    `Could not connect to ${cdpUrl}. Run \`npm run real:open\` and leave that Chrome window open.`,
  );
}

const context = browser.contexts()[0];
if (!context) throw new Error(`No Chrome context was available at ${cdpUrl}.`);

const manifest = JSON.parse(await fs.readFile("dist/manifest.json", "utf8"));
if (typeof manifest.key !== "string") {
  throw new Error("The built extension manifest has no public key.");
}
const digest = crypto
  .createHash("sha256")
  .update(Buffer.from(manifest.key, "base64"))
  .digest()
  .subarray(0, 16);
const extensionId = [...digest]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("")
  .replace(/[0-9a-f]/g, (digit) =>
    String.fromCharCode("a".charCodeAt(0) + Number.parseInt(digit, 16)),
  );

let extensionPage = findExtensionPage(context.pages(), extensionId);
if (!extensionPage) {
  extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/index.html`);
}

const extensionUrl = new URL(extensionPage.url());
await extensionPage.evaluate(() => chrome.runtime.reload()).catch(() => undefined);

const verificationPage = await context.newPage();
await verificationPage.goto(
  `${extensionUrl.protocol}//${extensionUrl.host}/index.html`,
);
await verificationPage.waitForLoadState("domcontentloaded");
console.log("Reloaded the unpacked extension from the latest dist build.");
await browser.close();
