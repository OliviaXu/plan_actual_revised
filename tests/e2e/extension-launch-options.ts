export function getExtensionLaunchOptions() {
  return {
    channel: "chromium" as const,
    headless: process.env.PW_HEADED !== "1",
  };
}
