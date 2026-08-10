import { expect, it } from "vitest";

import realPlaywrightConfig from "../../playwright.real.config";

it("does not retain live integration traces containing authorization headers", () => {
  expect(realPlaywrightConfig.use).toMatchObject({ trace: "off" });
});
