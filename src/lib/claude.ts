import { CountryConfig } from "@/data/countryConfigs";
import { ClaudeProfile, ProfileForm } from "@/store/useAppStore";
import { supabase } from "@/integrations/supabase/client";

// Lovable AI is always available via the edge function — no client-side key needed.
export function hasApiKey(): boolean { return true; }

export async function mapProfileWithClaude(form: ProfileForm, country: CountryConfig): Promise<ClaudeProfile> {
  const { data, error } = await supabase.functions.invoke("ai-skills-mapper", {
    body: { action: "map_profile", form, country },
  });
  if (error) {
    // supabase-js wraps non-2xx responses; surface a useful message
    const msg = (error as { message?: string }).message || "Failed to map profile";
    throw new Error(msg);
  }
  if (!data?.profile) {
    throw new Error(data?.error || "AI did not return a profile");
  }
  return data.profile as ClaudeProfile;
}

export async function generatePolicySignals(country: CountryConfig, agg: {
  avgRisk: number; topSkillGap: string; informalShare: number; topOccupations: string[];
}): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke("ai-skills-mapper", {
      body: { action: "policy_signals", country, agg },
    });
    if (error || !data?.signals?.length) throw new Error((error as { message?: string } | undefined)?.message || data?.error || "no signals");
    return data.signals as string[];
  } catch {
    // Graceful local fallback — keeps the dashboard useful if AI is unavailable.
    return [
      `${country.name}: Average displacement risk ${(agg.avgRisk * 100).toFixed(0)}% suggests targeted reskilling investment in ${country.top_sectors[0]}.`,
      `${(agg.informalShare * 100).toFixed(0)}% informal skill share — formalization pathways (TVET certification, recognition of prior learning) would unlock wage premia.`,
      `Top skill gap "${agg.topSkillGap}" aligns with ${country.top_sectors[0]} growth (${country.sector_growth[country.top_sectors[0]] ?? "n/a"}%/yr) — a clear public-private training opportunity.`,
    ];
  }
}
