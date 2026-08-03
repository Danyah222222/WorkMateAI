import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";
import LanguageToggle from "@/components/LanguageToggle";
import { Sparkles, ArrowLeft, Copy } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(true);
      if (res.data?.dev_token) {
        setDevLink(`${window.location.origin}/reset-password/${res.data.dev_token}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Something went wrong");
    } finally { setLoading(false); }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(devLink);
    toast.success("Link copied");
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> Sign in
          </Link>
          <LanguageToggle />
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 space-y-6" data-testid="forgot-password-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <div className="display font-bold tracking-tight">Reset your password</div>
              <div className="text-xs text-muted-foreground">We&apos;ll send you a reset link.</div>
            </div>
          </div>
          {!sent ? (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" data-testid="forgot-email-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11" data-testid="forgot-submit-btn">
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-sm" data-testid="forgot-sent-card">
              <p>If an account exists for <span className="font-medium">{email}</span>, a reset link has been generated.</p>
              {devLink && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Reset link</div>
                  <div className="font-mono text-xs break-all">{devLink}</div>
                  <Button size="sm" variant="outline" onClick={copyLink} className="mt-3 gap-1.5" data-testid="copy-reset-link">
                    <Copy className="h-3 w-3" strokeWidth={1.5} /> Copy link
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Once email delivery is configured, this link will be sent to the inbox.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
