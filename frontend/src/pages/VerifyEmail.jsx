import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import LanguageToggle from "@/components/LanguageToggle";
import { Sparkles, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

/**
 * VerifyEmail — hit when the user clicks the confirm-new-email link.
 * Applies the change on the backend and, if the user is already signed in,
 * refreshes the AuthContext so the header/profile reflect the new address.
 */
export default function VerifyEmail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, setUserAfterAuth } = useAuth();
  const [state, setState] = useState({ loading: true, ok: false, error: null, newEmail: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.post("/profile/email/verify", { token });
        if (cancelled) return;
        setState({ loading: false, ok: true, error: null, newEmail: r.data.new_email });
        if (user) setUserAfterAuth({ ...user, email: r.data.new_email });
        toast.success("Email verified");
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          ok: false,
          error: err.response?.data?.detail || "Verification failed",
          newEmail: null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> Home
          </Link>
          <LanguageToggle />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-6" data-testid="verify-email-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </div>
            <div>
              <div className="display font-bold tracking-tight">Email verification</div>
              <div className="text-xs text-muted-foreground">Confirming your new address…</div>
            </div>
          </div>

          {state.loading && (
            <div className="text-sm text-muted-foreground" data-testid="verify-email-loading">Verifying…</div>
          )}
          {!state.loading && state.ok && (
            <div className="space-y-4" data-testid="verify-email-success">
              <div className="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
                <div className="text-sm">
                  <div className="font-medium">Your email is now <span className="font-mono">{state.newEmail}</span>.</div>
                  <div className="text-muted-foreground mt-1">Use this address next time you sign in.</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                {user ? (
                  <Button onClick={() => navigate("/profile")} data-testid="verify-email-continue-btn">Back to profile</Button>
                ) : (
                  <Button onClick={() => navigate("/login")} data-testid="verify-email-login-btn">Sign in</Button>
                )}
              </div>
            </div>
          )}
          {!state.loading && !state.ok && (
            <div className="space-y-4" data-testid="verify-email-error">
              <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <XCircle className="h-5 w-5 text-destructive mt-0.5" strokeWidth={1.75} aria-hidden="true" />
                <div className="text-sm">
                  <div className="font-medium">{state.error}</div>
                  <div className="text-muted-foreground mt-1">You can request a new verification link from your profile.</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => navigate(user ? "/profile" : "/login")} data-testid="verify-email-back-btn">
                  {user ? "Back to profile" : "Sign in"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
