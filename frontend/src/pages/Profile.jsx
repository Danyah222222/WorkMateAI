import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import LanguageToggle from "@/components/LanguageToggle";
import { ArrowLeft, Camera, KeyRound, Save } from "lucide-react";

export default function Profile() {
  const { user, setUserAfterAuth, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [pwForm, setPwForm] = useState({ current: "", next: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/profile")
      .then(r => { setProfile(r.data); setName(r.data.name || ""); setAvatar(r.data.avatar || null); })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const chooseAvatar = () => fileRef.current?.click();

  const onAvatarPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 250_000) {
      toast.error("Image is too large (max ~250KB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result);
    reader.readAsDataURL(f);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.patch("/profile", { name: name.trim(), avatar });
      setProfile(r.data);
      setUserAfterAuth({ ...(user || {}), name: r.data.name });
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (pwForm.next.length < 6) return toast.error("New password must be at least 6 characters");
    setPwSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: pwForm.current, new_password: pwForm.next });
      setPwForm({ current: "", next: "" });
      toast.success("Password changed");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not change password");
    } finally { setPwSaving(false); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading profile…</div>;
  if (!profile) return null;

  const initials = (profile.name || profile.email || "?").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center justify-between px-6">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="profile-back-btn">
          <ArrowLeft className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> Back
        </button>
        <LanguageToggle />
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10 space-y-6">
        <h1 className="display text-3xl font-bold tracking-tight" data-testid="profile-title">Profile</h1>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-6" data-testid="profile-details-card">
          <form onSubmit={save} className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                {avatar ? (
                  <img src={avatar} alt="avatar" className="h-20 w-20 rounded-full object-cover" data-testid="profile-avatar-preview" />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-primary/10 text-primary grid place-items-center text-2xl font-bold" data-testid="profile-avatar-fallback">{initials}</div>
                )}
                <button type="button" onClick={chooseAvatar} className="absolute bottom-0 end-0 h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center shadow" data-testid="upload-avatar-btn">
                  <Camera className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarPick} data-testid="avatar-file-input" />
              </div>
              <div>
                <div className="font-semibold">{profile.name}</div>
                <div className="text-sm text-muted-foreground">{profile.email}</div>
                <div className="text-xs text-muted-foreground mt-1 capitalize">{profile.role} · {profile.workspace_name}</div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" data-testid="profile-name-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="gap-2" data-testid="save-profile-btn">
                <Save className="h-4 w-4" strokeWidth={2} /> {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-4" data-testid="change-password-card">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <h2 className="text-lg font-semibold">Change password</h2>
          </div>
          <form onSubmit={changePw} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current password</Label>
                <Input id="current" type="password" required autoComplete="current-password" data-testid="current-password-input" value={pwForm.current} onChange={(e) => setPwForm({...pwForm, current: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next">New password</Label>
                <Input id="next" type="password" required minLength={6} autoComplete="new-password" data-testid="new-password-input" value={pwForm.next} onChange={(e) => setPwForm({...pwForm, next: e.target.value})} />
              </div>
            </div>
            <div className="flex items-center justify-between">
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
