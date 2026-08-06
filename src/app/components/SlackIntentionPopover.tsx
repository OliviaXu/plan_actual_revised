import { useRef, useState, type FormEvent } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

const iconButtonClassName =
  "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-white text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50";

export function SlackIntentionPopover({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (intention: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [intention, setIntention] = useState("");

  function updateOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setIntention("");
    }
  }

  function submitIntention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedIntention = intention.trim();
    if (!normalizedIntention) return;

    onSubmit(normalizedIntention);
    updateOpen(false);
  }

  return (
    <Popover onOpenChange={updateOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label="Log Slack time"
          className={iconButtonClassName}
          disabled={disabled}
          type="button"
        >
          <SlackMarkIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Log Slack time"
        className="w-56 p-3"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        role="dialog"
      >
        <form className="space-y-2.5" noValidate onSubmit={submitIntention}>
          <label
            className="block text-sm font-medium"
            htmlFor="slack-intention"
          >
            What are you up to?
          </label>
          <input
            className="block h-8 w-full border-b border-border bg-transparent px-0 py-1 text-sm caret-primary outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-0"
            id="slack-intention"
            onChange={(event) => setIntention(event.target.value)}
            placeholder="attention is devotion :)"
            ref={inputRef}
            type="text"
            value={intention}
          />
          <div className="flex justify-end pt-0.5">
            <button
              className="inline-flex h-8 items-center justify-center rounded-sm bg-muted px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
              disabled={!intention.trim()}
              type="submit"
            >
              Open Slack
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SlackMarkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      data-testid="slack-mark-icon"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M5.042 15.165a2.528 2.528 0 1 1-2.52-2.523h2.52v2.523zm1.271 0a2.529 2.529 0 1 1 5.058 0v6.313a2.529 2.529 0 1 1-5.058 0v-6.313zm2.529-10.11a2.528 2.528 0 1 1 2.523-2.522v2.522H8.842zm0 1.271a2.529 2.529 0 1 1 0 5.058H2.529a2.529 2.529 0 1 1 0-5.058h6.313zm10.11 2.529a2.528 2.528 0 1 1 2.523 2.522h-2.523V8.855zm-1.271 0a2.529 2.529 0 1 1-5.058 0V2.542a2.529 2.529 0 1 1 5.058 0v6.313zm-2.529 10.11a2.528 2.528 0 1 1-2.523 2.522v-2.522h2.523zm0-1.271a2.529 2.529 0 1 1 0-5.058h6.313a2.529 2.529 0 1 1 0 5.058h-6.313z" />
    </svg>
  );
}
