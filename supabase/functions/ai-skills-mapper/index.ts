// Lovable AI gateway — maps youth profile to ISCO/ESCO + generates policy signals.
// Edge function — Deno runtime.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "google/gemini-3-flash-preview";

const PROFILE_SYSTEM_PROMPT =
  `You are a skills mapping specialist for the UNMAPPED platform, working with ILO ISCO-08 and ESCO frameworks. Map youth profiles from low- and middle-income countries. Be honest about confidence. Never invent credentials. Produce output the youth person can own.`;

const POLICY_SYSTEM_PROMPT =
  `You are a labor economics policy analyst. Produce 3 short, concrete policy signal strings calibrated to the country context provided.`;

interface ProfileForm {
  name: string;
  age: number | "";
  education: string;
  experience: string;
  skills: string[];
  description: string;
  languages: string[];
  connectivity: string;
}

interface CountryContext {
  name: string;
  code: string;
  region: string;
  wage_floor_usd: number;
  formality_rate: number;
  youth_unemployment_pct: number;
  informal_employment_pct: number;
  sector_growth: Record<string, number>;
  opportunity_types: string[];
  lmic_calibration: number;
  calibration_rationale: string;
  top_sectors: string[];
}

function buildProfileUserMessage(form: ProfileForm, country: CountryContext) {
  return `Map this youth profile to ISCO-08, ESCO skills, automation risk, and locally-relevant opportunities.

PROFILE
- Name: ${form.name || "(anonymous)"}
- Age: ${form.age}
- Education: ${form.education}
- Years experience: ${form.experience}
- Skills/experience: ${form.skills.join(", ")}
- Self description: ${form.description}
- Languages: ${form.languages.join(", ")}
- Connectivity: ${form.connectivity}

COUNTRY CONTEXT
- Country: ${country.name} (${country.code}) — ${country.region}
- Wage floor: $${country.wage_floor_usd}/day
- Formality rate: ${(country.formality_rate * 100).toFixed(0)}%
- Youth unemployment: ${country.youth_unemployment_pct}%
- Informal employment share: ${country.informal_employment_pct}%
- Top sectors & growth: ${
    Object.entries(country.sector_growth).map(([s, g]) => `${s} (${g}%/yr)`).join(", ")
  }
- Available opportunity types: ${country.opportunity_types.join(", ")}
- LMIC calibration factor for Frey-Osborne automation scores: ${country.lmic_calibration} (${country.calibration_rationale})

Provide 2-3 ISCO matches, 6-12 ESCO skills, 3-5 durable skills, 3-5 at-risk tasks, 3-5 adjacent skills, and 3-5 opportunities. automation_risk_raw is the raw Frey-Osborne probability (0.0-1.0) for the dominant occupation.`;
}

function buildPolicyUserMessage(country: CountryContext, agg: {
  avgRisk: number; topSkillGap: string; informalShare: number; topOccupations: string[];
}) {
  return `Country: ${country.name} (${country.region}). Avg displacement risk: ${(agg.avgRisk*100).toFixed(0)}%. Informal skill share: ${(agg.informalShare*100).toFixed(0)}%. Top skill gap: ${agg.topSkillGap}. Top occupations in cohort: ${agg.topOccupations.join(", ")}. Top growth sectors: ${Object.entries(country.sector_growth).map(([s,g])=>`${s} (${g}%)`).join(", ")}. Wage floor: $${country.wage_floor_usd}/day.`;
}

const PROFILE_TOOL = {
  type: "function",
  function: {
    name: "submit_profile_mapping",
    description: "Return the mapped youth profile.",
    parameters: {
      type: "object",
      properties: {
        plain_summary: { type: "string", description: "2-3 sentences written TO the youth person, warm but honest." },
        isco_matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "ISCO-08 4-digit code" },
              label: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["code", "label", "confidence"],
          },
        },
        esco_skills: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              type: { type: "string", enum: ["formal", "informal", "demonstrated"] },
            },
            required: ["label", "type"],
          },
        },
        automation_risk_raw: { type: "number", minimum: 0, maximum: 1 },
        durable_skills: { type: "array", items: { type: "string" } },
        at_risk_tasks: { type: "array", items: { type: "string" } },
        adjacent_skills: { type: "array", items: { type: "string" } },
        opportunities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              type: { type: "string", enum: ["formal_employment", "self_employment", "gig", "training"] },
              match_pct: { type: "number", minimum: 0, maximum: 100 },
              rationale: { type: "string" },
              wage_range_usd_day: { type: "string" },
            },
            required: ["title", "type", "match_pct", "rationale", "wage_range_usd_day"],
          },
        },
        risk_level: { type: "string", enum: ["low", "moderate", "high"] },
      },
      required: ["plain_summary", "isco_matches", "esco_skills", "automation_risk_raw", "durable_skills", "at_risk_tasks", "adjacent_skills", "opportunities", "risk_level"],
    },
  },
};

const POLICY_TOOL = {
  type: "function",
  function: {
    name: "submit_policy_signals",
    description: "Return 3 concise policy signals.",
    parameters: {
      type: "object",
      properties: {
        signals: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      },
      required: ["signals"],
    },
  },
};

async function callGateway(body: Record<string, unknown>) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false as const, status: res.status, text: t };
  }
  const data = await res.json();
  return { ok: true as const, data };
}

function extractToolArgs(data: { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }> }) {
  const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
  const raw = tc?.function?.arguments;
  if (!raw) throw new Error("No tool call returned by model");
  return JSON.parse(raw);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body?.action as string | undefined;

    if (action === "map_profile") {
      const { form, country } = body as { form: ProfileForm; country: CountryContext };
      if (!form || !country) {
        return new Response(JSON.stringify({ error: "form and country required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await callGateway({
        model: MODEL,
        messages: [
          { role: "system", content: PROFILE_SYSTEM_PROMPT },
          { role: "user", content: buildProfileUserMessage(form, country) },
        ],
        tools: [PROFILE_TOOL],
        tool_choice: { type: "function", function: { name: "submit_profile_mapping" } },
      });
      if (!result.ok) {
        const status = result.status === 429 || result.status === 402 ? result.status : 500;
        const msg = result.status === 429
          ? "Rate limit reached for Lovable AI. Please try again shortly."
          : result.status === 402
          ? "Lovable AI credits exhausted. Add credits in Settings → Workspace → Usage."
          : `AI gateway error ${result.status}`;
        console.error("map_profile gateway error:", result.status, result.text);
        return new Response(JSON.stringify({ error: msg }), {
          status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const profile = extractToolArgs(result.data);
      return new Response(JSON.stringify({ profile }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "policy_signals") {
      const { country, agg } = body as { country: CountryContext; agg: { avgRisk: number; topSkillGap: string; informalShare: number; topOccupations: string[] } };
      if (!country || !agg) {
        return new Response(JSON.stringify({ error: "country and agg required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await callGateway({
        model: MODEL,
        messages: [
          { role: "system", content: POLICY_SYSTEM_PROMPT },
          { role: "user", content: buildPolicyUserMessage(country, agg) },
        ],
        tools: [POLICY_TOOL],
        tool_choice: { type: "function", function: { name: "submit_policy_signals" } },
      });
      if (!result.ok) {
        const status = result.status === 429 || result.status === 402 ? result.status : 500;
        const msg = result.status === 429
          ? "Rate limit reached for Lovable AI."
          : result.status === 402
          ? "Lovable AI credits exhausted."
          : `AI gateway error ${result.status}`;
        console.error("policy_signals gateway error:", result.status, result.text);
        return new Response(JSON.stringify({ error: msg }), {
          status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const args = extractToolArgs(result.data);
      return new Response(JSON.stringify({ signals: args.signals ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-skills-mapper error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
