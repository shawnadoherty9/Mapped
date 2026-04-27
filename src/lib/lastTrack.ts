// Persists the user's most recently selected track so that after sign-out,
// they land back on the same dashboard on next sign-in without an extra
// redirect through the /auth picker.
//
// Stored in localStorage (per-browser) under a stable key. Wrapped in
// try/catch so SSR / disabled-storage environments degrade silently.

import type { DemoTrack } from "@/lib/demoPersonas";

const KEY = "unmapped:last-track";

export function getLastTrack(): DemoTrack | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "individual" || v === "policymaker" ? v : null;
  } catch {
    return null;
  }
}

export function setLastTrack(track: DemoTrack): void {
  try {
    localStorage.setItem(KEY, track);
  } catch {
    // ignore — best-effort persistence
  }
}

export function clearLastTrack(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
