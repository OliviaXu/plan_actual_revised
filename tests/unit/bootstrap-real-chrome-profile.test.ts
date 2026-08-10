import { describe, expect, it } from "vitest";

// This launcher is intentionally plain JavaScript so Node can run it directly.
// @ts-expect-error TS7016
import { getRealChromeArgs } from "../../scripts/bootstrap-real-chrome-profile.mjs";

describe("real Chrome profile bootstrap", () => {
  it("opens the extension in a dedicated remotely debuggable Chrome profile", () => {
    expect(
      getRealChromeArgs({
        cdpPort: "9225",
        extensionPath: "/repo/dist",
        extensionUrl: "chrome-extension://extension-id/index.html",
        userDataDir: "/repo/.pw-profiles/calendar",
      }),
    ).toEqual([
      "--remote-debugging-port=9225",
      "--user-data-dir=/repo/.pw-profiles/calendar",
      "--load-extension=/repo/dist",
      "--no-first-run",
      "--no-default-browser-check",
      "chrome-extension://extension-id/index.html",
    ]);
  });
});
