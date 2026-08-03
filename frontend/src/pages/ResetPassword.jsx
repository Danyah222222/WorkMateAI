import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";
import { Sparkles, ArrowLeft } from "lucide-react";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw });
      toast.success("Password reset — please sign in");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Reset failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> Sign in
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 space-y-6" data-testid="reset-password-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <div className="display font-bold tracking-tight">Choose a new password</div>
              <div className="text-xs text-muted-foreground">Must be at least 6 characters.</div>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" data-testid="reset-password-input" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete="new-password" />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11" data-testid="reset-submit-btn">
              {loading ? "Saving…" : "Reset password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
