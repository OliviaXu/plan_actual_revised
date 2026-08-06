import type { ComponentProps } from "react";
import { describe, expectTypeOf, it } from "vitest";

import { SlackIntentionPopover } from "../../src/app/components/SlackIntentionPopover";

describe("SlackIntentionPopover contract", () => {
  it("submits the intention the user is setting for Slack", () => {
    expectTypeOf<ComponentProps<typeof SlackIntentionPopover>>()
      .toMatchTypeOf<{
        onSubmit: (intention: string) => void;
      }>();
  });
});
