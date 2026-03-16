import { CheckCircle, Clock, XCircle, AlertCircle, Loader2, Ban } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  showIcon?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", icon: Clock },
  pending_approval: { label: "Pending", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", icon: Clock },
  approved: { label: "Approved", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: CheckCircle },
  filled: { label: "Filled", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: CheckCircle },
  executed: { label: "Executed", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: CheckCircle },
  completed: { label: "Completed", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: CheckCircle },
  rejected: { label: "Rejected", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: XCircle },
  cancelled: { label: "Cancelled", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/20", icon: Ban },
  active: { label: "Active", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: Loader2 },
  closed: { label: "Closed", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/20", icon: CheckCircle },
};

export function StatusBadge({ status, size = "sm", showIcon = true }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    color: "text-gray-400",
    bg: "bg-gray-500/10 border-gray-500/20",
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
