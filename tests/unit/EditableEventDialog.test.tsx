import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditableEventDialog } from "../../src/app/components/EditableEventDialog";

afterEach(cleanup);

describe("EditableEventDialog", () => {
  it("uses create mode to hide deletion even when a delete operation is available", () => {
    render(
      <EditableEventDialog
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
