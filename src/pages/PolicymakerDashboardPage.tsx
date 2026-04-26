import { useEffect, useMemo, useRef, useState } from "react";
import AppLayout, { PageHeader } from "@/components/AppLayout";
import { useActiveCountry, useAppStore } from "@/store/useAppStore";
import { generateSyntheticCohort } from "@/lib/synthetic";
import { generatePolicySignals } from "@/lib/claude";
import { Pie, PieChart, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, Legend, ReferenceLine, ErrorBar } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Users, Building2, Download, MapPin, ShieldCheck } from "lucide-react";
import DataProvenance from "@/components/DataProvenance";
import { useCalibratedRisk, formatCalibrationDeltaPp } from "@/hooks/useCalibratedRisk";
import { bandRationale } from "@/data/freyOsborne";
import BandLogicLink from "@/components/BandLogicLink";
import PolicyRecommendations from "@/components/PolicyRecommendations";
import CalibrationProvenance from "@/components/CalibrationProvenance";
import CalibrationFactorsBreakdown from "@/components/CalibrationFactorsBreakdown";
import { buildIscoCsv, buildAndDownloadIscoCsv, downloadCsv as downloadCsvFile, formatBytes, provenanceFromMergedCountry } from "@/lib/csvExport";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Synthetic helper — derive an aptitude per skill deterministically per profile
type Aptitude = "Novice" | "Proficient" | "Advanced";
const APT: Aptitude[] = ["Novice", "Proficient", "Advanced"];
const aptColor = (a: Aptitude) =>
  a === "Advanced" ? "bg-teal/20 text-teal" : a === "Proficient" ? "bg-brand/20 text-brand" : "bg-warn/20 text-warn";

function hash(s: string) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

export default function PolicymakerDashboardPage() {
  const country = useActiveCountry();
  const countryKey = useAppStore((s) => s.country);
  const cohort = useMemo(() => generateSyntheticCohort(country, 50), [country]);
  const { rows: iscoRows, meanCalibrated, meanBase, calibrationDeltaPp, highest, lowest } = useCalibratedRisk();
  const iscoChartData = useMemo(
    () => iscoRows.map((r) => ({
      code: `ISCO-${r.group.code}`,
      label: r.group.label,
      base: +(r.base * 100).toFixed(1),
      calibrated: +(r.calibrated * 100).toFixed(1),
      band: r.band,
      low: +(r.low * 100).toFixed(1),
      high: +(r.high * 100).toFixed(1),
      // Recharts ErrorBar wants symmetric/asymmetric offsets relative to the bar value.
      errBar: [
        +((r.calibrated - r.low) * 100).toFixed(1),
        +((r.high - r.calibrated) * 100).toFixed(1),
      ],
      halfWidthPp: +r.halfWidthPp.toFixed(1),
    })),
    [iscoRows],
  );
  const bandFill = (band: string) =>
    band === "low" ? "hsl(140,65%,38%)" :
    band === "moderate" ? "hsl(70,65%,36%)" :
    band === "elevated" ? "hsl(30,65%,34%)" : "hsl(0,65%,30%)";

  // Reference toggle: compare calibrated bars against US mean line OR per-ISCO base bars.
  const [refMode, setRefMode] = useState<"mean" | "perIsco">("mean");
  const [showUncertainty, setShowUncertainty] = useState(true);

  // Top-N ISCO table → drives which row feeds <PolicyRecommendations>.
  // Defaults to the highest-exposure group; resets when the country changes.
  const [selectedIscoCode, setSelectedIscoCode] = useState<string | null>(null);
  useEffect(() => { setSelectedIscoCode(null); }, [countryKey]);
  const topIscoRows = useMemo(
    () => [...iscoRows].sort((a, b) => b.calibrated - a.calibrated).slice(0, 5),
    [iscoRows],
  );
  const selectedIsco = useMemo(
    () => iscoRows.find((r) => r.group.code === selectedIscoCode) ?? highest,
    [iscoRows, selectedIscoCode, highest],
  );
  const meanHalfWidthPp = useMemo(
    () => iscoRows.reduce((a, r) => a + r.halfWidthPp, 0) / iscoRows.length,
    [iscoRows],
  );

  // ===== Chart export (PNG + CSV) =====
  const chartRef = useRef<HTMLDivElement>(null);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportChartCsv = () => {
    const filename = `isco-calibrated-${country.code}-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      const meta = [
        `# Calibrated automation risk · ISCO-08 distribution`,
        `# country,${country.name} (${country.code})`,
        `# lmic_calibration,${country.lmic_calibration}`,
        `# informality_pct,${country.informal_employment_pct ?? "fallback"}`,
        `# gdp_per_capita_usd,${(country as any).gdp_per_capita_usd ?? "fallback"}`,
        `# us_base_mean_pct,${Number.isFinite(meanBase) ? (meanBase * 100).toFixed(2) : "n/a"}`,
        `# calibrated_mean_pct,${Number.isFinite(meanCalibrated) ? (meanCalibrated * 100).toFixed(2) : "n/a"}`,
        `# source,Frey-Osborne (2013) · WDI · ILOSTAT`,
      ];
      const summary = buildAndDownloadIscoCsv(iscoChartData, filename, {
        meta,
        asPercent: true,
        calibrationProvenance: provenanceFromMergedCountry(country),
      });
      const desc = `${summary.rowCount} ISCO row${summary.rowCount === 1 ? "" : "s"} · ${formatBytes(summary.bytes)} · ${summary.filename}`;
      if (summary.warningCount > 0) {
        toast.warning("CSV exported with warnings", {
          description: `${desc}\n${summary.warningCount} data-quality note${summary.warningCount === 1 ? "" : "s"} embedded in the file header.`,
        });
      } else {
        toast.success("CSV exported", { description: desc });
      }
    } catch (err) {
      // Defensive: never let export crash the UI.
      // eslint-disable-next-line no-console
      console.error("[exportChartCsv] unexpected error", err);
      downloadCsvFile(
        `# export_error,${(err as Error)?.message ?? "unknown"}\nisco_code,isco_label,base_us_risk_pct,calibrated_risk_pct,band,quality\n`,
        `isco-calibrated-${country.code}-error.csv`,
      );
      toast.error("CSV export failed", {
        description: `Saved a diagnostic file instead: ${(err as Error)?.message ?? "unknown error"}`,
      });
    }
  };

  const exportChartPng = async () => {
    const container = chartRef.current;
    if (!container) return;
    const svg = container.querySelector("svg");
    if (!svg) return;

    // Clone & inline computed styles so the rasterised SVG matches what's on screen.
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const { width, height } = svg.getBoundingClientRect();
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    // Resolve CSS variables (hsl(var(--...))) by inlining computed colors.
    const srcNodes = svg.querySelectorAll<SVGElement>("*");
    const dstNodes = clone.querySelectorAll<SVGElement>("*");
    srcNodes.forEach((src, i) => {
      const cs = getComputedStyle(src);
      const dst = dstNodes[i];
      if (!dst) return;
      ["fill", "stroke", "color", "font-family", "font-size", "opacity"].forEach((prop) => {
        const v = cs.getPropertyValue(prop);
        if (v && v !== "none") dst.setAttribute(prop, v);
      });
    });

    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg load failed"));
      img.src = svgUrl;
    });

    const scale = 2; // 2x for crisp PNG
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d")!;
    // Background that matches the surface card so dark theme exports cleanly.
    const bg = getComputedStyle(container).backgroundColor || "#0b0b0b";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);

    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, `isco-calibrated-${country.code}-${new Date().toISOString().slice(0, 10)}.png`);
    }, "image/png");
  };

  // ===== Aggregations shared by both tabs =====
  const skillTypeCounts = useMemo(() => {
    const m = { formal: 0, informal: 0, demonstrated: 0 };
    cohort.forEach(p => p.skills.forEach(s => { (m as Record<string, number>)[s.type]++; }));
    return [
      { name: "formal", value: m.formal, fill: "hsl(var(--teal))" },
      { name: "informal", value: m.informal, fill: "hsl(var(--warn))" },
      { name: "demonstrated", value: m.demonstrated, fill: "hsl(var(--accent))" },
    ];
  }, [cohort]);

  const occCounts = useMemo(() => {
    const m: Record<string, { code: string; label: string; n: number }> = {};
    cohort.forEach(p => {
      const k = p.occupation.code; if (!m[k]) m[k] = { ...p.occupation, n: 0 }; m[k].n++;
    });
    return Object.values(m).sort((a,b) => b.n - a.n).slice(0, 5);
  }, [cohort]);

  const riskBuckets = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, i) => ({ name: `${i*10}-${(i+1)*10}%`, value: 0 }));
    cohort.forEach(p => { const idx = Math.min(9, Math.floor(p.risk * 10)); buckets[idx].value++; });
    return buckets;
  }, [cohort]);

  const stats = useMemo(() => {
    const total = cohort.length;
    const avgRisk = cohort.reduce((s, p) => s + p.risk, 0) / total;
    const allSkills = cohort.flatMap(p => p.skills);
    const informal = allSkills.filter(s => s.type === "informal").length;
    const adjCount: Record<string, number> = {};
    cohort.forEach(p => { adjCount[p.topAdjacent] = (adjCount[p.topAdjacent] || 0) + 1; });
    const topGap = Object.entries(adjCount).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? "—";
    return { total, avgRisk, informalShare: informal / allSkills.length, topGap };
  }, [cohort]);

  const skillFreq = useMemo(() => {
    const m: Record<string, number> = {};
    cohort.forEach(p => p.skills.forEach(s => { m[s.label] = (m[s.label] || 0) + 1; }));
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([s])=>s);
  }, [cohort]);

  const heat = useMemo(() => {
    const sectors = Object.entries(country.sector_growth).sort((a,b)=>b[1]-a[1]).slice(0, 3);
    return skillFreq.map(skill => ({
      skill,
      cells: sectors.map(([sec, g]) => {
        let h = 0; for (const ch of (skill+sec)) h = (h*31 + ch.charCodeAt(0)) | 0;
        const base = (Math.abs(h) % 60) + 20;
        const score = Math.min(95, Math.round(base + g));
        return { sector: sec, score };
      }),
    }));
  }, [skillFreq, country]);

  // ===== Aptitude distribution (synthetic deterministic) =====
  const aptitudeDist = useMemo(() => {
    const c = { Novice: 0, Proficient: 0, Advanced: 0 };
    cohort.forEach(p => p.skills.forEach(s => {
      const r = (hash(p.id + s.label) % 100) / 100;
      const calMod = country.lmic_calibration; // higher cal = more advanced share
      const apt: Aptitude = r < 0.25 ? "Novice" : r < 0.55 + (1 - calMod) * 0.1 ? "Proficient" : "Advanced";
      c[apt]++;
    }));
    const total = c.Novice + c.Proficient + c.Advanced || 1;
    return [
      { name: "Novice", value: c.Novice, pct: Math.round(c.Novice/total*100), fill: "hsl(var(--warn))" },
      { name: "Proficient", value: c.Proficient, pct: Math.round(c.Proficient/total*100), fill: "hsl(var(--brand))" },
      { name: "Advanced", value: c.Advanced, pct: Math.round(c.Advanced/total*100), fill: "hsl(var(--teal))" },
    ];
  }, [cohort, country]);

  const aiResilienceShare = useMemo(() => {
    // share of cohort with avg risk < 0.4
    const resilient = cohort.filter(p => p.risk < 0.4).length;
    return Math.round((resilient / cohort.length) * 100);
  }, [cohort]);

  // ===== Talent pool (employer view) =====
  const talentPool = useMemo(() => {
    return cohort.map(p => {
      const enriched = p.skills.map(s => {
        const r = (hash(p.id + s.label) % 100) / 100;
        const apt: Aptitude = r < 0.25 ? "Novice" : r < 0.6 ? "Proficient" : "Advanced";
        return { ...s, aptitude: apt };
      });
      const advancedCount = enriched.filter(s => s.aptitude === "Advanced").length;
      const aiResilience = p.risk < 0.35 ? "High" : p.risk < 0.6 ? "Medium" : "Low";
      return { ...p, enrichedSkills: enriched, advancedCount, aiResilience };
    });
  }, [cohort]);

  const [search, setSearch] = useState("");
  const [aptFilter, setAptFilter] = useState<Aptitude | "all">("all");

  const filteredTalent = useMemo(() => {
    const q = search.toLowerCase().trim();
    return talentPool.filter(p => {
      const matchSearch = !q ||
        p.occupation.label.toLowerCase().includes(q) ||
        p.enrichedSkills.some(s => s.label.toLowerCase().includes(q));
      const matchApt = aptFilter === "all" || p.enrichedSkills.some(s => s.aptitude === aptFilter);
      return matchSearch && matchApt;
    });
  }, [talentPool, search, aptFilter]);

  // ===== AI signals =====
  const [signals, setSignals] = useState<string[]>([]);
  const [signalsTime, setSignalsTime] = useState<string>("");
  const [signalsLoading, setSignalsLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setSignalsLoading(true);
    generatePolicySignals(country, {
      avgRisk: stats.avgRisk,
      topSkillGap: stats.topGap,
      informalShare: stats.informalShare,
      topOccupations: occCounts.map(o => o.label),
    }).then(s => { if (alive) { setSignals(s); setSignalsTime(new Date().toLocaleString()); } })
      .catch(() => { if (alive) setSignals(["Policy signal generation unavailable. Showing aggregate metrics only."]); })
      .finally(() => { if (alive) setSignalsLoading(false); });
    return () => { alive = false; };
  }, [countryKey]);

  const downloadCsv = () => {
    const rows = [["id","age","education","occupation_code","occupation","risk","ai_resilience","top_adjacent","skills"]];
    talentPool.forEach(p => rows.push([
      p.id, String(p.age), p.education, p.occupation.code, p.occupation.label,
      p.risk.toFixed(3), p.aiResilience, p.topAdjacent,
      p.enrichedSkills.map(s=>`${s.label}:${s.type}:${s.aptitude}`).join("|"),
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `unmapped-cohort-${country.code}.csv`; a.click();
  };

  const heatColor = (s: number) => s > 70 ? "bg-brand/30 text-brand" : s > 50 ? "bg-warn/30 text-warn" : "bg-danger/25 text-danger";
  const resCls = (r: string) => r === "High" ? "text-teal" : r === "Medium" ? "text-brand" : "text-warn";

  return (
    <AppLayout>
      <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-7xl">
        <PageHeader
          eyebrow="Policymakers · Employers"
          title={`Aggregate Intelligence — ${country.name}`}
          sub="Switch between policy aggregates and a searchable employer-facing talent pool"
        />

        {/* Headline KPIs (always visible) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <KPI label="Profiles mapped" value={String(stats.total)} />
          <KPI label="Avg displacement risk" value={`${(stats.avgRisk*100).toFixed(0)}%`} accent={stats.avgRisk > 0.5 ? "warn" : "teal"} />
          <KPI label="AI-resilient share" value={`${aiResilienceShare}%`} accent={aiResilienceShare > 50 ? "teal" : "warn"} />
          <KPI label="Top skill gap" value={stats.topGap} />
          <KPI label="Informal skill share" value={`${(stats.informalShare*100).toFixed(0)}%`} />
        </div>

        <Tabs defaultValue="policy" className="w-full">
          <TabsList className="bg-surface border border-border rounded-sm h-auto p-1 mb-6">
            <TabsTrigger value="policy" className="data-[state=active]:bg-brand data-[state=active]:text-bg rounded-sm text-xs px-4 py-2 flex items-center gap-2">
              <Building2 size={13}/> Policy view
            </TabsTrigger>
          </TabsList>

          {/* ============ POLICY TAB ============ */}
          <TabsContent value="policy" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <ChartCard title="Skill type breakdown">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={skillTypeCounts} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} stroke="hsl(var(--surface))">
                      {skillTypeCounts.map((d) => <Cell key={d.name} fill={d.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Top ISCO occupations">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={occCounts} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" stroke="hsl(var(--text-muted))" fontSize={10} />
                    <YAxis type="category" dataKey="code" stroke="hsl(var(--text-muted))" fontSize={11} width={50} />
                    <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: number, _n: string, p: { payload: { label: string } }) => [`${v} (${p.payload.label})`, "count"]} />
                    <Bar dataKey="n" fill="hsl(var(--teal))" radius={[0,2,2,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Risk distribution">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={riskBuckets}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 2" />
                    <XAxis dataKey="name" stroke="hsl(var(--text-muted))" fontSize={9} />
                    <YAxis stroke="hsl(var(--text-muted))" fontSize={10} />
                    <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Calibrated automation risk by ISCO major group */}
            <div className="surface rounded-sm p-5">
              <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
                <div>
                  <div className="label-mono text-brand">Calibrated automation risk · ISCO-08 distribution</div>
                  <div className="text-text-muted text-xs mt-0.5">
                    {country.name} (LMIC-calibrated) vs US Frey-Osborne base mean
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex gap-3 text-[11px] font-mono">
                    <span className="text-brand">● {country.code} calibrated</span>
                    {refMode === "perIsco" ? (
                      <span className="text-text-muted">▭ US base per ISCO</span>
                    ) : (
                      <span className="text-warn">— US base mean ({(meanBase * 100).toFixed(0)}%)</span>
                    )}
                  </div>

                  {/* Reference toggle */}
                  <div
                    role="tablist"
                    aria-label="US reference comparison"
                    className="inline-flex rounded-sm border border-border bg-surface2 p-0.5"
                  >
                    <button
                      role="tab"
                      aria-selected={refMode === "mean"}
                      onClick={() => setRefMode("mean")}
                      className={`px-2.5 py-1 rounded-sm font-mono text-[10px] transition-colors ${
                        refMode === "mean"
                          ? "bg-warn/20 text-warn"
                          : "text-text-muted hover:text-text"
                      }`}
                      title="Compare against US Frey-Osborne mean across all ISCO groups"
                    >
                      US base mean
                    </button>
                    <button
                      role="tab"
                      aria-selected={refMode === "perIsco"}
                      onClick={() => setRefMode("perIsco")}
                      className={`px-2.5 py-1 rounded-sm font-mono text-[10px] transition-colors ${
                        refMode === "perIsco"
                          ? "bg-text-muted/25 text-text"
                          : "text-text-muted hover:text-text"
                      }`}
                      title="Compare each ISCO calibrated value against its own US per-ISCO base"
                    >
                      US per-ISCO
                    </button>
                  </div>

                  {/* Uncertainty toggle */}
                  <label
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border bg-surface2 hover:bg-surface2/70 cursor-pointer font-mono text-[10px] text-text"
                    title="Show ±range driven by Frey-Osborne SE, informality ±5pp, GDP/cap ±20%, lmic_calibration ±0.05"
                  >
                    <input
                      type="checkbox"
                      checked={showUncertainty}
                      onChange={(e) => setShowUncertainty(e.target.checked)}
                      className="accent-brand h-3 w-3"
                    />
                    Uncertainty ±{meanHalfWidthPp.toFixed(1)}pp
                  </label>

                  <div className="flex gap-1.5">
                    <button
                      onClick={exportChartPng}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border bg-surface2 hover:bg-surface2/70 hover:border-brand text-text font-mono text-[10px] transition-colors"
                      title="Download chart as PNG"
                    >
                      <Download size={11} /> PNG
                    </button>
                    <button
                      onClick={exportChartCsv}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border bg-surface2 hover:bg-surface2/70 hover:border-brand text-text font-mono text-[10px] transition-colors"
                      title="Download underlying values as CSV"
                    >
                      <Download size={11} /> CSV
                    </button>
                  </div>
                </div>
              </div>

              {/* Summary tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 my-4">
                <div className="surface2 rounded-sm p-3">
                  <div className="label-mono mb-0.5">Mean calibrated</div>
                  <div className="font-display text-2xl text-brand">{(meanCalibrated * 100).toFixed(0)}%</div>
                  <div className="text-[10px] text-text-muted font-mono">across 9 ISCO groups</div>
                </div>
                <div className="surface2 rounded-sm p-3">
                  <div className="label-mono mb-0.5">vs US base mean</div>
                  <div className="font-display text-2xl text-text">
                    {formatCalibrationDeltaPp(meanBase, meanCalibrated, 1).signed}
                  </div>
                  <div className="text-[10px] text-text-muted font-mono">
                    {formatCalibrationDeltaPp(meanBase, meanCalibrated, 1).direction} US baseline
                  </div>
                </div>
                <div className="surface2 rounded-sm p-3 border-l-2 border-danger">
                  <div className="label-mono mb-0.5 text-danger">Highest exposure</div>
                  <div className="font-mono text-sm text-text">ISCO-{highest.group.code}</div>
                  <div className="text-[11px] text-text-muted truncate">{highest.group.label}</div>
                  <div className="font-mono text-xs text-danger mt-0.5">
                    {(highest.calibrated * 100).toFixed(0)}% · {highest.band}
                  </div>
                  {(() => {
                    const r = bandRationale({ calibrated: highest.calibrated, low: highest.low, high: highest.high });
                    const tone = r.confidence === "high" ? "text-brand" : r.confidence === "medium" ? "text-warn" : "text-danger";
                    return (
                      <div className="mt-1.5 text-[10px] leading-snug text-text-muted">
                        <span className={`font-mono ${tone}`}>conf: {r.confidence}</span> · {r.text}
                        <div><BandLogicLink calibrated={highest.calibrated} low={highest.low} high={highest.high} /></div>
                      </div>
                    );
                  })()}
                </div>
                <div className="surface2 rounded-sm p-3 border-l-2 border-brand">
                  <div className="label-mono mb-0.5 text-brand">Most durable</div>
                  <div className="font-mono text-sm text-text">ISCO-{lowest.group.code}</div>
                  <div className="text-[11px] text-text-muted truncate">{lowest.group.label}</div>
                  <div className="font-mono text-xs text-brand mt-0.5">
                    {(lowest.calibrated * 100).toFixed(0)}% · {lowest.band}
                  </div>
                </div>
              </div>

              {/* Grouped bar chart */}
              <div ref={chartRef} className="bg-surface">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={iscoChartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 2" vertical={false} />
                    <XAxis
                      dataKey="code"
                      stroke="hsl(var(--text-muted))"
                      fontSize={10}
                      angle={-25}
                      textAnchor="end"
                      height={50}
                      interval={0}
                    />
                    <YAxis
                      stroke="hsl(var(--text-muted))"
                      fontSize={10}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload as typeof iscoChartData[number] | undefined;
                        return p ? `${p.code} · ${p.label}` : "";
                      }}
                      formatter={(v: number, name: string, p: { payload: typeof iscoChartData[number] }) => {
                        if (name === "calibrated") {
                          const range = showUncertainty
                            ? ` · range ${p.payload.low}–${p.payload.high}% (±${p.payload.halfWidthPp}pp)`
                            : "";
                          return [`${v}% (${p.payload.band})${range}`, `${country.code} calibrated`];
                        }
                        return [`${v}%`, "US base"];
                      }}
                    />
                    {refMode === "mean" && (
                      <ReferenceLine
                        y={meanBase * 100}
                        stroke="hsl(var(--warn))"
                        strokeDasharray="4 3"
                        label={{ value: `US mean ${(meanBase * 100).toFixed(0)}%`, position: "right", fill: "hsl(var(--warn))", fontSize: 10 }}
                      />
                    )}
                    {refMode === "perIsco" && (
                      <Bar dataKey="base" fill="hsl(var(--text-muted))" opacity={0.35} radius={[2, 2, 0, 0]} />
                    )}
                    <Bar dataKey="calibrated" radius={[2, 2, 0, 0]}>
                      {iscoChartData.map((d) => <Cell key={d.code} fill={bandFill(d.band)} />)}
                      {showUncertainty && (
                        <ErrorBar
                          dataKey="errBar"
                          width={6}
                          strokeWidth={1.25}
                          stroke="hsl(var(--text))"
                          opacity={0.85}
                          direction="y"
                        />
                      )}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 text-[11px] text-text-muted leading-relaxed">
                Calibration applied per country: <span className="font-mono text-text">base × lmic_calibration ({country.lmic_calibration.toFixed(2)}) × informality_dampener × wage_factor</span>.
                Live World Bank GDP/cap and informality values feed the wage and dampener terms when available.
              </div>
            </div>

            {/* Top ISCO table — pick which group drives the recommendations below */}
            <div className="surface rounded-sm p-5">
              <div className="flex items-baseline justify-between mb-1">
                <div className="label-mono text-text">View top ISCO groups · click to update recommendations</div>
                <div className="font-mono text-[10px] text-text-muted">Top {topIscoRows.length} by calibrated risk</div>
              </div>
              <p className="text-text-muted text-xs mb-3">
                Selecting a row swaps which ISCO major group the recommendations panel below is built for.
                Defaults to the highest-exposure group ({highest.group.code}).
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-mono text-text-muted uppercase tracking-wider border-b border-border">
                      <th className="text-left py-2 pl-2 pr-3 font-normal w-[68px]">ISCO</th>
                      <th className="text-left py-2 pr-3 font-normal">Major group</th>
                      <th className="text-right py-2 pr-3 font-normal w-[80px]">Calibrated</th>
                      <th className="text-right py-2 pr-3 font-normal w-[70px]">vs base</th>
                      <th className="text-left py-2 pr-3 font-normal w-[100px]">Band</th>
                      <th className="text-right py-2 pr-2 font-normal w-[70px]">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topIscoRows.map((r) => {
                      const isSelected = r.group.code === selectedIsco.group.code;
                      const bandTone =
                        r.band === "low" ? "text-brand" :
                        r.band === "moderate" ? "text-warn" :
                        r.band === "elevated" ? "text-orange-400" : "text-danger";
                      const bandBg =
                        r.band === "low" ? "bg-brand/15" :
                        r.band === "moderate" ? "bg-warn/15" :
                        r.band === "elevated" ? "bg-orange-400/15" : "bg-danger/15";
                      const deltaPp = (r.base - r.calibrated) * 100;
                      const sign = deltaPp > 0 ? "−" : deltaPp < 0 ? "+" : "±";
                      return (
                        <tr
                          key={r.group.code}
                          onClick={() => setSelectedIscoCode(r.group.code)}
                          className={cn(
                            "border-b border-border/50 cursor-pointer transition-colors",
                            isSelected ? "bg-brand/10 hover:bg-brand/15" : "hover:bg-surface2/60",
                          )}
                          aria-selected={isSelected}
                          title={`Use ISCO-${r.group.code} for the recommendations panel`}
                        >
                          <td className="py-2 pl-2 pr-3 font-mono text-xs">
                            <span className={isSelected ? "text-brand" : "text-text"}>
                              {isSelected ? "▸ " : ""}ISCO-{r.group.code}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-text">{r.group.label}</td>
                          <td className="py-2 pr-3 text-right font-mono text-text">
                            {(r.calibrated * 100).toFixed(0)}%
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-text-muted text-xs">
                            {sign}{Math.abs(deltaPp).toFixed(1)} pp
                          </td>
                          <td className="py-2 pr-3">
                            <span className={cn("pill text-[10px]", bandBg, bandTone)}>{r.band}</span>
                          </td>
                          <td className="py-2 pr-2 text-right font-mono text-[10px] text-text-muted">
                            {(r.low * 100).toFixed(0)}–{(r.high * 100).toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {selectedIscoCode && selectedIscoCode !== highest.group.code && (
                <button
                  onClick={() => setSelectedIscoCode(null)}
                  className="mt-3 font-mono text-[10px] text-text-muted hover:text-text underline underline-offset-2"
                >
                  reset to highest-exposure ({highest.group.code})
                </button>
              )}
            </div>

            <PolicyRecommendations highest={selectedIsco} countryName={country.name} />
            <CalibrationFactorsBreakdown />
            <CalibrationProvenance />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="Aptitude distribution (cohort skills)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={aptitudeDist}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 2" />
                    <XAxis dataKey="name" stroke="hsl(var(--text-muted))" fontSize={11} />
                    <YAxis stroke="hsl(var(--text-muted))" fontSize={10} />
                    <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: number, _n: string, p: { payload: { pct: number } }) => [`${v} (${p.payload.pct}%)`, "skills"]} />
                    <Bar dataKey="value" radius={[3,3,0,0]}>
                      {aptitudeDist.map((d) => <Cell key={d.name} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="surface rounded-sm p-5 overflow-x-auto">
                <div className="label-mono mb-3">Skill ↔ sector match — top 8 skills × top 3 growth sectors</div>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left label-mono pb-2">Skill</th>
                      {heat[0]?.cells.map(c => <th key={c.sector} className="text-left label-mono pb-2 px-3">{c.sector}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {heat.map(row => (
                      <tr key={row.skill} className="border-t border-border">
                        <td className="py-2 pr-4 text-sm">{row.skill}</td>
                        {row.cells.map(c => (
                          <td key={c.sector} className="py-2 px-3"><span className={`pill ${heatColor(c.score)}`}>{c.score}</span></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Policy signals */}
            <div className="surface rounded-sm p-5 border-l-2 border-brand">
              <div className="flex items-center justify-between mb-3">
                <div className="label-mono text-brand">AI-generated policy signals</div>
                <div className="label-mono">{signalsTime} · config v{country.code}</div>
              </div>
              {signalsLoading ? (
                <div className="text-text-muted text-sm">Generating…</div>
              ) : (
                <ul className="space-y-2 list-disc pl-5 text-sm text-text">
                  {signals.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
              <DataProvenance />
            </div>

            <button onClick={downloadCsv} className="bg-brand text-bg px-5 py-2.5 rounded-sm text-sm font-medium flex items-center gap-2">
              <Download size={14}/> Download aggregate report (CSV)
            </button>
          </TabsContent>

          {/* Employer talent pool moved to /app/talent (Talent Pool sidebar nav). */}
        </Tabs>
      </div>
    </AppLayout>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: "teal" | "warn" }) {
  const cls = accent === "teal" ? "text-teal" : accent === "warn" ? "text-warn" : "text-text";
  return (
    <div className="surface rounded-sm p-3">
      <div className="label-mono">{label}</div>
      <div className={`data-num text-xl mt-1.5 ${cls}`}>{value}</div>
    </div>
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
