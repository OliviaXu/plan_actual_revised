import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WeeklyPracticeBanner } from "../../src/app/components/WeeklyPracticeBanner";

describe("WeeklyPracticeBanner", () => {
  it("submits a trimmed practice from the accessible form", () => {
    const onDraftChange = vi.fn();
    const onSubmit = vi.fn();
    render(<WeeklyPracticeBanner
      draft="  Concise writing  "
      summary={undefined}
      isSaving={false}
      onDraftChange={onDraftChange}
      onSubmit={onSubmit}
    />);

    fireEvent.submit(screen.getByRole("form", { name: "Weekly practice" }));
    expect(onSubmit).toHaveBeenCalledWith("Concise writing");
    expect(screen.getByText("MY PRACTICE THIS WEEK")).toBeVisible();
    expect(screen.getByPlaceholderText("practice")).toBeVisible();
  });

  it("renders a confirmed practice", () => {
    render(<WeeklyPracticeBanner
      draft=""
      summary="Deep listening"
      isSaving={false}
      onDraftChange={vi.fn()}
      onSubmit={vi.fn()}
    />);
    expect(screen.getByText("Deep listening")).toBeVisible();
  });

  it("delegates pending-state protection to the controller", () => {
    const onSubmit = vi.fn();
    render(<WeeklyPracticeBanner
      draft="Concise writing"
      summary={undefined}
      isSaving
      onDraftChange={vi.fn()}
      onSubmit={onSubmit}
    />);

    fireEvent.submit(screen.getByRole("form", { name: "Weekly practice" }));

    expect(onSubmit).toHaveBeenCalledWith("Concise writing");
    expect(screen.getByRole("button", { name: "Committing weekly practice" }))
      .toBeDisabled();
  });
});
