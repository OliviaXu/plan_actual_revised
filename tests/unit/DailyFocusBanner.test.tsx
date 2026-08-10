import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DailyFocusBanner } from "../../src/app/components/DailyFocusBanner";

afterEach(cleanup);

describe("DailyFocusBanner", () => {
  it("renders the empty commit form and submits trimmed text with Enter", () => {
    const onDraftChange = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <DailyFocusBanner
        draft=""
        summary={undefined}
        isSaving={false}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByPlaceholderText(
      "struggling is how learning happens",
    );
    expect(screen.getByTestId("daily-focus-banner")).toHaveClass(
      "flex",
      "items-center",
      "py-2",
    );
    expect(screen.getByRole("form", { name: "Daily focus" })).toHaveClass(
      "min-w-0",
      "flex-1",
    );
    const submit = screen.getByRole("button", { name: "Commit daily focus" });
    expect(submit).toBeDisabled();
    expect(submit).not.toHaveClass("border");
    expect(submit).not.toHaveClass("bg-amber-200/70");

    fireEvent.change(input, { target: { value: "  Ship the hard thing  " } });
    expect(onDraftChange).toHaveBeenCalledWith("  Ship the hard thing  ");

    rerender(
      <DailyFocusBanner
        draft="  Ship the hard thing  "
        summary={undefined}
        isSaving={false}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.submit(screen.getByRole("form", { name: "Daily focus" }));
    expect(onSubmit).toHaveBeenCalledWith("Ship the hard thing");
  });

  it("disables the editable controls while saving", () => {
    render(
      <DailyFocusBanner
        draft="Ship the hard thing"
        summary={undefined}
        isSaving
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Something hard today" }))
      .toBeDisabled();
    expect(screen.getByRole("button", { name: "Committing daily focus" }))
      .toBeDisabled();
  });

  it("renders only the title for one confirmed Calendar focus", () => {
    render(
      <DailyFocusBanner
        draft="ignored"
        summary={null}
        isSaving={false}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Untitled event")).toBeVisible();
    expect(screen.getByText("Untitled event")).toHaveClass("truncate");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
