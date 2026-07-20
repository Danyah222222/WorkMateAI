import { Link } from "react-router-dom";
import { useLang } from "@/contexts/LanguageContext";
import LanguageToggle from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, Zap, Workflow, Sparkles } from "lucide-react";

const HERO_IMG = "https://images.unsplash.com/photo-1758073519996-6d3c63b4922c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzN8MHwxfHNlYXJjaHw0fHxhYnN0cmFjdCUyMGRhdGElMjBuZXR3b3JrJTIwZ2xvd2luZ3xlbnwwfHx8fDE3ODQ1MTM0NjJ8MA&ixlib=rb-4.1.0&q=85";

export default function Landing() {
  const { t } = useLang();

  const benefits = [
    { icon: ShieldCheck, title: t("benefit_1_title"), desc: t("benefit_1_desc") },
    { icon: Zap, title: t("benefit_2_title"), desc: t("benefit_2_desc") },
    { icon: Workflow, title: t("benefit_3_title"), desc: t("benefit_3_desc") },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="landing-page">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="display text-lg font-bold tracking-tight">WorkMate<span className="text-primary">.</span>AI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">{t("nav_features")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Link to="/login">
              <Button data-testid="nav-signin-btn" variant="ghost" size="sm" className="rounded-full">{t("nav_login")}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh opacity-70 pointer-events-none" />
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-28 grid lg:grid-cols-12 gap-12 items-center relative">
          <div className="lg:col-span-7 space-y-8 animate-in-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
              {t("hero_badge")}
            </span>
            <h1 className="display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.02] tracking-tighter">
              {t("hero_title")}
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              {t("hero_sub")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/login">
                <Button data-testid="hero-cta-btn" size="lg" className="rounded-full h-12 px-6 gap-2 group">
                  {t("hero_cta")}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform rtl-flip" strokeWidth={2} />
                </Button>
              </Link>
              <Link to="/login">
                <Button data-testid="hero-secondary-btn" size="lg" variant="outline" className="rounded-full h-12 px-6">{t("hero_secondary")}</Button>
              </Link>
            </div>

            {/* Demo credentials chips */}
            <div className="flex flex-wrap gap-2 pt-2">
              <div className="text-xs rounded-md border border-border bg-card/60 px-3 py-2 font-mono">
                <span className="text-muted-foreground">{t("demo_admin")}: </span>admin@technova.com / admin123
              </div>
              <div className="text-xs rounded-md border border-border bg-card/60 px-3 py-2 font-mono">
                <span className="text-muted-foreground">{t("demo_employee")}: </span>sarah@technova.com / employee123
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative animate-in-up" style={{ animationDelay: "150ms" }}>
            <div className="relative rounded-3xl overflow-hidden border border-border shadow-2xl">
              <img src={HERO_IMG} alt="AI network" className="w-full h-[500px] object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
              <div className="absolute bottom-6 start-6 end-6 rounded-2xl backdrop-blur-xl bg-background/80 border border-border/60 p-4">
                <div className="text-xs text-muted-foreground mb-1">Employee query</div>
                <div className="font-medium">Who is the HR manager?</div>
                <div className="mt-3 text-sm border-t border-border/60 pt-3">
                  <span className="font-semibold">Sarah Ahmed</span> — HR Manager
                  <div className="text-xs text-muted-foreground mt-1">Source: employees.csv</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24 border-t border-border">
        <div className="max-w-2xl">
          <h2 className="display text-4xl lg:text-5xl font-bold tracking-tight">{t("benefits_title")}</h2>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <div
                key={i}
                data-testid={`benefit-card-${i}`}
                className="group rounded-2xl border border-border bg-card p-8 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-3 w-3" strokeWidth={2} />
            </div>
            <span className="font-semibold text-foreground">WorkMate AI</span>
          </div>
          <span>{t("footer_note")}</span>
        </div>
      </footer>
    </div>
  );
}
