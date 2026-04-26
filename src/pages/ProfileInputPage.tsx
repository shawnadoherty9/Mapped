import { useState, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout, { PageHeader } from "@/components/AppLayout";
import ClaudeLoader from "@/components/ClaudeLoader";
import { useAppStore, useActiveCountry, ProfileForm } from "@/store/useAppStore";
import { mapProfileWithClaude } from "@/lib/claude";
import { X } from "lucide-react";

const educations = ["No formal education", "Primary", "Secondary school certificate", "Vocational/TVET", "Some tertiary", "Tertiary degree"];
const experiences = ["<1", "1-2", "3-5", "6-10", "10+"];
const connectivities = ["Shared mobile data", "Personal mobile", "Limited wifi", "Reliable wifi"];

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const t = draft.trim(); if (t && !value.includes(t)) onChange([...value, t]); setDraft(""); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="surface2 rounded-sm px-2 py-2 flex flex-wrap gap-1.5">
      {value.map((t) => (
        <span key={t} className="pill bg-surface text-text border border-border">
          {t}
          <button onClick={() => onChange(value.filter(x => x !== t))} className="ml-1 text-text-muted hover:text-danger"><X size={10} /></button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-1"
      />
    </div>
  );
}

export default function ProfileInputPage() {
  const form = useAppStore((s) => s.form);
  const setForm = useAppStore((s) => s.setForm);
  const setProfile = useAppStore((s) => s.setActiveProfile);
  const setMappedAt = useAppStore((s) => s.setMappedAt);
  const country = useActiveCountry();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const update = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => setForm({ ...form, [k]: v });

  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      const res = await mapProfileWithClaude(form, country);
      setProfile(res);
      setMappedAt(new Date().toISOString());
      nav("/app/skills");
    } catch (e: any) {
      setErr(e.message ?? "Failed to map profile");
    } finally { setLoading(false); }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-10 max-w-3xl pb-24 md:pb-10">
        <PageHeader eyebrow="Entry point" title="Profile input" sub="Tell us who you are and what you can do. We map this to ISCO-08, ESCO and locally-calibrated opportunities." />

        {loading ? (
          <ClaudeLoader countryName={country.name} />
        ) : (
          <div className="space-y-5">
            {/* Lovable AI is always available — no API key prompt needed */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label-mono">Name (optional)</label>
                <input value={form.name} onChange={(e) => update("name", e.target.value)} className="mt-1 w-full surface2 rounded-sm px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="label-mono">Age</label>
                <input type="number" value={form.age} onChange={(e) => update("age", e.target.value === "" ? "" : Number(e.target.value))} className="mt-1 w-full surface2 rounded-sm px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label-mono">Education</label>
                <select value={form.education} onChange={(e) => update("education", e.target.value)} className="mt-1 w-full surface2 rounded-sm px-3 py-2 text-sm outline-none">
                  {educations.map((e) => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="label-mono">Years of work experience</label>
                <select value={form.experience} onChange={(e) => update("experience", e.target.value)} className="mt-1 w-full surface2 rounded-sm px-3 py-2 text-sm outline-none">
                  {experiences.map((e) => <option key={e}>{e} years</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label-mono">Skills & experience <span className="normal-case text-text-muted">(press Enter to add)</span></label>
              <div className="mt-1"><TagInput value={form.skills} onChange={(v) => update("skills", v)} placeholder="phone repair, customer service..." /></div>
            </div>

            <div>
              <label className="label-mono">Tell us about your work and how you learned</label>
              <textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={4} className="mt-1 w-full surface2 rounded-sm px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand resize-none" />
            </div>

            <div>
              <label className="label-mono">Languages spoken</label>
              <div className="mt-1"><TagInput value={form.languages} onChange={(v) => update("languages", v)} placeholder="English, French..." /></div>
            </div>

            <div>
              <label className="label-mono">Connectivity context</label>
              <select value={form.connectivity} onChange={(e) => update("connectivity", e.target.value)} className="mt-1 w-full surface2 rounded-sm px-3 py-2 text-sm outline-none">
                {connectivities.map((e) => <option key={e}>{e}</option>)}
              </select>
            </div>

            {err && <div className="text-sm text-danger surface rounded-sm p-3">{err}</div>}

            <div className="pt-2 flex items-center gap-4">
              <button onClick={() => nav("/app/grow")} className="bg-brand text-bg px-6 py-3 rounded-sm font-medium text-sm hover:opacity-90">
                Continue to Grow →
              </button>
              <span className="label-mono">Active country: {country.name} ({country.code})</span>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
