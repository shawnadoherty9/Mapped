import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, RotateCcw, Play } from "lucide-react";
import { categoryForSkill, fetchQuestions, scoreToAptitude, TriviaQuestion, AptitudeLevel } from "@/lib/opentdb";
import { useAppStore, SkillAssessment } from "@/store/useAppStore";

type Phase = "idle" | "loading" | "running" | "done" | "error";

const APT_COLOR: Record<AptitudeLevel, string> = {
  Advanced: "text-teal",
  Proficient: "text-brand",
  Novice: "text-warn",
};

function aiResilienceFor(skill: string, aptitude: AptitudeLevel): SkillAssessment["ai_resilience"] {
  const s = skill.toLowerCase();
  // Hands-on / interpersonal skills are harder to automate
  const human = /(repair|tailor|weld|cook|nurs|teach|coach|customer|sales|craft|farm|driv|guid|care)/.test(s);
  // Routine knowledge work / data entry / basic coding is highly exposed
  const routine = /(data entry|bookkeep|basic coding|trans|copy|admin|clerk|caption|tagging)/.test(s);
  if (human && aptitude !== "Novice") return "High";
  if (routine && aptitude !== "Advanced") return "Low";
  if (aptitude === "Advanced") return "High";
  if (aptitude === "Proficient") return "Medium";
  return "Low";
}

function growthPathFor(skill: string, aptitude: AptitudeLevel): string {
  const next = aptitude === "Novice" ? "Proficient" : aptitude === "Proficient" ? "Advanced" : "Expert";
  if (aptitude === "Advanced") {
    return `Mentor others in ${skill}. Layer AI-augmentation: use tools to scale your output without losing craft.`;
  }
  if (aptitude === "Proficient") {
    return `Practice 2–3 hrs/week on real-world ${skill} cases. Take a certification or peer review to reach ${next}.`;
  }
  return `Start with structured fundamentals in ${skill}. Free resources (YouTube, Khan Academy) → micro-credential to reach ${next}.`;
}

interface Props { skill: string; onClose?: () => void; }

export default function SkillAptitudeTest({ skill, onClose }: Props) {
  const upsert = useAppStore((s) => s.upsertAssessment);
  const cat = categoryForSkill(skill);

  const [phase, setPhase] = useState<Phase>("idle");
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => { start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [skill]);

  async function start() {
    setPhase("loading"); setError(""); setIdx(0); setAnswers([]);
    try {
      const qs = await fetchQuestions(cat.id, 5);
      if (!qs.length) throw new Error("No questions available");
      setQuestions(qs);
      setPhase("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load questions");
      setPhase("error");
    }
  }

  function answer(choice: string) {
    const next = [...answers, choice];
    setAnswers(next);
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
    } else {
      const correct = next.filter((a, i) => a === questions[i].correct_answer).length;
      const aptitude = scoreToAptitude(correct, questions.length);
      const assessment: SkillAssessment = {
        skill,
        category: cat.label,
        correct,
        total: questions.length,
        aptitude,
        ai_resilience: aiResilienceFor(skill, aptitude),
        growth_path: growthPathFor(skill, aptitude),
        assessed_at: new Date().toISOString(),
      };
      upsert(assessment);
      setPhase("done");
    }
  }

  if (phase === "loading") {
    return (
      <div className="surface2 rounded-sm p-5 flex items-center gap-3 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin text-brand" />
        Loading {cat.label.toLowerCase()} questions for <span className="text-text">{skill}</span>…
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="surface2 rounded-sm p-4">
        <div className="text-sm text-warn mb-2">Couldn’t load assessment: {error}</div>
        <button onClick={start} className="pill border border-border text-text hover:border-brand text-xs flex items-center gap-1.5">
          <RotateCcw size={11}/> Retry
        </button>
      </div>
    );
  }

  if (phase === "done") {
    const correct = answers.filter((a, i) => a === questions[i].correct_answer).length;
    const aptitude = scoreToAptitude(correct, questions.length);
    return (
      <div className="surface2 rounded-sm p-5">
        <div className="label-mono mb-2">Result · {skill}</div>
        <div className="flex items-baseline gap-3 mb-2">
          <span className={`data-num text-3xl ${APT_COLOR[aptitude]}`}>{aptitude}</span>
          <span className="font-mono text-sm text-text-muted">{correct}/{questions.length} correct</span>
        </div>
        <p className="text-sm text-text-muted mb-4">{growthPathFor(skill, aptitude)}</p>
        <div className="flex gap-2">
          <button onClick={start} className="pill border border-border text-text hover:border-brand text-xs flex items-center gap-1.5">
            <RotateCcw size={11}/> Retake
          </button>
          {onClose && (
            <button onClick={onClose} className="pill border border-border text-text-muted hover:text-text text-xs">Close</button>
          )}
        </div>
      </div>
    );
  }

  // running — guard against pre-load / empty state where questions[idx] is undefined
  const q = questions[idx];
  if (!q) {
    return (
      <div className="surface2 rounded-sm p-5 flex items-center gap-3 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin text-brand" />
        Preparing {cat.label.toLowerCase()} questions for <span className="text-text">{skill}</span>…
      </div>
    );
  }
  return (
    <div className="surface2 rounded-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="label-mono">{cat.label} · Q{idx + 1}/{questions.length}</div>
        <div className="font-mono text-[10px] text-text-muted uppercase">{q.difficulty}</div>
      </div>
      <div className="text-sm text-text mb-4 leading-relaxed">{q.question}</div>
      <div className="grid gap-2">
        {q.choices.map((c) => (
          <button
            key={c}
            onClick={() => answer(c)}
            className="text-left text-sm bg-surface border border-border rounded-sm px-3 py-2 hover:border-brand hover:text-brand transition"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="mt-4 h-1 bg-bg rounded-full overflow-hidden">
        <div className="h-full bg-brand transition-all" style={{ width: `${((idx) / questions.length) * 100}%` }} />
      </div>
    </div>
  );
}

export function AssessmentBadge({ assessment }: { assessment: SkillAssessment }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-muted">
      {assessment.aptitude === "Advanced"
        ? <CheckCircle2 size={10} className="text-teal" />
        : assessment.aptitude === "Proficient"
        ? <CheckCircle2 size={10} className="text-brand" />
        : <XCircle size={10} className="text-warn" />}
      {assessment.aptitude} · {assessment.correct}/{assessment.total}
    </span>
  );
}

export function StartTestButton({ skill, onClick }: { skill: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pill border border-border text-text-muted hover:border-brand hover:text-brand text-[10px] flex items-center gap-1"
      title={`Run aptitude test for ${skill}`}
    >
      <Play size={9} /> Test
    </button>
  );
}
