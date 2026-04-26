import type { CalibratedRiskRow } from "@/hooks/useCalibratedRisk";
import { GraduationCap, Wrench, Compass, ShieldAlert, ExternalLink, BookOpen } from "lucide-react";

type Band = "low" | "moderate" | "elevated" | "high";

/** A single citation entry — the framework/guideline an action was derived from. */
interface Citation {
  /** Stable short ID used for in-text markers, e.g. "ILO-TVET-2021". */
  id: string;
  /** Issuing body, e.g. "ILO". */
  org: string;
  /** Document title. */
  title: string;
  /** Year of publication. */
  year: number;
  /** Specific section/paragraph anchor, when relevant. */
  section?: string;
  /** Public URL. */
  url: string;
}

/** A recommended action with the citations that justify it. */
interface CitedAction {
  text: string;
  /** IDs of Citation entries that justify this action. */
  cites: string[];
}

interface BandPlaybook {
  label: string;
  posture: string;
  tvet: CitedAction[];
  transition: CitedAction[];
  accent: string;        // tailwind text color token
  border: string;        // tailwind border token
  badge: string;         // tailwind badge bg
  Icon: typeof GraduationCap;
}

/* --------------------------- Citations registry --------------------------- */
/* Sources used across all bands. Keeping them in one map makes it easy to    */
/* show a deduplicated "Citations" section per panel.                         */

const CITATIONS: Record<string, Citation> = {
  "ILO-TVET-2021": {
    id: "ILO-TVET-2021",
    org: "ILO",
    title: "Shaping skills and lifelong learning for the future of work",
    year: 2021,
    section: "Recommendations §3 (TVET reform)",
    url: "https://www.ilo.org/skills/pubs/WCMS_813750/lang--en/index.htm",
  },
  "ILO-R195": {
    id: "ILO-R195",
    org: "ILO",
    title: "Recommendation 195 on Human Resources Development",
    year: 2004,
    section: "Paras 5(c), 9(b)",
    url: "https://www.ilo.org/dyn/normlex/en/f?p=NORMLEXPUB:12100:0::NO::P12100_INSTRUMENT_ID:312533",
  },
  "ILO-JustTransition-2015": {
    id: "ILO-JustTransition-2015",
    org: "ILO",
    title: "Guidelines for a just transition towards environmentally sustainable economies and societies for all",
    year: 2015,
    section: "Policy framework §III (skills, social protection)",
    url: "https://www.ilo.org/global/topics/green-jobs/publications/WCMS_432859/lang--en/index.htm",
  },
  "OECD-FoW-2019": {
    id: "OECD-FoW-2019",
    org: "OECD",
    title: "OECD Employment Outlook 2019: The Future of Work",
    year: 2019,
    section: "Ch. 6 (training systems for adults)",
    url: "https://www.oecd.org/employment/Employment-Outlook-2019-Highlight-EN.pdf",
  },
  "OECD-Skills-2019": {
    id: "OECD-Skills-2019",
    org: "OECD",
    title: "OECD Skills Outlook 2019: Thriving in a Digital World",
    year: 2019,
    section: "Ch. 5 (digital & AI literacy)",
    url: "https://www.oecd.org/education/oecd-skills-outlook-e11c1c2d-en.htm",
  },
  "OECD-Microcred-2023": {
    id: "OECD-Microcred-2023",
    org: "OECD",
    title: "Micro-credentials for lifelong learning and employability",
    year: 2023,
    url: "https://www.oecd.org/education/skills-beyond-school/microcredentials.htm",
  },
  "WB-STEP": {
    id: "WB-STEP",
    org: "World Bank",
    title: "STEP Skills Measurement Programme — country diagnostic",
    year: 2014,
    url: "https://www.worldbank.org/en/programs/step",
  },
  "WB-WDR2019": {
    id: "WB-WDR2019",
    org: "World Bank",
    title: "World Development Report 2019: The Changing Nature of Work",
    year: 2019,
    section: "Ch. 6 (social protection for the future of work)",
    url: "https://www.worldbank.org/en/publication/wdr2019",
  },
  "UNESCO-TVET-2022": {
    id: "UNESCO-TVET-2022",
    org: "UNESCO-UNEVOC",
    title: "Transforming TVET for successful and just transitions",
    year: 2022,
    url: "https://unevoc.unesco.org/pub/transforming_tvet.pdf",
  },
  "EU-Pact-Skills-2020": {
    id: "EU-Pact-Skills-2020",
    org: "European Commission",
    title: "Pact for Skills (European Skills Agenda, Action 1)",
    year: 2020,
    url: "https://ec.europa.eu/social/main.jsp?catId=1517&langId=en",
  },
  "ILO-Apprenticeship-2018": {
    id: "ILO-Apprenticeship-2018",
    org: "ILO",
    title: "ILO Toolkit for Quality Apprenticeships, Vol. II",
    year: 2018,
    url: "https://www.ilo.org/skills/pubs/WCMS_633887/lang--en/index.htm",
  },
};

const PLAYBOOK: Record<Band, BandPlaybook> = {
  low: {
    label: "Low exposure",
    posture: "Maintain & deepen — low automation pressure, focus on quality and adjacency.",
    tvet: [
      { text: "Embed AI-literacy & digital tools as cross-cutting modules", cites: ["OECD-Skills-2019", "ILO-TVET-2021"] },
      { text: "Strengthen workplace-based learning & continuing-education pathways", cites: ["ILO-R195", "ILO-Apprenticeship-2018"] },
      { text: "Fund sector excellence centres for higher-order skills", cites: ["UNESCO-TVET-2022"] },
    ],
    transition: [
      { text: "Light-touch career navigation; signpost upward mobility", cites: ["OECD-FoW-2019"] },
      { text: "Tax incentives for employer-sponsored upskilling", cites: ["EU-Pact-Skills-2020", "OECD-FoW-2019"] },
    ],
    accent: "text-brand",
    border: "border-brand",
    badge: "bg-brand/15 text-brand",
    Icon: ShieldAlert,
  },
  moderate: {
    label: "Moderate exposure",
    posture: "Adapt — partial task automation, redesign curricula around human-AI complementarity.",
    tvet: [
      { text: "Modular short-cycle credentials for hybrid roles", cites: ["OECD-Microcred-2023", "ILO-TVET-2021"] },
      { text: "Update CBT (competency-based training) packages every 2 years", cites: ["UNESCO-TVET-2022", "ILO-TVET-2021"] },
      { text: "Industry-TVET co-design councils for the affected ISCO group", cites: ["ILO-R195", "EU-Pact-Skills-2020"] },
    ],
    transition: [
      { text: "Mid-career RPL (recognition of prior learning) gateways", cites: ["ILO-R195", "OECD-Microcred-2023"] },
      { text: "Wage-subsidy schemes for transition into adjacent occupations", cites: ["OECD-FoW-2019"] },
      { text: "Public job-matching bound to local skills demand signals", cites: ["WB-STEP", "OECD-FoW-2019"] },
    ],
    accent: "text-warn",
    border: "border-warn",
    badge: "bg-warn/15 text-warn",
    Icon: Compass,
  },
  elevated: {
    label: "Elevated exposure",
    posture: "Re-skill at scale — most tasks substitutable; active labor-market policy required.",
    tvet: [
      { text: "Rapid-deployment bootcamps for adjacent, less-exposed occupations", cites: ["ILO-TVET-2021", "OECD-FoW-2019"] },
      { text: "Stackable micro-credentials with portable digital wallets", cites: ["OECD-Microcred-2023", "EU-Pact-Skills-2020"] },
      { text: "Public-private apprenticeship levy ring-fenced to displaced workers", cites: ["ILO-Apprenticeship-2018", "ILO-R195"] },
    ],
    transition: [
      { text: "Tripartite (gov · employer · union) transition compacts", cites: ["ILO-JustTransition-2015"] },
      { text: "Income-bridging stipends tied to training completion", cites: ["OECD-FoW-2019", "WB-WDR2019"] },
      { text: "Geographic mobility grants where demand is in another region", cites: ["OECD-FoW-2019"] },
    ],
    accent: "text-orange-400",
    border: "border-orange-400",
    badge: "bg-orange-400/15 text-orange-400",
    Icon: Wrench,
  },
  high: {
    label: "High exposure",
    posture: "Active transition planning — assume large-scale displacement within a decade.",
    tvet: [
      { text: "National re-skilling guarantee for the affected ISCO group", cites: ["ILO-TVET-2021", "EU-Pact-Skills-2020"] },
      { text: "Pivot core curricula away from routine-cognitive task clusters", cites: ["UNESCO-TVET-2022", "OECD-Skills-2019"] },
      { text: "Foundational AI/data literacy embedded from secondary level", cites: ["OECD-Skills-2019"] },
    ],
    transition: [
      { text: "Just-transition fund with income support + counselling", cites: ["ILO-JustTransition-2015", "WB-WDR2019"] },
      { text: "Sector-wide redeployment plans co-signed by employers", cites: ["ILO-JustTransition-2015", "ILO-R195"] },
      { text: "Strengthen social protection (unemployment insurance, portable benefits)", cites: ["WB-WDR2019"] },
      { text: "Place-based economic diversification to absorb displaced cohorts", cites: ["WB-WDR2019", "OECD-FoW-2019"] },
    ],
    accent: "text-danger",
    border: "border-danger",
    badge: "bg-danger/15 text-danger",
    Icon: GraduationCap,
  },
};

interface Props {
  highest: CalibratedRiskRow;
  countryName: string;
}

export default function PolicyRecommendations({ highest, countryName }: Props) {
  const band = highest.band as Band;
  const play = PLAYBOOK[band];
  const Icon = play.Icon;

  // Build an ordered, deduplicated citation list for THIS panel, so the
  // [1][2]… markers next to actions match the numbered list at the bottom.
  const usedIds: string[] = [];
  for (const a of [...play.tvet, ...play.transition]) {
    for (const id of a.cites) if (!usedIds.includes(id)) usedIds.push(id);
  }
  const indexOf = (id: string) => usedIds.indexOf(id) + 1; // 1-based marker

  return (
    <div className={`surface rounded-sm p-5 border-l-2 ${play.border}`}>
      <div className="flex items-baseline justify-between mb-1">
        <div className={`label-mono ${play.accent}`}>Policy recommendations · highest-exposure ISCO group</div>
        <div className="font-mono text-[10px] text-text-muted">{countryName}</div>
      </div>

      <div className="flex items-start gap-3 mt-3 mb-4">
        <div className={`shrink-0 mt-0.5 ${play.accent}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-xs text-text-muted">
            ISCO-{highest.group.code} · {highest.group.label}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`pill ${play.badge}`}>{play.label}</span>
            <span className="font-mono text-xs text-text">
              {(highest.calibrated * 100).toFixed(0)}% calibrated risk
            </span>
          </div>
          <p className="text-text text-sm mt-2">{play.posture}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ActionList
          title="TVET actions"
          tone="teal"
          Icon={GraduationCap}
          actions={play.tvet}
          indexOf={indexOf}
        />
        <ActionList
          title="Transition actions"
          tone="brand"
          Icon={Compass}
          actions={play.transition}
          indexOf={indexOf}
        />
      </div>

      {/* On-panel citations — links each [n] marker to the source. */}
      <div className="mt-4 surface2 rounded-sm p-3">
        <div className="label-mono mb-2 flex items-center gap-1.5 text-text-muted">
          <BookOpen className="w-3.5 h-3.5" /> Citations · sources for the actions above
        </div>
        <ol className="space-y-1.5">
          {usedIds.map((id, i) => {
            const c = CITATIONS[id];
            return (
              <li key={id} id={`cite-${i + 1}`} className="text-[11px] leading-snug flex gap-2 scroll-mt-4 target:bg-brand/5 rounded-sm">
                <span className="font-mono text-text-muted shrink-0 w-6">[{i + 1}]</span>
                <span className="min-w-0">
                  <span className="font-mono text-text">{c.org} ({c.year})</span>
                  <span className="text-text-muted"> · </span>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand underline underline-offset-2 hover:text-brand/80 break-words inline-flex items-center gap-1"
                    title={`Open ${c.org} ${c.title}`}
                  >
                    {c.title}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  {c.section && (
                    <span className="text-text-muted"> · {c.section}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-3 text-[10px] font-mono text-text-muted leading-relaxed">
        Recommendations scale with the calibrated risk band of the highest-exposure ISCO major group for {countryName}.
        Each action above carries [n] markers linking to the specific guideline or framework it was derived from.
      </div>
    </div>
  );
}

function ActionList({
  title,
  tone,
  Icon,
  actions,
  indexOf,
}: {
  title: string;
  tone: "teal" | "brand";
  Icon: typeof GraduationCap;
  actions: CitedAction[];
  indexOf: (id: string) => number;
}) {
  const toneCls = tone === "teal" ? "text-teal" : "text-brand";
  return (
    <div className="surface2 rounded-sm p-3">
      <div className={`label-mono mb-2 ${toneCls} flex items-center gap-1.5`}>
        <Icon className="w-3.5 h-3.5" /> {title}
      </div>
      <ul className="space-y-1.5 text-sm text-text">
        {actions.map((a) => (
          <li key={a.text} className="flex gap-2">
            <span className={`${toneCls} mt-1`}>▸</span>
            <span>
              {a.text}
              {a.cites.length > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-text-muted whitespace-nowrap">
                  {a.cites.map((id, i) => (
                    <span key={id}>
                      {i > 0 && ""}
                      <a
                        href={`#cite-${indexOf(id)}`}
                        className="text-brand hover:underline"
                        title={id}
                      >
                        [{indexOf(id)}]
                      </a>
                    </span>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
