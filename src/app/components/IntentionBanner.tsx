import { Check } from "lucide-react";

type IntentionKind = "daily-focus" | "weekly-practice";

const intentionBannerConfig = {
  "daily-focus": {
    sectionLabel: "Something hard today",
    formLabel: "Daily focus",
    label: "SOMETHING HARD TODAY",
    placeholder: "struggling is how learning happens",
    testId: "daily-focus-banner",
    commitName: "daily focus",
    sectionClassName: "border-amber-300/70 bg-amber-100/70 text-amber-950",
    labelClassName: "text-amber-800",
    inputClassName: "border-amber-400 caret-amber-800 placeholder:text-amber-800/60 focus:border-amber-700",
    buttonClassName: "text-amber-800 hover:bg-amber-200/70 hover:text-amber-950 focus-visible:ring-amber-800 disabled:opacity-40",
  },
  "weekly-practice": {
    sectionLabel: "Weekly practice",
    formLabel: "Weekly practice",
    label: "MY PRACTICE THIS WEEK",
    placeholder: "practice",
    testId: "weekly-practice-banner",
    commitName: "weekly practice",
    sectionClassName: "border-rose-300/70 bg-rose-100/70 text-rose-950",
    labelClassName: "text-rose-800",
    inputClassName: "border-rose-400 placeholder:text-rose-800/60 focus:border-rose-700",
    buttonClassName: "text-rose-800 hover:bg-rose-200/70 hover:text-rose-950 focus-visible:ring-rose-800 disabled:opacity-40",
  },
} as const satisfies Record<IntentionKind, Record<string, string>>;

export function IntentionBanner({
  kind,
  draft,
  summary,
  isSaving,
  onDraftChange,
  onSubmit,
}: {
  kind: IntentionKind;
  draft: string;
  summary: string | null | undefined;
  isSaving: boolean;
  onDraftChange: (draft: string) => void;
  onSubmit: (summary: string) => void;
}) {
  const config = intentionBannerConfig[kind];
  const normalizedDraft = draft.trim();

  return (
    <section
      aria-label={config.sectionLabel}
      className={`flex min-w-0 items-center gap-3 rounded-md border px-3 py-2 ${config.sectionClassName}`}
      data-testid={config.testId}
    >
      <p className={`shrink-0 whitespace-nowrap text-[0.65rem] font-semibold tracking-[0.1em] ${config.labelClassName}`}>
        {config.label}
      </p>
      {summary !== undefined ? (
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {summary || "Untitled event"}
        </p>
      ) : (
        <form
          aria-label={config.formLabel}
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalizedDraft) onSubmit(normalizedDraft);
          }}
        >
          <input
            aria-label={config.sectionLabel}
            className={`min-w-0 flex-1 border-b bg-transparent px-0 py-0.5 text-sm outline-none disabled:opacity-60 ${config.inputClassName}`}
            disabled={isSaving}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={config.placeholder}
            type="text"
            value={draft}
          />
          <button
            aria-label={`${isSaving ? "Committing" : "Commit"} ${config.commitName}`}
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none ${config.buttonClassName}`}
            disabled={!normalizedDraft || isSaving}
            type="submit"
          >
            <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </form>
      )}
    </section>
  );
}
