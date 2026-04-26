import { useMemo } from "react";
import { TrendingUp, Check, AlertCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { ClaudeProfile } from "@/store/useAppStore";
import type { CountryConfig } from "@/data/countryConfigs";
import { getSectorSkills, scoreSectorFit } from "@/data/sectorSkills";

interface Props {
  profile: ClaudeProfile | null;
  country: CountryConfig;
  /** Optional Profile Input skills/languages, used when no mapped profile exists yet. */
  profileSkills?: string[];
  languages?: string[];
  /** Optional Grow self-rated skills (category, rating>=3 are added to user skills). */
  growRatings?: { category: string; rating: number }[];
  /** Optional Grow aptitude results; proficient/advanced attempts are treated as demonstrated skills. */
  growAttempts?: { category: string; level: string; skill_input?: string | null }[];
}

/**
 * SectorOpportunityMap
 * Maps the user's Skills Signal output to the active country's growth
 * sectors. For each sector we show:
 *   - annual growth %
 *   - required skill list (matched ✓ / missing ⚠)
 *   - fit score weighted 70/30 (required/adjacent)
 *   - what to learn next (top 3 missing required skills)
 */
export default function SectorOpportunityMap({ profile, country, profileSkills = [], languages = [], growRatings = [], growAttempts = [] }: Props) {
  const userSkills = useMemo(() => {
    const set = new Set<string>();
    profile?.durable_skills?.forEach((s) => set.add(s));
    profile?.esco_skills?.forEach((s) => set.add(s.label));
    profileSkills.forEach((s) => set.add(s));
    languages.forEach((s) => set.add(s));
    growRatings.filter((r) => r.rating >= 3).forEach((r) => set.add(r.category));
    growAttempts
      .filter((a) => a.level === "Proficient" || a.level === "Advanced")
      .forEach((a) => set.add(a.skill_input?.trim() || a.category));
    return Array.from(set);
  }, [profile, profileSkills, languages, growRatings, growAttempts]);

  const sectors = useMemo(() => {
    const entries = Object.entries(country.sector_growth)
      .sort((a, b) => b[1] - a[1])
      .map(([name, growth]) => {
        const skills = getSectorSkills(name);
        const score = scoreSectorFit(userSkills, skills);
        return { name, growth, skills, ...score };
      });
    return entries;
  }, [country.sector_growth, userSkills]);

  const maxGrowth = Math.max(...sectors.map((s) => s.growth), 1);

  return (
    <div className="surface rounded-sm p-5 mb-8 border-l-2 border-brand">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={14} className="text-brand" />
        <div className="label-mono">Your skills × {country.name} growth sectors</div>
        <span className="ml-auto font-mono text-[10px] text-text-muted">
          {userSkills.length} skill{userSkills.length === 1 ? "" : "s"} from your{" "}
          <Link to="/app/skills" className="text-brand hover:underline">Skills Signal</Link>
        </span>
      </div>
      <p className="text-text-muted text-xs mb-5">
        For every growth sector in {country.name}, here's the demanded skill set, what you already
        bring, and the concrete gaps to close before you can compete.
      </p>

      <div className="space-y-4">
        {sectors.map((s) => {
          const fitTone =
            s.fit >= 60 ? "text-teal" : s.fit >= 30 ? "text-brand" : "text-warn";
          const fitBar =
            s.fit >= 60 ? "bg-teal" : s.fit >= 30 ? "bg-brand" : "bg-warn";

          return (
            <div key={s.name} className="surface2 rounded-sm p-4">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h4 className="font-display text-lg text-text" style={{ fontWeight: 600 }}>
                      {s.name}
                    </h4>
                    <span className="font-mono text-xs text-teal inline-flex items-center gap-1">
                      <TrendingUp size={10} /> +{s.growth}%/yr
                    </span>
                  </div>
                  {s.skills.note && (
                    <p className="text-xs text-text-muted mt-1 leading-snug">{s.skills.note}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className={`data-num text-2xl ${fitTone}`}>{s.fit}%</div>
                  <div className="label-mono">your fit</div>
                </div>
              </div>

              {/* Growth bar relative to the top sector for this country */}
              <div className="h-1 bg-bg rounded-full overflow-hidden mb-4">
                <div className="h-full bg-teal/60" style={{ width: `${(s.growth / maxGrowth) * 100}%` }} />
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                {/* Skills you bring */}
                <div>
                  <div className="label-mono mb-1.5 flex items-center gap-1">
                    <Check size={10} className="text-teal" /> Skills you bring ({s.requiredMatched.length}/{s.skills.required.length})
                  </div>
                  {s.requiredMatched.length === 0 && s.adjacentMatched.length === 0 ? (
                    <p className="text-[11px] text-text-muted italic">
                      No direct matches yet. Start with one of the gap skills below.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {s.requiredMatched.map((sk) => (
                        <span key={sk} className="pill bg-teal/15 text-teal">{sk}</span>
                      ))}
                      {s.adjacentMatched.map((sk) => (
                        <span key={sk} className="pill bg-brand/10 text-brand">{sk} <span className="opacity-60">·adj</span></span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Gaps to close */}
                <div>
                  <div className="label-mono mb-1.5 flex items-center gap-1">
                    <AlertCircle size={10} className="text-warn" /> Skills needed ({s.requiredMissing.length})
                  </div>
                  {s.requiredMissing.length === 0 ? (
                    <p className="text-[11px] text-teal italic">All required skills covered — focus on certifications & local network.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {s.requiredMissing.map((sk) => (
                        <span key={sk} className="pill bg-warn/15 text-warn">{sk}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {s.requiredMissing.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="label-mono text-[10px] mb-1">Next step</div>
                  <p className="text-xs text-text">
                    Prioritise <span className="text-brand">{s.requiredMissing.slice(0, 2).join(" + ")}</span>
                    {" "}— closing these would lift your {s.name} fit toward{" "}
                    <span className="text-teal">
                      ~{Math.min(100, s.fit + Math.round((s.requiredMissing.slice(0, 2).length / s.skills.required.length) * 70))}%
                    </span>.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
