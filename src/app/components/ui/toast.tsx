import { CircleAlert, X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "./button";

export type ToastAction = {
  label: string;
  pending: boolean;
  pendingLabel: string;
  onClick: () => void;
};

export function Toast({
  action,
  durationMs,
  message,
  onDismiss,
  onDurationEnd,
  testId,
  tone,
}: {
  action?: ToastAction;
  durationMs?: number;
  message: string;
  onDismiss: () => void;
  onDurationEnd: () => void;
  testId?: string;
  tone: "plain" | "warning";
}) {
  useEffect(() => {
    if (durationMs === undefined) return;

    const timeoutId = window.setTimeout(onDurationEnd, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs, onDurationEnd]);

  return (
    <div
      aria-live={tone === "warning" ? "assertive" : "polite"}
      className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm items-start gap-3 rounded-md border border-border bg-white px-4 py-3 text-sm"
      data-testid={testId}
      role={tone === "warning" ? "alert" : "status"}
    >
      {tone === "warning" ? (
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
          data-testid="toast-warning-icon"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p>{message}</p>
        {action ? (
          <Button
            aria-busy={action.pending || undefined}
            className="mt-2"
            disabled={action.pending}
            onClick={action.onClick}
            type="button"
            variant="link"
          >
            {action.pending ? action.pendingLabel : action.label}
          </Button>
        ) : null}
      </div>
      <button
        aria-label="Dismiss notification"
        className="-mr-1 rounded-sm p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
