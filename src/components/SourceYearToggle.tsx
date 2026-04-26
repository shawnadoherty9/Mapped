import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useCountryStatsAtYear } from "@/hooks/useWorldBankStats";

const YEAR_OPTIONS = [2015, 2018, 2020, 2022, 2024];

/**
 * Compact segmented control that toggles the calibration between:
 *  - "Latest available" — most recent non-null WB observation per indicator (cached)
 *  - "Exact year"       — values pinned to a specific year, fetched live from World Bank
 *
 * State lives in the global store so the choice is shared across pages.
 */
export default function SourceYearToggle({ compact = false }: { compact?: boolean }) {
  const country = useAppStore((s) => s.country);
  const mode = useAppStore((s) => s.sourceYearMode);
  const setMode = useAppStore((s) => s.setSourceYearMode);
  const exactYear = useAppStore((s) => s.exactYear);
  const setExactYear = useAppStore((s) => s.setExactYear);

  // Surface loading state from the same hook the active country uses
  const { loading } = useCountryStatsAtYear(country, mode === "exact" ? exactYear : null);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 surface2 rounded-sm p-1 border border-border",
        compact ? "text-[10px]" : "text-[11px]",
      )}
      role="group"
      aria-label="Source-year mode"
    >
      <button
        type="button"
        onClick={() => setMode("latest")}
        className={cn(
          "px-2 py-1 rounded-sm font-mono transition-colors",
          mode === "latest"
            ? "bg-brand text-brand-foreground"
            : "text-text-muted hover:text-text",
        )}
        title="Use the most recent non-null WB observation per indicator (cached)"
      >
        latest
      </button>
      <button
        type="button"
        onClick={() => setMode("exact")}
        className={cn(
          "px-2 py-1 rounded-sm font-mono transition-colors",
          mode === "exact"
            ? "bg-brand text-brand-foreground"
            : "text-text-muted hover:text-text",
        )}
        title="Pin all WB indicators to a specific reporting year (live fetch)"
      >
        exact year
      </button>

      {mode === "exact" && (
        <>
          <select
            value={exactYear}
            onChange={(e) => setExactYear(Number(e.target.value))}
            className="bg-surface text-text font-mono px-1.5 py-1 rounded-sm border border-border focus:outline-none focus:border-brand"
            aria-label="Exact source year"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {loading && (
            <Loader2 className="w-3 h-3 animate-spin text-text-muted" aria-label="Fetching" />
          )}
        </>
      )}
    </div>
  );
}
