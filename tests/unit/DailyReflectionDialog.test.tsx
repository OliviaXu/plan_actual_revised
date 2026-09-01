import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DailyReflectionDialog } from "../../src/app/components/DailyReflectionDialog";
import type { ReflectionSession } from "../../src/domain/reflection-session";

const baseSession: ReflectionSession = {
  schemaVersion: 1,
  date: "2026-07-15",
  focusSummary: "Write the difficult proposal",
  weeklyPracticeSummary: "Ask one better question",
  detail: "",
  weeklyPracticeReflection: "",
  nextExperiment: "",
  nextFrog: "",
  snoozedUntil: null,
};

afterEach(cleanup);

describe("DailyReflectionDialog", () => {
  it("uses the agreed copy and requires an outcome plus detail", () => {
    const onChange = vi.fn();
    function Harness() {
      const [session, setSession] = useState(baseSession);
      return <DailyReflectionDialog
        isSaving={false}
        onChange={(change) => {
          onChange(change);
          setSession((current) => ({ ...current, ...change }));
        }}
        onSave={vi.fn()}
        onSnooze={vi.fn()}
        session={session}
      />;
    }
    render(<Harness />);

    expect(screen.getByText(
      "Take a breath. Close your eyes for a moment. What do you notice about your day?",
    )).toBeVisible();
    expect(screen.getByText("Write the difficult proposal")).toBeVisible();
    expect(screen.getByText("Ask one better question")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save reflection" }))
      .toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Made Progress" }));
    expect(onChange).toHaveBeenCalledWith({ outcome: "madeProgress" });
    expect(screen.getByLabelText("Tell me more")).toHaveAttribute(
      "placeholder",
      "What moved? What helped?",
    );
  });

  it("fixes a missing focus to Not set and keeps missing practice gentle", () => {
    render(
      <DailyReflectionDialog
        isSaving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onSnooze={vi.fn()}
        session={{
          ...baseSession,
          focusSummary: null,
          weeklyPracticeSummary: null,
          outcome: "notSet",
        }}
      />,
    );
    expect(screen.getByText("Not set")).toBeVisible();
    expect(screen.getByLabelText("What else moved forward?"))
      .toHaveAttribute(
        "placeholder",
        "What became the focus? How were your energy and focus?",
      );
    expect(screen.getByText("How’s our weekly practice going?")).toBeVisible();
    expect(screen.queryByText(/weekly practice.*not set/i)).not.toBeInTheDocument();
  });

  it("does not dismiss through Escape or the backdrop", () => {
    const onSnooze = vi.fn();
    render(
      <DailyReflectionDialog
        isSaving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onSnooze={onSnooze}
        session={baseSession}
      />,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByTestId("dialog-overlay"));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(onSnooze).not.toHaveBeenCalled();
  });
});
