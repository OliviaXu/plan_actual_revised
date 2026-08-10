import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("offers one stable command that discovers the complete live E2E suite", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };

  expect(packageJson.scripts?.["test:real"]).toBe(
    "npm run build && playwright test --config=playwright.real.config.ts",
  );
});
