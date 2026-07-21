import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import LanguageToggle from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";
import { Sparkles, ArrowLeft } from "lucide-react";

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { setUserAfterAuth } = useAuth();
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ name: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/invitations/lookup/${token}`)
      .then(r => setInvite(r.data))
      .catch(err => setLoadError(err.response?.data?.detail || "This invitation link is invalid or expired."));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post("/auth/accept-invite", {
        token,
        name: form.name,
        password: form.password,
      });
      localStorage.setItem("wm_token", res.data.access_token);
      setUserAfterAuth(res.data.user);
      toast.success(`Welcome to ${res.data.user.workspace_name}`);
      navigate(res.data.user.role === "employee" ? "/chat" : "/admin", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not accept invitation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> Home
          </Link>
          <LanguageToggle />
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 space-y-6" data-testid="accept-invite-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <div className="display font-bold tracking-tight">WorkMate<span className="text-primary">.</span>AI</div>
              <div className="text-xs text-muted-foreground">Join a workspace</div>
            </div>
          </div>

          {loadError ? (
            <div className="text-sm text-destructive" data-testid="invite-error">{loadError}</div>
          ) : !invite ? (
            <div className="text-sm text-muted-foreground">Loading invitation…</div>
          ) : (
            <>
              <div className="text-sm">
                <div className="text-muted-foreground">You&apos;ve been invited to</div>
                <div className="display text-2xl font-bold mt-1">{invite.workspace_name}</div>
                <div className="text-muted-foreground mt-1 text-xs">
                  as <span className="font-medium capitalize text-foreground">{invite.role}</span> · invited by {invite.invited_by_name}
                </div>
              </div>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Work email</Label>
                  <Input value={invite.email} disabled data-testid="invite-email-input" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Your full name</Label>
                  <Input
                    id="name"
                    data-testid="invite-name-input"
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Choose a password</Label>
                  <Input
                    id="password"
                    type="password"
                    data-testid="invite-password-input"
                    value={form.password}
                    onChange={(e) => setForm({...form, password: e.target.value})}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" disabled={submitting} className="w-full h-11 rounded-md" data-testid="invite-submit-btn">
                  {submitting ? "Joining…" : "Accept & join workspace"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
