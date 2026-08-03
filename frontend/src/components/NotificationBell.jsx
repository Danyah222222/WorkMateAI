import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, Plus, Sparkles, FolderKanban, UserCircle2 } from "lucide-react";

const ICONS = {
  task_created: Plus,
  task_completed: CheckCircle2,
  ai_conversation: Sparkles,
  project_created: FolderKanban,
  profile_updated: UserCircle2,
};

function fmt(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

function label(a) {
  if (a.type === "task_created") return `Task created: ${a.title}`;
  if (a.type === "task_completed") return `Task completed: ${a.title}`;
  if (a.type === "ai_conversation") return `AI conversation: ${a.title}`;
  if (a.type === "project_created") return `Project created: ${a.title}`;
  if (a.type === "profile_updated") return "Profile updated";
  return a.title || a.type;
}

export default function NotificationBell({ testId = "notification-bell" }) {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);

  const load = () => api.get("/notifications?limit=30").then(r => setData(r.data)).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 45_000);
    return () => clearInterval(t);
  }, []);

  const markAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
      setData(d => ({ ...d, items: d.items.map(i => ({ ...i, read: true })), unread: 0 }));
    } catch { /* silent */ }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <PopoverTrigger asChild>
        <button
          data-testid={testId}
          className="relative rounded-full h-9 w-9 grid place-items-center border border-border bg-card hover:border-primary transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" strokeWidth={1.5} />
          {data.unread > 0 && (
            <span data-testid={`${testId}-badge`} className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
              {data.unread > 99 ? "99+" : data.unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid={`${testId}-popover`}>
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="font-semibold text-sm">Notifications</div>
          {data.unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs" data-testid="mark-all-read-btn">Mark all read</Button>
          )}
        </div>
        <div className="max-h-96 overflow-auto">
          {data.items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">You're all caught up.</div>
          ) : (
            <ul>
              {data.items.map((a, i) => {
                const Icon = ICONS[a.type] || Bell;
                return (
                  <li key={a.id || i} data-testid={`notification-item-${i}`} className={`flex items-start gap-3 px-3 py-2.5 border-b border-border/60 last:border-0 ${!a.read ? "bg-primary/5" : ""}`}>
                    <div className="h-7 w-7 rounded-lg bg-secondary text-muted-foreground grid place-items-center flex-shrink-0">
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{label(a)}</div>
                      <div className="text-[11px] text-muted-foreground">{fmt(a.created_at)}</div>
                    </div>
                    {!a.read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
