import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface SharedProject {
  id: string;
  title: string;
  description: string | null;
  sdg_number: number | null;
  skill_focus: string | null;
  skill_tags: string[];
  status: "planned" | "in_progress" | "done";
  started_on: string | null;
  completed_on: string | null;
  external_link: string | null;
  reflection: string | null;
  evidence_paths: string[];
  created_at: string;
  updated_at: string;
}

interface EvidenceLink { name: string; url: string; }

export default function SharedPortfolioPage() {
  const { slug } = useParams<{ slug: string }>();
  const [project, setProject] = useState<SharedProject | null>(null);
  const [evidence, setEvidence] = useState<EvidenceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("portfolio_projects")
        .select("id, title, description, sdg_number, skill_focus, skill_tags, status, started_on, completed_on, external_link, reflection, evidence_paths, created_at, updated_at, is_public")
        .eq("share_slug", slug ?? "")
        .eq("is_public", true)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setError("This project isn't shared, or the link is invalid.");
        setLoading(false);
        return;
      }
      setProject(data as SharedProject);

      // Sign URLs for evidence files
      if (data.evidence_paths?.length) {
        const signed: EvidenceLink[] = [];
        for (const path of data.evidence_paths) {
          const { data: s } = await supabase
            .storage.from("portfolio-evidence")
            .createSignedUrl(path, 60 * 60);
          if (s?.signedUrl) {
            signed.push({ name: path.split("/").pop() ?? path, url: s.signedUrl });
          }
        }
        if (!cancelled) setEvidence(signed);
      }
      setLoading(false);
    }
    if (slug) load();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text-muted">
        <Loader2 className="animate-spin mr-2" size={16} /> Loading project…
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <div className="font-display text-2xl text-text">Project unavailable</div>
        <div className="text-text-muted text-sm">{error}</div>
        <Link to="/" className="text-sm text-accent hover:underline">← Back home</Link>
      </div>
    );
  }

  const dateRange = [project.started_on, project.completed_on].filter(Boolean).join(" → ");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="text-xs font-mono text-text-muted hover:text-text inline-flex items-center gap-1">
            <ArrowLeft size={12} /> MAPPED
          </Link>
          <div className="label-mono">Shared portfolio project</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {project.sdg_number && <Badge variant="outline">SDG {project.sdg_number}</Badge>}
          <Badge variant={project.status === "done" ? "default" : project.status === "in_progress" ? "secondary" : "outline"}>
            {project.status.replace("_", " ")}
          </Badge>
          {dateRange && <span className="text-xs font-mono text-text-muted">{dateRange}</span>}
        </div>

        <h1 className="font-display text-4xl text-text leading-tight">{project.title}</h1>

        {project.skill_focus && (
          <div className="mt-3 text-sm text-text-muted">
            <span className="label-mono mr-2">Skill focus</span>
            <span className="font-mono">{project.skill_focus}</span>
          </div>
        )}

        {project.skill_tags?.length > 0 && (
          <div className="mt-4">
            <div className="label-mono mb-2">Skills demonstrated</div>
            <div className="flex flex-wrap gap-1.5">
              {project.skill_tags.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        {project.description && (
          <section className="mt-8">
            <div className="label-mono mb-2">Overview</div>
            <p className="text-text whitespace-pre-wrap leading-relaxed">{project.description}</p>
          </section>
        )}

        {project.reflection && (
          <section className="mt-8">
            <div className="label-mono mb-2">What I learned</div>
            <p className="text-text whitespace-pre-wrap leading-relaxed">{project.reflection}</p>
          </section>
        )}

        {project.external_link && (
          <section className="mt-8">
            <div className="label-mono mb-2">External link</div>
            <a href={project.external_link} target="_blank" rel="noreferrer"
              className="text-accent hover:underline inline-flex items-center gap-1.5 text-sm break-all">
              {project.external_link} <ExternalLink size={12} />
            </a>
          </section>
        )}

        {evidence.length > 0 && (
          <section className="mt-8">
            <div className="label-mono mb-2">Sources ({evidence.length})</div>
            <ul className="space-y-1.5">
              {evidence.map((e) => (
                <li key={e.url}>
                  <a href={e.url} target="_blank" rel="noreferrer"
                    className="surface2 rounded-sm px-3 py-2 text-sm text-text hover:text-accent inline-flex items-center gap-2 w-full">
                    <FileText size={13} /> <span className="truncate">{e.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 pt-6 border-t border-border text-xs font-mono text-text-muted">
          Shared via MAPPED · last updated {new Date(project.updated_at).toLocaleDateString()}
        </footer>
      </main>
    </div>
  );
}
