import { ExternalLink, BookOpen, Database, Layers } from "lucide-react";
import { useActiveCountry } from "@/store/useAppStore";

/**
 * Provenance footnote for the calibrated automation-risk calculation.
 * Lists the three source families that feed:
 *   base × lmic_calibration × informality_dampener × wage_factor
 *
 *   1. Frey-Osborne (2013) — base US automation probabilities per ISCO group
 *   2. WDI / World Bank — informality %, GDP per capita (live, fallback when missing)
 *   3. ILOSTAT — routine-task indices & ISCO-08 occupational structure
 */
export default function CalibrationProvenance() {
  const c = useActiveCountry();
  const live = (c as any)._live as boolean;
  const sourceYear = (c as any)._sourceYear as number | null;
  const fetchedAt = (c as any)._fetchedAt as string | null | undefined;

  const informalLive = c.informal_employment_pct !== null && c.informal_employment_pct !== undefined;
  const gdpLive = (c as any).gdp_per_capita_usd !== null && (c as any).gdp_per_capita_usd !== undefined;

  return (
    <div className="surface2 rounded-sm p-4 mt-3 border-l-2 border-text-muted/40">
      <div className="flex items-baseline justify-between mb-2">
        <div className="label-mono text-text-muted flex items-center gap-1.5">
          <Database size={11} /> Data provenance · CALIBRATION DELTA
        </div>
        <div className="font-mono text-[10px] text-text-muted">{c.name} · {c.code}</div>
      </div>

      <div className="font-mono text-[11px] text-text mb-3">
        base × lmic_calibration ({c.lmic_calibration.toFixed(2)}) × informality_dampener × wage_factor
      </div>

      <ul className="space-y-2 text-[11px]">
        {/* Frey-Osborne */}
        <li className="flex items-start gap-2">
          <BookOpen size={11} className="text-warn mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-warn">Frey & Osborne (2013)</div>
            <div className="text-text-muted">
              <em>The Future of Employment</em> — US automation probabilities per ISCO-08 major group (the <code className="font-mono text-text">base</code> term).
            </div>
          </div>
          <a
            href="https://www.oxfordmartin.ox.ac.uk/downloads/academic/The_Future_of_Employment.pdf"
            target="_blank" rel="noreferrer"
            className="text-text-muted hover:text-brand shrink-0"
            title="Open paper"
          >
            <ExternalLink size={11} />
          </a>
        </li>

        {/* WDI · informality */}
        <li className="flex items-start gap-2">
          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${informalLive ? "bg-teal" : "bg-warn/60"}`} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-teal">
              WDI · SL.ISV.IFRM.ZS
              <span className="text-text-muted ml-1.5">
                {informalLive ? `(${c.informal_employment_pct}% live)` : "(fallback estimate)"}
              </span>
            </div>
            <div className="text-text-muted">
              Informal employment, non-agricultural — feeds the <code className="font-mono text-text">informality_dampener</code>.
            </div>
          </div>
          <a
            href="https://data.worldbank.org/indicator/SL.ISV.IFRM.ZS"
            target="_blank" rel="noreferrer"
            className="text-text-muted hover:text-brand shrink-0"
          >
            <ExternalLink size={11} />
          </a>
        </li>

        {/* WDI · GDP per capita */}
        <li className="flex items-start gap-2">
          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${gdpLive ? "bg-teal" : "bg-warn/60"}`} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-teal">
              WDI · NY.GDP.PCAP.CD
              <span className="text-text-muted ml-1.5">
                {gdpLive ? `($${Math.round((c as any).gdp_per_capita_usd).toLocaleString()} live)` : "(fallback estimate)"}
              </span>
            </div>
            <div className="text-text-muted">
              GDP per capita (current US$) — proxies the wage/automation cost ratio in <code className="font-mono text-text">wage_factor</code>.
            </div>
          </div>
          <a
            href="https://data.worldbank.org/indicator/NY.GDP.PCAP.CD"
            target="_blank" rel="noreferrer"
            className="text-text-muted hover:text-brand shrink-0"
          >
            <ExternalLink size={11} />
          </a>
        </li>

        {/* ILOSTAT */}
        <li className="flex items-start gap-2">
          <Layers size={11} className="text-brand mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-brand">ILOSTAT · EMP_TEMP_SEX_OCU_NB</div>
            <div className="text-text-muted">
              Employment by ISCO-08 major group & routine-task indices — defines the 9-group taxonomy and informs routine-share weights.
            </div>
          </div>
          <a
            href="https://ilostat.ilo.org/topics/employment/"
            target="_blank" rel="noreferrer"
            className="text-text-muted hover:text-brand shrink-0"
          >
            <ExternalLink size={11} />
          </a>
        </li>
      </ul>

      <div className="mt-3 pt-2 border-t border-border/60 text-[10px] font-mono text-text-muted leading-relaxed">
        WDI values fetched live from the World Bank API (cached 7 days).
        {sourceYear && <> · source_year <span className="text-text">{sourceYear}</span></>}
        {fetchedAt && <> · fetched <span className="text-text">{new Date(fetchedAt).toISOString().slice(0, 10)}</span></>}
        {!live && <> · <span className="text-warn">using fallback estimates</span></>}
      </div>
    </div>
  );
}
