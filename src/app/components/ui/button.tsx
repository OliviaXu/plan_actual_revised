import type { ButtonHTMLAttributes } from "react";

const buttonClassName =
  "inline-flex h-9 items-center justify-center rounded-md bg-button-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100";

export function Button({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={className ? `${buttonClassName} ${className}` : buttonClassName}
      {...props}
    />
  );
}
