import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CountryKey, countryConfigs } from "@/data/countryConfigs";
import type { AptitudeLevel } from "@/lib/opentdb";
import { useCountryStats, useCountryStatsAtYear, mergeWithStats } from "@/hooks/useWorldBankStats";

export type SourceYearMode = "latest" | "exact";
export const DEFAULT_EXACT_YEAR = 2020;

export interface SkillAssessment {
  skill: string;
  category: string;
  correct: number;
  total: number;
  aptitude: AptitudeLevel;
  ai_resilience: "Low" | "Medium" | "High";
  growth_path: string;
  assessed_at: string;
}

export interface ProfileForm {
  name: string;
  age: number | "";
  education: string;
  experience: string;
  skills: string[];
  description: string;
  languages: string[];
  connectivity: string;
}

export interface IscoMatch { code: string; label: string; confidence: number }
export interface EscoSkill { label: string; type: "formal" | "informal" | "demonstrated" }
export interface Opportunity {
  title: string;
  type: "formal_employment" | "self_employment" | "gig" | "training";
  match_pct: number;
  rationale: string;
  wage_range_usd_day: string;
}
export interface ClaudeProfile {
  plain_summary: string;
  isco_matches: IscoMatch[];
  esco_skills: EscoSkill[];
  automation_risk_raw: number;
  durable_skills: string[];
  at_risk_tasks: string[];
  adjacent_skills: string[];
  opportunities: Opportunity[];
  risk_level: "low" | "moderate" | "high";
}

interface AppState {
  country: CountryKey;
  setCountry: (c: CountryKey) => void;
  form: ProfileForm;
  setForm: (f: ProfileForm) => void;
  activeProfile: ClaudeProfile | null;
  setActiveProfile: (p: ClaudeProfile | null) => void;
  mappedAt: string | null;
  setMappedAt: (s: string | null) => void;
  assessments: SkillAssessment[];
  upsertAssessment: (a: SkillAssessment) => void;
  clearAssessments: () => void;
  publicId: string;
  isDiscoverable: boolean;
  setDiscoverable: (b: boolean) => void;
  /** Whether calibration uses latest-available WB obs or values pinned to an exact year. */
  sourceYearMode: SourceYearMode;
  setSourceYearMode: (m: SourceYearMode) => void;
  exactYear: number;
  setExactYear: (y: number) => void;
}

const defaultForm: ProfileForm = {
  name: "Amara",
  age: 22,
  education: "Secondary school certificate",
  experience: "3-5 years",
  skills: ["phone repair", "basic coding", "French", "Twi", "customer service", "parts sourcing", "basic bookkeeping"],
  description:
    "I fix phones for customers in my neighbourhood, including sourcing parts from Accra. I taught myself to code from YouTube videos on a shared mobile connection. I also help my family run a small goods stall.",
  languages: ["English", "Twi", "French"],
  connectivity: "Shared mobile data",
};

function makeId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      country: "ghana",
      setCountry: (c) => set({ country: c }),
      form: defaultForm,
      setForm: (f) => set({ form: f }),
      activeProfile: null,
      setActiveProfile: (p) => set({ activeProfile: p }),
      mappedAt: null,
      setMappedAt: (s) => set({ mappedAt: s }),
      assessments: [],
      upsertAssessment: (a) => set((s) => ({
        assessments: [...s.assessments.filter(x => x.skill.toLowerCase() !== a.skill.toLowerCase()), a],
      })),
      clearAssessments: () => set({ assessments: [] }),
      publicId: makeId(),
      isDiscoverable: true,
      setDiscoverable: (b) => set({ isDiscoverable: b }),
      sourceYearMode: "latest" as SourceYearMode,
      setSourceYearMode: (m) => set({ sourceYearMode: m }),
      exactYear: DEFAULT_EXACT_YEAR,
      setExactYear: (y) => set({ exactYear: Math.min(2024, Math.max(2010, Math.floor(y))) }),
    }),
    {
      name: "unmapped-store",
      partialize: (state) => ({
        country: state.country,
        publicId: state.publicId,
        isDiscoverable: state.isDiscoverable,
        sourceYearMode: state.sourceYearMode,
        exactYear: state.exactYear,
      }),
    }
  )
);


export const useActiveCountry = () => {
  const c = useAppStore((s) => s.country);
  const mode = useAppStore((s) => s.sourceYearMode);
  const year = useAppStore((s) => s.exactYear);
  const { stats: latestStats } = useCountryStats(c);
  const { stats: yearStats } = useCountryStatsAtYear(c, mode === "exact" ? year : null);
  const stats = mode === "exact" ? (yearStats ?? latestStats) : latestStats;
  return mergeWithStats(c, stats);
};
