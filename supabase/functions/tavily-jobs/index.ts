// Tavily jobs search edge function
// Searches the web for local job opportunities matching given skills + location

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  skills: string[];
  countryName?: string;
  city?: string;
  radiusKm?: number;
  maxResults?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    if (!TAVILY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "TAVILY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as RequestBody;
    const skills = Array.isArray(body.skills) ? body.skills.filter(Boolean).slice(0, 10) : [];
    if (skills.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide at least one skill" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const locParts: string[] = [];
    if (body.city) locParts.push(body.city);
    if (body.countryName) locParts.push(body.countryName);
    const location = locParts.join(", ");
    const radiusHint = body.radiusKm && body.city ? ` within ${body.radiusKm}km of ${body.city}` : "";

    const skillsStr = skills.map((s) => `"${s}"`).join(" OR ");
    const query =
      `Job opportunities, internships, gigs, or apprenticeships for someone skilled in ${skillsStr}` +
      (location ? ` in ${location}${radiusHint}` : "") +
      ` (hiring, vacancies, employment, freelance work)`;

    const tavilyRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "advanced",
        topic: "general",
        max_results: Math.min(Math.max(body.maxResults ?? 8, 1), 15),
        include_answer: true,
        include_raw_content: false,
        include_images: false,
      }),
    });

    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text();
      console.error("Tavily error:", tavilyRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Tavily API error (${tavilyRes.status})`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await tavilyRes.json();
    return new Response(
      JSON.stringify({
        query,
        location,
        skills,
        answer: data.answer ?? null,
        results: (data.results ?? []).map((r: any) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
          score: r.score,
          source: r.url ? new URL(r.url).hostname.replace(/^www\./, "") : "",
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("tavily-jobs error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
