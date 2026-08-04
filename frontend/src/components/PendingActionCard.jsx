import { useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, ShieldAlert, Loader2 } from "lucide-react";

const CATEGORY_LABEL = {
  hr: "HR",
  it: "IT",
  tasks: "Tasks",
  projects: "Projects",
  employees: "Employees",
  knowledge: "Knowledge",
};

const FIELD_LABEL = {
  start_date: "Start date",
  end_date: "End date",
  type: "Type",
  reason: "Reason",
  subject: "Subject",
  description: "Description",
  category: "Category",
  priority: "Priority",
  task_id: "Task",
  status: "Status",
  kanban_status: "Column",
  assignee: "Assignee",
  project_id: "Project",
  project: "Project",
};

function labelize(key) {
  return FIELD_LABEL[key] || key.replace(/_/g, " ");
}

function stringify(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * PendingActionCard — inline confirmation for AI write actions.
 * Renders in three visual states derived from `action.status`:
 *   - pending    → shows fields + Confirm/Cancel buttons
 *   - executed   → success card (locked)
 *   - cancelled  → cancelled card (locked)
 *   - failed     → error card with reason
 */
export default function PendingActionCard({ action, onResolved }) {
  const [busy, setBusy] = useState(null); // "confirm" | "cancel" | null
  const [local, setLocal] = useState(action);
  const status = local?.status || "pending";
  const preview = local?.preview || {};
  const missing = preview.missing || [];
  const args = preview.args || local?.args || {};
  const label = preview.label || local?.capability_name || "Action";
  const cat = CATEGORY_LABEL[preview.category || local?.category] || "Action";
  const dangerous = ["delete_project"].includes(local?.capability_name);

  const doConfirm = async () => {
    if (busy || status !== "pending") return;
    if (missing.length) {
      toast.error(`Please provide: ${missing.join(", ")}`);
      return;
    }
    setBusy("confirm");
    try {
      const r = await api.post(`/ai/pending-actions/${local.id}/confirm`, {});
      setLocal(r.data);
      if (r.data?.status === "executed") {
        toast.success(r.data?.result?.summary || "Action completed");
      } else {
        toast.error(r.data?.error || r.data?.result?.error || "Action failed");
      }
      onResolved && onResolved(r.data);
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not complete action";
      toast.error(msg);
      // Refresh state — the action may have been resolved by another tab
      try {
        const r2 = await api.get(`/ai/pending-actions/${local.id}`);
        setLocal(r2.data);
      } catch { /* noop */ }
    } finally {
      setBusy(null);
    }
  };

  const doCancel = async () => {
    if (busy || status !== "pending") return;
    setBusy("cancel");
    try {
      const r = await api.post(`/ai/pending-actions/${local.id}/cancel`, {});
      setLocal(r.data);
      toast.success("Action cancelled");
      onResolved && onResolved(r.data);
    } catch (err) {
      const msg = err.response?.data?.detail || "Could not cancel";
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  // ---- Rendering ----
  const rows = Object.entries(args).filter(([k]) => k !== "task_id" || args.task_id);

  return (
    <div
      data-testid={`pending-action-card-${local?.id}`}
      data-status={status}
      className={`rounded-xl border p-4 text-sm ${
        status === "pending" ? "border-primary/40 bg-primary/5"
        : status === "executed" ? "border-emerald-500/40 bg-emerald-500/5"
        : status === "cancelled" ? "border-border bg-secondary/50"
        : "border-destructive/40 bg-destructive/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {status === "pending" && (dangerous
          ? <ShieldAlert className="h-4 w-4 text-destructive" strokeWidth={1.75} aria-hidden="true" />
          : <AlertTriangle className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden="true" />)}
        {status === "executed" && <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={1.75} aria-hidden="true" />}
        {status === "cancelled" && <XCircle className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />}
        {status === "failed" && <XCircle className="h-4 w-4 text-destructive" strokeWidth={1.75} aria-hidden="true" />}
        <div className="font-semibold" data-testid="pending-action-label">{label}</div>
        <span className="ms-auto text-[10px] uppercase tracking-widest text-muted-foreground">{cat}</span>
      </div>

      {rows.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-3" data-testid="pending-action-fields">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2 min-w-0">
              <dt className="text-xs text-muted-foreground capitalize flex-shrink-0">{labelize(k)}:</dt>
              <dd className="text-xs font-medium truncate" title={stringify(v)}>{stringify(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {status === "pending" && missing.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 mb-3 text-xs" data-testid="pending-action-missing">
          Missing information: <span className="font-medium">{missing.join(", ")}</span>. Please provide these before confirming.
        </div>
      )}

      {status === "executed" && (
        <div className="text-xs text-emerald-700 dark:text-emerald-400 mb-1" data-testid="pending-action-executed">
          {local?.result?.summary || "Action completed successfully."}
        </div>
      )}
      {status === "cancelled" && (
        <div className="text-xs text-muted-foreground mb-1" data-testid="pending-action-cancelled">Cancelled — no changes were made.</div>
      )}
      {status === "failed" && (
        <div className="text-xs text-destructive mb-1" data-testid="pending-action-failed">
          {local?.error || local?.result?.error || "Action failed."}
        </div>
      )}

      {status === "pending" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant={dangerous ? "destructive" : "default"}
            disabled={!!busy || missing.length > 0}
            onClick={doConfirm}
            data-testid={`confirm-btn-${local?.id}`}
          >
            {busy === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" aria-hidden="true" /> : null}
            {dangerous ? "Delete" : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={doCancel}
            data-testid={`cancel-btn-${local?.id}`}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
