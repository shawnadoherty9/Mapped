// Generate 5 keyword-specific multiple-choice aptitude questions via Lovable AI.
// Uses tool-calling to guarantee structured output. No streaming.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AIQuestion {
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  difficulty: "easy" | "medium" | "hard";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { skill, count = 5, category } = await req.json();
    const skillStr = String(skill ?? "").trim().slice(0, 120);
    if (!skillStr) {
      return new Response(JSON.stringify({ error: "skill is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = [
      "You are an aptitude-test author for a global youth labor-market platform.",
      "Generate concise, fair multiple-choice questions to assess a person's working knowledge",
      "of the SPECIFIC topic the user enters (e.g. 'Python', 'mobile money', 'sewing', 'agronomy').",
      "Rules:",
      "- Every question must directly test the entered topic, not generic trivia.",
      "- Mix difficulties: ~2 easy, ~2 medium, ~1 hard.",
      "- Exactly 4 plausible answer choices per question (1 correct, 3 incorrect).",
      "- Keep questions short (<= 200 chars). Keep choices short (<= 80 chars).",
      "- Avoid US-centric or culture-specific framing; favor practical, applied knowledge.",
      "- No images, code blocks, markdown, or numbering — plain text only.",
    ].join("\n");

    const userPrompt =
      `Topic: "${skillStr}"` +
      (category ? `\nBroad category context: ${category}` : "") +
      `\nGenerate ${count} questions focused tightly on this topic.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_questions",
              description: "Return aptitude questions tailored to the topic.",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        correct_answer: { type: "string" },
                        incorrect_answers: {
                          type: "array",
                          items: { type: "string" },
                          minItems: 3,
                          maxItems: 3,
                        },
                        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                      },
                      required: ["question", "correct_answer", "incorrect_answers", "difficulty"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["questions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_questions" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached, please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Lovable Cloud workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiRes.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response", JSON.stringify(json).slice(0, 600));
      return new Response(JSON.stringify({ error: "Model did not return questions" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { questions: AIQuestion[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool arguments:", e);
      return new Response(JSON.stringify({ error: "Malformed AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Shuffle choices server-side so client can't infer correct answer position.
    const shuffle = <T,>(arr: T[]) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const questions = (parsed.questions ?? []).slice(0, count).map((q) => ({
      category: skillStr,
      type: "multiple" as const,
      difficulty: q.difficulty,
      question: q.question,
      correct_answer: q.correct_answer,
      incorrect_answers: q.incorrect_answers,
      choices: shuffle([q.correct_answer, ...q.incorrect_answers]),
    }));

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("aptitude-questions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
