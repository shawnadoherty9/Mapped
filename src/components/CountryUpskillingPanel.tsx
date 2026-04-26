import { useMemo } from "react";
import { Compass, GraduationCap, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { SkillAssessment, ClaudeProfile } from "@/store/useAppStore";

interface CountryLite {
  name: string;
  code: string;
  top_sectors: string[];
  opportunity_types: string[];
  wage_floor_usd: number;
}

interface Props {
  assessments: SkillAssessment[];
  profile: ClaudeProfile;
  country: CountryLite;
}

const APT_SCORE = { Novice: 1, Proficient: 2, Advanced: 3 } as const;
const RES_SCORE = { Low: 1, Medium: 2, High: 3 } as const;

/**
 * Job-seeker dashboard panel: current strengths, skill gaps, and
 * recommended upskilling paths, contextualised to the selected country's
 * top sectors and opportunity types.
 */
export default function CountryUpskillingPanel({ assessments, profile, country }: Props) {
  const { strengths, gaps, recommendations } = useMemo(() => {
    // Strengths: assessments rated Advanced/Proficient with Medium+ AI resilience
    const ranked = [...assessments]
      .map((a) => ({
        ...a,
        composite: APT_SCORE[a.aptitude] * 0.6 + RES_SCORE[a.ai_resilience] * 0.4,
      }))
      .sort((a, b) => b.composite - a.composite);

    const strengths = ranked.filter((a) => a.composite >= 2.0).slice(0, 5);
    const gaps = [...ranked]
      .filter((a) => a.composite < 2.0 || a.ai_resilience === "Low")
      .sort((a, b) => a.composite - b.composite)
      .slice(0, 5);

    // Untested adjacent skills are also gaps
    const tested = new Set(assessments.map((a) => a.skill.toLowerCase()));
    const untestedAdjacent = profile.adjacent_skills
      .filter((s) => !tested.has(s.toLowerCase()))
      .slice(0, 4);

    // Recommendations: blend each gap (or untested adjacent) with country sectors + pathways
    const sectors = country.top_sectors;
    const pathways = country.opportunity_types;
    const seeds: { skill: string; reason: string }[] = [
      ...gaps.map((g) => ({
        skill: g.skill,
        reason: g.ai_resilience === "Low"
          ? `Low AI resilience — pair with human-judgment work`
          : `${g.aptitude} aptitude — strengthen toward Advanced`,
      })),
      ...untestedAdjacent.map((s) => ({ skill: s, reason: "Adjacent skill from your roadmap" })),
    ];

    const recommendations = seeds.slice(0, 6).map((seed, i) => {
      const sector = sectors[i % sectors.length];
      const pathway = pathways[i % pathways.length];
      return {
        skill: seed.skill,
        reason: seed.reason,
        sector,
        pathway,
      };
    });

    return { strengths, gaps, recommendations };
  }, [assessments, profile, country]);

  const empty = assessments.length === 0;

  return (
    <div className="surface rounded-sm p-5 mb-8 border-l-2 border-teal">
      <div className="flex items-center gap-2 mb-1">
        <Compass size={14} className="text-teal" />
        <div className="label-mono">Job seeker · Country-tailored upskilling</div>
        <span className="ml-auto font-mono text-[10px] text-text-muted">
          {country.name} ({country.code})
        </span>
      </div>
      <p className="text-text-muted text-xs mb-5">
        Strengths, gaps, and recommended pathways drawn from your assessments and
        the labor-market signals for {country.name}.
      </p>

      {empty ? (
        <div className="surface2 rounded-sm p-4 text-sm text-text-muted">
          Run a skill assessment to see your country-specific strengths, gaps and upskilling paths.
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Strengths */}
          <Column
            icon={<TrendingUp size={12} className="text-teal" />}
            title="Current strengths"
            tone="teal"
            empty="No clear strengths yet — keep assessing skills."
          >
            {strengths.map((s) => (
              <li key={s.skill} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="text-text truncate">{s.skill}</div>
                  <div className="text-text-muted text-[11px] font-mono">
                    {s.aptitude} · AI {s.ai_resilience}
                  </div>
                </div>
                <span className="pill bg-teal/15 text-teal text-[10px] whitespace-nowrap">
                  {s.correct}/{s.total}
                </span>
              </li>
            ))}
            {strengths.length === 0 && (
              <li className="text-text-muted text-xs">No clear strengths yet — keep assessing skills.</li>
            )}
          </Column>

          {/* Gaps */}
          <Column
            icon={<TrendingDown size={12} className="text-warn" />}
            title="Skill gaps"
            tone="warn"
            empty="No notable gaps detected."
          >
            {gaps.map((g) => (
              <li key={g.skill} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="text-text truncate">{g.skill}</div>
                  <div className="text-text-muted text-[11px] font-mono">
                    {g.aptitude} · AI {g.ai_resilience}
                  </div>
                </div>
                <span className="pill bg-warn/15 text-warn text-[10px] whitespace-nowrap">gap</span>
              </li>
            ))}
            {gaps.length === 0 && (
              <li className="text-text-muted text-xs">No notable gaps detected.</li>
            )}
          </Column>

          {/* Recommended paths */}
          <Column
            icon={<GraduationCap size={12} className="text-brand" />}
            title="Recommended upskilling"
            tone="brand"
            empty="Add a few assessments to unlock tailored recommendations."
          >
            {recommendations.map((r, i) => (
              <li key={`${r.skill}-${i}`} className="surface2 rounded-sm p-2.5">
                <div className="flex items-center gap-2">
                  <Target size={11} className="text-brand shrink-0" />
                  <span className="text-sm text-text font-medium truncate">{r.skill}</span>
                </div>
                <div className="text-[11px] text-text-muted mt-1">{r.reason}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="pill bg-brand/10 text-brand text-[10px]">{r.sector}</span>
                  <span className="pill bg-teal/10 text-teal text-[10px]">via {r.pathway}</span>
                </div>
              </li>
            ))}
            {recommendations.length === 0 && (
              <li className="text-text-muted text-xs">Add a few assessments to unlock tailored recommendations.</li>
            )}
          </Column>
        </div>
      )}
    </div>
  );
}

function Column({
  icon, title, tone, children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "teal" | "warn" | "brand";
  empty: string;
  children: React.ReactNode;
}) {
  const border =
    tone === "teal" ? "border-teal/30" : tone === "warn" ? "border-warn/30" : "border-brand/30";
  return (
    <div className={`surface2 rounded-sm p-4 border ${border}`}>
      <div className="flex items-center gap-1.5 mb-3">
        {icon}
        <div className="label-mono">{title}</div>
      </div>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}
