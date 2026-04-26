// Local opportunities edge function
// 1) Ranks UN SDGs for the user's country using country_stats
// 2) Optionally searches Tavily for local NGOs / projects / volunteer opportunities
//    matching one SDG + the user's gap skill, scoped to their country/city.
// 3) Generates concrete portfolio project prompts (Lovable AI) grounded in
//    country stats + selected SDG + user skill gaps.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  countryCode: string;
  countryName?: string;
  city?: string;
  // Tavily search inputs
  sdgNumber?: number;
  sdgTitle?: string;
  skillFocus?: string;
  search?: boolean;
  // Project-prompt inputs
  mode?: "rank" | "prompts";
  skillGaps?: string[];
  strengths?: string[];
}

const SDGS: { n: number; title: string; tags: string[] }[] = [
  { n: 1, title: "No Poverty", tags: ["poverty", "informal"] },
  { n: 2, title: "Zero Hunger", tags: ["food security", "agriculture"] },
  { n: 3, title: "Good Health and Well-being", tags: ["health"] },
  { n: 4, title: "Quality Education", tags: ["education", "skills"] },
  { n: 5, title: "Gender Equality", tags: ["gender", "women"] },
  { n: 6, title: "Clean Water and Sanitation", tags: ["water", "sanitation"] },
  { n: 7, title: "Affordable and Clean Energy", tags: ["energy"] },
  { n: 8, title: "Decent Work and Economic Growth", tags: ["youth employment", "informality"] },
  { n: 9, title: "Industry, Innovation and Infrastructure", tags: ["innovation", "infrastructure"] },
  { n: 10, title: "Reduced Inequalities", tags: ["inequality"] },
  { n: 11, title: "Sustainable Cities and Communities", tags: ["urban", "community"] },
  { n: 12, title: "Responsible Consumption and Production", tags: ["sustainability"] },
  { n: 13, title: "Climate Action", tags: ["climate"] },
  { n: 14, title: "Life Below Water", tags: ["ocean", "fisheries"] },
  { n: 15, title: "Life on Land", tags: ["biodiversity", "land"] },
  { n: 16, title: "Peace, Justice and Strong Institutions", tags: ["governance", "peace"] },
  { n: 17, title: "Partnerships for the Goals", tags: ["partnerships"] },
];

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function rankSdgs(stats: Record<string, number | null> | null) {
  const informal = stats?.informal_employment_pct ?? null;
  const youthUnemp = stats?.youth_unemployment_pct ?? null;
  const secondary = stats?.secondary_enrollment_pct ?? null;
  const lfp = stats?.labor_force_participation_pct ?? null;
  const gdppc = stats?.gdp_per_capita_usd ?? null;

  const povertyProxy = gdppc !== null ? clamp(1 - gdppc / 20000, 0, 1) : 0.5;
  const educationGap = secondary !== null ? clamp(1 - secondary / 100, 0, 1) : 0.5;
  const workQuality =
    informal !== null && youthUnemp !== null
      ? clamp((informal / 100) * 0.6 + (youthUnemp / 50) * 0.4, 0, 1)
      : 0.5;
  const inequalityProxy = lfp !== null ? clamp(1 - lfp / 100, 0, 1) : 0.5;

  return SDGS.map((sdg) => {
    let score = 0.35;
    if (sdg.n === 1) score = povertyProxy;
    else if (sdg.n === 4) score = educationGap;
    else if (sdg.n === 8) score = workQuality;
    else if (sdg.n === 10) score = inequalityProxy;
    else if (sdg.n === 5) score = inequalityProxy * 0.9;
    else if (sdg.n === 9) score = (1 - povertyProxy) < 0.4 ? 0.6 : 0.45;
    else if (sdg.n === 11) score = workQuality * 0.7 + 0.2;
    else if (sdg.n === 13) score = 0.55;
    return { ...sdg, priority: Number(score.toFixed(3)) };
  }).sort((a, b) => b.priority - a.priority);
}

interface ProjectPrompt {
  title: string;
  summary: string;
  steps: string[];
  skills_built: string[];
  effort: "weekend" | "1-2 weeks" | "1 month" | "ongoing";
  evidence: string;
}

async function generateProjectPrompts(input: {
  sdgNumber: number;
  sdgTitle: string;
  countryName?: string;
  countryCode: string;
  city?: string;
  stats: Record<string, number | null> | null;
  skillGaps: string[];
  strengths: string[];
}): Promise<{ prompts: ProjectPrompt[]; raw?: string; error?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return { prompts: [], error: "LOVABLE_API_KEY not configured" };

  const loc = [input.city, input.countryName, input.countryCode].filter(Boolean).join(", ");
  const statsLines = Object.entries(input.stats ?? {})
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const system = `You design realistic, locally-grounded community projects that a job seeker or learner can complete in their spare time to build job-relevant skills, while contributing to a UN Sustainable Development Goal.

Always return STRICT JSON matching the provided schema. No prose outside JSON.`;

  const user = `Generate 4 distinct project briefs for someone living in ${loc || input.countryCode}.

UN SDG focus: SDG ${input.sdgNumber} — ${input.sdgTitle}

World Bank country indicators (use these to ground projects in real local conditions):
${statsLines || "(none available — propose general but locally feasible projects)"}

Skill gaps the person wants to close (target each project at one or more):
${input.skillGaps.length ? input.skillGaps.map((s) => `- ${s}`).join("\n") : "(none specified — assume a beginner builder)"}

Existing strengths to leverage:
${input.strengths.length ? input.strengths.map((s) => `- ${s}`).join("\n") : "(none specified)"}

Each project must:
- Be doable by ONE person with low-cost tools, no employer required
- Address a specific community need plausibly present in the country given the indicators
- Produce concrete portfolio evidence (a deliverable, dataset, prototype, write-up, video, etc.)
- Build at least one of the listed skill gaps

Respond with JSON only.`;

  const schema = {
    type: "object",
    properties: {
      prompts: {
        type: "array",
        minItems: 3,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, action-oriented project title" },
            summary: { type: "string", description: "1-2 sentence description of the project" },
            steps: {
              type: "array",
              items: { type: "string" },
              description: "3-6 concrete steps to complete it",
            },
            skills_built: {
              type: "array",
              items: { type: "string" },
              description: "Specific skills this project builds",
            },
            effort: {
              type: "string",
              enum: ["weekend", "1-2 weeks", "1 month", "ongoing"],
            },
            evidence: {
              type: "string",
              description: "What concrete artifact you'll have at the end (for a portfolio)",
            },
          },
          required: ["title", "summary", "steps", "skills_built", "effort", "evidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["prompts"],
    additionalProperties: false,
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_project_prompts",
            description: "Return the generated portfolio project briefs.",
            parameters: schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_project_prompts" } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { prompts: [], error: `AI gateway ${res.status}: ${text.slice(0, 300)}` };
  }
  const data = await res.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  const argsStr = call?.function?.arguments;
  if (!argsStr) {
    return { prompts: [], error: "No tool call in AI response", raw: JSON.stringify(data).slice(0, 400) };
  }
  try {
    const parsed = JSON.parse(argsStr);
    const prompts: ProjectPrompt[] = Array.isArray(parsed.prompts) ? parsed.prompts : [];
    return { prompts };
  } catch (e) {
    return { prompts: [], error: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`, raw: argsStr.slice(0, 400) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    if (!body?.countryCode || typeof body.countryCode !== "string") {
      return new Response(JSON.stringify({ error: "countryCode required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey);

    const { data: stats } = await supabase
      .from("country_stats")
      .select(
        "youth_unemployment_pct, informal_employment_pct, gdp_per_capita_usd, secondary_enrollment_pct, labor_force_participation_pct, source_year",
      )
      .eq("country_code", body.countryCode.toUpperCase())
      .maybeSingle();

    // ---- Project-prompt mode ----
    if (body.mode === "prompts") {
      if (!body.sdgNumber || !body.sdgTitle) {
        return new Response(JSON.stringify({ error: "sdgNumber and sdgTitle required for prompts mode" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await generateProjectPrompts({
        sdgNumber: body.sdgNumber,
        sdgTitle: body.sdgTitle,
        countryName: body.countryName,
        countryCode: body.countryCode.toUpperCase(),
        city: body.city,
        stats: (stats as Record<string, number | null> | null) ?? null,
        skillGaps: Array.isArray(body.skillGaps) ? body.skillGaps.slice(0, 8) : [],
        strengths: Array.isArray(body.strengths) ? body.strengths.slice(0, 8) : [],
      });
      return new Response(JSON.stringify({ stats, ...result }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ranked = rankSdgs(stats as Record<string, number | null> | null);

    // ---- Tavily search mode (existing behaviour) ----
    let tavily: unknown = null;
    if (body.search && body.sdgTitle) {
      const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
      if (!TAVILY_API_KEY) {
        return new Response(
          JSON.stringify({ ranked, stats, error: "TAVILY_API_KEY not configured" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const loc = [body.city, body.countryName].filter(Boolean).join(", ");
      const skillBit = body.skillFocus ? ` for someone with ${body.skillFocus} skills` : "";
      const query =
        `Local NGOs, community projects, internships, or volunteer opportunities working on ` +
        `UN SDG ${body.sdgNumber}: ${body.sdgTitle}${loc ? ` in ${loc}` : ""}${skillBit}`;

      const tavilyRes = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          search_depth: "advanced",
          max_results: 8,
          include_answer: true,
        }),
      });
      tavily = tavilyRes.ok
        ? await tavilyRes.json()
        : { error: `Tavily ${tavilyRes.status}` };
    }

    return new Response(
      JSON.stringify({ ranked, stats, tavily }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
