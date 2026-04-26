import { useState } from "react";
import AppLayout, { PageHeader } from "@/components/AppLayout";
import { useAppStore, useActiveCountry } from "@/store/useAppStore";
import { CountryKey, countryConfigs, countryKeys } from "@/data/countryConfigs";
import DataProvenance from "@/components/DataProvenance";

export default function CountryConfigPage() {
  const setCountry = useAppStore((s) => s.setCountry);
  const activeKey = useAppStore((s) => s.country);
  const c = useActiveCountry();
  const [compare, setCompare] = useState(false);
  const otherDefault = (countryKeys.find((k) => k !== activeKey) ?? activeKey) as CountryKey;
  const [compareKey, setCompareKey] = useState<CountryKey>(otherDefault);
  const c2 = countryConfigs[compareKey];

  return (
    <AppLayout>
      <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-6xl">
        <PageHeader
          eyebrow=""
          title="Country View"
          sub="Switch markets, compare calibration parameters, view data sources"
        />

        <div className="surface rounded-sm p-4 mb-4 flex flex-wrap items-center gap-3">
          <label className="label-mono">Active country</label>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <select
              value={activeKey}
              onChange={(e) => setCountry(e.target.value as CountryKey)}
              className="w-full appearance-none surface2 rounded-sm border border-border text-text text-sm font-mono px-3 py-2 pr-8 outline-none focus:border-brand cursor-pointer hover:border-text-muted"
            >
              {countryKeys.map((k) => (
                <option key={k} value={k} className="bg-surface text-text">
                  {countryConfigs[k as CountryKey].code} — {countryConfigs[k as CountryKey].name} ·{" "}
                  {countryConfigs[k as CountryKey].region}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-xs">
              ▼
            </span>
          </div>
          <span className="label-mono">updates all pages instantly</span>
        </div>


        <div className="surface rounded-sm p-5 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="label-mono">
              {compare ? `Side-by-side · ${c.code} vs ${c2.code}` : `Active country — ${c.name} (${c.code})`}
            </div>
            <button
              onClick={() => setCompare((v) => !v)}
              role="switch"
              aria-checked={compare}
              className="flex items-center gap-2 text-xs font-mono text-text-muted hover:text-text"
            >
              <span>Compare countries</span>
              <span
                className={`relative inline-block w-9 h-5 rounded-full transition-colors ${compare ? "bg-brand" : "bg-surface2 border border-border"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-bg transition-transform ${compare ? "translate-x-4" : ""}`}
                />
              </span>
            </button>
          </div>

          {compare && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="label-mono mb-1 block">Country A</label>
                <select
                  value={activeKey}
                  onChange={(e) => setCountry(e.target.value as CountryKey)}
                  className="w-full appearance-none surface2 rounded-sm border border-border text-text text-xs font-mono px-2 py-2 outline-none focus:border-brand cursor-pointer"
                >
                  {countryKeys.map((k) => (
                    <option key={k} value={k} className="bg-surface text-text">
                      {countryConfigs[k as CountryKey].code} — {countryConfigs[k as CountryKey].name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-mono mb-1 block">Country B</label>
                <select
                  value={compareKey}
                  onChange={(e) => setCompareKey(e.target.value as CountryKey)}
                  className="w-full appearance-none surface2 rounded-sm border border-border text-text text-xs font-mono px-2 py-2 outline-none focus:border-brand cursor-pointer"
                >
                  {countryKeys.map((k) => (
                    <option key={k} value={k} className="bg-surface text-text">
                      {countryConfigs[k as CountryKey].code} — {countryConfigs[k as CountryKey].name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {compare ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="text-left">
                    <th className="label-mono pb-2 pr-4">Metric</th>
                    <th className="label-mono pb-2 pr-4">
                      {c.code} · {c.name}
                    </th>
                    <th className="label-mono pb-2 pr-4">
                      {c2.code} · {c2.name}
                    </th>
                    <th className="label-mono pb-2">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <CompareRow k="region" a={c.region} b={c2.region} />
                  <CompareRow
                    k="wage_floor_usd"
                    a={`$${c.wage_floor_usd}/day`}
                    b={`$${c2.wage_floor_usd}/day`}
                    delta={c2.wage_floor_usd - c.wage_floor_usd}
                    unit="$"
                    higherBetter
                  />
                  <CompareRow
                    k="formality_rate"
                    a={`${(c.formality_rate * 100).toFixed(0)}%`}
                    b={`${(c2.formality_rate * 100).toFixed(0)}%`}
                    delta={(c2.formality_rate - c.formality_rate) * 100}
                    unit="pp"
                    higherBetter
                  />
                  <CompareRow
                    k="lmic_calibration"
                    a={c.lmic_calibration.toString()}
                    b={c2.lmic_calibration.toString()}
                    delta={c2.lmic_calibration - c.lmic_calibration}
                  />
                  <CompareRow
                    k="youth_unemployment_pct"
                    a={`${c.youth_unemployment_pct}%`}
                    b={`${c2.youth_unemployment_pct}%`}
                    delta={c2.youth_unemployment_pct - c.youth_unemployment_pct}
                    unit="pp"
                    higherBetter={false}
                  />
                  <CompareRow
                    k="informal_employment_pct"
                    a={`${c.informal_employment_pct}%`}
                    b={`${c2.informal_employment_pct}%`}
                    delta={c2.informal_employment_pct - c.informal_employment_pct}
                    unit="pp"
                    higherBetter={false}
                  />
                  <CompareRow
                    k="secondary_2024"
                    a={`${c.wittgenstein_secondary_2024}%`}
                    b={`${c2.wittgenstein_secondary_2024}%`}
                    delta={c2.wittgenstein_secondary_2024 - c.wittgenstein_secondary_2024}
                    unit="pp"
                    higherBetter
                  />
                  <CompareRow
                    k="secondary_2035"
                    a={`${c.wittgenstein_secondary_2035}%`}
                    b={`${c2.wittgenstein_secondary_2035}%`}
                    delta={c2.wittgenstein_secondary_2035 - c.wittgenstein_secondary_2035}
                    unit="pp"
                    higherBetter
                  />
                  <CompareRow k="top_sectors" a={c.top_sectors.join(", ")} b={c2.top_sectors.join(", ")} />
                  <CompareRow k="data_source" a={c.data_source} b={c2.data_source} />
                </tbody>
              </table>
              <div className="mt-4 grid md:grid-cols-2 gap-3 text-xs text-text-muted">
                <div className="surface2 rounded-sm p-3">
                  <span className="label-mono block mb-1 text-text">{c.code} rationale</span>
                  {c.calibration_rationale}
                </div>
                <div className="surface2 rounded-sm p-3">
                  <span className="label-mono block mb-1 text-text">{c2.code} rationale</span>
                  {c2.calibration_rationale}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-sm font-mono">
                <Line k="region" v={c.region} />
                <Line k="wage_floor_usd" v={`$${c.wage_floor_usd}/day`} />
                <Line k="formality_rate" v={`${(c.formality_rate * 100).toFixed(0)}%`} />
                <Line k="lmic_calibration" v={c.lmic_calibration.toString()} />
                <Line
                  k="youth_unemployment_pct"
                  v={`${typeof c.youth_unemployment_pct === "number" ? c.youth_unemployment_pct.toFixed(1) : c.youth_unemployment_pct}%`}
                />
                <Line
                  k="informal_employment_pct"
                  v={`${typeof c.informal_employment_pct === "number" ? c.informal_employment_pct.toFixed(1) : c.informal_employment_pct}%`}
                />
                {(c as any).gdp_per_capita_usd != null && (
                  <Line k="gdp_per_capita_usd" v={`$${Math.round((c as any).gdp_per_capita_usd).toLocaleString()}`} />
                )}
                {(c as any).labor_force_participation_pct != null && (
                  <Line
                    k="labor_force_participation_pct"
                    v={`${(c as any).labor_force_participation_pct.toFixed(1)}%`}
                  />
                )}
                <Line k="wittgenstein_secondary_2024" v={`${c.wittgenstein_secondary_2024}%`} />
                <Line k="wittgenstein_secondary_2035" v={`${c.wittgenstein_secondary_2035}%`} />
                <Line
                  k="data_source"
                  v={(c as any)._live ? `World Bank · ${(c as any)._sourceYear ?? "live"}` : c.data_source}
                />
                <Line k="top_sectors" v={c.top_sectors.join(", ")} />
              </div>
              <div className="mt-3 text-sm text-text-muted">{c.calibration_rationale}</div>
              <DataProvenance />
            </>
          )}
        </div>

        {/* Comparison table */}
        <div className="surface rounded-sm p-5 mb-8 overflow-x-auto">
          <div className="label-mono mb-3">Cross-country comparison</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {["Country", "Wage floor", "Calibration", "Youth unemploy.", "Informal %", "Top growth sector"].map(
                  (h) => (
                    <th key={h} className="label-mono pb-2 pr-4">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {countryKeys.map((k) => {
                const cc = countryConfigs[k as CountryKey];
                const top = Object.entries(cc.sector_growth).sort((a, b) => b[1] - a[1])[0];
                return (
                  <tr key={k} className="border-t border-border">
                    <td className="py-2 pr-4">
                      {cc.name} <span className="font-mono text-xs text-text-muted">{cc.code}</span>
                    </td>
                    <td className="py-2 pr-4 font-mono">${cc.wage_floor_usd.toFixed(2)}</td>
                    <td className="py-2 pr-4 font-mono">{cc.lmic_calibration}</td>
                    <td className="py-2 pr-4 font-mono">{cc.youth_unemployment_pct}%</td>
                    <td className="py-2 pr-4 font-mono">{cc.informal_employment_pct}%</td>
                    <td className="py-2 pr-4 font-mono">
                      {top[0]} (+{top[1]}%/yr)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="surface rounded-sm p-5 mb-8 border-l-2 border-teal">
          <div className="label-mono mb-2 text-teal">Localizability</div>
          <p className="text-sm text-text">
            Any of these parameters can be updated without changing the application code. In production, plug in
            country-specific ILOSTAT API calls, local education taxonomies, and regional automation exposure datasets.
          </p>
        </div>

        <div className="surface rounded-sm p-5 mb-8">
          <div className="label-mono mb-3">Data sources</div>
          <ul className="text-sm space-y-1">
            <li>
              <a className="text-brand hover:underline" href="https://ilostat.ilo.org" target="_blank" rel="noreferrer">
                ILOSTAT — ilostat.ilo.org
              </a>
            </li>
            <li>
              <a
                className="text-brand hover:underline"
                href="https://data.worldbank.org"
                target="_blank"
                rel="noreferrer"
              >
                World Bank WDI — data.worldbank.org
              </a>
            </li>
            <li>Frey & Osborne (2013) — Automation probability scores by occupation</li>
            <li>
              <a
                className="text-brand hover:underline"
                href="https://wittgensteincentre.org/dataexplorer"
                target="_blank"
                rel="noreferrer"
              >
                Wittgenstein Centre — wittgensteincentre.org/dataexplorer
              </a>
            </li>
            <li>
              <a className="text-brand hover:underline" href="https://isco.ilo.org" target="_blank" rel="noreferrer">
                ILO ISCO-08 — isco.ilo.org
              </a>
            </li>
            <li>
              <a
                className="text-brand hover:underline"
                href="https://esco.ec.europa.eu"
                target="_blank"
                rel="noreferrer"
              >
                ESCO — esco.ec.europa.eu
              </a>
            </li>
            <li>
              <a
                className="text-brand hover:underline"
                href="https://data.worldbank.org/data360"
                target="_blank"
                rel="noreferrer"
              >
                Data360 / World Bank — data.worldbank.org/data360
              </a>
            </li>
          </ul>
        </div>

        <div className="surface rounded-sm p-5">
          <div className="label-mono mb-2">AI provider</div>
          <p className="text-sm text-text-muted">
            Powered by <span className="text-text">Lovable AI</span> — no API key required. Skill mapping and policy
            signals run server-side via the <span className="font-mono text-text">ai-skills-mapper</span> edge function.
          </p>
          <div className="label-mono mt-2 text-teal">● gateway active</div>
        </div>
      </div>
    </AppLayout>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/60 py-1.5">
      <span className="text-text-muted">{k}</span>
      <span className="text-text">{v}</span>
    </div>
  );
}

function CompareRow({
  k,
  a,
  b,
  delta,
  unit,
  higherBetter,
}: {
  k: string;
  a: string;
  b: string;
  delta?: number;
  unit?: string;
  higherBetter?: boolean;
}) {
  let deltaEl: React.ReactNode = <span className="text-text-muted">—</span>;
  if (typeof delta === "number" && !isNaN(delta)) {
    const sign = delta > 0 ? "+" : "";
    const good = higherBetter === undefined ? null : higherBetter ? delta > 0 : delta < 0;
    const cls = good === null ? "text-text-muted" : good ? "text-teal" : delta === 0 ? "text-text-muted" : "text-warn";
    deltaEl = (
      <span className={cls}>
        {sign}
        {Math.abs(delta) < 10 ? delta.toFixed(2) : delta.toFixed(1)}
        {unit ?? ""}
      </span>
    );
  }
  return (
    <tr className="border-t border-border/60">
      <td className="py-2 pr-4 text-text-muted">{k}</td>
      <td className="py-2 pr-4">{a}</td>
      <td className="py-2 pr-4">{b}</td>
      <td className="py-2">{deltaEl}</td>
    </tr>
  );
}
