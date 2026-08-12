import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("builds and reloads the extension before discovering the live E2E suite", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };

  expect(packageJson.scripts?.["test:real"]).toBe(
    "npm run build && npm run real:reload && playwright test --config=playwright.real.config.ts",
  );
});
