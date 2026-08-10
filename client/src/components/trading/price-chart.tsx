import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePriceHistory } from "@/hooks/use-price-history";
import { useBinanceStream, type BinanceKlineUpdate, type BinanceTick } from "@/hooks/use-binance-stream";
import { useTheme } from "@/hooks/use-theme";
import type { ChartTimeframe } from "@/types/chart";
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickSeries, AreaSeries, BarSeries, HistogramSeries,
  ColorType, CrosshairMode, LineType, LastPriceAnimationMode,
  LineStyle, UTCTimestamp, type IPriceLine,
} from "lightweight-charts";
import { BarChart3, TrendingUp, Activity, Wifi, WifiOff } from "lucide-react";

interface PriceChartProps {
  symbol: string;
  className?: string;
}

type ExtendedChartType = "candlestick" | "line" | "ohlc" | "heikin-ashi";

const INTERVAL_SECONDS: Record<ChartTimeframe, number> = {
  "1s": 1, "1m": 60, "5m": 300, "15m": 900, "1h": 3600,
  "4h": 14400, "1d": 86400, "1w": 604800,
};

const TIMEFRAMES: { label: string; value: ChartTimeframe }[] = [
  { label: "1s", value: "1s" },
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "1H", value: "1h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

const CHART_TYPES: { label: string; value: ExtendedChartType; icon: typeof BarChart3 }[] = [
  { label: "Candles", value: "candlestick", icon: BarChart3 },
  { label: "Line", value: "line", icon: TrendingUp },
  { label: "OHLC", value: "ohlc", icon: Activity },
  { label: "Heikin-Ashi", value: "heikin-ashi", icon: BarChart3 },
];

function formatPrice(p: number): string {
  if (p >= 10000) return p.toFixed(2);
  if (p >= 100) return p.toFixed(3);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(2);
}

function calculateHeikinAshi(candles: any[]): any[] {
  if (!candles.length) return [];
  const result: any[] = [];
  let prevHA = { open: candles[0].open, close: candles[0].close };
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevHA.open + prevHA.close) / 2;
    result.push({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      open: haOpen, high: Math.max(c.high, haOpen, haClose),
      low: Math.min(c.low, haOpen, haClose), close: haClose,
    });
    prevHA = { open: haOpen, close: haClose };
  }
  return result;
}

export function PriceChart({ symbol, className }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1s");
  const [chartType, setChartType] = useState<ExtendedChartType>("candlestick");
  const { data: candles, isLoading } = usePriceHistory(symbol, timeframe, 500);
  const { isDark } = useTheme();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const lastCandleRef = useRef<any>(null);
  const lastVolumeRef = useRef<any>(null);
  const chartTypeRef = useRef(chartType);
  const timeframeRef = useRef(timeframe);
  const symbolRef = useRef(symbol);
  const lastTickTimeRef = useRef(0);
  const needsScrollRef = useRef(true);
  const isHoveredRef = useRef(false);

  const colors = useMemo(() => ({
    bg: isDark ? "#111111" : "#ffffff",
    text: isDark ? "#9ca3af" : "#374151",
    grid: isDark ? "#1e1e1e" : "#e5e7eb",
    border: isDark ? "#1e1e1e" : "#d1d5db",
    crosshair: isDark ? "#6b7280" : "#9B7DFF",
    up: "#22c55e", down: "#ef4444",
    volUp: "rgba(34,197,94,0.4)", volDown: "rgba(239,68,68,0.4)",
    areaTop: "rgba(34,197,94,0.28)", areaBottom: "rgba(34,197,94,0.02)",
    line: "#22c55e",
  }), [isDark]);

  useEffect(() => { chartTypeRef.current = chartType; }, [chartType]);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);

  const updateLegend = useCallback((data: any) => {
    if (!legendRef.current) return;
    const sym = symbolRef.current;
    if ("open" in data) {
      const up = data.close >= data.open;
      const c = up ? "#22c55e" : "#ef4444";
      legendRef.current.innerHTML =
        `<span style="color:#6b7280;font-weight:600">${sym}/USDT</span>` +
        `<span style="margin-left:8px">` +
        `O <span style="color:${c}">${formatPrice(data.open)}</span> ` +
        `H <span style="color:${c}">${formatPrice(data.high)}</span> ` +
        `L <span style="color:${c}">${formatPrice(data.low)}</span> ` +
        `C <span style="color:${c}">${formatPrice(data.close)}</span>` +
        `</span>` +
        (data.volume != null ? `<span style="color:#6b7280;margin-left:8px">V ${formatVolume(data.volume)}</span>` : "");
    } else if ("value" in data) {
      legendRef.current.innerHTML =
        `<span style="color:#6b7280;font-weight:600">${sym}/USDT</span>` +
        `<span style="color:#9ca3af;margin-left:8px">${formatPrice(data.value)}</span>`;
    }
  }, []);

  const processedData = useMemo(() => {
    if (!candles?.length) return { mainData: [], volumeData: [] };
    let mainData: any[];
    if (chartType === "heikin-ashi") mainData = calculateHeikinAshi(candles);
    else if (chartType === "line") {
      mainData = candles.map((c: any) => ({ time: Math.floor(c.time / 1000) as UTCTimestamp, value: c.close }));
    } else {
      mainData = candles.map((c: any) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        open: c.open, high: c.high, low: c.low, close: c.close,
      }));
    }
    const volumeData = candles.map((c: any) => ({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? colors.volUp : colors.volDown,
    }));
    return { mainData, volumeData };
  }, [candles, chartType, colors]);

  // Create chart
  useEffect(() => {
    if (!chartContainerRef.current || isLoading) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; volumeSeriesRef.current = null; priceLineRef.current = null; }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: colors.bg }, textColor: colors.text, attributionLogo: false, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
      watermark: { visible: true, text: `${symbol}USDT`, fontSize: 48, color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
      grid: { vertLines: { color: colors.grid, style: LineStyle.SparseDotted }, horzLines: { color: colors.grid, style: LineStyle.SparseDotted } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: colors.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.crosshair }, horzLine: { color: colors.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.crosshair } },
      rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.1, bottom: 0.2 }, borderVisible: false },
      timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: timeframe === "1s" || timeframe === "1m", borderVisible: false, rightOffset: 5 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const volSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeriesRef.current = volSeries;

    if (chartType === "line") {
      seriesRef.current = chart.addSeries(AreaSeries, {
        topColor: colors.areaTop, bottomColor: colors.areaBottom, lineColor: colors.line, lineWidth: 2,
        lineType: LineType.Curved, crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: colors.bg, crosshairMarkerBackgroundColor: colors.line,
        crosshairMarkerBorderWidth: 2, lastPriceAnimation: LastPriceAnimationMode.Continuous, priceLineVisible: false,
      });
    } else if (chartType === "ohlc") {
      seriesRef.current = chart.addSeries(BarSeries, { upColor: colors.up, downColor: colors.down, thinBars: false, priceLineVisible: false });
    } else {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: colors.up, downColor: colors.down, wickVisible: true, borderVisible: true,
        borderUpColor: colors.up, borderDownColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down, priceLineVisible: false,
      });
    }

    const mainSeries = seriesRef.current;
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.point.x < 0 || param.point.y < 0 || !param.time) {
        isHoveredRef.current = false;
        if (lastCandleRef.current) updateLegend(lastCandleRef.current);
        return;
      }
      isHoveredRef.current = true;
      const cd = param.seriesData.get(mainSeries) as any;
      const vd = param.seriesData.get(volSeries) as any;
      if (cd) updateLegend({ ...cd, volume: vd?.value });
    });

    needsScrollRef.current = true;
    lastCandleRef.current = null;
    lastVolumeRef.current = null;

    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; volumeSeriesRef.current = null; priceLineRef.current = null; } };
  }, [chartType, isLoading, colors, timeframe, symbol, isDark, updateLegend]);

  // Load data
  useEffect(() => {
    if (!seriesRef.current || !processedData.mainData.length) return;
    seriesRef.current.setData(processedData.mainData as any);
    if (volumeSeriesRef.current && processedData.volumeData.length > 0) volumeSeriesRef.current.setData(processedData.volumeData as any);

    const lastMain = processedData.mainData[processedData.mainData.length - 1];
    lastCandleRef.current = lastMain;
    if (processedData.volumeData.length > 0) lastVolumeRef.current = processedData.volumeData[processedData.volumeData.length - 1];

    if (priceLineRef.current) { try { seriesRef.current.removePriceLine(priceLineRef.current); } catch {} }
    const livePrice = "close" in lastMain ? lastMain.close : lastMain.value;
    priceLineRef.current = seriesRef.current.createPriceLine({ price: livePrice, color: "#3b82f6", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });

    if (!isHoveredRef.current) updateLegend(lastMain);
    if (needsScrollRef.current && chartRef.current) {
      needsScrollRef.current = false;
      const total = processedData.mainData.length;
      const visible = Math.min(80, total);
      chartRef.current.timeScale().setVisibleLogicalRange({ from: total - visible - 0.5, to: total + 4.5 });
    }
  }, [processedData, updateLegend]);

  // Real-time kline handler
  const handleKline = useCallback((kline: BinanceKlineUpdate) => {
    if (!seriesRef.current || !lastCandleRef.current) return;
    const ct = chartTypeRef.current;
    const candleTime = kline.time as UTCTimestamp;

    if (ct === "line") {
      const lastTime = lastCandleRef.current.time as number;
      const pt = candleTime > lastTime ? { time: candleTime, value: kline.close } : { time: lastCandleRef.current.time, value: kline.close };
      seriesRef.current.update(pt);
      lastCandleRef.current = pt;
    } else if (ct === "heikin-ashi") {
      const prev = lastCandleRef.current;
      const haClose = (kline.open + kline.high + kline.low + kline.close) / 4;
      const haOpen = (prev.open + prev.close) / 2;
      const lastTime = prev.time as number;
      const candle = candleTime > lastTime
        ? { time: candleTime, open: haOpen, high: Math.max(kline.high, haOpen, haClose), low: Math.min(kline.low, haOpen, haClose), close: haClose }
        : { time: prev.time, open: prev.open, high: Math.max(prev.high, kline.high, haClose), low: Math.min(prev.low, kline.low, haClose), close: haClose };
      seriesRef.current.update(candle);
      lastCandleRef.current = candle;
    } else {
      const lastTime = lastCandleRef.current.time as number;
      const prev = lastCandleRef.current;
      const candle = candleTime > lastTime
        ? { time: candleTime, open: kline.open, high: kline.high, low: kline.low, close: kline.close }
        : { time: prev.time, open: prev.open, high: Math.max(prev.high, kline.high), low: Math.min(prev.low, kline.low), close: kline.close };
      seriesRef.current.update(candle);
      lastCandleRef.current = candle;
    }

    if (volumeSeriesRef.current) {
      const volColor = kline.close >= kline.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)";
      const lastVolTime = lastVolumeRef.current?.time as number | undefined;
      const volTime = (!lastVolTime || candleTime > lastVolTime) ? candleTime : lastVolumeRef.current.time;
      const vol = { time: volTime, value: kline.volume, color: volColor };
      volumeSeriesRef.current.update(vol as any);
      lastVolumeRef.current = vol;
    }

    if (priceLineRef.current) priceLineRef.current.applyOptions({ price: kline.close });
    if (!isHoveredRef.current) {
      const c = lastCandleRef.current;
      updateLegend("open" in c ? { ...c, volume: kline.volume } : c);
    }
  }, [updateLegend]);

  // Tick handler
  const handleTick = useCallback((tick: BinanceTick) => {
    if (!seriesRef.current || !lastCandleRef.current) return;
    const ct = chartTypeRef.current;
    if (ct === "heikin-ashi") return;

    const intervalSec = INTERVAL_SECONDS[timeframeRef.current] || 60;
    const candleEndTime = (lastCandleRef.current.time as number) + intervalSec;
    if (tick.time >= candleEndTime) return;

    const now = performance.now();
    if (now - lastTickTimeRef.current < 50) return;
    lastTickTimeRef.current = now;

    if (ct === "line") {
      const pt = { time: lastCandleRef.current.time, value: tick.price };
      seriesRef.current.update(pt);
      lastCandleRef.current = pt;
    } else {
      const prev = lastCandleRef.current;
      const updated = { time: prev.time, open: prev.open, high: Math.max(prev.high, tick.price), low: Math.min(prev.low, tick.price), close: tick.price };
      seriesRef.current.update(updated);
      lastCandleRef.current = updated;
    }
    if (priceLineRef.current) priceLineRef.current.applyOptions({ price: tick.price });
    if (!isHoveredRef.current) updateLegend(lastCandleRef.current);
  }, [updateLegend]);

  const { isConnected } = useBinanceStream(symbol, timeframe, handleKline, handleTick);

  if (isLoading) {
    return (
      <div className={`rounded-2xl border flex flex-col overflow-hidden bg-[#111] border-[#1e1e1e] ${className || ""}`} style={{ minHeight: 0 }}>
        <div className="flex items-center px-3 py-2 border-b border-[#1e1e1e] flex-shrink-0">
          <div className="flex gap-1">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-7 h-6 rounded bg-[#1a1a1a] animate-pulse" />)}</div>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 size={24} className="mx-auto mb-2 animate-pulse text-gray-600" />
            <p className="text-xs text-gray-500">Loading chart...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border flex flex-col overflow-hidden bg-[#111] border-[#1e1e1e] ${className || ""}`} style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e1e] flex-shrink-0">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          <div className="flex items-center gap-1 mr-1.5 flex-shrink-0" title={isConnected ? "Live" : "Connecting..."}>
            {isConnected ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} className="text-gray-500 animate-pulse" />}
          </div>
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} onClick={() => setTimeframe(tf.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${timeframe === tf.value ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]" : "text-gray-500 hover:text-gray-300"}`}>
              {tf.label}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          {CHART_TYPES.map((ct) => (
            <button key={ct.value} onClick={() => setChartType(ct.value)}
              className={`p-1.5 rounded transition-colors ${chartType === ct.value ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]" : "text-gray-500 hover:text-gray-300"}`}
              title={ct.label}>
              <ct.icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 min-h-0 relative">
        <div ref={legendRef} className="absolute top-2 left-3 z-10 text-[11px] leading-relaxed pointer-events-none select-none" style={{ fontFamily: "monospace" }} />
        <div ref={chartContainerRef} className="absolute inset-0" style={{ WebkitOverflowScrolling: "touch" }}>
          {(!candles || candles.length === 0) && !isLoading && (
            <div className="h-full flex items-center justify-center"><p className="text-sm text-gray-600">No data available</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
