export const GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES = {
  "1": "border-[#7986cb]/50 bg-[#dee1f2]",
  "2": "border-[#33b679]/50 bg-[#ccedde]",
  "3": "border-[#8e24aa]/50 bg-[#e3c8ea]",
  "4": "border-[#e67c73]/50 bg-[#f9dedc]",
  "5": "border-[#f6c026]/50 bg-[#fdf0c9]",
  "6": "border-[#f5511d]/50 bg-[#fdd4c7]",
  "7": "border-[#039be5]/50 bg-[#c0e6f9]",
  "8": "border-[#616161]/50 bg-[#d8d8d8]",
  "9": "border-[#3f51b5]/50 bg-[#cfd4ec]",
  "10": "border-[#0b8043]/50 bg-[#c2dfd0]",
  "11": "border-[#d60000]/50 bg-[#f5bfbf]",
} as const;

export const PLAN_EVENT_NEUTRAL_COLOR_CLASS_NAME =
  "border-border bg-muted";

export function planEventColorClassName(colorId: string | null) {
  if (
    colorId !== null &&
    Object.prototype.hasOwnProperty.call(
      GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES,
      colorId,
    )
  ) {
    return GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES[
      colorId as keyof typeof GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES
    ];
  }

  return PLAN_EVENT_NEUTRAL_COLOR_CLASS_NAME;
}
