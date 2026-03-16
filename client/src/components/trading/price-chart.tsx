import { useState, useMemo } from "react";
import { usePriceHistory } from "@/hooks/use-price-history";
import type { ChartTimeframe, ChartType, CandlestickData } from "@/types/chart";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";
import { BarChart3, TrendingUp, Activity } from "lucide-react";

interface PriceChartProps {
  symbol: string;
  className?: string;
}

const TIMEFRAMES: { label: string; value: ChartTimeframe }[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

const CHART_TYPES: { label: string; value: ChartType; icon: typeof BarChart3 }[] = [
  { label: "Candles", value: "candlestick", icon: BarChart3 },
  { label: "Line", value: "line", icon: TrendingUp },
  { label: "Area", value: "area", icon: Activity },
];

function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(0);
  if (price >= 100) return price.toFixed(1);
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

function formatTime(timestamp: number, interval: ChartTimeframe): string {
  const d = new Date(timestamp);
  if (["1d", "1w"].includes(interval)) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (["4h", "1h"].includes(interval)) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// Custom candlestick shape for Recharts
function CandlestickShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload || payload.open === undefined) return null;

  const { open, close, high, low } = payload;
  const isUp = close >= open;
  const color = isUp ? "#22c55e" : "#ef4444";
  const bodyTop = Math.min(open, close);
  const bodyBottom = Math.max(open, close);

  // Scale calculations
  const chartHeight = props.yAxis?.height || 300;
  const domain = props.yAxis?.domain || [low, high];
  const [domainMin, domainMax] = domain;
  const range = domainMax - domainMin;
  if (range === 0) return null;

  const yScale = (val: number) => {
    const pct = (val - domainMin) / range;
    return props.yAxis?.y + chartHeight * (1 - pct);
  };

  const bodyY = yScale(bodyBottom);
  const bodyH = Math.max(1, yScale(bodyTop) - yScale(bodyBottom));
  const wickX = x + width / 2;

  return (
    <g>
      {/* Wick */}
      <line x1={wickX} y1={yScale(high)} x2={wickX} y2={yScale(low)} stroke={color} strokeWidth={1} />
      {/* Body */}
      <rect
        x={x + width * 0.15}
        y={Math.min(bodyY, yScale(bodyBottom))}
        width={width * 0.7}
        height={Math.abs(bodyH) || 1}
        fill={isUp ? color : color}
        stroke={color}
        strokeWidth={0.5}
      />
    </g>
  );
}

function ChartTooltipContent({ active, payload, interval }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const isUp = data.close >= data.open;
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{formatTime(data.time, interval)}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-gray-500">O</span>
        <span className="text-white tabular-nums">{formatPrice(data.open)}</span>
        <span className="text-gray-500">H</span>
        <span className="text-green-400 tabular-nums">{formatPrice(data.high)}</span>
        <span className="text-gray-500">L</span>
        <span className="text-red-400 tabular-nums">{formatPrice(data.low)}</span>
        <span className="text-gray-500">C</span>
        <span className={`tabular-nums ${isUp ? "text-green-400" : "text-red-400"}`}>{formatPrice(data.close)}</span>
        <span className="text-gray-500">Vol</span>
        <span className="text-white tabular-nums">{data.volume >= 1000 ? `${(data.volume / 1000).toFixed(1)}K` : data.volume.toFixed(1)}</span>
      </div>
    </div>
  );
}

export function PriceChart({ symbol, className }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1h");
  const [chartType, setChartType] = useState<ChartType>("candlestick");
  const { data: candles, isLoading } = usePriceHistory(symbol, timeframe, 100);

  const chartData = useMemo(() => {
    if (!candles?.length) return [];
    return candles.map((c) => ({
      ...c,
      displayTime: formatTime(c.time, timeframe),
      // For bar chart rendering of volume
      volColor: c.close >= c.open ? "#22c55e" : "#ef4444",
    }));
  }, [candles, timeframe]);

  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (!chartData.length) return { minPrice: 0, maxPrice: 0, maxVolume: 0 };
    const lows = chartData.map((c) => c.low);
    const highs = chartData.map((c) => c.high);
    const vols = chartData.map((c) => c.volume);
    const pad = (Math.max(...highs) - Math.min(...lows)) * 0.05;
    return {
      minPrice: Math.min(...lows) - pad,
      maxPrice: Math.max(...highs) + pad,
      maxVolume: Math.max(...vols),
    };
  }, [chartData]);

  if (isLoading) {
    return (
      <div className={`bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 flex items-center justify-center ${className || ""}`}>
        <div className="text-center">
          <BarChart3 size={24} className="text-gray-600 mx-auto mb-2 animate-pulse" />
          <p className="text-gray-500 text-xs">Loading chart...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#111] rounded-2xl border border-[#1e1e1e] flex flex-col ${className || ""}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e1e]">
        {/* Timeframes */}
        <div className="flex gap-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                timeframe === tf.value
                  ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        {/* Chart Type */}
        <div className="flex gap-0.5">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.value}
              onClick={() => setChartType(ct.value)}
              className={`p-1.5 rounded transition-colors ${
                chartType === ct.value
                  ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title={ct.label}
            >
              <ct.icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 min-h-[280px] px-1 pt-2">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-600 text-sm">No data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid stroke="#1e1e1e" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="displayTime"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={{ stroke: "#1e1e1e" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatPrice}
                orientation="right"
                width={65}
              />
              <Tooltip
                content={<ChartTooltipContent interval={timeframe} />}
                cursor={{ stroke: "#3b82f6", strokeWidth: 0.5, strokeDasharray: "4 4" }}
              />

              {/* Volume bars (background, low opacity) */}
              <Bar
                dataKey="volume"
                yAxisId="volume"
                barSize={chartData.length > 60 ? 3 : 6}
                opacity={0.3}
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.volColor} />
                ))}
              </Bar>

              {chartType === "candlestick" && (
                <>
                  {/* Render candlestick bodies as colored bars */}
                  <Bar
                    dataKey="close"
                    barSize={chartData.length > 60 ? 4 : 8}
                    shape={(props: any) => {
                      const d = props.payload;
                      if (!d) return <rect width={0} height={0} />;
                      const isUp = d.close >= d.open;
                      const color = isUp ? "#22c55e" : "#ef4444";
                      const { x, width } = props;
                      // Get Y positions from the scale
                      const yAxisScale = props.background?.y !== undefined;
                      return (
                        <rect
                          x={x}
                          y={props.y}
                          width={width}
                          height={Math.max(1, props.height)}
                          fill={color}
                          rx={0.5}
                        />
                      );
                    }}
                  />
                  {/* High-Low wicks as error-bar-like lines */}
                  <Line
                    type="monotone"
                    dataKey="high"
                    stroke="transparent"
                    dot={false}
                    activeDot={false}
                  />
                </>
              )}

              {chartType === "line" && (
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: "#3b82f6", stroke: "#111" }}
                />
              )}

              {chartType === "area" && (
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  fill="url(#areaGradient)"
                  dot={false}
                  activeDot={{ r: 3, fill: "#3b82f6", stroke: "#111" }}
                />
              )}

              {/* Volume Y axis (hidden, just for scaling) */}
              <YAxis
                yAxisId="volume"
                domain={[0, maxVolume * 5]}
                hide
              />

              {/* Area gradient definition */}
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
