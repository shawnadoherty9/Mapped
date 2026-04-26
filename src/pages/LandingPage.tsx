import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, GraduationCap, Globe2, ShieldCheck, LineChart, FileSpreadsheet, Users, Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth, type AccountRole } from "@/hooks/useAuth";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import LandingSectorMap from "@/components/LandingSectorMap";
import LanguageSwitcher from "@/components/LanguageSwitcher";

/**
 * Public landing page targeted at a World Bank / labor-policy audience.
 * Top-of-funnel: explains the product, the calibration approach, and the
 * two account types (individual upskiller vs. policymaker / employer).
 *
 * All user-visible strings come from i18next via `t()`, so the page renders
 * in the active language (defaults to detected browser locale, persisted via
 * localStorage). See src/i18n/index.ts for the bootstrap.
 */
export default function LandingPage() {
  const { session, profile } = useAuth();
  const { t } = useTranslation();
  const dashHref = profile?.role === "policymaker" ? "/app/policy" : "/app/risk";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-lg text-text">MAPPED</span>
            <span className="label-mono hidden sm:inline">{t("landing.tagline")}&nbsp;</span>
          </Link>
          <nav className="flex items-center gap-1">
            <a href="#about" className="text-xs font-mono text-text-muted hover:text-text px-2.5 py-1.5 rounded-sm hover:bg-surface2/60 transition-colors">{t("landing.nav.about")}</a>
            <a href="#how" className="text-xs font-mono text-text-muted hover:text-text px-2.5 py-1.5 rounded-sm hover:bg-surface2/60 transition-colors">{t("landing.nav.how")}</a>
            <a href="#audiences" className="text-xs font-mono text-text-muted hover:text-text px-2.5 py-1.5 rounded-sm hover:bg-surface2/60 transition-colors">{t("landing.nav.signUp")}</a>
            <LanguageSwitcher />
            <span aria-hidden="true" className="hidden sm:inline-block w-px h-4 bg-border mx-2" />
            {session ? (
              <Button asChild size="sm">
                <Link to={dashHref}>{t("common.openDashboard")} <ArrowRight size={14} className="ml-1 rtl:rotate-180" /></Link>
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Button asChild size="sm" variant="ghost"><Link to="/auth">{t("common.signIn")}</Link></Button>
                <Button asChild size="sm"><Link to="/auth">{t("common.createAccount")}</Link></Button>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative grid-paper border-b border-border">
        <div className="max-w-7xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="max-w-3xl">
            <div className="label-mono mb-4">&nbsp;</div>
            <h1 className="font-display text-4xl md:text-6xl text-text leading-[1.05] tracking-tight">
              {t("landing.hero.title")}
            </h1>
            <p className="mt-6 text-text-muted text-lg leading-relaxed max-w-2xl">
              {t("landing.hero.sub")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/auth">{t("landing.hero.ctaPrimary")} <ArrowRight size={16} className="ml-1.5 rtl:rotate-180" /></Link></Button>
              
            </div>
            <div className="mt-8 flex flex-nowrap items-center gap-x-3 sm:gap-x-6 text-[10px] sm:text-xs font-mono text-text-muted overflow-x-auto whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 shrink-0"><ShieldCheck size={12} className="text-accent" /> {t("landing.hero.trustSources")}</span>
              <span className="inline-flex items-center gap-1.5 shrink-0"><Globe2 size={12} className="text-accent" /> {t("landing.hero.trustAudiences")}</span>
              <span className="inline-flex items-center gap-1.5 shrink-0"><FileSpreadsheet size={12} className="text-accent" /> {t("landing.hero.trustExports")}</span>
            </div>
          </div>
        </div>

        {/* stat strip — numbers are universal; only labels need translation */}
        <div className="border-t border-border bg-surface">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
            <Stat k="9" label="ISCO-08 major groups modelled" />
            <Stat k="4" label="calibration factors per country" />
            <Stat k="3" label="confidence bands surfaced" />
            <Stat k="100%" label="of figures link to source row" />
          </div>
        </div>
      </section>

      {/* Global growth-sector map — public, anonymous-friendly */}
      <section id="growth-map" className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <LandingSectorMap />
        </div>
      </section>

      {/* Audiences — two account paths */}
      <section id="audiences" className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-10">
            <div className="label-mono mb-2">{t("landing.audiences.eyebrow")}</div>
            <h2 className="font-display text-3xl text-text">{t("landing.audiences.title")}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <AudienceCard
              icon={<GraduationCap size={20} className="text-teal" />}
              tag=""
              title={t("landing.audiences.individualsTitle")}
              points={[
                t("landing.audiences.individualsBullet1"),
                t("landing.audiences.individualsBullet2"),
                t("landing.audiences.individualsBullet3"),
              ]}
              cta={t("landing.audiences.individualsCta")}
              ctaHref="/auth"
              role="individual"
              googleLabel="Continue with Google · JOB SEEKER"
            />
            <AudienceCard
              icon={<BarChart3 size={20} className="text-accent" />}
              tag=""
              title={t("landing.audiences.policyTitle")}
              points={[
                t("landing.audiences.policyBullet1"),
                t("landing.audiences.policyBullet2"),
                t("landing.audiences.policyBullet3"),
              ]}
              cta={t("landing.audiences.policyCta")}
              ctaHref="/auth"
              role="policymaker"
              googleLabel="Continue with Google · Policymaker"
              accent
            />
          </div>
        </div>
      </section>

      {/* About — consolidated overview of what MAPPED does */}
      <section id="about" className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-10">
            <div className="label-mono mb-2">{t("landing.about.eyebrow")}</div>
            <h2 className="font-display text-3xl text-text">{t("landing.about.title")}</h2>
            <p className="mt-3 text-text-muted">{t("landing.about.sub")}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Feature icon={<BarChart3 size={18} className="text-accent" />}     title={t("landing.about.card1Title")} desc={t("landing.about.card1Desc")} />
            <Feature icon={<GraduationCap size={18} className="text-accent" />} title={t("landing.about.card2Title")} desc={t("landing.about.card2Desc")} />
            <Feature icon={<Users size={18} className="text-accent" />}         title={t("landing.about.card3Title")} desc={t("landing.about.card3Desc")} />
            <Feature icon={<Database size={18} className="text-accent" />}      title={t("landing.about.card4Title")} desc={t("landing.about.card4Desc")} />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-10">
            <div className="label-mono mb-2">{t("landing.how.eyebrow")}</div>
            <h2 className="font-display text-3xl text-text">{t("landing.how.title")}</h2>
            <p className="mt-3 text-text-muted">{t("landing.how.sub")}</p>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            <Step n="1" title={t("landing.how.step1Title")} desc={t("landing.how.step1Desc")} />
            <Step n="2" title={t("landing.how.step2Title")} desc={t("landing.how.step2Desc")} />
            <Step n="3" title={t("landing.how.step3Title")} desc={t("landing.how.step3Desc")} />
            <Step n="4" title={t("landing.how.step4Title")} desc={t("landing.how.step4Desc")} />
          </div>
          <div className="mt-8 surface2 p-4 font-mono text-xs text-text-muted overflow-x-auto whitespace-nowrap">
            <span className="text-accent">{t("landing.how.formulaLabel")}</span> {t("landing.how.formula")}
          </div>
        </div>
      </section>

      {/* Sources / trust */}
      <section id="evidence" className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-6">
          <SourceItem icon={<Globe2 size={18} className="text-accent" />}          title={t("landing.evidence.title1")} desc={t("landing.evidence.desc1")} />
          <SourceItem icon={<LineChart size={18} className="text-accent" />}       title={t("landing.evidence.title2")} desc={t("landing.evidence.desc2")} />
          <SourceItem icon={<FileSpreadsheet size={18} className="text-accent" />} title={t("landing.evidence.title3")} desc={t("landing.evidence.desc3")} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-accent">
        <div className="max-w-7xl mx-auto px-6 py-16 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="text-[hsl(var(--accent-foreground))]">
            <div className="label-mono opacity-70">{t("landing.audiences.eyebrow")}</div>
            <h2 className="font-display text-2xl md:text-3xl">{t("landing.about.title")}</h2>
          </div>
          <div className="flex gap-3">
            <Button asChild size="lg" variant="secondary"><Link to="/auth">{t("common.createAccount")}</Link></Button>
            <Button asChild size="lg" variant="outline" className="border-white/40 text-black bg-white hover:bg-white/90 hover:text-black"><Link to="/auth">{t("common.signIn")}</Link></Button>
          </div>
        </div>
      </section>

      <footer className="bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono text-text-muted">
          <div>{t("landing.footer.rights")}</div>
          <div className="flex gap-4">
            <a href="#how" className="hover:text-text">{t("landing.footer.linkHow")}</a>
            <a href="#about" className="hover:text-text">{t("landing.footer.linkAbout")}</a>
            <Link to="/auth" className="hover:text-text">{t("common.signIn")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ k, label }: { k: string; label: string }) {
  return (
    <div className="px-4 py-6 text-center">
      <div className="data-num text-3xl text-text">{k}</div>
      <div className="label-mono mt-1">{label}</div>
    </div>
  );
}

function AudienceCard({
  icon, tag, title, points, cta, ctaHref, accent, role, googleLabel,
}: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  points: string[];
  cta: string;
  ctaHref: string;
  accent?: boolean;
  role: AccountRole;
  googleLabel: string;
}) {
  return (
    <div className={`surface-elevated p-7 border-l-2 ${accent ? "border-accent" : "border-teal"}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="label-mono">{tag}</span>
      </div>
      <h3 className="font-display text-2xl text-text mb-4">{title}</h3>
      <ul className="space-y-2 mb-6">
        {points.map((p) => (
          <li key={p} className="text-sm text-text-muted flex gap-2 leading-relaxed">
            <span className={`mt-1.5 h-1 w-1 rounded-full shrink-0 ${accent ? "bg-accent" : "bg-teal"}`} />
            {p}
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        <GoogleSignInButton role={role} label={googleLabel} />
        <Button asChild className="w-full" variant="outline">
          <Link to={ctaHref}>{cta} <ArrowRight size={14} className="ml-1.5 rtl:rotate-180" /></Link>
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="surface p-5">
      <div className="data-num text-3xl text-accent mb-1">{n}</div>
      <div className="font-mono text-xs text-text mb-1">{title}</div>
      <div className="text-xs text-text-muted leading-relaxed">{desc}</div>
    </div>
  );
}

function SourceItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="surface p-6">
      <div className="mb-3">{icon}</div>
      <div className="font-display text-lg text-text mb-1">{title}</div>
      <div className="text-sm text-text-muted leading-relaxed">{desc}</div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="surface-elevated p-5 border border-border hover:border-strong transition-colors">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <div className="font-display text-base text-text">{title}</div>
      </div>
      <div className="text-sm text-text-muted leading-relaxed">{desc}</div>
    </div>
  );
}
