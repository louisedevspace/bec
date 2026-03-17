import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { usePriceHistory } from "@/hooks/use-price-history";
import type { ChartTimeframe, ChartType, CandlestickData } from "@/types/chart";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import { BarChart3, TrendingUp, Activity, Layers, Grid3X3 } from "lucide-react";

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

// Extended chart types including all 5 requested
type ExtendedChartType = "candlestick" | "line" | "ohlc" | "heikin-ashi" | "renko";

const CHART_TYPES: { label: string; value: ExtendedChartType; icon: typeof BarChart3 }[] = [
  { label: "Candles", value: "candlestick", icon: BarChart3 },
  { label: "Line", value: "line", icon: TrendingUp },
  { label: "OHLC", value: "ohlc", icon: Activity },
  { label: "Heikin-Ashi", value: "heikin-ashi", icon: Layers },
  { label: "Renko", value: "renko", icon: Grid3X3 },
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

// Calculate Heikin-Ashi values from regular OHLC data
function calculateHeikinAshi(candles: any[]): any[] {
  if (!candles.length) return [];
  
  const result: any[] = [];
  let prevHA = { open: candles[0].open, close: candles[0].close };
  
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevHA.open + prevHA.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    
    result.push({
      ...c,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      originalOpen: c.open,
      originalClose: c.close,
    });
    
    prevHA = { open: haOpen, close: haClose };
  }
  
  return result;
}

// Calculate Renko bricks from price data
function calculateRenko(candles: any[], brickSize?: number): any[] {
  if (!candles.length) return [];
  
  // Auto-calculate brick size if not provided (2% of price range)
  const prices = candles.map(c => c.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const autoSize = brickSize || Math.max(1, (maxPrice - minPrice) * 0.02);
  
  const bricks: any[] = [];
  let currentPrice = candles[0].close;
  let direction: 'up' | 'down' | null = null;
  
  for (const candle of candles) {
    const price = candle.close;
    
    while (true) {
      if (direction === null || direction === 'up') {
        if (price >= currentPrice + autoSize) {
          bricks.push({
            time: candle.time,
            open: currentPrice,
            close: currentPrice + autoSize,
            high: currentPrice + autoSize,
            low: currentPrice,
            isUp: true,
            volume: candle.volume,
          });
          currentPrice += autoSize;
          direction = 'up';
        } else if (price <= currentPrice - autoSize * 2) {
          // Reversal requires 2 bricks
          bricks.push({
            time: candle.time,
            open: currentPrice,
            close: currentPrice - autoSize,
            high: currentPrice,
            low: currentPrice - autoSize,
            isUp: false,
            volume: candle.volume,
          });
          currentPrice -= autoSize;
          direction = 'down';
        } else {
          break;
        }
      } else {
        if (price <= currentPrice - autoSize) {
          bricks.push({
            time: candle.time,
            open: currentPrice,
            close: currentPrice - autoSize,
            high: currentPrice,
            low: currentPrice - autoSize,
            isUp: false,
            volume: candle.volume,
          });
          currentPrice -= autoSize;
          direction = 'down';
        } else if (price >= currentPrice + autoSize * 2) {
          // Reversal requires 2 bricks
          bricks.push({
            time: candle.time,
            open: currentPrice,
            close: currentPrice + autoSize,
            high: currentPrice + autoSize,
            low: currentPrice,
            isUp: true,
            volume: candle.volume,
          });
          currentPrice += autoSize;
          direction = 'up';
        } else {
          break;
        }
      }
    }
  }
  
  // Limit to last 100 bricks for performance
  return bricks.slice(-100);
}

function ChartTooltipContent({ active, payload, interval }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const isUp = data.close >= data.open;
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs shadow-xl z-50">
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
        {data.volume !== undefined && (
          <>
            <span className="text-gray-500">Vol</span>
            <span className="text-white tabular-nums">{data.volume >= 1000 ? `${(data.volume / 1000).toFixed(1)}K` : data.volume.toFixed(1)}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function PriceChart({ symbol, className }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1h");
  const [chartType, setChartType] = useState<ExtendedChartType>("candlestick");
  const { data: candles, isLoading } = usePriceHistory(symbol, timeframe, 100);

  // Mobile PWA fix: Explicit dimension management instead of ResponsiveContainer
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Initialize with reasonable defaults based on window size for immediate rendering
  const getDefaultDimensions = useCallback(() => {
    const defaultWidth = typeof window !== 'undefined' ? Math.min(800, Math.max(280, window.innerWidth - 380)) : 320;
    const defaultHeight = 260;
    return { width: defaultWidth, height: defaultHeight };
  }, []);
  
  const [dimensions, setDimensions] = useState(getDefaultDimensions);

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      // Get parent container's actual dimensions
      const parent = containerRef.current.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      
      // Try multiple methods to get dimensions (mobile PWA compatibility)
      let width = containerRef.current.getBoundingClientRect().width;
      let height = containerRef.current.getBoundingClientRect().height;
      
      // Use parent width if available and smaller (prevents overflow)
      if (parentRect && parentRect.width > 0 && parentRect.width < width) {
        width = parentRect.width;
      }
      
      // Fallback chain for PWA
      if (width < 50) width = containerRef.current.offsetWidth;
      if (height < 50) height = containerRef.current.offsetHeight;
      if (width < 50) width = containerRef.current.clientWidth;
      if (height < 50) height = containerRef.current.clientHeight;
      
      // Window-based fallback with proper constraints
      if (width < 50) {
        const isDesktop = window.innerWidth >= 1024;
        width = isDesktop ? Math.min(800, window.innerWidth - 400) : window.innerWidth - 40;
      }
      if (height < 50) height = 260;

      // Ensure minimum and maximum dimensions to prevent overflow
      width = Math.max(200, Math.min(width, window.innerWidth - 20));
      height = Math.max(200, Math.min(height, 400));

      setDimensions((prev) => {
        if (Math.abs(prev.width - width) > 2 || Math.abs(prev.height - height) > 2) {
          return { width: Math.floor(width), height: Math.floor(height) };
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    // Staggered measurements for PWA initialization
    const timers = [
      setTimeout(updateDimensions, 0),
      setTimeout(updateDimensions, 100),
      setTimeout(updateDimensions, 500),
      setTimeout(updateDimensions, 1000),
    ];

    const handleResize = () => {
      requestAnimationFrame(updateDimensions);
    };

    const handleOrientationChange = () => {
      setTimeout(updateDimensions, 150);
      setTimeout(updateDimensions, 500);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleOrientationChange);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      resizeObserver?.disconnect();
    };
  }, [updateDimensions]);

  // Process chart data based on chart type
  const chartData = useMemo(() => {
    if (!candles?.length) return [];
    
    let processedData = candles;
    
    // Apply Heikin-Ashi transformation
    if (chartType === "heikin-ashi") {
      processedData = calculateHeikinAshi(candles);
    }
    
    // Apply Renko transformation
    if (chartType === "renko") {
      processedData = calculateRenko(candles);
    }
    
    return processedData.map((c: any, index: number) => ({
      ...c,
      displayTime: formatTime(c.time, timeframe),
      index,
      volColor: c.close >= c.open ? "#22c55e" : "#ef4444",
      isUp: c.isUp !== undefined ? c.isUp : c.close >= c.open,
    }));
  }, [candles, timeframe, chartType]);

  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (!chartData.length) return { minPrice: 0, maxPrice: 0, maxVolume: 0 };
    const lows = chartData.map((c: any) => c.low);
    const highs = chartData.map((c: any) => c.high);
    const vols = chartData.map((c: any) => c.volume || 0);
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

      {/* Chart Area - constrained to prevent overflow */}
      <div
        ref={containerRef}
        className="flex-1 min-h-[240px] max-h-[350px] px-1 pt-2 touch-manipulation overflow-hidden"
        style={{
          WebkitOverflowScrolling: 'touch',
          position: 'relative',
          WebkitTransform: 'translateZ(0)',
          willChange: 'transform',
        }}
      >
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center" style={{ minHeight: '240px' }}>
            <p className="text-gray-600 text-sm">No data available</p>
          </div>
        ) : (
          <ComposedChart 
            width={Math.max(200, Math.min(dimensions.width - 8, window.innerWidth - 350))} 
            height={Math.max(180, Math.min(dimensions.height - 8, 340))} 
            data={chartData} 
            margin={{ top: 5, right: 8, bottom: 5, left: 5 }}
          >
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

              {/* Volume bars (background, low opacity) - skip for Renko */}
              {chartType !== "renko" && (
                <Bar
                  dataKey="volume"
                  yAxisId="volume"
                  barSize={chartData.length > 60 ? 3 : 6}
                  opacity={0.3}
                >
                  {chartData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.volColor} />
                  ))}
                </Bar>
              )}

              {/* Candlestick Chart */}
              {chartType === "candlestick" && (
                <Bar
                  dataKey="close"
                  barSize={chartData.length > 60 ? 4 : 8}
                  shape={(props: any) => {
                    const d = props.payload;
                    if (!d || d.open === undefined) return <g />;
                    
                    const isUp = d.close >= d.open;
                    const color = isUp ? "#22c55e" : "#ef4444";
                    const { x, width, y, height } = props;
                    const wickX = x + width / 2;
                    const bodyHeight = Math.max(2, Math.abs(height) || 2);
                    
                    return (
                      <g>
                        <line x1={wickX} y1={y - 8} x2={wickX} y2={y + bodyHeight + 8} stroke={color} strokeWidth={1} />
                        <rect x={x} y={y} width={width} height={bodyHeight} fill={color} stroke={color} strokeWidth={0.5} rx={0.5} />
                      </g>
                    );
                  }}
                />
              )}

              {/* Heikin-Ashi Chart - uses transformed data with candlestick rendering */}
              {chartType === "heikin-ashi" && (
                <Bar
                  dataKey="close"
                  barSize={chartData.length > 60 ? 4 : 8}
                  shape={(props: any) => {
                    const d = props.payload;
                    if (!d || d.open === undefined) return <g />;
                    
                    const isUp = d.close >= d.open;
                    const color = isUp ? "#22c55e" : "#ef4444";
                    const { x, width, y, height } = props;
                    const wickX = x + width / 2;
                    const bodyHeight = Math.max(2, Math.abs(height) || 2);
                    
                    return (
                      <g>
                        <line x1={wickX} y1={y - 8} x2={wickX} y2={y + bodyHeight + 8} stroke={color} strokeWidth={1} />
                        <rect x={x} y={y} width={width} height={bodyHeight} fill={color} stroke={color} strokeWidth={0.5} rx={0.5} />
                      </g>
                    );
                  }}
                />
              )}

              {/* OHLC Bar Chart */}
              {chartType === "ohlc" && (
                <Bar
                  dataKey="close"
                  barSize={chartData.length > 60 ? 4 : 8}
                  shape={(props: any) => {
                    const d = props.payload;
                    if (!d || d.open === undefined) return <g />;
                    
                    const isUp = d.close >= d.open;
                    const color = isUp ? "#22c55e" : "#ef4444";
                    const { x, width, y, height } = props;
                    const centerX = x + width / 2;
                    const tickSize = width * 0.4;
                    
                    // OHLC uses vertical line for high-low, horizontal ticks for open/close
                    return (
                      <g>
                        {/* High-Low vertical line */}
                        <line x1={centerX} y1={y - 10} x2={centerX} y2={y + Math.abs(height) + 10} stroke={color} strokeWidth={1.5} />
                        {/* Open tick (left) */}
                        <line x1={centerX - tickSize} y1={y + (isUp ? Math.abs(height) : 0)} x2={centerX} y2={y + (isUp ? Math.abs(height) : 0)} stroke={color} strokeWidth={1.5} />
                        {/* Close tick (right) */}
                        <line x1={centerX} y1={y + (isUp ? 0 : Math.abs(height))} x2={centerX + tickSize} y2={y + (isUp ? 0 : Math.abs(height))} stroke={color} strokeWidth={1.5} />
                      </g>
                    );
                  }}
                />
              )}

              {/* Renko Chart - brick-based rendering */}
              {chartType === "renko" && (
                <Bar
                  dataKey="close"
                  barSize={chartData.length > 60 ? 6 : 10}
                  shape={(props: any) => {
                    const d = props.payload;
                    if (!d) return <g />;
                    
                    const isUp = d.isUp;
                    const color = isUp ? "#22c55e" : "#ef4444";
                    const { x, width, y, height } = props;
                    const brickHeight = Math.max(4, Math.abs(height) || 8);
                    
                    // Renko uses filled bricks without wicks
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={brickHeight}
                        fill={isUp ? color : "transparent"}
                        stroke={color}
                        strokeWidth={1}
                        rx={1}
                      />
                    );
                  }}
                />
              )}

              {/* Line Chart */}
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

              {/* Volume Y axis (hidden, just for scaling) */}
              <YAxis
                yAxisId="volume"
                domain={[0, maxVolume * 5]}
                hide
              />
          </ComposedChart>
        )}
      </div>
    </div>
  );
}
