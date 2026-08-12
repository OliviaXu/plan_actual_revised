import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IntentionBanner } from "../../src/app/components/IntentionBanner";

describe("IntentionBanner", () => {
  it.each([
    {
      kind: "daily-focus" as const,
      formName: "Daily focus",
      label: "SOMETHING HARD TODAY",
      placeholder: "eat the frog",
      testId: "daily-focus-banner",
    },
    {
      kind: "weekly-practice" as const,
      formName: "Weekly practice",
      label: "MY PRACTICE THIS WEEK",
      placeholder: "let’s compound",
      testId: "weekly-practice-banner",
    },
  ])("renders and submits the $kind configuration", ({
    kind,
    formName,
    label,
    placeholder,
    testId,
  }) => {
    const onSubmit = vi.fn();
    render(<IntentionBanner
      kind={kind}
      draft="  Deliberate practice  "
      summary={undefined}
      isSaving={false}
      onDraftChange={vi.fn()}
      onSubmit={onSubmit}
    />);

    fireEvent.submit(screen.getByRole("form", { name: formName }));

    expect(onSubmit).toHaveBeenCalledWith("Deliberate practice");
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByPlaceholderText(placeholder)).toBeVisible();
    expect(screen.getByTestId(testId)).toBeVisible();
  });

  it("renders an untitled confirmed intention without editable controls", () => {
    render(<IntentionBanner
      kind="daily-focus"
      draft=""
      summary={null}
      isSaving={false}
      onDraftChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    expect(screen.getByText("Untitled event")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("aligns its content with the surrounding planner sections", () => {
    render(<IntentionBanner
      kind="daily-focus"
      draft=""
      summary="Deliberate practice"
      isSaving={false}
      onDraftChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    expect(screen.getByTestId("daily-focus-banner"))
      .toHaveClass("px-0", "py-2");
  });

  it.each([
    {
      kind: "daily-focus" as const,
      buttonName: "Commit daily focus",
      textClassName: "text-amber-800",
      inputBorderClassName: "border-amber-400",
    },
    {
      kind: "weekly-practice" as const,
      buttonName: "Commit weekly practice",
      textClassName: "text-rose-800",
      inputBorderClassName: "border-rose-400",
    },
  ])("uses a flat, color-coded treatment for $kind", ({
    kind,
    buttonName,
    textClassName,
    inputBorderClassName,
  }) => {
    render(<IntentionBanner
      kind={kind}
      draft="Deliberate practice"
      summary={undefined}
      isSaving={false}
      onDraftChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    const button = screen.getByRole("button", { name: buttonName });
    expect(button).not.toHaveClass("border", "bg-rose-200/70");
    expect(button).toHaveClass(textClassName);
    expect(button.querySelector("svg")).toHaveAttribute("stroke-width", "2.5");

    const banner = screen.getByTestId(
      kind === "daily-focus" ? "daily-focus-banner" : "weekly-practice-banner",
    );
    expect(banner).not.toHaveClass("border");
    expect(banner).not.toHaveClass("border-b");
    expect(banner).not.toHaveClass("bg-amber-100/70");
    expect(banner).not.toHaveClass("bg-rose-100/70");
    expect(banner).not.toHaveClass("rounded-md");
    expect(screen.getByRole("textbox")).toHaveClass("border-b", inputBorderClassName);
  });

  it.each([
    {
      kind: "daily-focus" as const,
      inputName: "Something hard today",
      pendingButtonName: "Committing daily focus",
    },
    {
      kind: "weekly-practice" as const,
      inputName: "Weekly practice",
      pendingButtonName: "Committing weekly practice",
    },
  ])("disables the $kind controls while saving", ({
    kind,
    inputName,
    pendingButtonName,
  }) => {
    render(<IntentionBanner
      kind={kind}
      draft="Deliberate practice"
      summary={undefined}
      isSaving
      onDraftChange={vi.fn()}
      onSubmit={vi.fn()}
    />);

    expect(screen.getByRole("textbox", { name: inputName })).toBeDisabled();
    expect(screen.getByRole("button", { name: pendingButtonName }))
      .toBeDisabled();
  });
});
