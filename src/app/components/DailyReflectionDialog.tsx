import { DateTime } from "luxon";

import type {
  ReflectionOutcome,
  ReflectionSession,
} from "../../domain/reflection-session";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

type ReflectionDraftChange = Partial<Pick<
  ReflectionSession,
  | "outcome"
  | "detail"
  | "weeklyPracticeReflection"
  | "nextExperiment"
  | "nextFrog"
>>;

const outcomeOptions: Array<{
  value: Exclude<ReflectionOutcome, "notSet">;
  label: string;
}> = [
  { value: "done", label: "Done" },
  { value: "madeProgress", label: "Made Progress" },
  { value: "didntGetTo", label: "Didn’t get to" },
];

const detailPrompts = {
  done: {
    label: "Tell me more",
    placeholder: "What helped? How were your energy and focus?",
  },
  madeProgress: {
    label: "Tell me more",
    placeholder: "What moved? What helped?",
  },
  didntGetTo: {
    label: "What else moved forward?",
    placeholder: "What got in the way? What mattered instead?",
  },
  notSet: {
    label: "What else moved forward?",
    placeholder: "What became the focus? How were your energy and focus?",
  },
} as const;

export function DailyReflectionDialog({
  isSaving,
  onChange,
  onSave,
  onSnooze,
  session,
}: {
  isSaving: boolean;
  onChange: (change: ReflectionDraftChange) => void;
  onSave: () => void;
  onSnooze: () => void;
  session: ReflectionSession;
}) {
  const outcome = session.focusSummary ? session.outcome : "notSet";
  const detailPrompt = outcome ? detailPrompts[outcome] : null;
  const canSave = Boolean(outcome && session.detail.trim()) && !isSaving;
  const dateLabel = DateTime.fromISO(session.date, { zone: "utc" }).toLocaleString({
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        aria-describedby="daily-reflection-description"
        className="max-h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="text-xl font-semibold">
          Reflect on {dateLabel}
        </DialogTitle>
        <DialogDescription
          className="mt-2 text-sm leading-6 text-muted-foreground"
          id="daily-reflection-description"
        >
          Take a breath. Close your eyes for a moment. What do you notice about
          your day?
        </DialogDescription>

        <div className="mt-6 space-y-5">
          <section aria-labelledby="daily-reflection-focus-label">
            <p
              className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-800"
              id="daily-reflection-focus-label"
            >
              Today’s frog
            </p>
            {session.focusSummary ? (
              <p className="mt-1 text-sm font-medium">{session.focusSummary}</p>
            ) : (
              <p className="mt-2 text-sm font-medium">Not set</p>
            )}
            {session.focusSummary ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {outcomeOptions.map((option) => (
                  <button
                    aria-pressed={session.outcome === option.value}
                    className="rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    key={option.value}
                    onClick={() => onChange({ outcome: option.value })}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {detailPrompt ? (
            <ReflectionTextarea
              label={detailPrompt.label}
              onChange={(detail) => onChange({ detail })}
              placeholder={detailPrompt.placeholder}
              required
              value={session.detail}
            />
          ) : null}

          <section>
            <ReflectionTextarea
              label="How’s our weekly practice going?"
              onChange={(weeklyPracticeReflection) =>
                onChange({ weeklyPracticeReflection })}
              value={session.weeklyPracticeReflection}
            />
            {session.weeklyPracticeSummary ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {session.weeklyPracticeSummary}
              </p>
            ) : null}
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <ReflectionTextarea
              label="Next experiment?"
              onChange={(nextExperiment) => onChange({ nextExperiment })}
              rows={2}
              value={session.nextExperiment}
            />
            <ReflectionTextarea
              label="Next frog?"
              onChange={(nextFrog) => onChange({ nextFrog })}
              rows={2}
              value={session.nextFrog}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-4">
          <Button
            disabled={isSaving}
            onClick={onSnooze}
            type="button"
            variant="link"
          >
            Snooze 15 minutes
          </Button>
          <Button disabled={!canSave} onClick={onSave} type="button">
            {isSaving ? "Saving…" : "Save reflection"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReflectionTextarea({
  label,
  onChange,
  placeholder,
  required,
  rows = 3,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <textarea
        aria-required={required || undefined}
        className="mt-1 block w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-sm font-normal outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
    </label>
  );
}
