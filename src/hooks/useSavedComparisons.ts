import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getInstallId } from "@/hooks/useInstallId";
import type { CountryKey } from "@/data/countryConfigs";

export type DeltaMode = "AminusB" | "BminusA";

export interface SavedComparison {
  id: string;
  install_id: string;
  country_a: CountryKey;
  country_b: CountryKey;
  delta_mode: DeltaMode;
  name: string | null;
  created_at: string;
}

export interface UseSavedComparisonsResult {
  items: SavedComparison[];
  loading: boolean;
  error: string | null;
  save: (input: {
    country_a: CountryKey;
    country_b: CountryKey;
    delta_mode: DeltaMode;
    name?: string | null;
  }) => Promise<SavedComparison | null>;
  remove: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * CRUD for the per-device saved country comparisons.
 *
 * All rows are scoped to the local install_id. Deletes go through the
 * `delete_saved_comparison` RPC (no direct DELETE policy exists).
 */
export function useSavedComparisons(): UseSavedComparisonsResult {
  const installId = getInstallId();
  const [items, setItems] = useState<SavedComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("saved_comparisons")
      .select("*")
      .eq("install_id", installId)
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setItems([]);
    } else {
      setItems((data ?? []) as SavedComparison[]);
    }
    setLoading(false);
  }, [installId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback<UseSavedComparisonsResult["save"]>(
    async ({ country_a, country_b, delta_mode, name }) => {
      // Avoid trivial duplicates: same pair + direction already saved.
      const dupe = items.find(
        (i) =>
          i.country_a === country_a &&
          i.country_b === country_b &&
          i.delta_mode === delta_mode,
      );
      if (dupe) return dupe;

      const { data, error } = await supabase
        .from("saved_comparisons")
        .insert({
          install_id: installId,
          country_a,
          country_b,
          delta_mode,
          name: name ?? null,
        })
        .select()
        .single();
      if (error) {
        setError(error.message);
        return null;
      }
      const row = data as SavedComparison;
      setItems((prev) => [row, ...prev]);
      return row;
    },
    [installId, items],
  );

  const remove = useCallback<UseSavedComparisonsResult["remove"]>(
    async (id) => {
      const { data, error } = await supabase.rpc("delete_saved_comparison", {
        _id: id,
        _install_id: installId,
      });
      if (error) {
        setError(error.message);
        return false;
      }
      if (data) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        return true;
      }
      return false;
    },
    [installId],
  );

  return { items, loading, error, save, remove, refresh };
}
