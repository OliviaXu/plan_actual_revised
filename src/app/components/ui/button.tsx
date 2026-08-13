import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "link" | "destructive";

const buttonClassNames: Record<ButtonVariant, string> = {
  primary:
    "inline-flex h-9 items-center justify-center rounded-md bg-button-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
  link:
    "inline-flex items-center rounded-sm bg-transparent p-0 text-sm font-medium text-foreground underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-default disabled:text-muted-foreground disabled:no-underline",
  destructive:
    "h-9 rounded-md px-2 text-sm font-medium text-destructive hover:bg-destructive/5",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const buttonClassName = buttonClassNames[variant];
  return (
    <button
      className={className ? `${buttonClassName} ${className}` : buttonClassName}
      {...props}
    />
  );
}

type IconButtonTone = "default" | "muted";

const iconButtonToneClassNames: Record<IconButtonTone, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground hover:text-foreground",
};

export function IconButton({
  className,
  tone = "default",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  "aria-label": string;
  tone?: IconButtonTone;
}) {
  const iconButtonClassName =
    `inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 ${iconButtonToneClassNames[tone]}`;

  return (
    <button
      className={className ? `${iconButtonClassName} ${className}` : iconButtonClassName}
      type={type}
      {...props}
    />
  );
}
