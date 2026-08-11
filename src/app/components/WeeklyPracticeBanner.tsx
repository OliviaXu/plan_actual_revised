import { Check } from "lucide-react";

export function WeeklyPracticeBanner({
  draft,
  summary,
  isSaving,
  onDraftChange,
  onSubmit,
}: {
  draft: string;
  summary?: string | null;
  isSaving: boolean;
  onDraftChange: (draft: string) => void;
  onSubmit: (summary: string) => void;
}) {
  const normalizedDraft = draft.trim();

  return (
    <section
      aria-label="Weekly practice"
      className="flex min-w-0 items-center gap-3 rounded-md border border-rose-300/70 bg-rose-100/70 px-3 py-2 text-rose-950"
      data-testid="weekly-practice-banner"
    >
      <p className="shrink-0 whitespace-nowrap text-[0.65rem] font-semibold tracking-[0.1em] text-rose-800">
        MY PRACTICE THIS WEEK
      </p>
      {summary !== undefined ? (
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {summary || "Untitled event"}
        </p>
      ) : (
        <form
          aria-label="Weekly practice"
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (normalizedDraft) onSubmit(normalizedDraft);
          }}
        >
          <input
            aria-label="Weekly practice"
            className="min-w-0 flex-1 border-b border-rose-400 bg-transparent px-0 py-0.5 text-sm outline-none placeholder:text-rose-800/60 focus:border-rose-700 disabled:opacity-60"
            disabled={isSaving}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="practice"
            type="text"
            value={draft}
          />
          <button
            aria-label={isSaving ? "Committing weekly practice" : "Commit weekly practice"}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-rose-400 bg-rose-200/70 disabled:pointer-events-none disabled:opacity-50"
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
