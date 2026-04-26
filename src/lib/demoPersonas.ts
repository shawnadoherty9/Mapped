// Shared catalog of demo personas. Each persona maps to its own auth user
// so signing in as a different persona yields a fully separate history,
// country context, and skill ratings.
//
// IMPORTANT: emails / passwords here are NOT secret — they're sandbox demo
// credentials used by the `ensure-demo-user` edge function (which uses the
// service role to create the account on first use) and by the client to sign
// in. Never use this pattern for real accounts.

import type { CountryKey } from "@/data/countryConfigs";

export type DemoTrack = "individual" | "policymaker";

export interface DemoPersona {
  id: string;
  email: string;
  password: string;
  displayName: string;
  country: CountryKey;
  blurb: string;
  /** Short emoji/avatar glyph used in switcher chips. */
  glyph: string;
  /** Which login page this persona belongs to. */
  track: DemoTrack;
  /** Optional org label for policymaker personas. */
  organization?: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  // ===== Job-seeker track =====
  {
    id: "default",
    email: "demo@unmapped.app",
    password: "demo-unmapped-2026",
    displayName: "Demo User",
    country: "kenya",
    blurb: "Original shared sandbox · Kenya",
    glyph: "◐",
    track: "individual",
  },
  {
    id: "aisha",
    email: "demo+aisha@unmapped.app",
    password: "demo-unmapped-2026",
    displayName: "Aisha — Nairobi",
    country: "kenya",
    blurb: "Early-career data analyst · Nairobi",
    glyph: "A",
    track: "individual",
  },
  {
    id: "mateo",
    email: "demo+mateo@unmapped.app",
    password: "demo-unmapped-2026",
    displayName: "Mateo — Bogotá",
    country: "colombia",
    blurb: "Logistics coordinator pivoting to ops tech · Colombia",
    glyph: "M",
    track: "individual",
  },
  {
    id: "priya",
    email: "demo+priya@unmapped.app",
    password: "demo-unmapped-2026",
    displayName: "Priya — Bengaluru",
    country: "india",
    blurb: "Junior developer exploring AI tooling · India",
    glyph: "P",
    track: "individual",
  },

  // ===== Policymaker / employer track =====
  {
    id: "policy-ke",
    email: "demo+policy-ke@unmapped.app",
    password: "demo-unmapped-2026",
    displayName: "Ministry analyst — Kenya",
    country: "kenya",
    blurb: "Country-level risk diagnostics · Ministry of Labor",
    glyph: "K",
    track: "policymaker",
    organization: "Ministry of Labor (Kenya)",
  },
  {
    id: "policy-employer",
    email: "demo+employer@unmapped.app",
    password: "demo-unmapped-2026",
    displayName: "Regional employer — LATAM",
    country: "colombia",
    blurb: "Workforce planning across LATAM operations",
    glyph: "E",
    track: "policymaker",
    organization: "LATAM Operations Group",
  },
];

export function getPersonaByEmail(email: string | null | undefined): DemoPersona | undefined {
  if (!email) return undefined;
  const lc = email.toLowerCase();
  return DEMO_PERSONAS.find((p) => p.email.toLowerCase() === lc);
}

export function personasForTrack(track: DemoTrack): DemoPersona[] {
  return DEMO_PERSONAS.filter((p) => p.track === track);
}
