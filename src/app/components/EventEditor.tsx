import { Check } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import type {
  EditableColumn,
  EditableEvent,
} from "../../domain/day-event";
import { resolveGoogleCalendarEventColor } from "../../calendar/google-calendar-colors";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

export type EventEditorDraft = {
  summary: string;
  durationMinutes: number;
  colorId: string;
};

export function EventEditor({
  column,
  event,
  mode,
  onDelete,
  onDismiss,
  onSave,
  paletteColorIds,
}: {
  column: EditableColumn;
  event: EditableEvent;
  mode: "create" | "edit";
  onDelete: () => void;
  onDismiss: () => void;
  onSave: (draft: EventEditorDraft) => void;
  paletteColorIds: string[];
}) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const columnLabel = column === "actual" ? "Actual" : "Revised";
  const [title, setTitle] = useState(event.summary);
  const [duration, setDuration] = useState(String(event.durationMinutes));
  const [colorId, setColorId] = useState(event.colorId);
  const [titleError, setTitleError] = useState<string>();
  const [durationError, setDurationError] = useState<string>();

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const summary = title.trim();
    const durationMinutes = Number(duration);
    const nextTitleError = summary ? undefined : "Title is required.";
    const nextDurationError =
      Number.isInteger(durationMinutes) && durationMinutes > 0
        ? undefined
        : "Duration must be a positive whole number.";

    setTitleError(nextTitleError);
    setDurationError(nextDurationError);
    if (nextTitleError || nextDurationError) return;

    onSave({ summary, durationMinutes, colorId });
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      open
    >
      <DialogContent
        aria-describedby="event-editor-description"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const titleInput = titleInputRef.current;
          titleInput?.focus();
          if (mode === "create") {
            titleInput?.select();
          } else if (titleInput) {
            const titleEnd = titleInput.value.length;
            titleInput.setSelectionRange(titleEnd, titleEnd);
          }
        }}
        onBackdropClick={onDismiss}
      >
        <DialogTitle className="sr-only">Edit {columnLabel}</DialogTitle>
        <DialogDescription
          className="sr-only"
          id="event-editor-description"
        >
          Update this local {columnLabel} block.
        </DialogDescription>

        <form className="space-y-4" noValidate onSubmit={submitDraft}>
          <input
            aria-label="Title"
            aria-invalid={titleError ? true : undefined}
            className="-mx-2 block w-[calc(100%+1rem)] cursor-text border-b border-border bg-transparent px-2 py-1 text-xl font-semibold tracking-tight caret-primary outline-none selection:bg-primary/20 placeholder:text-muted-foreground focus:border-primary focus:ring-0"
            id="event-editor-title"
            onChange={(event) => setTitle(event.target.value)}
            ref={titleInputRef}
            type="text"
            value={title}
          />
          {titleError ? (
            <p className="-mt-3 text-xs text-destructive">{titleError}</p>
          ) : null}

          <div className="grid grid-cols-[5rem_1fr] gap-4">
            <div>
              <label
                className="block text-sm font-medium"
                htmlFor="event-editor-duration"
              >
                Minutes
                <input
                  aria-label="Duration"
                  aria-invalid={durationError ? true : undefined}
                  className="mt-1 block h-9 w-16 rounded-md border border-border px-2 font-normal outline-none focus:ring-2 focus:ring-primary"
                  id="event-editor-duration"
                  min={1}
                  onChange={(event) => setDuration(event.target.value)}
                  step={1}
                  type="number"
                  value={duration}
                />
              </label>
              {durationError ? (
                <p className="mt-1 text-xs text-destructive">
                  {durationError}
                </p>
              ) : null}
            </div>

            <fieldset>
              <legend className="text-sm font-medium">Color</legend>
              <div className="mt-2 flex gap-2">
                {paletteColorIds.map((paletteColorId) => {
                  const color = resolveGoogleCalendarEventColor(paletteColorId);
                  const selected = colorId === paletteColorId;
                  return (
                    <button
                      aria-label={`Color ${paletteColorId}`}
                      aria-pressed={selected}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      key={paletteColorId}
                      onClick={() =>
                        setColorId(selected ? "" : paletteColorId)
                      }
                      style={color ? { backgroundColor: color } : undefined}
                      title={selected ? "Clear selected color" : "Select color"}
                      type="button"
                    >
                      {selected ? (
                        <Check
                          aria-hidden="true"
                          className="h-4 w-4 text-white drop-shadow"
                          data-testid="selected-color-indicator"
                          strokeWidth={3}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div
            className={`flex items-center pt-1 ${
              mode === "edit" ? "justify-between" : "justify-end"
            }`}
          >
            {mode === "edit" ? (
              <button
                className="h-9 rounded-md px-2 text-sm font-medium text-destructive hover:bg-destructive/5"
                onClick={onDelete}
                type="button"
              >
                Delete
              </button>
            ) : null}
            <Button type="submit">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
