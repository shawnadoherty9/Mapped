import { useMemo, useState } from "react";
import AppLayout, { PageHeader } from "@/components/AppLayout";
import { useActiveCountry } from "@/store/useAppStore";
import { generateSyntheticCohort } from "@/lib/synthetic";
import { getSectorSkills, scoreSectorFit } from "@/data/sectorSkills";
import { Pie, PieChart, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Search, Users, Layers3, Download, MapPin, ShieldCheck, GraduationCap, Briefcase, TrendingUp, Mail, Bookmark, X, Settings2, Check } from "lucide-react";

// Synthetic helper — derive an aptitude per skill deterministically per profile
type Aptitude = "Novice" | "Proficient" | "Advanced";
const APT: Aptitude[] = ["Novice", "Proficient", "Advanced"];
const aptColor = (a: Aptitude) =>
  a === "Advanced" ? "bg-teal/20 text-teal" : a === "Proficient" ? "bg-brand/20 text-brand" : "bg-warn/20 text-warn";

function hash(s: string) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

/**
 * Talent Pool — dedicated workspace combining the cohort-level skill aggregates
 * with the searchable employer-facing talent pool. Lives at /app/talent under
 * the policymaker sidebar so analysts and recruiters can pivot between
 * macro-level skill distribution and individual candidate browsing without
 * leaving the page.
 */
export default function TalentPoolPage() {
  const country = useActiveCountry();
  const cohort = useMemo(() => generateSyntheticCohort(country, 50), [country]);

  // ===== Skill-type aggregates (formal / informal / demonstrated) =====
  const skillTypeCounts = useMemo(() => {
    const m = { formal: 0, informal: 0, demonstrated: 0 };
    cohort.forEach((p) => p.skills.forEach((s) => { (m as Record<string, number>)[s.type]++; }));
    return [
      { name: "formal", value: m.formal, fill: "hsl(var(--teal))" },
      { name: "informal", value: m.informal, fill: "hsl(var(--warn))" },
      { name: "demonstrated", value: m.demonstrated, fill: "hsl(var(--accent))" },
    ];
  }, [cohort]);

  // ===== Aptitude distribution per skill type =====
  const aptitudeBySkillType = useMemo(() => {
    const types = ["formal", "informal", "demonstrated"] as const;
    return types.map((t) => {
      const c = { Novice: 0, Proficient: 0, Advanced: 0 };
      cohort.forEach((p) =>
        p.skills.filter((s) => s.type === t).forEach((s) => {
          const r = (hash(p.id + s.label) % 100) / 100;
          const apt: Aptitude = r < 0.25 ? "Novice" : r < 0.6 ? "Proficient" : "Advanced";
          c[apt]++;
        }),
      );
      return { type: t, ...c };
    });
  }, [cohort]);

  const topSkillsByType = useMemo(() => {
    const types = ["formal", "informal", "demonstrated"] as const;
    return types.map((t) => {
      const m: Record<string, number> = {};
      cohort.forEach((p) => p.skills.filter((s) => s.type === t).forEach((s) => { m[s.label] = (m[s.label] || 0) + 1; }));
      return {
        type: t,
        items: Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6),
      };
    });
  }, [cohort]);

  // ===== Talent pool (employer view) =====
  // `enrichedSkills` is pre-sorted Advanced > Proficient > Novice (stable on
  // ties via the original ESCO order). This single ordering is the source of
  // truth for the table preview, drawer detail list, and CSV `top_skill_N_rank`
  // export — keep them aligned by always rendering / slicing this array as-is.
  const APT_RANK: Record<Aptitude, number> = { Advanced: 3, Proficient: 2, Novice: 1 };

  // AI confidence model — deterministic 0-100 score the mapper assigns to each
  // (candidate, skill) pair. Real models would blend evidence strength,
  // self-report calibration, and credential verification; here we approximate
  // with three signals so the CSV value lines up with what users see:
  //   • aptitude tier  (Novice 0.50 / Proficient 0.70 / Advanced 0.85 base)
  //   • skill type     (formal +6, demonstrated +3, informal -2)
  //   • per-skill jitter from the same hash used for aptitude (±6 points)
  // Output is rounded and clamped to [40, 99] so the column reads like a
  // probability without ever showing a misleading "100".
  const APT_CONF_BASE: Record<Aptitude, number> = { Novice: 50, Proficient: 70, Advanced: 85 };
  const TYPE_CONF_BONUS: Record<string, number> = { formal: 6, demonstrated: 3, informal: -2 };
  const skillConfidence = (profileId: string, label: string, type: string, apt: Aptitude) => {
    const jitter = ((hash(profileId + "::" + label) % 13) - 6); // -6..+6
    const raw = APT_CONF_BASE[apt] + (TYPE_CONF_BONUS[type] ?? 0) + jitter;
    return Math.max(40, Math.min(99, Math.round(raw)));
  };

  const talentPool = useMemo(() => {
    return cohort.map((p) => {
      const enriched = p.skills.map((s) => {
        const r = (hash(p.id + s.label) % 100) / 100;
        const apt: Aptitude = r < 0.25 ? "Novice" : r < 0.6 ? "Proficient" : "Advanced";
        const confidence = skillConfidence(p.id, s.label, s.type, apt);
        return { ...s, aptitude: apt, confidence };
      });
      // Deterministic ordering — never rely on engine sort stability or input
      // order, since both can drift between browsers, Node versions, and
      // re-runs of the export. Tie-breakers (in order):
      //   1. aptitude tier      (Advanced > Proficient > Novice)
      //   2. AI confidence desc (higher-confidence skills rank first)
      //   3. skill type         (formal > demonstrated > informal)
      //   4. label A→Z          (locale-independent codepoint compare)
      // This guarantees `top_skill_N_rank` is identical across browsers and
      // export runs for the same candidate snapshot.
      const TYPE_RANK: Record<string, number> = { formal: 3, demonstrated: 2, informal: 1 };
      enriched.sort((a, b) => {
        const aptDiff = APT_RANK[b.aptitude] - APT_RANK[a.aptitude];
        if (aptDiff !== 0) return aptDiff;
        const confDiff = b.confidence - a.confidence;
        if (confDiff !== 0) return confDiff;
        const typeDiff = (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0);
        if (typeDiff !== 0) return typeDiff;
        return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
      });
      const aiResilience = p.risk < 0.35 ? "High" : p.risk < 0.6 ? "Medium" : "Low";
      return { ...p, enrichedSkills: enriched, aiResilience };
    });
  }, [cohort]);

  const [search, setSearch] = useState("");
  const [aptFilter, setAptFilter] = useState<Aptitude | "all">("all");
  type Candidate = (typeof talentPool)[number];
  const [selected, setSelected] = useState<Candidate | null>(null);

  // ===== CSV column selection =====
  // Each toggle controls a logical column group in the export. Recruiters can
  // strip the file down to just identifiers + top skills, or keep the full
  // employer-match + raw-skill payload.
  type ColGroup = "core" | "aptCounts" | "match" | "topSkills" | "allSkills";
  const COL_GROUPS: { key: ColGroup; label: string; desc: string }[] = [
    { key: "core",       label: "Identity & risk",   desc: "id, age, education, occupation, risk, AI resilience, top adjacent" },
    { key: "aptCounts",  label: "Aptitude counts",   desc: "skill_count, advanced/proficient/novice counts" },
    { key: "match",      label: "Employer match",    desc: "match_sector, match_score, recommended_roles" },
    { key: "topSkills",  label: "Top skills",        desc: "top_skill_1..N with rank, type, aptitude, AI confidence (N selectable below)" },
    { key: "allSkills",  label: "Full skills payload", desc: "all_skills (pipe-delimited label:type:aptitude:confidence)" },
  ];
  const [colGroups, setColGroups] = useState<Record<ColGroup, boolean>>({
    core: true, aptCounts: true, match: true, topSkills: true, allSkills: true,
  });
  const toggleGroup = (k: ColGroup) => setColGroups((g) => ({ ...g, [k]: !g[k] }));
  const applyPreset = (preset: "full" | "topSkillsOnly" | "matchOnly") => {
    if (preset === "full") setColGroups({ core: true, aptCounts: true, match: true, topSkills: true, allSkills: true });
    if (preset === "topSkillsOnly") setColGroups({ core: true, aptCounts: false, match: false, topSkills: true, allSkills: false });
    if (preset === "matchOnly") setColGroups({ core: true, aptCounts: false, match: true, topSkills: false, allSkills: false });
  };
  const selectedGroupCount = Object.values(colGroups).filter(Boolean).length;

  // ===== Top-skill column ordering =====
  // Recruiters and analysts read CSVs differently — some scan by label first,
  // others sort by rank or aptitude. The preset below controls the field
  // sequence repeated for each top_skill_N block; `confidence` is always
  // appended last because it's a derived signal.
  type SkillField = "rank" | "label" | "type" | "aptitude";
  type SkillOrderPreset = "standard" | "labelFirst" | "aptitudeFirst";
  const SKILL_ORDER_PRESETS: { key: SkillOrderPreset; label: string; fields: SkillField[]; desc: string }[] = [
    { key: "standard",      label: "Rank · Label · Aptitude · Type",  fields: ["rank", "label", "aptitude", "type"], desc: "Default — read by ranking" },
    { key: "labelFirst",    label: "Label · Aptitude · Type · Rank",  fields: ["label", "aptitude", "type", "rank"], desc: "Read skill names first" },
    { key: "aptitudeFirst", label: "Aptitude · Rank · Label · Type",  fields: ["aptitude", "rank", "label", "type"], desc: "Filter by aptitude tier" },
  ];
  const [skillOrder, setSkillOrder] = useState<SkillOrderPreset>("standard");
  const skillFields = SKILL_ORDER_PRESETS.find((p) => p.key === skillOrder)!.fields;

  // ===== Top-N skills export depth =====
  // Controls how many top_skill_N blocks are written to the CSV and how many
  // rank badges in the drawer light up as "in export". The drawer always lists
  // every verified skill, but only ranks <= topN are tagged as exported.
  const TOP_N_OPTIONS = [3, 5, 10] as const;
  type TopN = (typeof TOP_N_OPTIONS)[number];
  const [topN, setTopN] = useState<TopN>(5);

  const filteredTalent = useMemo(() => {
    const q = search.toLowerCase().trim();
    return talentPool.filter((p) => {
      const matchSearch = !q ||
        p.occupation.label.toLowerCase().includes(q) ||
        p.enrichedSkills.some((s) => s.label.toLowerCase().includes(q));
      const matchApt = aptFilter === "all" || p.enrichedSkills.some((s) => s.aptitude === aptFilter);
      return matchSearch && matchApt;
    });
  }, [talentPool, search, aptFilter]);

  const downloadCsv = () => {
    const TOP_N = topN;
    // NOTE: `enrichedSkills` is already pre-sorted by the deterministic
    // comparator (see talentPool useMemo). The CSV slices it directly so
    // `top_skill_N_rank` matches the order shown in the table preview and
    // candidate drawer.

    // ----- Header assembly, group by group -----
    const header: string[] = [];
    if (colGroups.core)      header.push("id", "age", "education", "occupation_code", "occupation", "risk", "ai_resilience", "top_adjacent");
    if (colGroups.aptCounts) header.push("skill_count", "advanced_count", "proficient_count", "novice_count");
    if (colGroups.match)     header.push("match_sector", "match_score", "recommended_roles");
    if (colGroups.topSkills) {
      // Header field name per SkillField — the suffix uses an empty string for
      // `label` so the column reads as `top_skill_1` rather than `top_skill_1_label`.
      const SUFFIX: Record<SkillField, string> = { rank: "_rank", label: "", type: "_type", aptitude: "_aptitude" };
      for (let i = 1; i <= TOP_N; i++) {
        for (const f of skillFields) header.push(`top_skill_${i}${SUFFIX[f]}`);
        // top_skill_N_confidence: 0-100 AI confidence the candidate actually
        // holds this skill at the stated aptitude (always last for stable parsing).
        header.push(`top_skill_${i}_confidence`);
      }
    }
    if (colGroups.allSkills) header.push("all_skills");

    // Pre-compute the country's growth sectors as scoreable SectorSkillSets
    // (only when the match group is included — otherwise this work is wasted).
    const growthSectors = colGroups.match
      ? Object.keys(country.sector_growth ?? {}).map((label) => ({
          label,
          growth: country.sector_growth[label],
          set: getSectorSkills(label),
        }))
      : [];

    const rows: string[][] = [header];
    talentPool.forEach((p) => {
      const top = p.enrichedSkills.slice(0, TOP_N);
      const row: string[] = [];

      if (colGroups.core) {
        row.push(
          p.id, String(p.age), p.education, p.occupation.code, p.occupation.label,
          p.risk.toFixed(3), p.aiResilience, p.topAdjacent,
        );
      }
      if (colGroups.aptCounts) {
        const advanced = p.enrichedSkills.filter((s) => s.aptitude === "Advanced").length;
        const proficient = p.enrichedSkills.filter((s) => s.aptitude === "Proficient").length;
        const novice = p.enrichedSkills.filter((s) => s.aptitude === "Novice").length;
        row.push(String(p.enrichedSkills.length), String(advanced), String(proficient), String(novice));
      }
      if (colGroups.match) {
        const userSkillLabels = p.enrichedSkills.map((s) => s.label);
        let best: { label: string; score: number; matched: string[] } | null = null;
        for (const gs of growthSectors) {
          const { fit, requiredMatched } = scoreSectorFit(userSkillLabels, gs.set);
          if (!best || fit > best.score) best = { label: gs.label, score: fit, matched: requiredMatched };
        }
        const recommendedRoles = [
          p.occupation.label,
          p.topAdjacent,
          ...(best?.matched ?? []).slice(0, 3),
        ].filter(Boolean).join(" | ");
        row.push(best?.label ?? "", best ? String(best.score) : "", recommendedRoles);
      }
      if (colGroups.topSkills) {
        for (let i = 0; i < TOP_N; i++) {
          const s = top[i];
          // Emit fields in the user-selected order, then always append confidence
          // last so consumers can find it at a stable offset within each block.
          for (const f of skillFields) {
            if (!s) { row.push(""); continue; }
            if (f === "rank") row.push(String(i + 1));
            else if (f === "label") row.push(s.label);
            else if (f === "type") row.push(s.type);
            else if (f === "aptitude") row.push(s.aptitude);
          }
          row.push(s ? String(s.confidence) : "");
        }
      }
      if (colGroups.allSkills) {
        // Append confidence to the pipe-delimited payload as label:type:aptitude:confidence
        // so the wide and long encodings carry the same signal.
        row.push(p.enrichedSkills.map((s) => `${s.label}:${s.type}:${s.aptitude}:${s.confidence}`).join("|"));
      }
      rows.push(row);
    });

    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `mapped-talent-${country.code}.csv`; a.click();
  };

  const resCls = (r: string) => r === "High" ? "text-teal" : r === "Medium" ? "text-brand" : "text-warn";

  return (
    <AppLayout>
      <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-7xl">
        <PageHeader
          eyebrow="Talent Pool · Policymakers · Employers"
          title={`Talent intelligence — ${country.name}`}
          sub="Pivot between cohort-level skill aggregates and a searchable, employer-facing talent pool. 50 synthetic profiles per country."
        />

        <Tabs defaultValue="aggregate" className="w-full">
          <TabsList className="bg-surface border border-border rounded-sm h-auto p-1 mb-6">
            <TabsTrigger value="aggregate" className="data-[state=active]:bg-brand data-[state=active]:text-bg rounded-sm text-xs px-4 py-2 flex items-center gap-2">
              <Layers3 size={13} /> Talent Aggregate by Skill Type
            </TabsTrigger>
            <TabsTrigger value="employer" className="data-[state=active]:bg-brand data-[state=active]:text-bg rounded-sm text-xs px-4 py-2 flex items-center gap-2">
              <Users size={13} /> Employer Talent Pool
            </TabsTrigger>
          </TabsList>

          {/* ============ AGGREGATE TAB ============ */}
          <TabsContent value="aggregate" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="Skill type breakdown">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={skillTypeCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} stroke="hsl(var(--surface))">
                      {skillTypeCounts.map((d) => <Cell key={d.name} fill={d.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="text-[11px] text-text-muted text-center mt-2">
                  How verified each skill is: formal credential, informal practice, or demonstrated via project.
                </div>
              </ChartCard>

              <ChartCard title="Aptitude tier × skill type">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={aptitudeBySkillType}>
                    <XAxis dataKey="type" stroke="hsl(var(--text-muted))" fontSize={11} />
                    <YAxis stroke="hsl(var(--text-muted))" fontSize={10} />
                    <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Novice" stackId="apt" fill="hsl(var(--warn))" />
                    <Bar dataKey="Proficient" stackId="apt" fill="hsl(var(--brand))" />
                    <Bar dataKey="Advanced" stackId="apt" fill="hsl(var(--teal))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="text-[11px] text-text-muted text-center mt-2">
                  Distribution of Novice / Proficient / Advanced ratings within each skill type.
                </div>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topSkillsByType.map((t) => (
                <div key={t.type} className="surface rounded-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="label-mono text-text">Top {t.type} skills</span>
                    <span className="data-num text-sm text-brand">{t.items.length}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {t.items.map(([label, n]) => (
                      <li key={label} className="flex items-center justify-between text-xs">
                        <span className="text-text truncate pr-2">{label}</span>
                        <span className="font-mono text-text-muted">{n}</span>
                      </li>
                    ))}
                    {t.items.length === 0 && (
                      <li className="text-text-muted text-xs">No {t.type} skills in this cohort.</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {APT.map((level) => {
                const count = talentPool.reduce((sum, p) => sum + p.enrichedSkills.filter((s) => s.aptitude === level).length, 0);
                return (
                  <div key={level} className="surface rounded-sm p-4">
                    <div className="flex items-center justify-between">
                      <span className={`pill ${aptColor(level)}`}>{level}</span>
                      <span className="data-num text-2xl">{count}</span>
                    </div>
                    <div className="text-xs text-text-muted mt-2">verified skill-aptitude matches in cohort</div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ============ EMPLOYER TAB ============ */}
          <TabsContent value="employer" className="mt-0 space-y-6">
            <div className="surface rounded-sm p-5">
              <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search by skill or occupation (e.g. 'mobile money', 'welder')"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full surface2 border border-border rounded-sm pl-9 pr-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </div>
                <div className="flex gap-1">
                  {(["all", "Advanced", "Proficient", "Novice"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setAptFilter(f as Aptitude | "all")}
                      className={`pill border text-[11px] ${aptFilter === f ? "border-brand text-brand bg-brand/10" : "border-border text-text-muted hover:text-text"}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="font-mono text-xs text-text-muted whitespace-nowrap">
                  {filteredTalent.length}/{talentPool.length} candidates
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left">
                      <th className="label-mono pb-2 pr-3">ID</th>
                      <th className="label-mono pb-2 pr-3">Occupation</th>
                      <th className="label-mono pb-2 pr-3">Top skills · aptitude</th>
                      <th className="label-mono pb-2 pr-3">AI resilience</th>
                      <th className="label-mono pb-2 pr-3">Location</th>
                      <th className="label-mono pb-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTalent.slice(0, 25).map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className="border-t border-border align-top hover:bg-surface2/40 cursor-pointer"
                      >
                        <td className="py-2.5 pr-3 font-mono text-xs text-text-muted">{p.id}</td>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium">{p.occupation.label}</div>
                          <div className="text-text-muted text-xs">ISCO {p.occupation.code} · age {p.age}</div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {p.enrichedSkills.slice(0, 4).map((s, i) => (
                              <span
                                key={i}
                                className={`pill ${aptColor(s.aptitude)} text-[10px] inline-flex items-center gap-1`}
                                title={`Rank ${i + 1} — exported as top_skill_${i + 1}`}
                              >
                                <span className="font-mono text-[9px] text-text-muted">#{i + 1}</span>
                                {s.label} · {s.aptitude.charAt(0)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className={`py-2.5 pr-3 text-xs font-medium ${resCls(p.aiResilience)}`}>
                          <ShieldCheck size={11} className="inline mr-1" />{p.aiResilience}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-text-muted">
                          <MapPin size={10} className="inline mr-1" />{country.code}
                        </td>
                        <td className="py-2.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelected(p); }}
                            className="pill border border-border text-text-muted hover:border-brand hover:text-brand text-[10px]"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredTalent.length === 0 && (
                  <div className="text-center text-text-muted text-sm py-8">No candidates match your filter.</div>
                )}
              </div>
            </div>

            {/* ===== CSV column selector + export ===== */}
            <div className="surface rounded-sm p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Settings2 size={14} className="text-text-muted" />
                  <span className="label-mono text-text">CSV columns</span>
                  <span className="font-mono text-[11px] text-text-muted">{selectedGroupCount}/{COL_GROUPS.length} groups selected</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => applyPreset("full")}
                    className="pill border border-border text-text-muted hover:border-brand hover:text-brand text-[11px]"
                  >
                    Full fidelity
                  </button>
                  <button
                    onClick={() => applyPreset("topSkillsOnly")}
                    className="pill border border-border text-text-muted hover:border-brand hover:text-brand text-[11px]"
                  >
                    Top skills only
                  </button>
                  <button
                    onClick={() => applyPreset("matchOnly")}
                    className="pill border border-border text-text-muted hover:border-brand hover:text-brand text-[11px]"
                  >
                    Employer match
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {COL_GROUPS.map((g) => {
                  const on = colGroups[g.key];
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => toggleGroup(g.key)}
                      className={`text-left flex items-start gap-3 p-3 rounded-sm border transition-colors ${
                        on ? "border-brand bg-brand/5" : "border-border bg-surface2/40 hover:border-strong"
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${
                          on ? "bg-brand border-brand text-bg" : "border-border"
                        }`}
                      >
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <div className="text-sm text-text font-medium">{g.label}</div>
                        <div className="text-[11px] text-text-muted leading-relaxed">{g.desc}</div>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ===== Top-N export depth =====
                  Recruiters comparing wide cohorts often want only top-3 to keep
                  spreadsheets scannable; analytics workflows benefit from top-10.
                  This control changes both the CSV header count and which drawer
                  rank badges light up as "in export". */}
              <div className={`border-t border-border pt-4 ${colGroups.topSkills ? "" : "opacity-50"}`}>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className="label-mono text-text">Top-N skills exported</span>
                  <span className="font-mono text-[11px] text-text-muted">controls CSV columns + drawer badges</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {TOP_N_OPTIONS.map((n) => {
                    const on = topN === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={!colGroups.topSkills}
                        onClick={() => setTopN(n)}
                        className={`p-3 rounded-sm border transition-colors disabled:cursor-not-allowed text-center ${
                          on ? "border-brand bg-brand/5" : "border-border bg-surface2/40 hover:border-strong"
                        }`}
                      >
                        <div className="data-num text-lg text-text">Top {n}</div>
                        <div className="text-[11px] text-text-muted mt-0.5">
                          {n === 3 ? "Concise overview" : n === 5 ? "Balanced default" : "Deep skill profile"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ===== Top-skill column ordering preset =====
                  Only meaningful when the Top skills group is included; the
                  picker fades when that group is off so it's discoverable but
                  obviously inert. */}
              <div className={`border-t border-border pt-4 ${colGroups.topSkills ? "" : "opacity-50"}`}>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className="label-mono text-text">Top-skill column order</span>
                  <span className="font-mono text-[11px] text-text-muted">applies to top_skill_1..{topN} blocks</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {SKILL_ORDER_PRESETS.map((p) => {
                    const on = skillOrder === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        disabled={!colGroups.topSkills}
                        onClick={() => setSkillOrder(p.key)}
                        className={`text-left p-3 rounded-sm border transition-colors disabled:cursor-not-allowed ${
                          on ? "border-brand bg-brand/5" : "border-border bg-surface2/40 hover:border-strong"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full border flex items-center justify-center shrink-0 ${on ? "border-brand" : "border-border"}`}>
                            {on && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                          </span>
                          <span className="text-sm text-text font-medium">{p.label}</span>
                        </div>
                        <div className="text-[11px] text-text-muted mt-1 ml-5">{p.desc}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-text-muted mt-2 font-mono">
                  Confidence is always appended last so parsers can find it at a stable offset.
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={downloadCsv}
                  disabled={selectedGroupCount === 0}
                  className="bg-brand text-bg px-5 py-2.5 rounded-sm text-sm font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download size={14} /> Export talent pool (CSV)
                </button>
                {selectedGroupCount === 0 && (
                  <span className="text-[11px] text-warn">Select at least one column group to export.</span>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ============ CANDIDATE DETAILS DRAWER ============ */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg bg-bg border-l border-border overflow-y-auto p-0">
          {selected && (
            <div className="flex flex-col h-full">
              {/* Header band */}
              <div className="bg-surface border-b border-border px-6 py-5">
                <SheetHeader className="text-left space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="label-mono text-text-muted">Candidate · {selected.id}</span>
                    <span className={`pill text-[10px] font-medium ${resCls(selected.aiResilience)} bg-surface2 border border-border`}>
                      <ShieldCheck size={10} className="inline mr-1" />
                      {selected.aiResilience} AI resilience
                    </span>
                  </div>
                  <SheetTitle className="font-display text-2xl text-text leading-tight">
                    {selected.occupation.label}
                  </SheetTitle>
                  <SheetDescription className="text-text-muted text-xs flex flex-wrap gap-x-3 gap-y-1">
                    <span><Briefcase size={11} className="inline mr-1" />ISCO {selected.occupation.code}</span>
                    <span>· Age {selected.age}</span>
                    <span>· <GraduationCap size={11} className="inline mr-1" />{selected.education}</span>
                    <span>· <MapPin size={11} className="inline mr-1" />{country.name}</span>
                  </SheetDescription>
                </SheetHeader>
              </div>

              {/* Body */}
              <div className="flex-1 px-6 py-5 space-y-6">
                {/* Risk + adjacency */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="surface2 rounded-sm p-3 border border-border">
                    <div className="label-mono text-[10px] text-text-muted mb-1">Automation risk</div>
                    <div className="data-num text-2xl text-text">{(selected.risk * 100).toFixed(0)}%</div>
                  </div>
                  <div className="surface2 rounded-sm p-3 border border-border">
                    <div className="label-mono text-[10px] text-text-muted mb-1">Top adjacent path</div>
                    <div className="text-sm text-text font-medium leading-tight flex items-start gap-1.5">
                      <TrendingUp size={13} className="text-teal mt-0.5 shrink-0" />
                      <span>{selected.topAdjacent}</span>
                    </div>
                  </div>
                </div>

                {/* Skills breakdown — rank badge mirrors CSV `top_skill_N_rank` (top 5 only).
                    INVARIANT: rank = index + 1 over `enrichedSkills`, the SAME pre-sorted
                    array the CSV export slices in `downloadCsv`. Do NOT re-sort or filter
                    here — any reordering must happen upstream in the `talentPool` useMemo
                    so table, drawer, and CSV stay in lockstep. */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="label-mono text-text">Verified skills</span>
                    <span className="font-mono text-xs text-text-muted">{selected.enrichedSkills.length} total · top {topN} export</span>
                  </div>
                  <div className="space-y-2">
                    {selected.enrichedSkills.map((s, i) => {
                      // Rank is computed from the export-sorted index, not display order.
                      const rank = i + 1;
                      const inTop = rank <= topN;
                      return (
                        <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-b-0">
                          <span
                            className={`shrink-0 w-6 h-6 rounded-sm flex items-center justify-center font-mono text-[11px] ${
                              inTop
                                ? "bg-brand/15 text-brand border border-brand/40"
                                : "bg-surface2 text-text-muted border border-border"
                            }`}
                            title={inTop ? `Rank ${rank} — included in CSV as top_skill_${rank}` : `Outside top ${topN} — not in CSV top-skill columns`}
                          >
                            {inTop ? rank : "—"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-text truncate">{s.label}</div>
                            <div className="text-[10px] text-text-muted uppercase tracking-wide">{s.type}</div>
                          </div>
                          <span
                            className="font-mono text-[10px] text-text-muted shrink-0 tabular-nums"
                            title="AI confidence — exported as top_skill_N_confidence"
                          >
                            {s.confidence}%
                          </span>
                          <span className={`pill ${aptColor(s.aptitude)} text-[10px] shrink-0`}>{s.aptitude}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Aptitude tally */}
                <div>
                  <div className="label-mono text-text mb-2">Aptitude distribution</div>
                  <div className="grid grid-cols-3 gap-2">
                    {APT.map((level) => {
                      const n = selected.enrichedSkills.filter((s) => s.aptitude === level).length;
                      return (
                        <div key={level} className="surface2 rounded-sm p-3 border border-border text-center">
                          <div className="data-num text-lg text-text">{n}</div>
                          <div className={`text-[10px] mt-1 ${level === "Advanced" ? "text-teal" : level === "Proficient" ? "text-brand" : "text-warn"}`}>
                            {level}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div className="border-t border-border bg-surface px-6 py-4 flex items-center gap-2">
                <button className="flex-1 bg-brand text-bg px-4 py-2.5 rounded-sm text-sm font-medium flex items-center justify-center gap-2 hover:bg-brand/90">
                  <Mail size={14} /> Contact candidate
                </button>
                <button className="surface2 border border-border text-text px-3 py-2.5 rounded-sm text-sm hover:border-brand hover:text-brand flex items-center gap-1.5">
                  <Bookmark size={14} /> Save
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="surface2 border border-border text-text-muted px-3 py-2.5 rounded-sm text-sm hover:text-text"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface rounded-sm p-5">
      <div className="label-mono mb-2">{title}</div>
      {children}
    </div>
  );
}
