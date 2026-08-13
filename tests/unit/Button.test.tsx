import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button, IconButton } from "../../src/app/components/ui/button";

afterEach(cleanup);

describe("Button", () => {
  it("uses the primary treatment by default", () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveClass(
      "h-9",
      "bg-button-primary",
      "text-primary-foreground",
    );
  });

  it("provides visually stable destructive and link treatments", () => {
    render(
      <>
        <Button variant="destructive">Delete</Button>
        <Button className="mt-2" variant="link">Retry save</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "h-9",
      "px-2",
      "text-destructive",
      "hover:bg-destructive/5",
    );
    expect(screen.getByRole("button", { name: "Retry save" })).toHaveClass(
      "mt-2",
      "bg-transparent",
      "p-0",
      "underline",
      "focus-visible:ring-offset-2",
      "disabled:no-underline",
    );
  });
});

describe("IconButton", () => {
  it("requires an accessible label", () => {
    // @ts-expect-error Icon buttons require an accessible label.
    render(<IconButton>+</IconButton>);
  });

  it("defaults to a labeled 28px circular button", () => {
    render(<IconButton aria-label="Add Actual">+</IconButton>);

    const button = screen.getByRole("button", { name: "Add Actual" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass(
      "h-7",
      "w-7",
      "rounded-full",
      "bg-transparent",
      "text-foreground",
      "hover:bg-white/70",
      "disabled:opacity-50",
    );
  });

  it("supports the muted icon tone", () => {
    render(<IconButton aria-label="Log Slack time" tone="muted">S</IconButton>);

    expect(screen.getByRole("button", { name: "Log Slack time" })).toHaveClass(
      "text-muted-foreground",
      "hover:text-foreground",
    );
  });
});
