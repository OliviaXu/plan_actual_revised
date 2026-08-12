import { describe, expect, it } from "vitest";

// The reload helper is intentionally plain JavaScript so Node can run it directly.
// @ts-expect-error TS7016
import { findExtensionPage } from "../../scripts/real-chrome-extension.mjs";

describe("real Chrome extension reload", () => {
  it("selects the intended extension when another extension page is open", () => {
    const unrelatedPage = {
      url: () => "chrome-extension://other-extension/options.html",
    };
    const intendedPage = {
      url: () => "chrome-extension://intended-extension/index.html",
    };

    expect(
      findExtensionPage(
        [unrelatedPage, intendedPage],
        "intended-extension",
      ),
    ).toBe(intendedPage);
  });
});
