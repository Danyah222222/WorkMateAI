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
  UserPlus, Mail, Send, Shield, Crown, Briefcase, UserCircle2, Copy, X,
  FolderKanban, ArrowLeft, Tag, Archive, GitBranch, Loader2,
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const NAV = [
  { key: "dashboard", icon: LayoutDashboard, i18n: "admin_dashboard" },
  { key: "projects", icon: FolderKanban, i18n: "projects" },
  { key: "tasks", icon: ListTodo, i18n: "tasks" },
  { key: "team", icon: Users, i18n: "team" },
  { key: "knowledge", icon: FileText, i18n: "knowledge" },
  { key: "employees", icon: Briefcase, i18n: "employees" },
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
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[160px]" data-testid="sidebar-workspace-name">
                {user?.workspace_name || "Workspace"}
              </div>
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
          {tab === "projects" && <ProjectsTab currentUser={user} />}
          {tab === "team" && <TeamTab currentUser={user} />}
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
                <ResponsiveContainer width="100%" height="100%" minHeight={220}>
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
                <ResponsiveContainer width="100%" height="100%" minHeight={220}>
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
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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


const ROLE_META = {
  owner:    { label: "Owner",    icon: Crown,       cls: "text-amber-600 bg-amber-500/10" },
  admin:    { label: "Admin",    icon: Shield,      cls: "text-primary bg-primary/10" },
  manager:  { label: "Manager",  icon: Briefcase,   cls: "text-blue-600 bg-blue-500/10" },
  employee: { label: "Employee", icon: UserCircle2, cls: "text-muted-foreground bg-secondary" },
};

function TeamTab({ currentUser }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "employee" });
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState(null);

  const load = () => {
    setLoadError(null);
    setLoading(true);
    return Promise.all([
      api.get("/team").then(r => setMembers(r.data)),
      api.get("/invitations").then(r => setInvites(r.data)),
    ]).catch(() => setLoadError("Failed to load team.")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const sendInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email.trim()) return;
    setInviting(true);
    try {
      const res = await api.post("/invitations", {
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.role,
      });
      const inviteLink = `${window.location.origin}/accept-invite/${res.data.token}`;
      setLastInvite({ email: res.data.email, link: inviteLink });
      setInviteForm({ email: "", role: "employee" });
      toast.success("Invitation created");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not send invitation");
    } finally { setInviting(false); }
  };

  const resendInvite = async (id) => {
    try {
      await api.post(`/invitations/${id}/resend`);
      toast.success("Invitation refreshed");
      load();
    } catch { toast.error("Could not resend"); }
  };

  const cancelInvite = async (id) => {
    try {
      await api.delete(`/invitations/${id}`);
      toast.success("Invitation cancelled");
      load();
    } catch { toast.error("Could not cancel"); }
  };

  const removeMember = async (id) => {
    if (!window.confirm("Remove this member from your workspace?")) return;
    try {
      await api.delete(`/team/${id}`);
      toast.success("Member removed");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not remove");
    }
  };

  const copyLink = (link) => {
    navigator.clipboard?.writeText(link);
    toast.success("Invite link copied");
  };

  const pending = invites.filter(i => i.status === "pending");

  return (
    <div className="space-y-6" data-testid="team-tab">
      <form onSubmit={sendInvite} className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-end gap-3" data-testid="invite-form">
        <div className="flex-1 min-w-[200px] space-y-1.5">
          <Label>Invite by email</Label>
          <Input
            data-testid="invite-email-input"
            type="email"
            placeholder="teammate@company.com"
            value={inviteForm.email}
            onChange={(e) => setInviteForm({...inviteForm, email: e.target.value})}
            required
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label>Role</Label>
          <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({...inviteForm, role: v})}>
            <SelectTrigger data-testid="invite-role-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={inviting} className="rounded-full gap-2" data-testid="send-invite-btn">
          <UserPlus className="h-4 w-4" strokeWidth={2} /> {inviting ? "Sending…" : "Send invitation"}
        </Button>
      </form>

      {lastInvite && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 flex items-center gap-3" data-testid="last-invite-banner">
          <Mail className="h-4 w-4 text-primary" strokeWidth={1.5} />
          <div className="text-sm flex-1 min-w-0">
            <div className="font-medium">Invitation ready for {lastInvite.email}</div>
            <div className="font-mono text-xs text-muted-foreground truncate">{lastInvite.link}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => copyLink(lastInvite.link)} data-testid="copy-invite-link-btn" className="gap-1.5">
            <Copy className="h-3 w-3" strokeWidth={1.5} /> Copy link
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-14 rounded-lg bg-secondary/60 animate-pulse" />)}
        </div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Members</h3>
              <span className="text-xs text-muted-foreground">{members.length} total</span>
            </div>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead>Workload</TableHead>
                    <TableHead className="text-end">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => {
                    const meta = ROLE_META[m.role] || ROLE_META.employee;
                    const Icon = meta.icon;
                    const workload = m.stats.pending + m.stats.overdue;
                    return (
                      <TableRow key={m.id} data-testid={`member-${m.id}`}>
                        <TableCell>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${meta.cls}`}>
                            <Icon className="h-3 w-3" strokeWidth={1.5} /> {meta.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-muted-foreground">{m.stats.total_tasks}</span>
                          {m.stats.overdue > 0 && <span className="ms-2 text-destructive text-xs">{m.stats.overdue} overdue</span>}
                        </TableCell>
                        <TableCell>
                          <WorkloadBar level={workload} />
                        </TableCell>
                        <TableCell className="text-end">
                          {m.id !== currentUser?.id && m.role !== "owner" && (
                            <Button variant="ghost" size="icon" onClick={() => removeMember(m.id)} data-testid={`remove-member-${m.id}`}>
                              <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.5} />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Pending invitations</h3>
              <span className="text-xs text-muted-foreground">{pending.length}</span>
            </div>
            {pending.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm" data-testid="no-invites">
                No pending invitations. Invite teammates using the form above.
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Invited by</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead className="text-end">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((inv) => {
                      const inviteLink = `${window.location.origin}/accept-invite/${inv.token}`;
                      return (
                        <TableRow key={inv.id} data-testid={`invite-${inv.id}`}>
                          <TableCell className="font-medium">{inv.email}</TableCell>
                          <TableCell><span className="text-xs capitalize">{inv.role}</span></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{inv.invited_by_name || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="text-end space-x-1">
                            <Button variant="ghost" size="icon" onClick={() => copyLink(inviteLink)} title="Copy link" data-testid={`copy-invite-${inv.id}`}>
                              <Copy className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => resendInvite(inv.id)} title="Resend" data-testid={`resend-invite-${inv.id}`}>
                              <Send className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => cancelInvite(inv.id)} title="Cancel" data-testid={`cancel-invite-${inv.id}`}>
                              <X className="h-4 w-4 text-destructive" strokeWidth={1.5} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function WorkloadBar({ level }) {
  const pct = Math.min(100, level * 20); // 5 tasks = 100%
  const color = level >= 5 ? "bg-destructive" : level >= 3 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}


const KANBAN_COLUMNS = [
  { key: "backlog",     label: "Backlog" },
  { key: "todo",        label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "review",      label: "Review" },
  { key: "done",        label: "Done" },
];

const PROJECT_STATUS_META = {
  planning:  { label: "Planning",  cls: "text-muted-foreground bg-secondary" },
  active:    { label: "Active",    cls: "text-emerald-600 bg-emerald-500/10" },
  on_hold:   { label: "On hold",   cls: "text-amber-600 bg-amber-500/10" },
  completed: { label: "Completed", cls: "text-primary bg-primary/10" },
  archived:  { label: "Archived",  cls: "text-muted-foreground bg-secondary" },
};

function ProjectsTab({ currentUser }) {
  const [view, setView] = useState("list");
  const [activeId, setActiveId] = useState(null);
  const canManage = ["owner", "admin", "manager"].includes(currentUser?.role);

  return view === "list" ? (
    <ProjectsList
      canManage={canManage}
      onOpen={(id) => { setActiveId(id); setView("detail"); }}
    />
  ) : (
    <ProjectDetail
      projectId={activeId}
      canManage={canManage}
      onBack={() => { setView("list"); setActiveId(null); }}
    />
  );
}

function ProjectsList({ canManage, onOpen }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", priority: "medium", due_date: "", tags: "" });

  const load = () => {
    setLoadError(null);
    setLoading(true);
    return api.get("/projects")
      .then(r => setProjects(r.data))
      .catch(() => setLoadError("Failed to load projects."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
      await api.post("/projects", {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        due_date: form.due_date || undefined,
        tags,
      });
      setForm({ name: "", description: "", priority: "medium", due_date: "", tags: "" });
      setShowForm(false);
      toast.success("Project created");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create project");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4" data-testid="projects-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Group tasks under a project and track progress across your team.</p>
        {canManage && (
          <Button data-testid="new-project-btn" onClick={() => setShowForm(v => !v)} className="rounded-full gap-2">
            <Plus className="h-4 w-4" strokeWidth={2} /> New project
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={create} className="rounded-2xl border border-border bg-card p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="project-form">
          <Input className="lg:col-span-2" required placeholder="Project name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} data-testid="project-name-input" />
          <Input placeholder="Tags (comma separated)" value={form.tags} onChange={(e) => setForm({...form, tags: e.target.value})} data-testid="project-tags-input" />
          <Input type="date" value={form.due_date} onChange={(e) => setForm({...form, due_date: e.target.value})} data-testid="project-due-input" />
          <textarea className="lg:col-span-3 min-h-[70px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none" placeholder="Description" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} data-testid="project-desc-input" />
          <Select value={form.priority} onValueChange={(v) => setForm({...form, priority: v})}>
            <SelectTrigger data-testid="project-priority-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High priority</SelectItem>
              <SelectItem value="medium">Medium priority</SelectItem>
              <SelectItem value="low">Low priority</SelectItem>
            </SelectContent>
          </Select>
          <div className="lg:col-span-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" data-testid="save-project-btn" disabled={saving}>{saving ? "Saving…" : "Create project"}</Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0,1,2].map(i => <div key={i} className="h-48 rounded-2xl bg-secondary/60 animate-pulse" />)}
        </div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={canManage ? "Create your first project to organize tasks and see cross-team progress." : "You haven't been added to any project yet. Ask a manager to assign you one."}
          ctaLabel={canManage ? "Create your first project" : undefined}
          onCta={canManage ? () => setShowForm(true) : undefined}
          testId="empty-projects"
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => {
            const meta = PROJECT_STATUS_META[p.status] || PROJECT_STATUS_META.active;
            return (
              <button
                key={p.id}
                data-testid={`project-card-${p.id}`}
                onClick={() => onOpen(p.id)}
                className="text-start rounded-2xl border border-border bg-card p-5 hover:border-primary hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                  <span className="text-xs text-muted-foreground capitalize">{p.priority}</span>
                </div>
                <div className="font-semibold text-base truncate">{p.name}</div>
                {p.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.description}</div>}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold">{p.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><ListTodo className="h-3 w-3" strokeWidth={1.5} />{p.stats?.total_tasks || 0}</span>
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" strokeWidth={1.5} />{p.stats?.completed_tasks || 0}</span>
                  {p.stats?.overdue_tasks > 0 && (
                    <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" strokeWidth={1.5} />{p.stats.overdue_tasks} overdue</span>
                  )}
                  {p.due_date && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" strokeWidth={1.5} />{p.due_date}</span>}
                </div>
                {p.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.tags.slice(0, 4).map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        <Tag className="h-2.5 w-2.5" strokeWidth={1.5} />{t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ projectId, canManage, onBack }) {
  const [project, setProject] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [subtab, setSubtab] = useState("overview");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", priority: "medium", kanban_status: "todo", due_date: "" });

  const load = async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const [p, a, t] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/analytics`),
        api.get(`/tasks`, { params: { project_id: projectId } }),
      ]);
      setProject(p.data);
      setAnalytics(a.data);
      setTasks(t.data);
    } catch (err) {
      setLoadError(err.response?.data?.detail || "Failed to load project");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (projectId) load(); }, [projectId]);

  const archive = async () => {
    if (!window.confirm("Archive this project?")) return;
    try { await api.post(`/projects/${projectId}/archive`); toast.success("Project archived"); onBack(); }
    catch { toast.error("Failed to archive"); }
  };
  const remove = async () => {
    if (!window.confirm("Delete this project? Tasks will be detached (not deleted).")) return;
    try { await api.delete(`/projects/${projectId}`); toast.success("Project deleted"); onBack(); }
    catch { toast.error("Failed to delete"); }
  };
  const runAi = async () => {
    setAiOpen(true);
    setAiLoading(true);
    setAiResult(null);
    try {
      const r = await api.post(`/projects/${projectId}/ai/summary`);
      setAiResult(r.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "AI unavailable right now");
      setAiOpen(false);
    } finally { setAiLoading(false); }
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    try {
      await api.post("/tasks", { ...newTask, project_id: projectId, due_date: newTask.due_date || undefined });
      setNewTask({ title: "", priority: "medium", kanban_status: "todo", due_date: "" });
      setTaskFormOpen(false);
      toast.success("Task added");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add task");
    }
  };

  const moveTask = async (taskId, column) => {
    // optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, kanban_status: column, status: column === "done" ? "completed" : (t.status === "completed" ? "pending" : t.status) } : t));
    try {
      await api.patch(`/tasks/${taskId}`, { kanban_status: column });
      // reload analytics + project for progress %
      const [p, a] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/analytics`),
      ]);
      setProject(p.data);
      setAnalytics(a.data);
    } catch (err) {
      toast.error("Failed to move task");
      load();
    }
  };

  if (loading) return <div className="space-y-4">
    <div className="h-6 w-40 bg-secondary rounded animate-pulse" />
    <div className="h-56 rounded-2xl bg-secondary/60 animate-pulse" />
  </div>;
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!project) return null;

  const meta = PROJECT_STATUS_META[project.status] || PROJECT_STATUS_META.active;

  return (
    <div className="space-y-6" data-testid="project-detail">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="back-to-projects" className="gap-2">
            <ArrowLeft className="h-4 w-4 rtl-flip" strokeWidth={1.5} /> Projects
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
              <span className="text-xs text-muted-foreground capitalize">{project.priority} priority</span>
            </div>
            <h2 className="display text-2xl font-bold tracking-tight mt-1 truncate" data-testid="project-title">{project.name}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="run-ai-summary-btn" onClick={runAi} className="rounded-full gap-2" variant="outline">
            <Sparkles className="h-4 w-4" strokeWidth={2} /> AI summary
          </Button>
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={archive} data-testid="archive-project-btn" className="gap-2 rounded-full">
                <Archive className="h-4 w-4" strokeWidth={1.5} /> Archive
              </Button>
              <Button variant="outline" size="sm" onClick={remove} data-testid="delete-project-btn" className="gap-2 rounded-full text-destructive">
                <Trash2 className="h-4 w-4" strokeWidth={1.5} /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {aiOpen && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5" data-testid="ai-summary-card">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-primary" strokeWidth={2} /> AI project assistant
            </div>
            <button onClick={() => setAiOpen(false)}><X className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} /></button>
          </div>
          {aiLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> Analyzing project…</div>}
          {aiResult && (
            <div className="space-y-4 text-sm">
              {aiResult.summary && <p className="leading-relaxed">{aiResult.summary}</p>}
              {aiResult.risks?.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Risks</div>
                  <ul className="space-y-1">
                    {aiResult.risks.map((r, i) => <li key={i} className="flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-destructive flex-shrink-0" strokeWidth={1.5} /><span>{r}</span></li>)}
                  </ul>
                </div>
              )}
              {aiResult.next_actions?.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Next actions</div>
                  <ul className="space-y-1">
                    {aiResult.next_actions.map((a, i) => <li key={i} className="flex items-start gap-2"><ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary flex-shrink-0 rtl-flip" strokeWidth={2} /><span>{a}</span></li>)}
                  </ul>
                </div>
              )}
              {aiResult.overdue_focus?.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Overdue focus</div>
                  <ul className="space-y-1 text-destructive">
                    {aiResult.overdue_focus.map((a, i) => <li key={i} className="flex items-start gap-2"><Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" strokeWidth={1.5} /><span>{a}</span></li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 border-b border-border">
        {[
          { k: "overview", label: "Overview" },
          { k: "kanban",   label: "Kanban" },
        ].map(s => (
          <button
            key={s.k}
            data-testid={`project-subtab-${s.k}`}
            onClick={() => setSubtab(s.k)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              subtab === s.k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >{s.label}</button>
        ))}
      </div>

      {subtab === "overview" && analytics && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-border bg-card p-6" data-testid="project-progress-card">
            <h3 className="text-sm text-muted-foreground">Progress</h3>
            <div className="display text-5xl font-bold mt-2">{analytics.progress}%</div>
            <div className="mt-4 h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${analytics.progress}%` }} />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div><div className="text-xs text-muted-foreground">Total</div><div className="font-semibold text-lg">{analytics.totals.total}</div></div>
              <div><div className="text-xs text-muted-foreground">Done</div><div className="font-semibold text-lg text-emerald-600">{analytics.totals.completed}</div></div>
              <div><div className="text-xs text-muted-foreground">Overdue</div><div className={`font-semibold text-lg ${analytics.totals.overdue > 0 ? "text-destructive" : ""}`}>{analytics.totals.overdue}</div></div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6" data-testid="project-members-card">
            <h3 className="font-semibold mb-3">Team</h3>
            {analytics.members.length === 0 ? (
              <div className="text-sm text-muted-foreground">No members yet.</div>
            ) : (
              <ul className="space-y-2">
                {analytics.members.map(m => (
                  <li key={m.id} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold">{m.name?.[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{m.stats.completed}/{m.stats.total} tasks</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6" data-testid="project-activity-card">
            <h3 className="font-semibold mb-3">Activity</h3>
            {analytics.activity.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nothing recorded yet.</div>
            ) : (
              <ul className="space-y-3">
                {analytics.activity.slice(0, 8).map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
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

          {project.description && (
            <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold mb-2">About</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.description}</p>
              {project.tags?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {project.tags.map((t, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"><Tag className="h-2.5 w-2.5" strokeWidth={1.5} />{t}</span>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {subtab === "kanban" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setTaskFormOpen(v => !v)} className="rounded-full gap-2" data-testid="new-project-task-btn">
              <Plus className="h-4 w-4" strokeWidth={2} /> Add task
            </Button>
          </div>
          {taskFormOpen && (
            <form onSubmit={addTask} className="rounded-2xl border border-border bg-card p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="project-task-form">
              <Input className="lg:col-span-2" required placeholder="Task title" value={newTask.title} onChange={(e) => setNewTask({...newTask, title: e.target.value})} data-testid="project-task-title" />
              <Select value={newTask.kanban_status} onValueChange={(v) => setNewTask({...newTask, kanban_status: v})}>
                <SelectTrigger data-testid="project-task-column"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KANBAN_COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={newTask.priority} onValueChange={(v) => setNewTask({...newTask, priority: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={newTask.due_date} onChange={(e) => setNewTask({...newTask, due_date: e.target.value})} />
              <div className="lg:col-span-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setTaskFormOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="save-project-task-btn">Add</Button>
              </div>
            </form>
          )}

          <KanbanBoard tasks={tasks} onMove={moveTask} />
        </div>
      )}
    </div>
  );
}

function KanbanBoard({ tasks, onMove }) {
  const [dragId, setDragId] = useState(null);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="kanban-board">
      {KANBAN_COLUMNS.map(col => {
        const items = tasks.filter(t => (t.kanban_status || "todo") === col.key);
        return (
          <div
            key={col.key}
            data-testid={`kanban-col-${col.key}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) onMove(dragId, col.key);
              setDragId(null);
            }}
            className="rounded-2xl border border-border bg-card/60 p-3 min-h-[300px]"
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-xs font-semibold uppercase tracking-widest">{col.label}</div>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map(t => (
                <div
                  key={t.id}
                  data-testid={`kanban-task-${t.id}`}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => setDragId(null)}
                  className="cursor-grab active:cursor-grabbing rounded-lg border border-border bg-card p-3 hover:border-primary transition-colors"
                >
                  <div className="text-sm font-medium leading-tight">{t.title}</div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className={`inline-flex items-center gap-1 ${t.priority === "high" ? "text-destructive" : t.priority === "low" ? "" : "text-primary"}`}>
                      <Flag className="h-2.5 w-2.5" strokeWidth={1.5} />{t.priority}
                    </span>
                    {t.due_date && (
                      <span className={`inline-flex items-center gap-1 ${t.overdue ? "text-destructive" : ""}`}>
                        <Clock className="h-2.5 w-2.5" strokeWidth={1.5} />{t.due_date}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-[11px] text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">Drop tasks here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

