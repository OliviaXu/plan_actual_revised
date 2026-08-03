import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toast } from "../../src/app/components/ui/toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toast", () => {
  it("shows flat plain feedback until the requested duration ends", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onDurationEnd = vi.fn();

    render(
      <Toast
        durationMs={5_000}
        message="Saved 3 Actuals to Calendar."
        onDismiss={onDismiss}
        onDurationEnd={onDurationEnd}
        tone="plain"
      />,
    );

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Saved 3 Actuals to Calendar.");
    expect(toast).toHaveClass("border-border", "bg-white");
    expect(toast).not.toHaveClass(
      "border-destructive",
      "bg-destructive",
      "shadow-soft",
    );
    expect(screen.queryByTestId("toast-warning-icon")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4_999));
    expect(onDurationEnd).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDurationEnd).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("keeps warning feedback visible and supports retry and dismissal", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const view = render(
      <Toast
        action={{
          label: "Retry save",
          pending: false,
          pendingLabel: "Retrying…",
          onClick: onAction,
        }}
        message="1 Actual wasn’t saved."
        onDismiss={onDismiss}
        onDurationEnd={vi.fn()}
        tone="warning"
      />,
    );

    const toast = screen.getByRole("alert");
    expect(toast).toHaveClass("border-border", "bg-white");
    expect(toast).not.toHaveClass(
      "border-destructive",
      "bg-destructive",
      "shadow-soft",
    );
    expect(screen.getByTestId("toast-warning-icon")).toHaveClass(
      "text-destructive",
    );

    act(() => vi.advanceTimersByTime(30_000));
    expect(onDismiss).not.toHaveBeenCalled();
    const retry = screen.getByRole("button", { name: "Retry save" });
    expect(retry).toHaveClass(
      "bg-transparent",
      "underline",
      "hover:decoration-2",
    );
    expect(retry).not.toHaveClass("bg-foreground", "text-background");
    expect(screen.queryByTestId("toast-retry-icon")).not.toBeInTheDocument();
    fireEvent.click(retry);
    expect(onAction).toHaveBeenCalledOnce();

    view.rerender(
      <Toast
        action={{
          label: "Retry save",
          pending: true,
          pendingLabel: "Retrying…",
          onClick: onAction,
        }}
        message="1 Actual wasn’t saved."
        onDismiss={onDismiss}
        onDurationEnd={vi.fn()}
        tone="warning"
      />,
    );
    expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
