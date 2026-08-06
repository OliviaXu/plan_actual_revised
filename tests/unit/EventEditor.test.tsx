import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventEditor } from "../../src/app/components/EventEditor";

afterEach(cleanup);

describe("EventEditor", () => {
  it("uses create mode to hide deletion even when a delete operation is available", () => {
    render(
      <EventEditor
        column="actual"
        event={{
          id: "proposed-actual",
          summary: "Untitled",
          startMinutes: 720,
          durationMinutes: 30,
          colorId: "",
        }}
        mode="create"
        onDelete={vi.fn()}
        onDismiss={vi.fn()}
        onSave={vi.fn()}
        paletteColorIds={[]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
});
