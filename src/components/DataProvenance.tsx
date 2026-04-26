import { Database, ExternalLink, Info } from "lucide-react";
import { useActiveCountry } from "@/store/useAppStore";
import { useState } from "react";

// World Bank indicator codes used by /functions/v1/worldbank-stats
const INDICATORS: { key: string; code: string; label: string; wbUrl: string }[] = [
  { key: "youth_unemployment_pct",        code: "SL.UEM.1524.ZS",  label: "Youth unemployment (15–24)",         wbUrl: "https://data.worldbank.org/indicator/SL.UEM.1524.ZS" },
  { key: "informal_employment_pct",       code: "SL.ISV.IFRM.ZS",  label: "Informal employment (non-agri)",      wbUrl: "https://data.worldbank.org/indicator/SL.ISV.IFRM.ZS" },
  { key: "gdp_per_capita_usd",            code: "NY.GDP.PCAP.CD",  label: "GDP per capita (current US$)",        wbUrl: "https://data.worldbank.org/indicator/NY.GDP.PCAP.CD" },
  { key: "secondary_enrollment_pct",      code: "SE.SEC.NENR",      label: "Secondary school enrollment (% net)", wbUrl: "https://data.worldbank.org/indicator/SE.SEC.NENR" },
  { key: "labor_force_participation_pct", code: "SL.TLF.CACT.ZS",  label: "Labor force participation (15+)",     wbUrl: "https://data.worldbank.org/indicator/SL.TLF.CACT.ZS" },
];

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

interface Props {
  /** Optional: only show indicators relevant to this card. Defaults to all 5. */
  indicators?: string[];
  /** Compact one-liner instead of expanded card. */
  compact?: boolean;
}

export default function DataProvenance({ indicators, compact }: Props) {
  const c = useActiveCountry();
  const live = (c as any)._live as boolean;
  const sourceYear = (c as any)._sourceYear as number | null;
  const fetchedAt = (c as any)._fetchedAt as string | null | undefined;
  const [open, setOpen] = useState(false);

  const used = INDICATORS.filter((i) => !indicators || indicators.includes(i.key));

  // Determine which indicators actually have a live value for this country
  const indicatorState = used.map((i) => {
    const v = (c as any)[i.key];
    return { ...i, hasValue: v !== null && v !== undefined };
  });

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
        <Database size={10} className={live ? "text-teal" : "text-text-muted"} />
        <span>
          {live ? `World Bank · ${sourceYear ?? "live"}` : "Calibrated estimate"}
          {fetchedAt && ` · refreshed ${timeAgo(fetchedAt)}`}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left label-mono hover:text-brand transition-colors"
      >
        <Database size={11} className={live ? "text-teal" : "text-text-muted"} />
        <span>Data provenance</span>
        <span className="ml-auto font-mono text-[10px] text-text-muted">
          {live ? `World Bank · ${sourceYear ?? "live"}` : "Calibrated"}
          {fetchedAt && ` · ${timeAgo(fetchedAt)}`}
        </span>
        <span className="text-[10px] text-text-muted">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2.5 text-[11px]">
          <div className="grid grid-cols-2 gap-2 font-mono">
            <div className="surface2 rounded-sm p-2">
              <div className="label-mono mb-0.5">source_year</div>
              <div className={live ? "text-teal" : "text-text-muted"}>{sourceYear ?? "—"}</div>
            </div>
            <div className="surface2 rounded-sm p-2">
              <div className="label-mono mb-0.5">fetched_at</div>
              <div className="text-text-muted">
                {fetchedAt ? new Date(fetchedAt).toISOString().slice(0, 16).replace("T", " ") : "—"}
              </div>
            </div>
          </div>

          <div>
            <div className="label-mono mb-1.5 flex items-center gap-1">
              <Info size={10} /> World Bank indicators used
            </div>
            <ul className="space-y-1">
              {indicatorState.map((i) => (
                <li key={i.code} className="flex items-center gap-2 surface2 rounded-sm px-2 py-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${i.hasValue ? "bg-teal" : "bg-warn/60"}`}
                    title={i.hasValue ? "Live value" : "Fallback (no WB data)"}
                  />
                  <span className="font-mono text-teal text-[10px] whitespace-nowrap">{i.code}</span>
                  <span className="text-text-muted truncate flex-1">{i.label}</span>
                  <a
                    href={i.wbUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-text-muted hover:text-brand"
                    title="Open on data.worldbank.org"
                  >
                    <ExternalLink size={10} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-[10px] text-text-muted leading-relaxed">
            Live indicators are pulled from the public World Bank API and cached for 7 days.
            Fields without recent data fall back to the calibrated estimate baked into the model.
          </div>
        </div>
      )}
    </div>
  );
}
