import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import LanguageToggle from "@/components/LanguageToggle";
import PasswordStrength, { isPasswordStrong } from "@/components/PasswordStrength";
import { ArrowLeft, Camera, KeyRound, Save, Mail, Building2, Shield, Calendar, Copy, X, CheckCircle2 } from "lucide-react";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

const ROLE_LABEL = {
  owner: "Owner", admin: "Administrator", manager: "Manager", employee: "Employee",
};

export default function Profile() {
  const { user, setUserAfterAuth, logout } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ current: "", next: "" });
  const [pwSaving, setPwSaving] = useState(false);

  const [emailForm, setEmailForm] = useState({ new_email: "", current_password: "" });
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailDevLink, setEmailDevLink] = useState(null);

  const refresh = async () => {
    try {
      const r = await api.get("/profile");
      setProfile(r.data);
      setName(r.data.name || "");
      setAvatar(r.data.avatar || null);
    } catch { toast.error("Failed to load profile"); }
  };

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  const chooseAvatar = () => fileRef.current?.click();

  const onAvatarPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 250_000) { toast.error("Image is too large (max ~250KB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result);
    reader.readAsDataURL(f);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.patch("/profile", { name: name.trim(), avatar });
      setProfile((p) => ({ ...(p || {}), ...r.data }));
      setUserAfterAuth({ ...(user || {}), name: r.data.name });
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (!isPasswordStrong(pwForm.next)) return toast.error("New password must be 8+ chars with a letter and a number");
    setPwSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: pwForm.current, new_password: pwForm.next });
      setPwForm({ current: "", next: "" });
      toast.success("Password changed");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not change password");
    } finally { setPwSaving(false); }
  };

  const requestEmailChange = async (e) => {
    e.preventDefault();
    setEmailSubmitting(true);
    setEmailDevLink(null);
    try {
      const r = await api.post("/profile/email/request-change", {
        new_email: emailForm.new_email.trim().toLowerCase(),
        current_password: emailForm.current_password,
      });
      await refresh();
      setEmailForm({ new_email: "", current_password: "" });
      if (r.data?.email_sent) {
        toast.success(`Confirmation email sent to ${r.data.pending_email}`);
      } else if (r.data?.dev_token) {
        setEmailDevLink(`${window.location.origin}/verify-email/${r.data.dev_token}`);
        toast.info("Confirmation link generated (see below)");
      } else {
        toast.success("Verification requested");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not request email change");
    } finally { setEmailSubmitting(false); }
  };

  const cancelEmailChange = async () => {
    try {
      await api.post("/profile/email/cancel-change");
      setEmailDevLink(null);
      await refresh();
      toast.success("Pending email change cancelled");
    } catch { toast.error("Could not cancel"); }
  };

  const copyEmailLink = () => {
    if (!emailDevLink) return;
    navigator.clipboard?.writeText(emailDevLink);
    toast.success("Link copied");
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading profile…</div>;
  if (!profile) return null;

  const initials = (profile.name || profile.email || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const roleLabel = ROLE_LABEL[profile.role] || profile.role;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-4 sm:px-6">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="profile-back-btn" aria-label="Go back">
          <ArrowLeft className="h-4 w-4 rtl-flip" strokeWidth={1.5} aria-hidden="true" /> Back
        </button>
        <LanguageToggle />
      </header>

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <h1 className="display text-2xl sm:text-3xl font-bold tracking-tight" data-testid="profile-title">Profile</h1>

        {/* Pending email verification banner */}
        {profile.pending_email && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="pending-email-banner">
            <div className="flex-1 text-sm">
              <div className="font-medium">Confirm your new email</div>
              <div className="text-muted-foreground">
                We&apos;re waiting for you to confirm <span className="font-mono">{profile.pending_email}</span>.
                {profile.email_delivery_enabled
                  ? " Check your inbox for the verification link."
                  : " Use the verification link generated below."}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={cancelEmailChange} className="gap-1.5" data-testid="cancel-pending-email-btn">
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" /> Cancel
            </Button>
          </div>
        )}

        {/* Identity card */}
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-6" data-testid="profile-details-card">
          <form onSubmit={saveProfile} className="space-y-5" noValidate>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="relative w-fit">
                {avatar ? (
                  <img src={avatar} alt={`${profile.name || 'user'} avatar`} className="h-20 w-20 rounded-full object-cover" data-testid="profile-avatar-preview" />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-primary/10 text-primary grid place-items-center text-2xl font-bold" data-testid="profile-avatar-fallback" aria-label="Default avatar">{initials}</div>
                )}
                <button type="button" onClick={chooseAvatar} className="absolute bottom-0 end-0 h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center shadow" data-testid="upload-avatar-btn" aria-label="Upload a new avatar">
                  <Camera className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarPick} data-testid="avatar-file-input" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate" data-testid="profile-display-name">{profile.name}</div>
                <div className="text-sm text-muted-foreground truncate" data-testid="profile-display-email">{profile.email}</div>
                <div className="text-xs text-muted-foreground mt-1" data-testid="profile-display-role">{roleLabel} · {profile.workspace_name}</div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" data-testid="profile-name-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="gap-2" data-testid="save-profile-btn">
                <Save className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </section>

        {/* Account facts */}
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3" data-testid="account-info-card">
          <h2 className="text-base font-semibold">Account</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" strokeWidth={1.5} aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-muted-foreground">Company</dt>
                <dd className="font-medium truncate" data-testid="account-company">{profile.workspace_name || "—"}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-4 w-4 text-muted-foreground mt-0.5" strokeWidth={1.5} aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium" data-testid="account-role">{roleLabel}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" strokeWidth={1.5} aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-muted-foreground">Member since</dt>
                <dd className="font-medium" data-testid="account-created-at">{formatDate(profile.created_at)}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5" strokeWidth={1.5} aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium truncate" data-testid="account-email">{profile.email}</dd>
              </div>
            </div>
          </dl>
        </section>

        {/* Email change card */}
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4" data-testid="email-change-card">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="text-lg font-semibold">Change email address</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            We&apos;ll send a confirmation link to your new address. Your email only changes after you click it.
          </p>
          <form onSubmit={requestEmailChange} className="space-y-4" noValidate>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new_email">New email</Label>
                <Input id="new_email" type="email" required autoComplete="email" data-testid="new-email-input"
                  value={emailForm.new_email}
                  onChange={(e) => setEmailForm({ ...emailForm, new_email: e.target.value })}
                  placeholder="you@newdomain.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email_current_pw">Current password</Label>
                <Input id="email_current_pw" type="password" required autoComplete="current-password" data-testid="email-current-password-input"
                  value={emailForm.current_password}
                  onChange={(e) => setEmailForm({ ...emailForm, current_password: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={emailSubmitting} data-testid="request-email-change-btn">
                {emailSubmitting ? "Sending…" : "Send verification link"}
              </Button>
            </div>
          </form>
          {emailDevLink && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3" data-testid="email-change-dev-link-block">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-primary" strokeWidth={2} aria-hidden="true" /> Verification link
              </div>
              <div className="font-mono text-xs break-all">{emailDevLink}</div>
              <Button size="sm" variant="outline" onClick={copyEmailLink} className="mt-3 gap-1.5" data-testid="copy-email-verify-link">
                <Copy className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" /> Copy link
              </Button>
              <p className="text-xs text-muted-foreground mt-2">Email delivery isn&apos;t configured — open this link (or paste it in a new tab) to confirm.</p>
            </div>
          )}
        </section>

        {/* Change password */}
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4" data-testid="change-password-card">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="text-lg font-semibold">Change password</h2>
          </div>
          <form onSubmit={changePw} className="space-y-4" noValidate>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current password</Label>
                <Input id="current" type="password" required autoComplete="current-password" data-testid="current-password-input" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next">New password</Label>
                <Input id="next" type="password" required minLength={8} autoComplete="new-password" data-testid="new-password-input" value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} />
              </div>
            </div>
            <PasswordStrength value={pwForm.next} />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">Forgot password?</Link>
              <Button type="submit" disabled={pwSaving} data-testid="change-password-btn">{pwSaving ? "Saving…" : "Update password"}</Button>
            </div>
          </form>
        </section>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => { logout(); navigate("/login"); }} data-testid="profile-logout-btn">Sign out</Button>
        </div>
      </main>
    </div>
  );
}
