import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IntentionBanner } from "../../src/app/components/IntentionBanner";

describe("IntentionBanner", () => {
  it.each([
    {
      kind: "daily-focus" as const,
      formName: "Daily focus",
      label: "SOMETHING HARD TODAY",
      placeholder: "struggling is how learning happens",
      testId: "daily-focus-banner",
    },
    {
      kind: "weekly-practice" as const,
      formName: "Weekly practice",
      label: "MY PRACTICE THIS WEEK",
      placeholder: "practice",
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
