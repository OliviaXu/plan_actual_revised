# AGENTS.md

## Local Test Environment Notes

- Always run `npm run test:e2e` with sandbox escalation in this repo because Chromium's Crashpad cannot access its macOS settings inside the filesystem sandbox. Do not attempt a sandboxed run first.
