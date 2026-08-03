import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LanguageContext";
import LanguageToggle from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";
import { Sparkles, ArrowLeft } from "lucide-react";
import PasswordStrength, { isPasswordStrong } from "@/components/PasswordStrength";

export default function Register() {
  const navigate = useNavigate();
  const { t } = useLang();
  const { setUserAfterAuth } = useAuth();
  const [form, setForm] = useState({ workspace_name: "", name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!isPasswordStrong(form.password)) {
      toast.error("Password must be at least 8 characters and include a letter and a number");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/register", form);
      localStorage.setItem("wm_token", res.data.access_token);
      setUserAfterAuth(res.data.user);
      toast.success(`Welcome to ${res.data.user.workspace_name}`);
      navigate("/admin", { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : "Could not create your workspace";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-secondary/30 border-e border-border overflow-hidden">
        <div className="absolute inset-0 gradient-mesh opacity-60" />
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="display font-bold text-lg tracking-tight">WorkMate<span className="text-primary">.</span>AI</span>
          </Link>
        </div>
        <div className="relative z-10 space-y-6">
          <h2 className="display text-4xl font-bold tracking-tight leading-tight">
            Start your company&apos;s private AI workspace in seconds.
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>· Private, isolated per company</li>
            <li>· Invite your team by email</li>
            <li>· Role-based permissions built in</li>
          </ul>
        </div>
        <div className="relative z-10 text-xs text-muted-foreground">© WorkMate AI</div>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-between p-6">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> Sign in
          </Link>
          <LanguageToggle />
        </div>
        <div className="flex-1 flex items-center justify-center px-6 pb-12">
          <form onSubmit={submit} className="w-full max-w-md space-y-6" data-testid="register-form">
            <div>
              <h1 className="display text-3xl font-bold tracking-tight">Create your workspace</h1>
              <p className="text-sm text-muted-foreground mt-2">You&apos;ll be the owner and can invite your team next.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workspace_name">Company / workspace name</Label>
                <Input
                  id="workspace_name"
                  data-testid="register-workspace-input"
                  value={form.workspace_name}
                  onChange={(e) => setForm({...form, workspace_name: e.target.value})}
                  required
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Your full name</Label>
                <Input
                  id="name"
                  data-testid="register-name-input"
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="register-email-input"
                  value={form.email}
                  onChange={(e) => setForm({...form, email: e.target.value})}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="register-password-input"
                  value={form.password}
                  onChange={(e) => setForm({...form, password: e.target.value})}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <PasswordStrength value={form.password} />
              </div>
            </div>

            <Button data-testid="register-submit-btn" type="submit" disabled={loading} className="w-full h-11 rounded-md">
              {loading ? "Creating workspace…" : "Create workspace"}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Already have an account? <Link to="/login" className="text-primary font-medium">Sign in</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
