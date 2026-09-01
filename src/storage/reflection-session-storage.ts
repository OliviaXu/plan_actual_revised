import {
  normalizeReflectionSession,
  type ReflectionSession,
} from "../domain/reflection-session";

const reflectionSessionStorageKey = "reflectionSession";

export async function loadReflectionSession() {
  const stored = await chrome.storage.local.get(reflectionSessionStorageKey);
  const value = stored[reflectionSessionStorageKey];
  if (value === undefined) return null;
  const session = normalizeReflectionSession(value);
  if (!session) throw new Error("Stored reflection uses an invalid format.");
  return session;
}

export function saveReflectionSession(session: ReflectionSession) {
  return chrome.storage.local.set({ [reflectionSessionStorageKey]: session });
}

export function clearReflectionSession() {
  return chrome.storage.local.remove(reflectionSessionStorageKey);
}
