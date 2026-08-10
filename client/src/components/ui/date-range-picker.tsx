import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";

interface DateRange {
  from: Date | null;
  to: Date | null;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 0 },
];

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const handlePreset = (days: number) => {
    if (days === 0) {
      onChange({ from: null, to: null });
    } else {
      const now = new Date();
      const from = new Date(now.getTime() - days * 86400000);
      onChange({ from, to: now });
    }
    setOpen(false);
  };

  const label = value.from && value.to
    ? `${formatDate(value.from)} - ${formatDate(value.to)}`
    : value.from
    ? `From ${formatDate(value.from)}`
    : "All time";

  return (
    <div className={`relative ${className || ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-[#111] border border-[#1e1e1e] text-gray-400 hover:text-gray-300 hover:border-[#2a2a2a] transition-colors"
      >
        <Calendar size={12} />
        <span className="truncate max-w-[140px]">{label}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-xl p-3 min-w-[220px]">
            {/* Quick Presets */}
            <div className="space-y-1 mb-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Quick Select</p>
              {PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  onClick={() => handlePreset(preset.days)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-gray-300 hover:bg-[#222] hover:text-white transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            <div className="border-t border-[#2a2a2a] pt-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Custom Range</p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={value.from ? formatDate(value.from) : ""}
                  onChange={(e) => onChange({ ...value, from: e.target.value ? new Date(e.target.value) : null })}
                  className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-blue-500/50"
                />
                <input
                  type="date"
                  value={value.to ? formatDate(value.to) : ""}
                  onChange={(e) => onChange({ ...value, to: e.target.value ? new Date(e.target.value) : null })}
                  className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-full mt-2 py-1.5 bg-blue-500/10 text-blue-400 text-xs rounded-lg hover:bg-blue-500/20 transition-colors border border-blue-500/20"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
