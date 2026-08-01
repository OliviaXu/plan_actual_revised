import { afterEach, describe, expect, it } from "vitest";

import { getExtensionLaunchOptions } from "../e2e/extension-launch-options";

const originalHeadedSetting = process.env.PW_HEADED;

afterEach(() => {
  if (originalHeadedSetting === undefined) {
    delete process.env.PW_HEADED;
    return;
  }
  process.env.PW_HEADED = originalHeadedSetting;
});

describe("extension E2E launch options", () => {
  it("uses modern headless Chromium by default", () => {
    delete process.env.PW_HEADED;

    expect(getExtensionLaunchOptions()).toEqual({
      channel: "chromium",
      headless: true,
    });
  });

  it("allows an explicitly headed debugging run", () => {
    process.env.PW_HEADED = "1";

    expect(getExtensionLaunchOptions()).toEqual({
      channel: "chromium",
      headless: false,
    });
  });
});
