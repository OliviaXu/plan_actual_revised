import { Check } from "lucide-react";

export function DailyFocusBanner({
  draft,
  summary,
  isSaving,
  onDraftChange,
  onSubmit,
}: {
  draft: string;
  summary: string | null | undefined;
  isSaving: boolean;
  onDraftChange: (draft: string) => void;
  onSubmit: (summary: string) => void;
}) {
  const normalizedDraft = draft.trim();

  return (
    <section
      aria-label="Something hard today"
      className="flex min-w-0 items-center gap-3 rounded-md border border-amber-300/70 bg-amber-100/70 px-3 py-2 text-amber-950"
      data-testid="daily-focus-banner"
    >
      <p className="shrink-0 whitespace-nowrap text-[0.65rem] font-semibold tracking-[0.1em] text-amber-800">
        SOMETHING HARD TODAY
      </p>
      {summary !== undefined ? (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {summary || "Untitled event"}
          </p>
        </div>
      ) : (
        <form
          aria-label="Daily focus"
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (normalizedDraft && !isSaving) onSubmit(normalizedDraft);
          }}
        >
          <input
            aria-label="Something hard today"
            className="min-w-0 flex-1 border-b border-amber-400 bg-transparent px-0 py-0.5 text-sm caret-amber-800 outline-none placeholder:text-amber-800/60 focus:border-amber-700 disabled:opacity-60"
            disabled={isSaving}
            onChange={(inputEvent) => onDraftChange(inputEvent.target.value)}
            placeholder="struggling is how learning happens"
            type="text"
            value={draft}
          />
          <button
            aria-label={isSaving ? "Committing daily focus" : "Commit daily focus"}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-amber-700 transition-colors hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 disabled:pointer-events-none disabled:opacity-40"
            disabled={!normalizedDraft || isSaving}
            type="submit"
          >
            <Check aria-hidden="true" className="h-4 w-4" />
          </button>
        </form>
      )}
    </section>
  );
}
