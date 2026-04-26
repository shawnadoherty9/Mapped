// OpenTDB integration — public API, no key required.
// Maps free-text skills to OpenTDB category IDs and runs short aptitude quizzes.

export interface TriviaQuestion {
  category: string;
  type: "multiple" | "boolean";
  difficulty: "easy" | "medium" | "hard";
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  // derived
  choices: string[];
}

// OpenTDB category IDs (https://opentdb.com/api_category.php)
const CATEGORIES: Record<string, number> = {
  "computers": 18,
  "science": 17,
  "math": 19,
  "general": 9,
  "geography": 22,
  "history": 23,
  "politics": 24,
  "art": 25,
  "sports": 21,
};

// Heuristic skill → category mapping. Fallback to general knowledge.
export function categoryForSkill(skill: string): { id: number; label: string } {
  const s = skill.toLowerCase();
  if (/(cod|program|python|javascript|software|comput|develop|web|data|sql|repair|phone|tech|it|hardware)/.test(s))
    return { id: CATEGORIES.computers, label: "Computers" };
  if (/(math|account|book|financ|number|statistic)/.test(s))
    return { id: CATEGORIES.math, label: "Mathematics" };
  if (/(science|biolog|chem|physic|nurs|health|medic|agri|farm)/.test(s))
    return { id: CATEGORIES.science, label: "Science & Nature" };
  if (/(geograph|map|travel|tour|logistic|sourc)/.test(s))
    return { id: CATEGORIES.geography, label: "Geography" };
  if (/(histor|cultur|herit)/.test(s))
    return { id: CATEGORIES.history, label: "History" };
  if (/(art|design|music|craft|tailor|sew)/.test(s))
    return { id: CATEGORIES.art, label: "Art" };
  if (/(sport|coach|fit)/.test(s))
    return { id: CATEGORIES.sports, label: "Sports" };
  return { id: CATEGORIES.general, label: "General Knowledge" };
}

function decode(s: string): string {
  // OpenTDB returns HTML-encoded text
  const ta = document.createElement("textarea");
  ta.innerHTML = s;
  return ta.value;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function fetchQuestions(categoryId: number, amount = 5): Promise<TriviaQuestion[]> {
  const url = `https://opentdb.com/api.php?amount=${amount}&category=${categoryId}&type=multiple`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenTDB error ${res.status}`);
  const json = await res.json();
  if (json.response_code !== 0) {
    // fallback — pull general knowledge
    const r2 = await fetch(`https://opentdb.com/api.php?amount=${amount}&type=multiple`);
    const j2 = await r2.json();
    return (j2.results || []).map(normalize);
  }
  return (json.results || []).map(normalize);
}

function normalize(q: any): TriviaQuestion {
  const correct = decode(q.correct_answer);
  const incorrect = (q.incorrect_answers || []).map(decode);
  return {
    category: decode(q.category),
    type: q.type,
    difficulty: q.difficulty,
    question: decode(q.question),
    correct_answer: correct,
    incorrect_answers: incorrect,
    choices: shuffle([correct, ...incorrect]),
  };
}

export type AptitudeLevel = "Novice" | "Proficient" | "Advanced";

export function scoreToAptitude(correct: number, total: number): AptitudeLevel {
  if (total === 0) return "Novice";
  const pct = correct / total;
  if (pct >= 0.8) return "Advanced";
  if (pct >= 0.5) return "Proficient";
  return "Novice";
}
