import { describe, expectTypeOf, it } from "vitest";

import type { AppProps } from "../../src/app/App";

describe("App composition contract", () => {
  it("requires the browser entry point to provide Slack launching", () => {
    expectTypeOf<AppProps>().toMatchTypeOf<{
      launchSlack: () => void;
    }>();
  });
});
