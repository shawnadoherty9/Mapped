/**
 * Sector → required skills mapping.
 * Curated taxonomy used by the Opportunity Match page to translate the
 * country growth sectors (from `countryConfigs[k].sector_growth`) into
 * concrete skill demands. Skills are normalized lower-case keywords; the
 * matcher does substring + token overlap against the user's
 * durable / ESCO / self-rated skills.
 *
 * Keys are lower-cased sector labels. We also expose a fuzzy lookup
 * (`getSectorSkills`) that handles variants like "ICT services" vs
 * "ict & technology" without needing every variant in the table.
 */

export interface SectorSkillSet {
  /** Display label */
  sector: string;
  /** Core skills typically demanded by employers in this sector */
  required: string[];
  /** Adjacent / nice-to-have skills that boost match probability */
  adjacent: string[];
  /** Short note about the sector's labor-market dynamic */
  note?: string;
}

const TABLE: SectorSkillSet[] = [
  {
    sector: "ICT services",
    required: ["software development", "web development", "database / SQL", "cloud basics", "english communication"],
    adjacent: ["devops", "data analysis", "ux design", "agile project mgmt", "cybersecurity awareness"],
    note: "Highest wage premium in the dataset; remote-friendly demand from EU/US clients.",
  },
  {
    sector: "fintech",
    required: ["financial literacy", "regulatory & compliance basics", "customer service", "english communication", "mobile / web app proficiency"],
    adjacent: ["data analysis", "fraud detection", "product mgmt", "ux design", "API integration"],
    note: "Driven by mobile-money rails; strong growth in Sub-Saharan Africa & SEA.",
  },
  {
    sector: "mobile finance",
    required: ["mobile money operations", "customer service", "basic bookkeeping", "agent network mgmt", "local language fluency"],
    adjacent: ["fraud awareness", "marketing & sales", "training & onboarding", "field operations"],
    note: "Agent-heavy; entry-level roles convert into supervisory paths quickly.",
  },
  {
    sector: "agritech",
    required: ["agronomy basics", "mobile data collection", "customer service", "smallholder engagement", "local language fluency"],
    adjacent: ["data entry", "extension training", "logistics coordination", "credit / micro-finance basics"],
    note: "Bridges traditional agriculture and digital tools — strong informal-to-formal pipeline.",
  },
  {
    sector: "agriculture",
    required: ["agronomy basics", "irrigation & soil mgmt", "harvest planning", "post-harvest handling", "cooperative mgmt"],
    adjacent: ["climate-smart practices", "marketing & sales", "bookkeeping", "extension training"],
    note: "Largest informal employer; productivity gains depend on extension + finance access.",
  },
  {
    sector: "renewable energy",
    required: ["electrical fundamentals", "site surveying", "battery / solar installation", "safety standards", "customer service"],
    adjacent: ["maintenance & repair", "project mgmt", "sales & financing", "data monitoring"],
    note: "Off-grid solar + mini-grids drive entry-level technician demand.",
  },
  {
    sector: "tourism",
    required: ["hospitality service", "english communication", "tour guiding", "cultural knowledge", "customer service"],
    adjacent: ["digital marketing", "booking systems", "second foreign language", "first aid"],
    note: "Bimodal: vulnerable to shocks but high informal-to-formal uplift potential.",
  },
  {
    sector: "trade & repair",
    required: ["customer service", "basic bookkeeping", "phone / electronics repair", "parts sourcing", "negotiation"],
    adjacent: ["digital storefront", "mobile money", "inventory mgmt", "after-sales service"],
    note: "Dominant micro-enterprise channel; digitization unlocks scale.",
  },
  {
    sector: "manufacturing",
    required: ["machine operation", "quality control", "safety standards", "basic mechanical maintenance", "literacy & numeracy"],
    adjacent: ["supervisor / team lead", "lean process basics", "industrial electronics", "logistics"],
    note: "Higher automation exposure — durable skills cluster around oversight & maintenance.",
  },
  {
    sector: "textiles",
    required: ["sewing & stitching", "pattern reading", "quality control", "machine maintenance", "production-line discipline"],
    adjacent: ["supervisor skills", "fabric sourcing", "design basics", "export compliance"],
    note: "Major formal employer for women in South Asia; supervisor track is the durable path.",
  },
  {
    sector: "construction",
    required: ["site safety", "blueprint reading", "mason / carpentry / electrical fundamentals", "tool handling", "team coordination"],
    adjacent: ["estimation & costing", "project supervision", "BIM basics", "first aid"],
    note: "Cyclical with infrastructure spend; trades certification raises wages 1.5-2×.",
  },
  {
    sector: "oil & gas services",
    required: ["industrial safety (HSE)", "mechanical / electrical fundamentals", "equipment maintenance", "shift discipline", "english communication"],
    adjacent: ["instrumentation", "welding certification", "logistics coordination", "permit-to-work systems"],
    note: "Contract-heavy; certifications gate entry but pay premium wages.",
  },
  {
    sector: "creative industries",
    required: ["storytelling", "production tools (audio/video)", "social media literacy", "client communication", "self-management"],
    adjacent: ["audience research", "monetization basics", "intellectual property", "second language"],
    note: "Nigeria/Brazil exporters; durable income depends on distribution + IP literacy.",
  },
  {
    sector: "healthcare",
    required: ["patient communication", "infection control", "basic clinical procedures", "record keeping", "empathy & care"],
    adjacent: ["health informatics", "community outreach", "language interpretation", "first response"],
    note: "Persistent shortage of mid-level cadres (nursing, lab tech) across LMICs.",
  },
  {
    sector: "education",
    required: ["lesson planning", "subject expertise", "classroom management", "assessment design", "patience & communication"],
    adjacent: ["edtech tools", "inclusive education", "second language", "parent engagement"],
    note: "Public-sector dominant; private tutoring + edtech are growth edges.",
  },
  {
    sector: "logistics",
    required: ["route planning", "inventory mgmt", "driver / dispatcher coordination", "basic systems literacy", "customer service"],
    adjacent: ["warehouse mgmt", "cold-chain handling", "fleet maintenance", "import/export docs"],
    note: "E-commerce + last-mile drives strong entry-level demand.",
  },
];

const LOOKUP = new Map<string, SectorSkillSet>(TABLE.map((s) => [s.sector.toLowerCase(), s]));

/** Common sector-label synonyms used in countryConfigs that should resolve to a curated entry. */
const ALIASES: Record<string, string> = {
  "ict services": "ict services",
  "ict & technology": "ict services",
  "it services": "ict services",
  "it outsourcing": "ict services",
  "digital services": "ict services",
  "digital commerce": "ict services",
  "bpo": "ict services",
  "electronics": "manufacturing",
  "garments": "textiles",
  "telecoms": "ict services",
  "telecommunications": "ict services",
  "mobile money": "mobile finance",
  "finance": "fintech",
  "banking": "fintech",
  "renewables": "renewable energy",
  "solar": "renewable energy",
  "fisheries": "agriculture",
  "hospitality": "tourism",
  "retail": "trade & repair",
  "transport": "logistics",
  "shipping": "logistics",
  "mining": "oil & gas services",
  "extractives": "oil & gas services",
};

/** Fuzzy lookup tolerant of label variants ("ICT services" vs "ict & technology"). */
export function getSectorSkills(label: string): SectorSkillSet {
  const key = label.toLowerCase().trim();
  if (LOOKUP.has(key)) return LOOKUP.get(key)!;
  if (ALIASES[key] && LOOKUP.has(ALIASES[key])) return LOOKUP.get(ALIASES[key])!;
  // token overlap fallback
  const tokens = key.split(/[\s&/,-]+/).filter((t) => t.length > 2);
  let best: { entry: SectorSkillSet; score: number } | null = null;
  for (const entry of TABLE) {
    const ek = entry.sector.toLowerCase();
    const score = tokens.reduce((s, t) => (ek.includes(t) ? s + 1 : s), 0);
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  if (best) return best.entry;
  // generic fallback so the UI always renders
  return {
    sector: label,
    required: ["customer service", "literacy & numeracy", "team coordination", "local language fluency"],
    adjacent: ["digital literacy", "english communication", "basic bookkeeping"],
    note: "No curated profile yet for this sector — using a generic LMIC service-economy baseline.",
  };
}

/** Keyword expansions: a required skill matches if the user has ANY of these tokens. */
const SKILL_KEYWORDS: Record<string, string[]> = {
  "software development": ["software", "programming", "coding", "developer", "engineer", "python", "java", "javascript", "typescript", "react", "node", "c++", "c#", "ruby", "php", "go", "rust", "swift", "kotlin", "android", "ios", "mobile dev"],
  "web development": ["web", "html", "css", "react", "vue", "angular", "javascript", "typescript", "frontend", "backend", "full-stack", "node", "django", "rails", "laravel", "wordpress"],
  "database / sql": ["sql", "database", "postgres", "mysql", "mongodb", "oracle", "nosql", "data modeling", "etl"],
  "cloud basics": ["aws", "azure", "gcp", "cloud", "docker", "kubernetes", "devops", "linux"],
  "english communication": ["english", "communication", "writing", "speaking", "presentation"],
  "data analysis": ["data", "analytics", "excel", "spreadsheet", "statistics", "tableau", "powerbi", "power bi", "sql", "python", "r ", "pandas"],
  "customer service": ["customer", "service", "support", "client", "hospitality", "sales", "retail"],
  "financial literacy": ["finance", "accounting", "bookkeeping", "budget", "money", "banking", "economics"],
  "regulatory & compliance basics": ["compliance", "regulatory", "legal", "policy", "audit", "governance"],
  "mobile / web app proficiency": ["mobile", "app", "smartphone", "web", "internet"],
  "marketing & sales": ["marketing", "sales", "branding", "advertising", "social media", "promotion", "business development"],
  "ux design": ["ux", "ui", "design", "figma", "sketch", "user experience", "prototyping"],
  "agile project mgmt": ["agile", "scrum", "kanban", "project management", "pm ", "jira"],
  "cybersecurity awareness": ["security", "cyber", "infosec", "penetration testing", "encryption"],
  "local language fluency": ["language", "fluent", "bilingual", "swahili", "twi", "hausa", "yoruba", "amharic", "french", "spanish", "portuguese", "arabic", "hindi", "bengali", "urdu"],
  "agronomy basics": ["agriculture", "farming", "crops", "agronomy", "agritech", "horticulture"],
  "irrigation & soil mgmt": ["irrigation", "soil", "water management", "farming"],
  "harvest planning": ["harvest", "farming", "agriculture", "crop"],
  "post-harvest handling": ["post-harvest", "storage", "processing", "packaging"],
  "cooperative mgmt": ["cooperative", "coop", "community organizing", "leadership"],
  "mobile data collection": ["mobile", "data entry", "survey", "kobo", "odk"],
  "smallholder engagement": ["community", "outreach", "farmer", "field"],
  "mobile money operations": ["mobile money", "mpesa", "momo", "fintech", "payments"],
  "basic bookkeeping": ["bookkeeping", "accounting", "ledger", "finance", "excel"],
  "agent network mgmt": ["agent", "network", "distribution", "field operations"],
  "electrical fundamentals": ["electrical", "electrician", "wiring", "circuits"],
  "site surveying": ["surveying", "site", "field assessment"],
  "battery / solar installation": ["solar", "battery", "pv", "photovoltaic", "renewable", "installation"],
  "safety standards": ["safety", "hse", "ohs", "first aid"],
  "hospitality service": ["hospitality", "hotel", "restaurant", "tourism", "guest", "service"],
  "tour guiding": ["tour", "guide", "tourism", "travel"],
  "cultural knowledge": ["culture", "history", "heritage", "local knowledge"],
  "phone / electronics repair": ["repair", "electronics", "phone", "technician", "fix"],
  "parts sourcing": ["sourcing", "procurement", "supply chain"],
  "negotiation": ["negotiation", "deal", "sales", "communication"],
  "machine operation": ["machine", "operator", "factory", "production"],
  "quality control": ["quality", "qc", "qa", "inspection", "testing"],
  "basic mechanical maintenance": ["mechanical", "maintenance", "repair", "engineering"],
  "literacy & numeracy": ["literacy", "numeracy", "reading", "writing", "math", "basic education"],
  "sewing & stitching": ["sewing", "stitching", "tailoring", "garment", "textile"],
  "pattern reading": ["pattern", "design", "tailoring"],
  "machine maintenance": ["maintenance", "machine", "mechanical"],
  "production-line discipline": ["production", "factory", "manufacturing", "assembly"],
  "site safety": ["safety", "construction", "hse"],
  "blueprint reading": ["blueprint", "drawing", "cad", "drafting"],
  "mason / carpentry / electrical fundamentals": ["mason", "carpentry", "carpenter", "electrical", "construction", "trade"],
  "tool handling": ["tool", "equipment", "manual"],
  "team coordination": ["team", "leadership", "coordination", "management", "supervision"],
  "industrial safety (hse)": ["safety", "hse", "industrial", "ohs"],
  "mechanical / electrical fundamentals": ["mechanical", "electrical", "engineering"],
  "equipment maintenance": ["maintenance", "equipment", "repair"],
  "shift discipline": ["shift", "discipline", "punctuality"],
  "storytelling": ["storytelling", "writing", "content", "narrative", "journalism"],
  "production tools (audio/video)": ["audio", "video", "premiere", "final cut", "audacity", "production", "editing", "filmmaking"],
  "social media literacy": ["social media", "instagram", "tiktok", "youtube", "facebook", "twitter", "x ", "marketing"],
  "client communication": ["client", "communication", "customer"],
  "self-management": ["self-management", "discipline", "time management", "organization"],
  "patient communication": ["patient", "communication", "bedside", "empathy"],
  "infection control": ["infection", "hygiene", "sterilization", "ppe", "clinical"],
  "basic clinical procedures": ["clinical", "nursing", "medical", "first aid", "healthcare"],
  "record keeping": ["record", "documentation", "filing", "data entry"],
  "empathy & care": ["empathy", "care", "compassion", "interpersonal"],
  "lesson planning": ["lesson", "teaching", "curriculum", "education", "pedagogy"],
  "subject expertise": ["subject", "expertise", "teaching", "academic"],
  "classroom management": ["classroom", "teaching", "discipline", "education"],
  "assessment design": ["assessment", "testing", "evaluation", "grading"],
  "patience & communication": ["patience", "communication", "interpersonal"],
  "route planning": ["route", "planning", "logistics", "navigation"],
  "inventory mgmt": ["inventory", "stock", "warehouse", "supply"],
  "driver / dispatcher coordination": ["driver", "dispatcher", "logistics", "fleet"],
  "basic systems literacy": ["computer", "digital", "software", "systems"],
};

/** Score how well a user's skill list matches a sector. Returns a 0-100 fit %
 *  plus the matched / missing breakdown for UI rendering. */
export function scoreSectorFit(userSkills: string[], sector: SectorSkillSet) {
  const norm = (s: string) => s.toLowerCase().trim();
  const userSet = new Set(userSkills.map(norm));
  const userTokens = userSkills.flatMap((s) => norm(s).split(/[\s&/,-]+/)).filter((t) => t.length > 2);
  const userTokenSet = new Set(userTokens);
  // Full normalized strings for substring searches against user skills
  const userJoined = userSkills.map(norm).join(" | ");

  const matches = (req: string) => {
    const r = norm(req);
    if (userSet.has(r)) return true;
    // direct token overlap
    const reqTokens = r.split(/[\s&/,-]+/).filter((t) => t.length > 2);
    if (reqTokens.some((t) => userTokenSet.has(t))) return true;
    // keyword expansion — required skill matches if user has any related keyword
    const keywords = SKILL_KEYWORDS[r] ?? [];
    if (keywords.some((kw) => userJoined.includes(kw))) return true;
    return false;
  };

  const requiredMatched = sector.required.filter(matches);
  const requiredMissing = sector.required.filter((r) => !matches(r));
  const adjacentMatched = sector.adjacent.filter(matches);

  // Weighted fit: required = 70%, adjacent = 30%
  const reqPct = sector.required.length === 0 ? 0 : requiredMatched.length / sector.required.length;
  const adjPct = sector.adjacent.length === 0 ? 0 : adjacentMatched.length / sector.adjacent.length;
  const fit = Math.round((reqPct * 0.7 + adjPct * 0.3) * 100);

  return { fit, requiredMatched, requiredMissing, adjacentMatched };
}
