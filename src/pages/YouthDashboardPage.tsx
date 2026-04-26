import { useEffect, useMemo, useState } from "react";
import AppLayout, { PageHeader } from "@/components/AppLayout";
import { useAppStore, useActiveCountry } from "@/store/useAppStore";
import { countryConfigs, countryKeys, CountryKey } from "@/data/countryConfigs";
import { Link } from "react-router-dom";
import { Copy, Globe, Eye, EyeOff, Printer, Sparkles, TrendingUp, ShieldCheck, Filter, X } from "lucide-react";
import OpportunityGlobe from "@/components/OpportunityGlobe";
import DataProvenance from "@/components/DataProvenance";
import CountryUpskillingPanel from "@/components/CountryUpskillingPanel";
import AssessmentHistoryPanel from "@/components/AssessmentHistoryPanel";

function inferSector(title: string, sectors: string[]): string {
  const t = title.toLowerCase();
  for (const s of sectors) if (t.includes(s.toLowerCase().split(/[ &/]/)[0])) return s;
  if (/(gig|freelance|remote|bpo|outsourc)/.test(t)) return "digital services";
  if (/(farm|agri|crop|cooperative)/.test(t)) return "agriculture";
  if (/(repair|trade|retail|sales|shop)/.test(t)) return "trade & services";
  if (/(manufact|garment|weld|construc)/.test(t)) return "manufacturing";
  if (/(tour|hospital)/.test(t)) return "tourism";
  return sectors[0] ?? "general";
}

const STORAGE_KEY = "unmapped-youth-state";
type OppStatus = "exploring" | "applied" | "not_interested" | null;

const aptitudeColor = (a: string) =>
  a === "Advanced" ? "bg-teal/20 text-teal" : a === "Proficient" ? "bg-brand/20 text-brand" : "bg-warn/20 text-warn";
const resilienceColor = (r: string) =>
  r === "High" ? "text-teal" : r === "Medium" ? "text-brand" : "text-warn";

export default function YouthDashboardPage() {
  const profile = useAppStore((s) => s.activeProfile);
  const form = useAppStore((s) => s.form);
  const country = useActiveCountry();
  const mappedAt = useAppStore((s) => s.mappedAt);
  const assessments = useAppStore((s) => s.assessments);
  const publicId = useAppStore((s) => s.publicId);
  const isDiscoverable = useAppStore((s) => s.isDiscoverable);
  const setDiscoverable = useAppStore((s) => s.setDiscoverable);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [statuses, setStatuses] = useState<Record<string, OppStatus>>({});
  const [copied, setCopied] = useState(false);

  // Opportunity filter controls
  const activeCountryKey = useAppStore((s) => s.country);
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<CountryKey | "all">("all");
  const [minMatch, setMinMatch] = useState<number>(0);

  // Build extended opportunity list: active country + cross-border picks from peers
  const allOpportunities = useMemo(() => {
    if (!profile) return [];
    const local = profile.opportunities.map((o) => ({
      ...o,
      sector: inferSector(o.title, country.top_sectors),
      countryKey: activeCountryKey,
      countryName: country.name,
      countryCode: country.code,
    }));
    // Synthetic cross-border opportunities seeded from each peer country's opportunity_types
    const peers = countryKeys.filter((k) => k !== activeCountryKey).slice(0, 6);
    const cross = peers.flatMap((k) => {
      const c = countryConfigs[k];
      return c.opportunity_types.slice(0, 1).map((t, i) => {
        const hash = (k + t).split("").reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 0);
        const matchPct = 55 + (Math.abs(hash) % 35);
        const wageLow = Math.round(c.wage_floor_usd * 1.2);
        const wageHigh = Math.round(c.wage_floor_usd * 2.4);
        return {
          title: `${t} · ${c.name}`,
          type: "gig" as const,
          match_pct: matchPct,
          rationale: `Cross-border opportunity in ${c.name}`,
          wage_range_usd_day: `${wageLow}-${wageHigh}`,
          sector: inferSector(t, c.top_sectors),
          countryKey: k,
          countryName: c.name,
          countryCode: c.code,
          _crossBorder: true,
          _i: i,
        };
      });
    });
    return [...local, ...cross];
  }, [profile, country, activeCountryKey]);

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    allOpportunities.forEach((o) => set.add(o.sector));
    return Array.from(set).sort();
  }, [allOpportunities]);

  const filteredOpportunities = useMemo(() => {
    return allOpportunities.filter((o) => {
      if (sectorFilter !== "all" && o.sector !== sectorFilter) return false;
      if (countryFilter !== "all" && o.countryKey !== countryFilter) return false;
      if (o.match_pct < minMatch) return false;
      return true;
    });
  }, [allOpportunities, sectorFilter, countryFilter, minMatch]);

  const filtersActive = sectorFilter !== "all" || countryFilter !== "all" || minMatch > 0;
  const resetFilters = () => { setSectorFilter("all"); setCountryFilter("all"); setMinMatch(0); };

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      setChecked(s.checked || {}); setStatuses(s.statuses || {});
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ checked, statuses }));
  }, [checked, statuses]);

  const aptitudeStats = useMemo(() => {
    const c = { Novice: 0, Proficient: 0, Advanced: 0 };
    assessments.forEach(a => { c[a.aptitude]++; });
    return c;
  }, [assessments]);

  const avgResilience = useMemo(() => {
    if (!assessments.length) return null;
    const map = { Low: 1, Medium: 2, High: 3 } as const;
    const v = assessments.reduce((s, a) => s + map[a.ai_resilience], 0) / assessments.length;
    return v >= 2.5 ? "High" : v >= 1.5 ? "Medium" : "Low";
  }, [assessments]);

  const completedAdj = profile ? profile.adjacent_skills.filter(s => checked[s]).length : 0;
  const totalAdj = profile?.adjacent_skills.length ?? 0;

  if (!profile) {
    return (
      <AppLayout>
        <div className="p-10">
          <PageHeader eyebrow="Personal" title="Your skills profile" />
          <div className="surface rounded-sm p-6 text-text-muted text-sm">
            No profile mapped yet. <Link to="/" className="text-brand underline">Go to Profile Input →</Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const dateStr = mappedAt ? new Date(mappedAt).toLocaleDateString() : new Date().toLocaleDateString();
  const riskBadgeCls = profile.risk_level === "low" ? "text-brand bg-brand/15" : profile.risk_level === "moderate" ? "text-warn bg-warn/15" : "text-danger bg-danger/15";
  const publicUrl = `${window.location.origin}/p/${publicId}`;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-6xl">
        <PageHeader
          eyebrow="Job seekers · Learners"
          title="Your skills profile"
          sub={`${form.name || "Anonymous"} · ${country.name} (${country.code}) · mapped ${dateStr}`}
        />

        {/* Header KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <KPI label="Skills mapped" value={String(profile.esco_skills.length)} />
          <KPI label="Skills assessed" value={`${assessments.length}/${profile.esco_skills.length}`} />
          <KPI label="AI resilience" value={avgResilience ?? "—"} accent={avgResilience === "High" ? "teal" : avgResilience === "Medium" ? "brand" : "warn"} />
          <KPI label="Roadmap progress" value={`${completedAdj}/${totalAdj}`} />
        </div>

        {/* Country-tailored strengths · gaps · upskilling */}
        <CountryUpskillingPanel
          assessments={assessments}
          profile={profile}
          country={country}
        />

        {/* Past assessments + by-country trends */}
        <AssessmentHistoryPanel />

        {/* Discoverability + Passport */}
        <div className="grid lg:grid-cols-3 gap-5 mb-8">
          {/* Passport */}
          <div className="surface rounded-md p-6 lg:col-span-2 print:bg-white" id="passport">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="label-mono">MAPPED · Skills Passport</div>
                <div className="font-display text-3xl mt-1" style={{ fontWeight: 600 }}>{form.name || "Anonymous"}</div>
                <div className="text-text-muted text-sm">Age {form.age} · {form.education} · {country.name}</div>
              </div>
              <div className="text-right">
                <span className={`pill ${riskBadgeCls}`}>risk: {profile.risk_level}</span>
                <div className="label-mono mt-2">Verified · {dateStr}</div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6 pt-5">
              <div>
                <div className="label-mono mb-2">Top occupations (ISCO-08)</div>
                {profile.isco_matches.slice(0, 2).map((m) => (
                  <div key={m.code} className="text-sm flex gap-2 mb-1">
                    <span className="font-mono text-teal">{m.code}</span>
                    <span>{m.label}</span>
                    <span className="text-text-muted ml-auto font-mono text-xs">{Math.round(m.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="label-mono mb-2">Top skills (ESCO)</div>
                <div className="flex flex-wrap gap-1.5">
                  {profile.esco_skills.slice(0, 6).map((s, i) => {
                    const cls = s.type === "formal" ? "bg-teal/20 text-teal" : s.type === "informal" ? "bg-warn/20 text-warn" : "bg-brand/20 text-brand";
                    return <span key={i} className={`pill ${cls}`}>{s.label}</span>;
                  })}
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-3 print:hidden">
              <button onClick={() => window.print()} className="bg-brand text-bg px-4 py-2 rounded-sm text-sm flex items-center gap-2"><Printer size={14}/> Export PDF</button>
              <Link to="/skills" className="surface2 text-text px-4 py-2 rounded-sm text-sm border border-border hover:border-brand">Take more assessments</Link>
            </div>
          </div>

          {/* Discoverability card */}
          <div className="surface rounded-md p-5">
            <div className="flex items-center gap-2 mb-1">
              <Globe size={14} className="text-brand"/>
              <div className="label-mono">Global discoverability</div>
            </div>
            <p className="text-text-muted text-xs mb-4">Let employers across geographies discover your verified skill set.</p>

            <div className="surface2 rounded-sm p-3 mb-3">
              <div className="label-mono mb-1">Public profile ID</div>
              <div className="font-mono text-sm text-text break-all">{publicId}</div>
              <button onClick={copyLink} className="mt-2 text-xs flex items-center gap-1.5 text-brand hover:underline">
                <Copy size={12}/> {copied ? "Copied" : "Copy share link"}
              </button>
            </div>

            <button
              onClick={() => setDiscoverable(!isDiscoverable)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-sm text-sm border ${isDiscoverable ? "border-teal/40 bg-teal/10 text-teal" : "border-border bg-surface2 text-text-muted"}`}
            >
              <span className="flex items-center gap-2">
                {isDiscoverable ? <Eye size={14}/> : <EyeOff size={14}/>}
                {isDiscoverable ? "Discoverable globally" : "Hidden from search"}
              </span>
              <span className="font-mono text-[10px]">{isDiscoverable ? "ON" : "OFF"}</span>
            </button>

            <div className="mt-4 pt-3 border-t border-border text-xs text-text-muted space-y-1">
              <div className="flex justify-between"><span>Region</span><span className="text-text">{country.region}</span></div>
              <div className="flex justify-between"><span>Languages</span><span className="text-text">{form.languages?.join(", ") || "—"}</span></div>
              <div className="flex justify-between"><span>Connectivity</span><span className="text-text">{form.connectivity || "—"}</span></div>
            </div>
          </div>
        </div>

        {/* Skill aptitude table */}
        <div className="surface rounded-sm p-5 mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-brand"/>
              <div className="label-mono">Skill aptitude · AI resilience · growth path</div>
            </div>
            <Link to="/skills" className="text-xs text-brand hover:underline">Assess more →</Link>
          </div>

          {assessments.length === 0 ? (
            <div className="surface2 rounded-sm p-4 text-sm text-text-muted">
              No skill assessments yet. <Link to="/skills" className="text-brand underline">Run your first assessment</Link> to see aptitude levels and AI-resilience scoring.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="label-mono pb-2 pr-3">Skill</th>
                    <th className="label-mono pb-2 pr-3">Category</th>
                    <th className="label-mono pb-2 pr-3">Aptitude</th>
                    <th className="label-mono pb-2 pr-3">Score</th>
                    <th className="label-mono pb-2 pr-3">AI resilience</th>
                    <th className="label-mono pb-2">Become more proficient</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((a) => (
                    <tr key={a.skill} className="border-t border-border align-top">
                      <td className="py-2.5 pr-3 font-medium">{a.skill}</td>
                      <td className="py-2.5 pr-3 text-text-muted text-xs">{a.category}</td>
                      <td className="py-2.5 pr-3"><span className={`pill ${aptitudeColor(a.aptitude)}`}>{a.aptitude}</span></td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{a.correct}/{a.total}</td>
                      <td className={`py-2.5 pr-3 text-xs font-medium ${resilienceColor(a.ai_resilience)}`}>{a.ai_resilience}</td>
                      <td className="py-2.5 text-text-muted text-xs max-w-md">{a.growth_path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-text-muted">
                <span><span className="pill bg-warn/20 text-warn mr-1">Novice</span>{aptitudeStats.Novice}</span>
                <span><span className="pill bg-brand/20 text-brand mr-1">Proficient</span>{aptitudeStats.Proficient}</span>
                <span><span className="pill bg-teal/20 text-teal mr-1">Advanced</span>{aptitudeStats.Advanced}</span>
              </div>
            </div>
          )}
        </div>

        {/* Resilience roadmap */}
        <div className="grid lg:grid-cols-2 gap-5 mb-8">
          <div className="surface rounded-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={14} className="text-teal"/>
              <div className="label-mono">Resilience roadmap</div>
              <span className="ml-auto font-mono text-[10px] text-text-muted">{completedAdj}/{totalAdj}</span>
            </div>
            <ul className="space-y-2">
              {profile.adjacent_skills.map((s) => (
                <li key={s} className="flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={!!checked[s]} onChange={(e) => setChecked({ ...checked, [s]: e.target.checked })} className="accent-brand" />
                  <span className={checked[s] ? "line-through text-text-muted" : ""}>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 3D globe + Tavily local job search */}
          <div className="surface rounded-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} className="text-teal"/>
              <div className="label-mono">Explore opportunities by region</div>
              <span className="ml-auto font-mono text-[10px] text-text-muted">
                Live web search · Tavily
              </span>
            </div>
            <p className="text-text-muted text-xs mb-4">
              Spin the globe, click a country to zoom in, optionally narrow to a city + radius, and search the live web for jobs that match your skills.
            </p>
            <OpportunityGlobe
              allSkills={Array.from(new Set([
                ...assessments.map((a) => a.skill),
                ...(profile?.esco_skills.map((s) => s.label) ?? []),
                ...form.skills,
              ])).filter(Boolean)}
            />
          </div>

          <div className="surface rounded-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-brand"/>
              <div className="label-mono">Opportunity tracker</div>
              <span className="ml-auto font-mono text-[10px] text-text-muted">
                {filteredOpportunities.length}/{allOpportunities.length}
              </span>
            </div>
            <DataProvenance compact indicators={["youth_unemployment_pct", "informal_employment_pct", "gdp_per_capita_usd"]} />

            {/* Filter controls */}
            <div className="surface2 rounded-sm p-3 mb-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Filter size={12} className="text-text-muted"/>
                <span className="label-mono">Filter</span>
                {filtersActive && (
                  <button onClick={resetFilters} className="ml-auto text-[10px] text-brand hover:underline flex items-center gap-1">
                    <X size={10}/> Reset
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="label-mono mb-1 block">Sector</span>
                  <select
                    value={sectorFilter}
                    onChange={(e) => setSectorFilter(e.target.value)}
                    className="w-full bg-surface border border-border rounded-sm text-xs font-mono px-2 py-1.5 outline-none focus:border-brand"
                  >
                    <option value="all">All sectors</option>
                    {sectorOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="label-mono mb-1 block">Country</span>
                  <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value as CountryKey | "all")}
                    className="w-full bg-surface border border-border rounded-sm text-xs font-mono px-2 py-1.5 outline-none focus:border-brand"
                  >
                    <option value="all">All countries</option>
                    {countryKeys.map((k) => (
                      <option key={k} value={k}>{countryConfigs[k].code} — {countryConfigs[k].name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="label-mono mb-1 flex justify-between">
                  <span>Min match score</span>
                  <span className="text-brand">{minMatch}%</span>
                </span>
                <input
                  type="range" min={0} max={100} step={5}
                  value={minMatch}
                  onChange={(e) => setMinMatch(Number(e.target.value))}
                  className="w-full accent-brand"
                />
              </label>
            </div>

            <div className="space-y-2.5">
              {filteredOpportunities.length === 0 ? (
                <div className="text-text-muted text-xs text-center py-6">
                  No opportunities match your filters.
                </div>
              ) : filteredOpportunities.map((o, idx) => {
                const key = `${o.countryKey}-${o.title}-${idx}`;
                const st = statuses[key] || null;
                const setSt = (v: OppStatus) => setStatuses({ ...statuses, [key]: v });
                return (
                  <div key={key} className="surface2 rounded-sm p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{o.title}</div>
                        <div className="text-text-muted text-xs flex flex-wrap gap-x-2">
                          <span className="font-mono text-teal">{o.countryCode}</span>
                          <span>· {o.sector}</span>
                          <span>· ${o.wage_range_usd_day}/day</span>
                        </div>
                      </div>
                      <span className="pill bg-brand/15 text-brand whitespace-nowrap">{o.match_pct}%</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(["exploring","applied","not_interested"] as OppStatus[]).map((s) => (
                        <button key={s as string} onClick={() => setSt(st === s ? null : s)} className={`pill border text-[10px] ${st === s ? "border-brand text-brand bg-brand/10" : "border-border text-text-muted hover:text-text"}`}>{(s as string).replace("_"," ")}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="surface rounded-sm p-5 border-l-2 border-brand">
          <div className="label-mono mb-2 text-brand">Becoming AI-resilient</div>
          <p className="text-text text-sm">
            As routine work is increasingly automated and outsourced to AI, your edge comes from <strong>uniquely human</strong> skills
            (judgment, relationships, craft) combined with <strong>AI-augmented digital fluency</strong>. Aim to move every skill to{" "}
            <span className="text-teal">Advanced</span> aptitude, then layer adjacent skills from your roadmap.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: "teal" | "brand" | "warn" }) {
  const cls = accent === "teal" ? "text-teal" : accent === "warn" ? "text-warn" : accent === "brand" ? "text-brand" : "text-text";
  return (
    <div className="surface rounded-sm p-4">
      <div className="label-mono">{label}</div>
      <div className={`data-num text-2xl mt-2 ${cls}`}>{value}</div>
    </div>
  );
}
