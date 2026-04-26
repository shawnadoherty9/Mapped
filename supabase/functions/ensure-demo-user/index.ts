// Ensures a demo account exists. Called by the demo auth pages and switcher;
// accepts an optional { personaId } in the request body. Idempotent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ServerPersona {
  id: string;
  email: string;
  password: string;
  displayName: string;
  countryCode: string; // ISO-3 to match profiles.country_code usage
  role: "individual" | "policymaker";
  organization?: string;
}

// Mirror of src/lib/demoPersonas.ts. Keep in sync.
const PERSONAS: ServerPersona[] = [
  // Job-seeker track
  { id: "default", email: "demo@unmapped.app",        password: "demo-unmapped-2026", displayName: "Demo User",         countryCode: "KEN", role: "individual" },
  { id: "aisha",   email: "demo+aisha@unmapped.app",  password: "demo-unmapped-2026", displayName: "Aisha — Nairobi",   countryCode: "KEN", role: "individual" },
  { id: "mateo",   email: "demo+mateo@unmapped.app",  password: "demo-unmapped-2026", displayName: "Mateo — Bogotá",    countryCode: "COL", role: "individual" },
  { id: "priya",   email: "demo+priya@unmapped.app",  password: "demo-unmapped-2026", displayName: "Priya — Bengaluru", countryCode: "IND", role: "individual" },
  // Policymaker / employer track
  { id: "policy-ke",       email: "demo+policy-ke@unmapped.app", password: "demo-unmapped-2026", displayName: "Ministry analyst — Kenya", countryCode: "KEN", role: "policymaker", organization: "Ministry of Labor (Kenya)" },
  { id: "policy-employer", email: "demo+employer@unmapped.app",  password: "demo-unmapped-2026", displayName: "Regional employer — LATAM", countryCode: "COL", role: "policymaker", organization: "LATAM Operations Group" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server not configured");
    const admin = createClient(url, serviceKey);

    let personaId = "default";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.personaId === "string") personaId = body.personaId;
      } catch {
        // empty body — fall back to default
      }
    }
    const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

    // Look up by email. listUsers paginates; 200 is plenty for our handful of demo accounts.
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;
    const existing = list.users.find((u) => u.email?.toLowerCase() === persona.email.toLowerCase());

    if (!existing) {
      const { error } = await admin.auth.admin.createUser({
        email: persona.email,
        password: persona.password,
        email_confirm: true,
        user_metadata: {
          display_name: persona.displayName,
          role: persona.role,
          country_code: persona.countryCode,
          organization: persona.organization ?? null,
        },
      });
      if (error && !/already.*registered/i.test(error.message)) throw error;
    } else {
      // Make sure the profile reflects the persona's intended role/org/country
      // even if the row was created previously with stale defaults.
      await admin
        .from("profiles")
        .update({
          role: persona.role,
          country_code: persona.countryCode,
          organization: persona.organization ?? null,
          display_name: persona.displayName,
        })
        .eq("user_id", existing.id);
    }

    return new Response(
      JSON.stringify({
        email: persona.email,
        password: persona.password,
        personaId: persona.id,
        role: persona.role,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ensure-demo-user error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
