import { useEffect, useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Calculator, TrendingUp } from "lucide-react";
import { formatUsdNumber } from "@/utils/format-utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface CalculatorProduct {
  title: string;
  apy: string; // annualized %, e.g. "4.00" — same convention as the rest of the staking pages
  duration: number; // days
}

interface RoiCalculatorProps {
  products: CalculatorProduct[];
}

const DURATION_PRESETS = [7, 14, 30, 60, 90];

export function RoiCalculator({ products }: RoiCalculatorProps) {
  const [amount, setAmount] = useState(1000);
  const [duration, setDuration] = useState(30);
  const [dailyRate, setDailyRate] = useState(0.05); // percent per day
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

  const maxDailyRate = useMemo(() => {
    const rates = products.map((p) => parseFloat(p.apy) / 365);
    const highest = rates.length ? Math.max(...rates) : 0.1;
    return Math.max(0.2, Math.ceil(highest * 150) / 100);
  }, [products]);

  const applyPreset = (p: CalculatorProduct) => {
    setSelectedTitle(p.title);
    setDailyRate(Math.round((parseFloat(p.apy) / 365) * 10000) / 10000);
    setDuration(p.duration);
  };

  // Seed the calculator with the first real plan so it opens already showing
  // a meaningful projection, same spirit as the mockup's pre-selected preset.
  useEffect(() => {
    if (products.length > 0 && selectedTitle === null) {
      applyPreset(products[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const dailyProfit = amount * (dailyRate / 100);
  const totalProfit = dailyProfit * duration;
  const roi = amount > 0 ? (totalProfit / amount) * 100 : 0;
  const totalReturn = amount + totalProfit;

  const chartData = useMemo(() => {
    const maxPoints = 30;
    const step = Math.max(1, Math.round(duration / maxPoints));
    const data: { day: string; value: number }[] = [];
    for (let d = 0; d <= duration; d += step) {
      data.push({ day: `D${d}`, value: amount + dailyProfit * d });
    }
    if (data[data.length - 1]?.day !== `D${duration}`) {
      data.push({ day: `D${duration}`, value: amount + dailyProfit * duration });
    }
    return data;
  }, [amount, duration, dailyProfit]);

  return (
    <div className="space-y-5">
      {products.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wide">Quick Plan Presets</p>
          <div className="flex flex-wrap gap-2">
            {products.map((p) => (
              <button
                key={p.title}
                onClick={() => applyPreset(p)}
                className={`px-3 py-2 rounded-xl border text-left transition-colors ${
                  selectedTitle === p.title
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-card border-border text-foreground hover:border-primary/30"
                }`}
              >
                <div className="text-xs font-semibold">{p.title}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{(parseFloat(p.apy) / 365).toFixed(3)}%/day</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Investment Amount */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground">Investment Amount</label>
          <span className="text-sm font-semibold text-foreground tabular-nums">${formatUsdNumber(amount)}</span>
        </div>
        <Slider value={[amount]} onValueChange={([v]) => setAmount(v)} min={10} max={100000} step={10} />
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
          className="mt-2 tabular-nums"
        />
      </div>

      {/* Duration */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground">Duration (Days)</label>
          <span className="text-sm font-semibold text-foreground tabular-nums">{duration}d</span>
        </div>
        <Slider value={[duration]} onValueChange={([v]) => setDuration(v)} min={1} max={365} step={1} />
        <div className="grid grid-cols-5 gap-1.5 mt-2">
          {DURATION_PRESETS.map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                duration === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Daily Rate */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground">Daily Rate (%)</label>
          <span className="text-sm font-semibold text-foreground tabular-nums">{dailyRate.toFixed(3)}%</span>
        </div>
        <Slider value={[dailyRate]} onValueChange={([v]) => setDailyRate(v)} min={0} max={maxDailyRate} step={0.001} />
      </div>

      {/* Projected Returns */}
      <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" /> Projected Returns
        </p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Daily Profit</p>
            <p className="text-sm font-semibold text-success tabular-nums">+${formatUsdNumber(dailyProfit)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Total Profit</p>
            <p className="text-sm font-semibold text-success tabular-nums">+${formatUsdNumber(totalProfit)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">ROI</p>
            <p className="text-sm font-semibold text-primary tabular-nums">{roi.toFixed(2)}%</p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">Total Return</span>
          <span className="text-base font-bold text-foreground tabular-nums">${formatUsdNumber(totalReturn)}</span>
        </div>
      </div>

      {/* Growth Projection Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-primary" /> Growth Projection
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `$${formatUsdNumber(v)}`} width={60} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", fontSize: "12px" }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
              formatter={(v: number) => [`$${formatUsdNumber(v)}`, "Value"]}
            />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        * Projections are estimates. Actual returns may vary.
      </p>
    </div>
  );
}
