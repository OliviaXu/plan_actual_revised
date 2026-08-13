import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventEditor } from "../../src/app/components/EventEditor";

afterEach(cleanup);

describe("EventEditor", () => {
  it("gives the title more separation while keeping settings close to the action row", () => {
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

    const title = screen.getByRole("textbox", { name: "Title" });
    const settingsRow = title.nextElementSibling;
    const actionRow = settingsRow?.nextElementSibling;

    expect(settingsRow).toHaveClass("mt-8");
    expect(actionRow).toHaveClass("mt-3");
    expect(actionRow).toHaveClass("justify-end");
  });

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
