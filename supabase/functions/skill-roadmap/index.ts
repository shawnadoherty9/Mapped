// Skill roadmap generator
// Returns a step-by-step upskilling plan for a single skill category, including
// learning modules, current/target levels, and an estimated total time to Advanced.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  category: string;
  currentLevel?: "Novice" | "Developing" | "Proficient" | "Advanced" | null;
  selfRating?: number | null; // 1-5
  targetLevel?: "Proficient" | "Advanced";
  countryCode?: string | null;
  pathway?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    if (!body?.category || typeof body.category !== "string") {
      return new Response(JSON.stringify({ error: "category is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const category = body.category.trim().slice(0, 80);
    const target = body.targetLevel ?? "Advanced";
    const current =
      body.currentLevel ??
      (body.selfRating == null
        ? "Novice"
        : body.selfRating <= 1
        ? "Novice"
        : body.selfRating <= 2
        ? "Developing"
        : body.selfRating <= 3
        ? "Proficient"
        : "Advanced");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys =
      "You design realistic, step-by-step upskilling roadmaps for self-learners in emerging markets. " +
      "Be concrete, free/low-cost-first (MOOCs, YouTube, open docs, community projects). " +
      "Estimate weeks honestly assuming ~5 hours/week. Order modules from foundational to advanced.";

    const user =
      `Skill category: ${category}\n` +
      `Current level: ${current}\n` +
      `Target level: ${target}\n` +
      (body.countryCode ? `Country: ${body.countryCode}\n` : "") +
      (body.pathway ? `Career pathway: ${body.pathway}\n` : "") +
      `\nDesign a roadmap of 4–6 sequential learning modules to reach ${target}. ` +
      `For each module include: title, what you'll learn, 2–4 concrete activities, ` +
      `1–3 free/low-cost resource suggestions (generic platform names, no URLs), ` +
      `estimated weeks, and the level reached after completing it. ` +
      `Also produce a single total estimated weeks number and a short overview.`;

    const tool = {
      type: "function",
      function: {
        name: "emit_roadmap",
        description: "Return the structured upskilling roadmap.",
        parameters: {
          type: "object",
          properties: {
            overview: { type: "string", description: "1–2 sentence overview of the path." },
            current_level: { type: "string", enum: ["Novice", "Developing", "Proficient", "Advanced"] },
            target_level: { type: "string", enum: ["Proficient", "Advanced"] },
            total_weeks: { type: "number", description: "Sum of module weeks." },
            modules: {
              type: "array",
              minItems: 3,
              maxItems: 7,
              items: {
                type: "object",
                properties: {
                  step: { type: "number" },
                  title: { type: "string" },
                  focus: { type: "string", description: "What you will learn." },
                  activities: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
                  resources: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
                  weeks: { type: "number" },
                  level_after: { type: "string", enum: ["Novice", "Developing", "Proficient", "Advanced"] },
                },
                required: ["step", "title", "focus", "activities", "resources", "weeks", "level_after"],
                additionalProperties: false,
              },
            },
          },
          required: ["overview", "current_level", "target_level", "total_weeks", "modules"],
          additionalProperties: false,
        },
      },
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_roadmap" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Lovable Cloud." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiResp.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments;
    let roadmap: unknown = null;
    if (typeof args === "string") {
      try { roadmap = JSON.parse(args); } catch { /* noop */ }
    } else if (args && typeof args === "object") {
      roadmap = args;
    }
    if (!roadmap) {
      return new Response(JSON.stringify({ error: "Could not parse roadmap." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ category, roadmap }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("skill-roadmap error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
