# AGENTS.md

## Local Test Environment Notes

- Always run `npm run test:e2e` with sandbox escalation in this repo because Chromium's Crashpad cannot access its macOS settings inside the filesystem sandbox. Do not attempt a sandboxed run first.

## Runtime Boundary Validation

- Do not add runtime validation for extension-internal data sent by our own statically typed code when the sender and receiver share the same message types.
- Keep runtime validation at genuinely untrusted boundaries, including persisted storage, external messages or input, and data returned by external APIs.
- If an internal channel later becomes externally reachable, add validation at that boundary rather than defensively rechecking every internal consumer.
