export const GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES = {
  "1": "border-[#7986cb]/50 bg-[#7986cb]/25",
  "2": "border-[#33b679]/50 bg-[#33b679]/25",
  "3": "border-[#8e24aa]/50 bg-[#8e24aa]/25",
  "4": "border-[#e67c73]/50 bg-[#e67c73]/25",
  "5": "border-[#f6c026]/50 bg-[#f6c026]/25",
  "6": "border-[#f5511d]/50 bg-[#f5511d]/25",
  "7": "border-[#039be5]/50 bg-[#039be5]/25",
  "8": "border-[#616161]/50 bg-[#616161]/25",
  "9": "border-[#3f51b5]/50 bg-[#3f51b5]/25",
  "10": "border-[#0b8043]/50 bg-[#0b8043]/25",
  "11": "border-[#d60000]/50 bg-[#d60000]/25",
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
