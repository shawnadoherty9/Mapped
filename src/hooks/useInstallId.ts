/**
 * Stable, anonymous, per-browser install identifier.
 * Used to scope user-saved data (e.g. saved comparisons) without auth.
 *
 * Generated lazily on first call, persisted in localStorage. Length and
 * shape are validated by the saved_comparisons RLS policy (>= 8 chars).
 */
const STORAGE_KEY = "lovable.install_id";

export function getInstallId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Private mode / SSR safety: fall back to an in-memory value.
    return `inst_eph_${Date.now()}`;
  }
}

export function useInstallId(): string {
  return getInstallId();
}
