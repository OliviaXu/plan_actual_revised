import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/real",
  timeout: 120_000,
  workers: 1,
  use: { trace: "off" },
});
