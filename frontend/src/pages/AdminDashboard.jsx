import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LanguageContext";
import LanguageToggle from "@/components/LanguageToggle";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  LayoutDashboard, FileText, Users, Settings2, Workflow, LogOut,
  Sparkles, Upload, Trash2, Calendar, LifeBuoy, FileSpreadsheet, FileType2, Plus,
  ThumbsUp, ThumbsDown, MessageSquare, AlertTriangle, RefreshCw,
} from "lucide-react";

const NAV = [
  { key: "dashboard", icon: LayoutDashboard, i18n: "admin_dashboard" },
  { key: "knowledge", icon: FileText, i18n: "knowledge" },
  { key: "employees", icon: Users, i18n: "employees" },
  { key: "settings", icon: Settings2, i18n: "ai_settings" },
  { key: "automations", icon: Workflow, i18n: "automations" },
  { key: "feedback", icon: ThumbsUp, i18n: "feedback" },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState("dashboard");
  const [stats, setStats] = useState({ employees: 0, documents: 0, conversations: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  const loadStats = () => {
    setStatsError(null);
    setStatsLoading(true);
    return api.get("/stats")
      .then(r => setStats(r.data))
      .catch(() => setStatsError("Failed to load dashboard stats."))
      .finally(() => setStatsLoading(false));
  };

  useEffect(() => { loadStats(); }, [tab]);

  return (
    <div className="min-h-screen flex bg-background text-foreground" data-testid="admin-dashboard">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-e border-border bg-card/30">
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            </div>
            <div>
              <div className="display font-bold tracking-tight leading-none">WorkMate<span className="text-primary">.</span>AI</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Admin workspace</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = tab === n.key;
            return (
              <button
                key={n.key}
                data-testid={`nav-${n.key}`}
                onClick={() => setTab(n.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
                {t(n.i18n)}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
          <button
            data-testid="logout-btn"
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> {t("logout")}
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 backdrop-blur-xl bg-background/70 sticky top-0 z-30">
          <h1 className="display text-xl font-bold tracking-tight">{t(NAV.find(n => n.key === tab)?.i18n)}</h1>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold">
                {user?.name?.[0]}
              </div>
              <span className="text-sm">{user?.name}</span>
            </div>
          </div>
        </header>

        <div className="p-6 flex-1 overflow-auto">
          {tab === "dashboard" && <DashboardHome stats={stats} setTab={setTab} loading={statsLoading} loadError={statsError} onRetry={loadStats} />}
          {tab === "knowledge" && <KnowledgeTab />}
          {tab === "employees" && <EmployeesTab />}
          {tab === "settings" && <SettingsTab />}
          {tab === "automations" && <AutomationsTab />}
          {tab === "feedback" && <FeedbackTab />}
        </div>
      </main>
    </div>
  );
}

function DashboardHome({ stats, setTab, loading, loadError, onRetry }) {
  const { t } = useLang();
  const cards = [
    { label: t("stat_employees"), val: stats.employees, icon: Users, to: "employees" },
    { label: t("stat_documents"), val: stats.documents, icon: FileText, to: "knowledge" },
    { label: t("stat_conversations"), val: stats.conversations, icon: Sparkles, to: "dashboard" },
  ];
  return (
    <div className="space-y-6">
      {loadError && <ErrorState message={loadError} onRetry={onRetry} />}
      <div className="grid sm:grid-cols-3 gap-4">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <button
              key={i}
              data-testid={`stat-card-${c.to}`}
              onClick={() => setTab(c.to)}
              className="rounded-2xl border border-border bg-card p-6 text-start hover:-translate-y-0.5 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{c.label}</div>
                <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              </div>
              {loading ? (
                <div className="mt-4 h-10 w-16 rounded bg-secondary animate-pulse" />
              ) : (
                <div className="display text-4xl font-bold mt-4">{c.val}</div>
              )}
            </button>
          );
        })}
      </div>
      <div className="rounded-2xl border border-border bg-card p-8">
        <h3 className="display text-2xl font-bold tracking-tight">Welcome back</h3>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Upload company files, manage your directory, and configure your AI assistant. Employees can start chatting the moment your knowledge is in place.
        </p>
      </div>
    </div>
  );
}

function KnowledgeTab() {
  const { t } = useLang();
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const fileRef = useRef(null);

  const load = () => {
    setLoadError(null);
    return api.get("/documents")
      .then(r => setDocs(r.data))
      .catch(() => setLoadError("Failed to load documents."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        await api.post("/documents/upload", fd, { headers: { "Content-Type": "multipart/form-data" }});
      }
      toast.success("Files uploaded");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id) => {
    await api.delete(`/documents/${id}`);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div
        data-testid="upload-dropzone"
        className="rounded-2xl border-2 border-dashed border-border bg-card/40 p-10 text-center transition-colors hover:border-primary/60"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleUpload(Array.from(e.dataTransfer.files)); }}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground" strokeWidth={1.5} />
        <div className="mt-4 font-semibold">{t("upload_files")}</div>
        <div className="text-sm text-muted-foreground mt-1">{t("upload_hint")}</div>
        <input
          ref={fileRef}
          type="file"
          data-testid="file-input"
          accept=".pdf,.csv"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(Array.from(e.target.files))}
        />
        <Button
          data-testid="browse-files-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          variant="outline"
          className="mt-4 rounded-full"
        >
          {uploading ? "Uploading…" : "Browse files"}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("file_name")}</TableHead>
              <TableHead>{t("file_type")}</TableHead>
              <TableHead>{t("uploaded")}</TableHead>
              <TableHead className="text-end">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={4}><SkeletonRows cols={4} /></TableCell></TableRow>
            )}
            {!loading && loadError && (
              <TableRow>
                <TableCell colSpan={4}>
                  <ErrorState message={loadError} onRetry={load} />
                </TableCell>
              </TableRow>
            )}
            {!loading && !loadError && docs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <EmptyState
                    icon={FileText}
                    title="No documents yet"
                    description="Upload company policies or a CSV of your employee directory to unlock the AI assistant."
                    ctaLabel="Upload your first file"
                    onCta={() => fileRef.current?.click()}
                    testId="empty-documents"
                  />
                </TableCell>
              </TableRow>
            )}
            {!loading && !loadError && docs.map((d) => (
              <TableRow key={d.id} data-testid={`doc-row-${d.id}`}>
                <TableCell className="font-medium flex items-center gap-2">
                  {d.file_type === "csv" ? <FileSpreadsheet className="h-4 w-4 text-emerald-500" strokeWidth={1.5} /> : <FileType2 className="h-4 w-4 text-rose-500" strokeWidth={1.5} />}
                  {d.filename}
                </TableCell>
                <TableCell><Badge variant="secondary" className="uppercase">{d.file_type}</Badge></TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(d.uploaded_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-end">
                  <Button data-testid={`delete-doc-${d.id}`} variant="ghost" size="icon" onClick={() => remove(d.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.5} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EmployeesTab() {
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", department: "", position: "", email: "" });
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = () => {
    setLoadError(null);
    return api.get("/employees")
      .then(r => setRows(r.data))
      .catch(() => setLoadError("Failed to load employees."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/employees", form);
      setForm({ name: "", department: "", position: "", email: "" });
      setAdding(false);
      toast.success("Employee added");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const del = async (id) => {
    await api.delete(`/employees/${id}`);
    toast.success("Removed");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button data-testid="add-employee-btn" onClick={() => setAdding(!adding)} className="rounded-full gap-2">
          <Plus className="h-4 w-4" strokeWidth={2} /> Add employee
        </Button>
      </div>
      {adding && (
        <form onSubmit={add} className="rounded-2xl border border-border bg-card p-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="add-employee-form">
          <Input placeholder={t("name")} value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
          <Input placeholder={t("department")} value={form.department} onChange={(e) => setForm({...form, department: e.target.value})} required />
          <Input placeholder={t("position")} value={form.position} onChange={(e) => setForm({...form, position: e.target.value})} required />
          <Input type="email" placeholder={t("email")} value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} required />
          <div className="lg:col-span-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" data-testid="save-employee-btn">Save</Button>
          </div>
        </form>
      )}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("department")}</TableHead>
              <TableHead>{t("position")}</TableHead>
              <TableHead>{t("email")}</TableHead>
              <TableHead className="text-end">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5}><SkeletonRows cols={5} /></TableCell></TableRow>
            )}
            {!loading && loadError && (
              <TableRow>
                <TableCell colSpan={5}><ErrorState message={loadError} onRetry={load} /></TableCell>
              </TableRow>
            )}
            {!loading && !loadError && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    icon={Users}
                    title="No employees yet"
                    description="Add your first employee to build the company directory."
                    ctaLabel="Add employee"
                    onCta={() => setAdding(true)}
                    testId="empty-employees"
                  />
                </TableCell>
              </TableRow>
            )}
            {!loading && !loadError && rows.map((r) => (
              <TableRow key={r.id} data-testid={`emp-row-${r.id}`}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.department}</TableCell>
                <TableCell className="text-muted-foreground">{r.position}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.email}</TableCell>
                <TableCell className="text-end">
                  <Button variant="ghost" size="icon" onClick={() => del(r.id)} data-testid={`del-emp-${r.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.5} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SettingsTab() {
  const { t } = useLang();
  const [s, setS] = useState({ assistant_name: "Nova", language: "en", personality: "professional" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = () => {
    setLoadError(null);
    setLoading(true);
    return api.get("/settings")
      .then(r => r.data && setS(r.data))
      .catch(() => setLoadError("Failed to load settings."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", s);
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save settings");
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="max-w-2xl rounded-2xl border border-border bg-card p-8 space-y-6">
        <div className="h-6 w-40 bg-secondary rounded animate-pulse" />
        <div className="h-10 bg-secondary rounded animate-pulse" />
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="h-10 bg-secondary rounded animate-pulse" />
          <div className="h-10 bg-secondary rounded animate-pulse" />
        </div>
      </div>
    );
  }
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  return (
    <div className="max-w-2xl rounded-2xl border border-border bg-card p-8 space-y-6" data-testid="settings-form">
      <div className="space-y-2">
        <Label>{t("assistant_name")}</Label>
        <Input value={s.assistant_name} onChange={(e) => setS({...s, assistant_name: e.target.value})} data-testid="assistant-name-input" />
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>{t("language")}</Label>
          <Select value={s.language} onValueChange={(v) => setS({...s, language: v})}>
            <SelectTrigger data-testid="lang-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("personality")}</Label>
          <Select value={s.personality} onValueChange={(v) => setS({...s, personality: v})}>
            <SelectTrigger data-testid="personality-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">{t("professional")}</SelectItem>
              <SelectItem value="friendly">{t("friendly")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} data-testid="save-settings-btn">{saving ? "Saving…" : t("save")}</Button>
      </div>
    </div>
  );
}

function AutomationsTab() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/automations").then(r => setItems(r.data)); }, []);
  const iconMap = { calendar: Calendar, "life-buoy": LifeBuoy };
  return (
    <div className="grid md:grid-cols-2 gap-4" data-testid="automations-grid">
      {items.map((a) => {
        const Icon = iconMap[a.icon] || Workflow;
        return (
          <div key={a.id} data-testid={`automation-${a.id}`} className="relative rounded-2xl border border-border bg-card p-6 overflow-hidden group">
            <div className="absolute -end-8 -top-8 h-32 w-32 rounded-full bg-primary/5 group-hover:bg-primary/10 transition-colors" />
            <div className="relative flex items-start justify-between">
              <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <Badge variant="outline" className="gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {a.status}
              </Badge>
            </div>
            <h3 className="mt-6 text-lg font-semibold">{a.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-border" />
              <span className="h-px flex-1 bg-border" />
              <Workflow className="h-3 w-3" strokeWidth={1.5} /> n8n
              <span className="h-px flex-1 bg-border" />
              <span className="h-2 w-2 rounded-full bg-border" />
            </div>
          </div>
        );
      })}
    </div>
  );
}


function FeedbackTab() {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ up: 0, down: 0, total: 0 });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = () => {
    setLoadError(null);
    setLoading(true);
    return Promise.all([
      api.get("/feedback").then(r => setItems(r.data)),
      api.get("/feedback/stats").then(r => setStats(r.data)),
    ])
      .catch(() => setLoadError("Failed to load feedback."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => filter === "all" ? true : i.rating === filter);

  return (
    <div className="space-y-6" data-testid="feedback-tab">
      <div className="grid sm:grid-cols-3 gap-4">
        <StatBox label={t("total_feedback")} value={stats.total} icon={MessageSquare} tone="muted" />
        <StatBox label={t("helpful")} value={stats.up} icon={ThumbsUp} tone="up" />
        <StatBox label={t("not_helpful")} value={stats.down} icon={ThumbsDown} tone="down" />
      </div>

      <div className="flex gap-2">
        {[
          { k: "all", label: t("filter_all") },
          { k: "down", label: t("filter_down") },
          { k: "up", label: t("filter_up") },
        ].map(f => (
          <button
            key={f.k}
            data-testid={`feedback-filter-${f.k}`}
            onClick={() => setFilter(f.k)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              filter === f.k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : loading ? (
        <div className="space-y-3">
          {[0,1,2].map(i => <div key={i} className="h-24 rounded-2xl bg-secondary/60 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t("no_feedback")}
          description="Once employees start rating AI answers, you'll see the results here."
          testId="empty-feedback"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <div key={f.id} data-testid={`feedback-item-${f.id}`} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  {f.rating === "up" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-500/10 rounded-full px-2.5 py-1">
                      <ThumbsUp className="h-3 w-3" strokeWidth={2} /> {t("helpful")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive bg-destructive/10 rounded-full px-2.5 py-1">
                      <ThumbsDown className="h-3 w-3" strokeWidth={2} /> {t("not_helpful")}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{f.user_name} · {f.user_email}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(f.updated_at).toLocaleString()}</span>
              </div>
              {f.question && (
                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{t("question")}</div>
                  <div className="text-sm mt-1">{f.question}</div>
                </div>
              )}
              {f.answer && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{t("answer")}</div>
                  <div className="text-sm mt-1 text-muted-foreground whitespace-pre-wrap line-clamp-4">{f.answer}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, icon: Icon, tone }) {
  const toneCls = tone === "up"
    ? "text-emerald-600 bg-emerald-500/10"
    : tone === "down"
    ? "text-destructive bg-destructive/10"
    : "text-muted-foreground bg-secondary";
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`h-8 w-8 rounded-lg grid place-items-center ${toneCls}`}>
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </div>
      </div>
      <div className="display text-4xl font-bold mt-4">{value}</div>
    </div>
  );
}

function SkeletonRows({ cols = 4, rows = 3 }) {
  return (
    <div className="py-4 space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 rounded bg-secondary animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon = FileText, title, description, ctaLabel, onCta, testId }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-4">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <div className="font-semibold">{title}</div>
      {description && <div className="text-sm text-muted-foreground mt-1 max-w-md">{description}</div>}
      {ctaLabel && onCta && (
        <Button data-testid={testId ? `${testId}-cta` : undefined} onClick={onCta} className="rounded-full mt-5 gap-2">
          <Plus className="h-4 w-4" strokeWidth={2} /> {ctaLabel}
        </Button>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      <div className="h-10 w-10 rounded-full bg-destructive/10 text-destructive grid place-items-center mb-3">
        <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
      </div>
      <div className="font-medium">{message || "Something went wrong."}</div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4 rounded-full gap-2" data-testid="error-retry-btn">
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} /> Try again
        </Button>
      )}
    </div>
  );
}

