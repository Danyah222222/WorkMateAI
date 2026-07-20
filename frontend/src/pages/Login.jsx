import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LanguageContext";
import LanguageToggle from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, ArrowLeft, User, ShieldCheck } from "lucide-react";

export default function Login() {
  const { t } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email.trim().toLowerCase(), password);
      toast.success(`Welcome, ${user.name}`);
      navigate(user.role === "admin" ? "/admin" : "/chat", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const fill = (e, p) => { setEmail(e); setPassword(p); };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      {/* Left panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-secondary/30 border-e border-border overflow-hidden">
        <div className="absolute inset-0 gradient-mesh opacity-60" />
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-2" data-testid="login-brand-link">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="display font-bold text-lg tracking-tight">WorkMate<span className="text-primary">.</span>AI</span>
          </Link>
        </div>
        <div className="relative z-10 space-y-8">
          <h2 className="display text-4xl font-bold tracking-tight leading-tight">
            Your company&apos;s knowledge, one question away.
          </h2>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-card/80 p-4 backdrop-blur">
              <div className="text-xs text-muted-foreground">Employee asked</div>
              <div className="font-medium mt-1">What is the remote work policy?</div>
              <div className="mt-3 text-sm border-t border-border/60 pt-3 text-muted-foreground">
                Up to 3 days remote per week with manager approval. Core hours 10 AM – 3 PM.
                <div className="mt-2 text-xs">Source: remote_work_policy.pdf</div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 text-xs text-muted-foreground">© WorkMate AI · Private workspace assistant</div>
      </div>

      {/* Right form */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="back-home-link">
            <ArrowLeft className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> Home
          </Link>
          <LanguageToggle />
        </div>
        <div className="flex-1 flex items-center justify-center px-6 pb-12">
          <form onSubmit={submit} className="w-full max-w-md space-y-6" data-testid="login-form">
            <div>
              <h1 className="display text-3xl font-bold tracking-tight">{t("login_title")}</h1>
              <p className="text-sm text-muted-foreground mt-2">{t("login_sub")}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  data-testid="login-email-input"
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  data-testid="login-password-input"
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button data-testid="login-submit-btn" type="submit" disabled={loading} className="w-full h-11 rounded-md">
              {loading ? "…" : t("login_btn")}
            </Button>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                data-testid="fill-admin-btn"
                onClick={() => fill("admin@technova.com", "admin123")}
                className="rounded-md border border-border bg-card p-3 text-start hover:border-primary transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-medium">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
                  {t("demo_admin")}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">admin@technova.com</div>
              </button>
              <button
                type="button"
                data-testid="fill-employee-btn"
                onClick={() => fill("sarah@technova.com", "employee123")}
                className="rounded-md border border-border bg-card p-3 text-start hover:border-primary transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-medium">
                  <User className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
                  {t("demo_employee")}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">sarah@technova.com</div>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
