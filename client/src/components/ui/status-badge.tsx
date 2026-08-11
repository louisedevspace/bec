import { CheckCircle, Clock, XCircle, AlertCircle, Loader2, Ban } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  showIcon?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "text-warning", bg: "bg-warning/10 border-warning/20", icon: Clock },
  pending_approval: { label: "Pending", color: "text-warning", bg: "bg-warning/10 border-warning/20", icon: Clock },
  approved: { label: "Approved", color: "text-success", bg: "bg-success/10 border-success/20", icon: CheckCircle },
  filled: { label: "Filled", color: "text-success", bg: "bg-success/10 border-success/20", icon: CheckCircle },
  executed: { label: "Executed", color: "text-success", bg: "bg-success/10 border-success/20", icon: CheckCircle },
  completed: { label: "Completed", color: "text-success", bg: "bg-success/10 border-success/20", icon: CheckCircle },
  rejected: { label: "Rejected", color: "text-danger", bg: "bg-danger/10 border-danger/20", icon: XCircle },
  cancelled: { label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted border-border", icon: Ban },
  active: { label: "Active", color: "text-info", bg: "bg-info/10 border-info/20", icon: Loader2 },
  closed: { label: "Closed", color: "text-muted-foreground", bg: "bg-muted border-border", icon: CheckCircle },
};

export function StatusBadge({ status, size = "sm", showIcon = true }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    color: "text-muted-foreground",
    bg: "bg-muted border-border",
    icon: AlertCircle,
  };

  const Icon = config.icon;
  const sizeClasses = size === "sm" ? "text-[10px] px-1.5 py-0.5 gap-1" : "text-xs px-2 py-1 gap-1.5";

  return (
    <span className={`inline-flex items-center font-medium rounded border ${config.color} ${config.bg} ${sizeClasses}`}>
      {showIcon && <Icon size={size === "sm" ? 10 : 12} />}
      {config.label}
    </span>
  );
}
