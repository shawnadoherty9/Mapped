import { CountryConfig } from "@/data/countryConfigs";

// Mulberry32 PRNG for deterministic seeding
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const educationLevels = [
  { label: "No formal education", w: 0.08 },
  { label: "Primary", w: 0.25 },
  { label: "Secondary certificate", w: 0.38 },
  { label: "Vocational/TVET", w: 0.15 },
  { label: "Some tertiary", w: 0.09 },
  { label: "Tertiary degree", w: 0.05 },
];

const skillPools: Record<string, string[]> = {
  ghana: ["phone repair","trade","customer service","basic coding","Twi","French","tailoring","welding","masonry","mobile money","bookkeeping","driving","farming","carpentry","retail sales"],
  kenya: ["mobile money","Swahili","retail","agritech","driving","customer service","welding","basic coding","English","bookkeeping","tourism guiding","farming","tailoring","data entry","solar install"],
  bangladesh: ["garment sewing","Bangla","English","retail","mobile repair","rickshaw driving","farming","data entry","tailoring","bookkeeping","welding","basic coding","tutoring","catering","crafts"],
  indonesia: ["e-commerce sales","Bahasa","English","food service","driving","mobile repair","basic coding","customer service","welding","data entry","tourism","tailoring","graphic design","bookkeeping","logistics"],
};

const occupationPool: { code: string; label: string }[] = [
  { code: "7421", label: "Electronics mechanic" },
  { code: "5223", label: "Shop sales assistant" },
  { code: "9333", label: "Freight handler" },
  { code: "7531", label: "Tailor / dressmaker" },
  { code: "6111", label: "Field crop grower" },
  { code: "8332", label: "Heavy truck driver" },
  { code: "4311", label: "Bookkeeping clerk" },
  { code: "2513", label: "Web developer" },
  { code: "5120", label: "Cook / food server" },
  { code: "7212", label: "Welder" },
];

function pickWeighted<T extends { w: number }>(rand: () => number, arr: T[]): T {
  const total = arr.reduce((s, x) => s + x.w, 0);
  let r = rand() * total;
  for (const x of arr) { r -= x.w; if (r <= 0) return x; }
  return arr[arr.length - 1];
}

export interface SyntheticProfile {
  id: string;
  age: number;
  education: string;
  skills: { label: string; type: "formal" | "informal" | "demonstrated" }[];
  occupation: { code: string; label: string };
  risk: number; // adjusted 0-1
  topAdjacent: string;
}

export function generateSyntheticCohort(country: CountryConfig, n = 50, seedBase = 42): SyntheticProfile[] {
  const seed = seedBase + country.code.charCodeAt(0) + country.code.charCodeAt(1) + country.code.charCodeAt(2);
  const rand = mulberry32(seed);
  const pool = skillPools[country.name.toLowerCase()] ?? skillPools.ghana;
  const adjacents = ["digital literacy","English business","data analysis","financial planning","project mgmt","communication","critical thinking","sales","logistics","cloud basics"];
  const out: SyntheticProfile[] = [];
  for (let i = 0; i < n; i++) {
    const edu = pickWeighted(rand, educationLevels).label;
    const age = 16 + Math.floor(rand() * 14);
    const nSkills = 3 + Math.floor(rand() * 5);
    const skills: SyntheticProfile["skills"] = [];
    const used = new Set<number>();
    for (let j = 0; j < nSkills; j++) {
      let idx = Math.floor(rand() * pool.length);
      while (used.has(idx)) idx = (idx + 1) % pool.length;
      used.add(idx);
      const t = rand();
      const type: "formal" | "informal" | "demonstrated" =
        t < country.formality_rate ? "formal" : t < country.formality_rate + 0.45 ? "informal" : "demonstrated";
      skills.push({ label: pool[idx], type });
    }
    const occupation = occupationPool[Math.floor(rand() * occupationPool.length)];
    // Risk: beta-ish around 0.45 raw, scaled by calibration, clipped
    const raw = Math.min(0.95, Math.max(0.05, 0.3 + rand() * 0.55));
    const risk = Math.min(0.95, raw * country.lmic_calibration);
    const topAdjacent = adjacents[Math.floor(rand() * adjacents.length)];
    out.push({ id: `${country.code}-${i+1}`, age, education: edu, skills, occupation, risk, topAdjacent });
  }
  return out;
}
