const map: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  uploading: { label: "Uploading", className: "bg-blue-100 text-blue-700" },
  transcribing: { label: "Transcribing", className: "bg-blue-100 text-blue-700" },
  analyzing: { label: "Analyzing", className: "bg-violet-100 text-violet-700" },
  ready: { label: "Ready", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", className: "bg-rose-100 text-rose-700" },
};

export function StatusPill({ status }: { status: string }) {
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium " +
        cfg.className
      }
    >
      {cfg.label}
    </span>
  );
}

const priorityMap: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-700",
};

export function PriorityPill({ priority }: { priority: string }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase " +
        (priorityMap[priority] ?? "bg-muted text-muted-foreground")
      }
    >
      {priority}
    </span>
  );
}

const severityMap: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-rose-50 text-rose-700 border-rose-200",
};

export function SeverityPill({ severity }: { severity: string }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase " +
        (severityMap[severity] ?? "bg-muted text-muted-foreground border-border")
      }
    >
      {severity}
    </span>
  );
}