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
  CheckCircle2, Circle, ListTodo, TrendingUp, TrendingDown, Zap, Clock, Flag, ChevronRight, MoreHorizontal,
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const NAV = [
  { key: "dashboard", icon: LayoutDashboard, i18n: "admin_dashboard" },
  { key: "tasks", icon: ListTodo, i18n: "tasks" },
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
          {tab === "dashboard" && <DashboardHome setTab={setTab} />}
          {tab === "tasks" && <TasksTab />}
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

function DashboardHome({ setTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = () => {
    setLoadError(null);
    setLoading(true);
    return api.get("/tasks/analytics")
      .then(r => setData(r.data))
      .catch(() => setLoadError("Failed to load productivity analytics."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <DashboardSkeleton />;
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  const t_ = data.totals;
  const isEmpty = t_.total === 0;

  return (
    <div className="space-y-6" data-testid="productivity-dashboard">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total tasks" value={t_.total} icon={ListTodo} testId="stat-total" />
        <StatCard label="Completed" value={t_.completed} icon={CheckCircle2} tone="up" testId="stat-completed" />
        <StatCard label="Pending" value={t_.pending} icon={Circle} testId="stat-pending" />
        <StatCard label="Overdue" value={t_.overdue} icon={AlertTriangle} tone={t_.overdue > 0 ? "down" : "muted"} testId="stat-overdue" />
        <StatCard label="Completion rate" value={`${t_.completion_rate}%`} icon={TrendingUp} testId="stat-rate" />
        <StatCard label="AI sessions" value={t_.ai_sessions} icon={Sparkles} testId="stat-ai" />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={ListTodo}
          title="Your dashboard starts here"
          description="Create your first task to unlock real-time analytics, completion trends, and productivity insights."
          ctaLabel="Create your first task"
          onCta={() => setTab("tasks")}
          testId="dashboard-empty"
        />
      ) : (
        <>
          {/* Quick actions + insights */}
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6" data-testid="smart-insights">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Smart insights</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Auto-generated from your productivity data.</p>
                </div>
                <Zap className="h-5 w-5 text-primary" strokeWidth={1.5} />
              </div>
              <ul className="space-y-2">
                {data.insights.length === 0 && (
                  <li className="text-sm text-muted-foreground">Keep going — insights appear once you have more activity.</li>
                )}
                {data.insights.map((ins, i) => (
                  <li key={i} data-testid={`insight-${i}`} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="h-4 w-4 mt-0.5 text-primary flex-shrink-0 rtl-flip" strokeWidth={2} />
                    <span>{ins}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6" data-testid="quick-actions">
              <h3 className="text-lg font-semibold mb-4">Quick actions</h3>
              <div className="space-y-2">
                <QuickAction icon={Plus} label="Create task" onClick={() => setTab("tasks")} testId="qa-create-task" />
                <QuickAction icon={Sparkles} label="Open AI assistant" onClick={() => window.open("/chat", "_self")} testId="qa-open-chat" />
                <QuickAction icon={FileText} label="Upload knowledge" onClick={() => setTab("knowledge")} testId="qa-upload" />
                <QuickAction icon={Workflow} label="View automations" onClick={() => setTab("automations")} testId="qa-automations" />
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6" data-testid="chart-weekly">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Weekly productivity</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {data.this_week_completed} completed this week ·{" "}
                    <TrendBadge pct={data.trend_pct} />
                  </p>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weekly_series} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="completed" name="Completed" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
                    <Bar dataKey="created" name="Created" fill="hsl(var(--muted-foreground) / 0.35)" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6" data-testid="chart-status">
              <h3 className="text-lg font-semibold mb-4">Status distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.status_distribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {data.status_distribution.map((entry, i) => (
                        <Cell key={i} fill={["hsl(var(--primary))", "hsl(var(--muted-foreground) / 0.35)", "hsl(var(--destructive))"][i]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6" data-testid="chart-trend">
              <h3 className="text-lg font-semibold mb-4">Completion trend (30 days)</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend_series} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                    <XAxis dataKey="date" hide />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="cumulative" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6" data-testid="chart-priority">
              <h3 className="text-lg font-semibold mb-4">Priority</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.priority_distribution} layout="vertical" margin={{ top: 10, right: 8, left: 20, bottom: 0 }}>
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} width={60} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0,6,6,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Productivity meta + Recent activity */}
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-border bg-card p-6" data-testid="productivity-meta">
              <h3 className="text-lg font-semibold mb-4">This period</h3>
              <MetaRow label="Completed this week" value={data.this_week_completed} />
              <MetaRow label="Completed this month" value={data.this_month_completed} />
              <MetaRow label="Most productive day" value={data.most_productive_day || "—"} />
              <MetaRow label="Most productive hour" value={data.most_productive_hour !== null ? `${data.most_productive_hour}:00` : "—"} />
              <MetaRow label="Avg time to complete" value={data.avg_completion_time_hours !== null ? `${data.avg_completion_time_hours}h` : "—"} />
              <MetaRow label="Active projects" value={t_.active_projects} />
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6" data-testid="recent-activity">
              <h3 className="text-lg font-semibold mb-4">Recent activity</h3>
              {data.recent_activity.length === 0 ? (
                <div className="text-sm text-muted-foreground">No activity yet.</div>
              ) : (
                <ul className="space-y-3">
                  {data.recent_activity.map((a, i) => (
                    <li key={i} data-testid={`activity-${i}`} className="flex items-center gap-3">
                      <ActivityIcon type={a.type} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{activityLabel(a)}</div>
                        <div className="text-xs text-muted-foreground">{formatRelative(a.created_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, testId }) {
  const toneCls = tone === "up"
    ? "text-emerald-600 bg-emerald-500/10"
    : tone === "down"
    ? "text-destructive bg-destructive/10"
    : "text-muted-foreground bg-secondary";
  return (
    <div data-testid={testId} className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`h-7 w-7 rounded-lg grid place-items-center ${toneCls}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
        </div>
      </div>
      <div className="display text-2xl font-bold mt-3">{value}</div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, testId }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm hover:border-primary hover:-translate-y-0.5 transition-all"
    >
      <div className="h-7 w-7 rounded-md bg-primary/10 text-primary grid place-items-center">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      </div>
      <span className="flex-1 text-start">{label}</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground rtl-flip" strokeWidth={2} />
    </button>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function TrendBadge({ pct }) {
  if (pct === 0) return <span className="text-muted-foreground">no change</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${up ? "text-emerald-600" : "text-destructive"}`}>
      <Icon className="h-3 w-3" strokeWidth={2} /> {up ? "+" : ""}{pct}% vs last week
    </span>
  );
}

function ActivityIcon({ type }) {
  const map = {
    task_created: { i: Plus, c: "text-primary bg-primary/10" },
    task_completed: { i: CheckCircle2, c: "text-emerald-600 bg-emerald-500/10" },
    ai_conversation: { i: Sparkles, c: "text-primary bg-primary/10" },
  };
  const { i: Icon, c } = map[type] || { i: MoreHorizontal, c: "text-muted-foreground bg-secondary" };
  return (
    <div className={`h-8 w-8 rounded-lg grid place-items-center flex-shrink-0 ${c}`}>
      <Icon className="h-4 w-4" strokeWidth={1.5} />
    </div>
  );
}

function activityLabel(a) {
  if (a.type === "task_created") return `Created task · ${a.title}`;
  if (a.type === "task_completed") return `Completed task · ${a.title}`;
  if (a.type === "ai_conversation") return `AI conversation · ${a.title}`;
  return a.title || a.type;
}

function formatRelative(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.floor((now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s/60)} min ago`;
  if (s < 86400) return `${Math.floor(s/3600)} h ago`;
  return `${Math.floor(s/86400)} d ago`;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({length: 6}).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-secondary/60 animate-pulse" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-64 rounded-2xl bg-secondary/60 animate-pulse" />
        <div className="h-64 rounded-2xl bg-secondary/60 animate-pulse" />
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


function TasksTab() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", priority: "medium", project: "", due_date: "" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = () => {
    setLoadError(null);
    setLoading(true);
    return api.get("/tasks")
      .then(r => setTasks(r.data))
      .catch(() => setLoadError("Failed to load tasks."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.post("/tasks", {
        title: form.title.trim(),
        priority: form.priority,
        project: form.project.trim() || undefined,
        due_date: form.due_date || undefined,
      });
      setForm({ title: "", priority: "medium", project: "", due_date: "" });
      setShowForm(false);
      toast.success("Task created");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create task");
    } finally { setSaving(false); }
  };

  const toggle = async (task) => {
    const next = task.status === "completed" ? "pending" : "completed";
    try {
      await api.patch(`/tasks/${task.id}`, { status: next });
      load();
    } catch {
      toast.error("Failed to update task");
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      toast.success("Task removed");
      load();
    } catch { toast.error("Failed to remove"); }
  };

  const filtered = tasks.filter(t => {
    if (filter === "all") return true;
    if (filter === "overdue") return t.overdue;
    return t.status === filter;
  });

  const priorityColor = { high: "text-destructive", medium: "text-primary", low: "text-muted-foreground" };

  return (
    <div className="space-y-4" data-testid="tasks-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { k: "all", label: "All" },
            { k: "pending", label: "Pending" },
            { k: "completed", label: "Completed" },
            { k: "overdue", label: "Overdue" },
          ].map(f => (
            <button
              key={f.k}
              data-testid={`task-filter-${f.k}`}
              onClick={() => setFilter(f.k)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                filter === f.k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >{f.label}</button>
          ))}
        </div>
        <Button data-testid="new-task-btn" onClick={() => setShowForm(v => !v)} className="rounded-full gap-2">
          <Plus className="h-4 w-4" strokeWidth={2} /> New task
        </Button>
      </div>

      {showForm && (
        <form onSubmit={create} className="rounded-2xl border border-border bg-card p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="task-form">
          <Input required placeholder="Task title" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} data-testid="task-title-input" className="lg:col-span-2" />
          <Input placeholder="Project (optional)" value={form.project} onChange={(e) => setForm({...form, project: e.target.value})} data-testid="task-project-input" />
          <Input type="date" value={form.due_date} onChange={(e) => setForm({...form, due_date: e.target.value})} data-testid="task-due-input" />
          <Select value={form.priority} onValueChange={(v) => setForm({...form, priority: v})}>
            <SelectTrigger data-testid="task-priority-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High priority</SelectItem>
              <SelectItem value="medium">Medium priority</SelectItem>
              <SelectItem value="low">Low priority</SelectItem>
            </SelectContent>
          </Select>
          <div className="lg:col-span-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" data-testid="save-task-btn" disabled={saving}>{saving ? "Saving…" : "Save task"}</Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-14 rounded-lg bg-secondary/60 animate-pulse" />)}
        </div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={tasks.length === 0 ? "No tasks yet" : "Nothing matches this filter"}
          description={tasks.length === 0 ? "Create your first task and watch your dashboard come alive." : "Try a different filter to see other tasks."}
          ctaLabel={tasks.length === 0 ? "Create your first task" : undefined}
          onCta={tasks.length === 0 ? () => setShowForm(true) : undefined}
          testId="empty-tasks"
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <div key={task.id} data-testid={`task-${task.id}`} className={`flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors ${task.status === "completed" ? "opacity-60" : ""}`}>
              <button
                data-testid={`toggle-${task.id}`}
                onClick={() => toggle(task)}
                className="h-6 w-6 rounded-full border-2 border-border grid place-items-center hover:border-primary transition-colors flex-shrink-0"
                aria-label="Toggle complete"
              >
                {task.status === "completed" && <CheckCircle2 className="h-5 w-5 text-emerald-600" strokeWidth={2} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${task.status === "completed" ? "line-through" : ""}`}>{task.title}</div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className={`inline-flex items-center gap-1 ${priorityColor[task.priority]}`}>
                    <Flag className="h-3 w-3" strokeWidth={1.5} /> {task.priority}
                  </span>
                  {task.project && <span className="inline-flex items-center gap-1"><Workflow className="h-3 w-3" strokeWidth={1.5} /> {task.project}</span>}
                  {task.due_date && (
                    <span className={`inline-flex items-center gap-1 ${task.overdue ? "text-destructive" : ""}`}>
                      <Clock className="h-3 w-3" strokeWidth={1.5} /> {task.due_date}{task.overdue ? " · overdue" : ""}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(task.id)} data-testid={`delete-task-${task.id}`}>
                <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

