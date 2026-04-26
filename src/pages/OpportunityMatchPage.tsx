import { useEffect, useMemo, useState } from "react";
import AppLayout, { PageHeader } from "@/components/AppLayout";
import { useAppStore, useActiveCountry } from "@/store/useAppStore";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import SectorOpportunityMap from "@/components/SectorOpportunityMap";
import { LocalOpportunitiesTab, PortfolioTab, SavedTab } from "./GrowPage";

function StatCard({ source, value, label }: { source: string; value: string; label: string }) {
  return (
    <div className="surface rounded-sm p-5">
      <div className="label-mono">{source}</div>
      <div className="data-num text-4xl text-text mt-2">{value}</div>
      <div className="text-sm text-text-muted mt-1">{label}</div>
    </div>
  );
}

function MatchTab() {
  const profile = useAppStore((s) => s.activeProfile);
  const form = useAppStore((s) => s.form);
  const country = useActiveCountry();
  const { user } = useAuth();
  const [growRatings, setGrowRatings] = useState<{ category: string; rating: number }[]>([]);
  const [growAttempts, setGrowAttempts] = useState<{ category: string; level: string; skill_input: string | null }[]>([]);

  // Pull self-rated skills from Grow so the sector map sees the user's
  // full skill surface, not just the AI-mapped ESCO list.
  useEffect(() => {
    if (!user?.id) { setGrowRatings([]); setGrowAttempts([]); return; }
    let cancelled = false;
    Promise.all([
      supabase.from("user_skill_ratings")
        .select("category, rating")
        .eq("user_id", user.id),
      supabase.from("aptitude_attempts")
        .select("category, level, skill_input")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]).then(([ratings, attempts]) => {
        if (cancelled) return;
        setGrowRatings((ratings.data ?? []).filter((r: any) => r.rating > 0) as any);
        setGrowAttempts((attempts.data ?? []) as any);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const hasSkillInputs = useMemo(() => Boolean(
    profile || form.skills.length || form.languages.length || growRatings.length || growAttempts.length
  ), [profile, form.skills.length, form.languages.length, growRatings.length, growAttempts.length]);

  const sectorEntries = Object.entries(country.sector_growth).sort((a, b) => b[1] - a[1]);
  const topSector = sectorEntries[0];
  const sectorData = sectorEntries.map(([name, growth]) => ({ name, growth }));
  const max = Math.max(...sectorData.map((d) => d.growth));

  const typeColor: Record<string, string> = {
    formal_employment: "bg-teal/20 text-teal",
    self_employment: "bg-brand/20 text-brand",
    gig: "bg-warn/20 text-warn",
    training: "bg-surface2 text-text",
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard source="ILOSTAT" value={`$${country.wage_floor_usd.toFixed(2)}`} label="Daily wage floor" />
        <StatCard source="ILOSTAT" value={`${country.informal_employment_pct}%`} label="Informal employment" />
        <StatCard source="WORLD BANK WDI" value={`${country.youth_unemployment_pct}%`} label="Youth unemployment" />
        <StatCard source="DATA360" value={`${topSector[1]}%/yr`} label={`Top growth: ${topSector[0]}`} />
      </div>

      <div className="surface rounded-sm p-5 mb-8">
        <div className="label-mono mb-3">Opportunity types surfaced</div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "formal_employment", label: "Formal employment", desc: "Salaried roles with contracts & benefits" },
            { key: "self_employment", label: "Self-employment", desc: "Microbusiness, freelance, entrepreneurship" },
            { key: "gig", label: "Gig work", desc: "Short-term, task-based, platform-mediated" },
            { key: "training", label: "Training pathways", desc: "Courses, apprenticeships, certifications" },
          ].map((t) => (
            <div key={t.key} className={`rounded-sm px-3 py-2 text-xs ${typeColor[t.key]}`}>
              <div className="font-mono uppercase tracking-wide">{t.label}</div>
              <div className="text-[11px] opacity-80 mt-0.5">{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="surface rounded-sm p-5 mb-8">
        <div className="label-mono mb-1">Sector employment growth · {country.name}</div>
        <div className="text-text-muted text-xs mb-3 font-mono">Data360 / ILOSTAT · annualized %</div>
        <ResponsiveContainer width="100%" height={Math.max(140, sectorData.length * 50)}>
          <BarChart data={sectorData} layout="vertical" margin={{ left: 100, right: 30 }}>
            <XAxis type="number" stroke="hsl(var(--text-muted))" fontSize={10} />
            <YAxis type="category" dataKey="name" stroke="hsl(var(--text-muted))" fontSize={11} width={100} />
            <Tooltip cursor={{ fill: "hsl(var(--surface2))" }} contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Bar dataKey="growth" radius={[0, 2, 2, 0]}>
              {sectorData.map((d) => (
                <Cell key={d.name} fill={d.growth === max ? "hsl(var(--accent))" : d.growth > max * 0.5 ? "hsl(var(--teal))" : "hsl(var(--text-muted))"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Skills × growth-sector mapping, derived from Skills Signal, Profile Input, and Grow output */}
      {hasSkillInputs ? (
        <SectorOpportunityMap
          profile={profile}
          country={country}
          profileSkills={form.skills}
          languages={form.languages}
          growRatings={growRatings}
          growAttempts={growAttempts}
        />
      ) : (
        <div className="surface rounded-sm p-6 text-text-muted text-sm mb-8">
          Add skills in <Link to="/app/profile" className="text-brand underline">Profile Input</Link> or Grow to see your sector match.
        </div>
      )}

    </>
  );
}

export default function OpportunityMatchPage() {
  const { user, profile } = useAuth();
  const country = useActiveCountry();
  const [tab, setTab] = useState("match");

  // Read initial tab from URL (?tab=portfolio|local|match|saved) and respond to draft events
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "portfolio" || t === "local" || t === "match" || t === "saved") setTab(t);
    function onDraft() { setTab("portfolio"); }
    window.addEventListener("grow:portfolio-draft", onDraft);
    return () => window.removeEventListener("grow:portfolio-draft", onDraft);
  }, []);

  return (
    <AppLayout>
      <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-6xl">
        <PageHeader
          eyebrow="Module 03 · Opportunity Matching"
          title="Where the labor market is moving"
          sub={`Real economic signals for ${country.name} cross-referenced with your skills profile. Find local projects aligned with UNDP goals to build your skills and portfolio!`}
        />

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-3xl mb-6">
            <TabsTrigger value="match">Opportunity match</TabsTrigger>
            <TabsTrigger value="local">Local opportunities</TabsTrigger>
            <TabsTrigger value="portfolio">My portfolio</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>

          <TabsContent value="match">
            <MatchTab />
          </TabsContent>
          <TabsContent value="local">
            <LocalOpportunitiesTab countryCode={profile?.country_code ?? null} userId={user?.id ?? null} />
          </TabsContent>
          <TabsContent value="portfolio">
            {user ? <PortfolioTab userId={user.id} /> : (
              <div className="surface rounded-sm p-6 text-text-muted text-sm">Sign in to manage your portfolio.</div>
            )}
          </TabsContent>
          <TabsContent value="saved">
            {user ? <SavedTab userId={user.id} /> : (
              <div className="surface rounded-sm p-6 text-text-muted text-sm">Sign in to view saved items.</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
