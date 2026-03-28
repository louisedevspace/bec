import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePriceHistory } from "@/hooks/use-price-history";
import { useBinanceStream, type BinanceKlineUpdate, type BinanceTick } from "@/hooks/use-binance-stream";
import { useTheme } from "@/hooks/use-theme";
import type { ChartTimeframe } from "@/types/chart";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  AreaSeries,
  BarSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineType,
  LastPriceAnimationMode,
  LineStyle,
  UTCTimestamp,
  type IPriceLine,
} from "lightweight-charts";
import { BarChart3, TrendingUp, Activity, Layers, Grid3X3, Wifi, WifiOff } from "lucide-react";

/* ─── Types ─── */

interface OHLCData {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface SingleValueData {
  time: UTCTimestamp;
  value: number;
  color?: string;
}

interface PriceChartProps {
  symbol: string;
  className?: string;
}

/* ─── Constants ─── */

type ExtendedChartType = "candlestick" | "line" | "ohlc" | "heikin-ashi" | "renko";

const INTERVAL_SECONDS: Record<ChartTimeframe, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600,
  "4h": 14400, "1d": 86400, "1w": 604800,
};

const TIMEFRAMES: { label: string; value: ChartTimeframe }[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

const CHART_TYPES: { label: string; value: ExtendedChartType; icon: typeof BarChart3 }[] = [
  { label: "Candles", value: "candlestick", icon: BarChart3 },
  { label: "Line", value: "line", icon: TrendingUp },
  { label: "OHLC", value: "ohlc", icon: Activity },
  { label: "Heikin-Ashi", value: "heikin-ashi", icon: Layers },
  { label: "Renko", value: "renko", icon: Grid3X3 },
];

// Chart color palette — matches app's dark theme (#111 bg, #1e1e1e grid)
const getChartColors = (isDark: boolean) => ({
  background: isDark ? "#111111" : "#ffffff",
  text: isDark ? "#9ca3af" : "#374151",
  grid: isDark ? "#1e1e1e" : "#e5e7eb",
  border: isDark ? "#1e1e1e" : "#d1d5db",
  crosshair: isDark ? "#6b7280" : "#9B7DFF",
  upColor: "#22c55e",
  downColor: "#ef4444",
  volumeUp: "rgba(34,197,94,0.4)",
  volumeDown: "rgba(239,68,68,0.4)",
  areaTop: isDark ? "rgba(34,197,94,0.28)" : "rgba(34,197,94,0.3)",
  areaBottom: isDark ? "rgba(34,197,94,0.02)" : "rgba(34,197,94,0.02)",
  lineColor: "#22c55e",
  priceLineColor: "#3b82f6",
});

/* ─── Helpers ─── */

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

function calculateHeikinAshi(candles: any[]): OHLCData[] {
  if (!candles.length) return [];
  const result: OHLCData[] = [];
  let prevHA = { open: candles[0].open, close: candles[0].close };
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevHA.open + prevHA.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    result.push({ time: Math.floor(c.time / 1000) as UTCTimestamp, open: haOpen, high: haHigh, low: haLow, close: haClose });
    prevHA = { open: haOpen, close: haClose };
  }
  return result;
}

function calculateRenko(candles: any[], brickSize?: number): OHLCData[] {
  if (!candles.length) return [];
  const prices = candles.map((c: any) => c.close);
  const autoSize = brickSize || Math.max(1, (Math.max(...prices) - Math.min(...prices)) * 0.02);
  const bricks: OHLCData[] = [];
  let current = candles[0].close;
  let dir: "up" | "down" | null = null;
  let idx = 0;
  for (const candle of candles) {
    const p = candle.close;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (dir === null || dir === "up") {
        if (p >= current + autoSize) {
          bricks.push({ time: (Math.floor(candle.time / 1000) + idx) as any, open: current, close: current + autoSize, high: current + autoSize, low: current });
          current += autoSize; dir = "up"; idx++;
        } else if (p <= current - autoSize * 2) {
          bricks.push({ time: (Math.floor(candle.time / 1000) + idx) as any, open: current, close: current - autoSize, high: current, low: current - autoSize });
          current -= autoSize; dir = "down"; idx++;
        } else break;
      } else {
        if (p <= current - autoSize) {
          bricks.push({ time: (Math.floor(candle.time / 1000) + idx) as any, open: current, close: current - autoSize, high: current, low: current - autoSize });
          current -= autoSize; dir = "down"; idx++;
        } else if (p >= current + autoSize * 2) {
          bricks.push({ time: (Math.floor(candle.time / 1000) + idx) as any, open: current, close: current + autoSize, high: current + autoSize, low: current });
          current += autoSize; dir = "up"; idx++;
        } else break;
      }
    }
  }
  return bricks.slice(-200);
}

/* ─── Component ─── */

export function PriceChart({ symbol, className }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1h");
  const [chartType, setChartType] = useState<ExtendedChartType>("candlestick");
  const { data: candles, isLoading } = usePriceHistory(symbol, timeframe, 500);
  const { isDark } = useTheme();

  // DOM refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Chart instance refs
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);

  // Data tracking refs
  const lastCandleRef = useRef<any>(null);
  const lastVolumeRef = useRef<any>(null);
  const chartTypeRef = useRef<ExtendedChartType>(chartType);
  const timeframeRef = useRef<ChartTimeframe>(timeframe);
  const symbolRef = useRef(symbol);
  const lastTickTimeRef = useRef(0);
  const needsInitialScrollRef = useRef(true);
  const isHoveredRef = useRef(false);

  const colors = useMemo(() => getChartColors(isDark), [isDark]);

  // Keep refs in sync
  useEffect(() => { chartTypeRef.current = chartType; }, [chartType]);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);

  /* ── Legend / Tooltip DOM updaters (no React re-renders) ── */

  const updateLegend = useCallback((data: any) => {
    if (!legendRef.current) return;
    const sym = symbolRef.current;
    if ("open" in data) {
      const up = data.close >= data.open;
      const c = up ? "#22c55e" : "#ef4444";
      legendRef.current.innerHTML =
        `<span style="color:#6b7280;font-weight:600">${sym}/USDT</span>` +
        `<span style="margin-left:10px">` +
        `<span style="color:#6b7280">O</span> <span style="color:${c}">${formatPrice(data.open)}</span> ` +
        `<span style="color:#6b7280">H</span> <span style="color:${c}">${formatPrice(data.high)}</span> ` +
        `<span style="color:#6b7280">L</span> <span style="color:${c}">${formatPrice(data.low)}</span> ` +
        `<span style="color:#6b7280">C</span> <span style="color:${c}">${formatPrice(data.close)}</span>` +
        `</span>` +
        (data.volume != null ? `<span style="color:#6b7280;margin-left:10px">V ${formatVolume(data.volume)}</span>` : "");
    } else if ("value" in data) {
      legendRef.current.innerHTML =
        `<span style="color:#6b7280;font-weight:600">${sym}/USDT</span>` +
        `<span style="color:#9ca3af;margin-left:10px">${formatPrice(data.value)}</span>`;
    }
  }, []);

  const updateTooltip = useCallback((x: number, y: number, time: number, mainData: any, volValue?: number) => {
    const tip = tooltipRef.current;
    const container = chartContainerRef.current;
    if (!tip || !container) return;

    const d = new Date(time * 1000);
    const timeStr = d.toLocaleDateString() + " " + d.toLocaleTimeString();

    let html = `<div style="color:#6b7280;margin-bottom:4px;font-size:11px">${timeStr}</div>`;
    if ("open" in mainData) {
      const up = mainData.close >= mainData.open;
      const c = up ? "#22c55e" : "#ef4444";
      html +=
        `<div>O: <span style="color:${c}">${formatPrice(mainData.open)}</span></div>` +
        `<div>H: <span style="color:${c}">${formatPrice(mainData.high)}</span></div>` +
        `<div>L: <span style="color:${c}">${formatPrice(mainData.low)}</span></div>` +
        `<div>C: <span style="color:${c}">${formatPrice(mainData.close)}</span></div>`;
    } else if ("value" in mainData) {
      html += `<div>Price: <span style="color:#9ca3af">${formatPrice(mainData.value)}</span></div>`;
    }
    if (volValue != null) {
      html += `<div style="color:#6b7280">Vol: ${formatVolume(volValue)}</div>`;
    }

    tip.innerHTML = html;
    tip.style.display = "block";

    // Position within bounds
    const W = 170;
    const H = tip.offsetHeight || 110;
    let left = x + 16;
    let top = y - 10;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (left + W > cw) left = x - W - 8;
    if (top + H > ch) top = ch - H - 4;
    if (top < 0) top = 4;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  }, []);

  /* ── Process raw candle data by chart type ── */

  const processedData = useMemo(() => {
    if (!candles?.length) return { mainData: [], volumeData: [] };

    let mainData: OHLCData[] | SingleValueData[];
    if (chartType === "heikin-ashi") mainData = calculateHeikinAshi(candles);
    else if (chartType === "renko") mainData = calculateRenko(candles);
    else if (chartType === "line") {
      mainData = candles.map((c: any) => ({ time: Math.floor(c.time / 1000) as UTCTimestamp, value: c.close }));
    } else {
      mainData = candles.map((c: any) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        open: c.open, high: c.high, low: c.low, close: c.close,
      }));
    }

    const volumeData: SingleValueData[] = chartType !== "renko"
      ? candles.map((c: any) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? colors.volumeUp : colors.volumeDown,
        }))
      : [];

    return { mainData, volumeData };
  }, [candles, chartType, colors]);

  /* ── Effect 1: Create chart, series, crosshair subscription ── */

  useEffect(() => {
    if (!chartContainerRef.current || isLoading) return;

    // Tear down previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLineRef.current = null;
    }

    const container = chartContainerRef.current;

    // Create chart with watermark & crosshair
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        attributionLogo: false,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      watermark: {
        visible: true,
        text: `${symbol}USDT`,
        fontSize: 48,
        color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
      },
      grid: {
        vertLines: { color: colors.grid, style: LineStyle.SparseDotted },
        horzLines: { color: colors.grid, style: LineStyle.SparseDotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.crosshair },
        horzLine: { color: colors.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.crosshair },
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.1, bottom: 0.2 },
        borderVisible: false,
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: timeframe === "1m",
        borderVisible: false,
        rightOffset: 5,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    // Volume histogram (background pane)
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeriesRef.current = volSeries;

    // Main price series
    if (chartType === "line") {
      seriesRef.current = chart.addSeries(AreaSeries, {
        topColor: colors.areaTop,
        bottomColor: colors.areaBottom,
        lineColor: colors.lineColor,
        lineWidth: 2,
        lineType: LineType.Curved,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: colors.background,
        crosshairMarkerBackgroundColor: colors.lineColor,
        crosshairMarkerBorderWidth: 2,
        lastPriceAnimation: LastPriceAnimationMode.Continuous,
        priceLineVisible: false,
      });
    } else if (chartType === "ohlc") {
      seriesRef.current = chart.addSeries(BarSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        thinBars: false,
        priceLineVisible: false,
      });
    } else {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        wickVisible: true,
        borderVisible: true,
        borderUpColor: colors.upColor,
        borderDownColor: colors.downColor,
        wickUpColor: colors.upColor,
        wickDownColor: colors.downColor,
        priceLineVisible: false,
      });
    }

    // Crosshair move → update legend + tooltip
    const mainSeries = seriesRef.current;
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.point.x < 0 || param.point.y < 0 || !param.time) {
        // Cursor left chart → revert legend to live data, hide tooltip
        isHoveredRef.current = false;
        hideTooltip();
        if (lastCandleRef.current) updateLegend(lastCandleRef.current);
        return;
      }
      isHoveredRef.current = true;
      const cd = param.seriesData.get(mainSeries) as any;
      const vd = param.seriesData.get(volSeries) as any;
      if (cd) {
        updateLegend({ ...cd, volume: vd?.value });
        updateTooltip(param.point.x, param.point.y, param.time as number, cd, vd?.value);
      }
    });

    // Prepare for data load
    needsInitialScrollRef.current = true;
    lastCandleRef.current = null;
    lastVolumeRef.current = null;

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        volumeSeriesRef.current = null;
        priceLineRef.current = null;
      }
    };
  }, [chartType, isLoading, colors, timeframe, symbol, isDark, updateLegend, updateTooltip, hideTooltip]);

  /* ── Effect 2: Load data into chart, create price line, scroll ── */

  useEffect(() => {
    if (!seriesRef.current || !processedData.mainData.length) return;

    // Set full historical data
    seriesRef.current.setData(processedData.mainData as any);
    if (volumeSeriesRef.current && processedData.volumeData.length > 0) {
      volumeSeriesRef.current.setData(processedData.volumeData as any);
    }

    // Sync tracking refs to the latest candle
    const lastMain = processedData.mainData[processedData.mainData.length - 1];
    lastCandleRef.current = lastMain;
    if (processedData.volumeData.length > 0) {
      lastVolumeRef.current = processedData.volumeData[processedData.volumeData.length - 1];
    }

    // Create / recreate the live price line on the main series
    if (priceLineRef.current) {
      try { seriesRef.current.removePriceLine(priceLineRef.current); } catch { /* already removed */ }
    }
    const livePrice = "close" in lastMain ? (lastMain as OHLCData).close : (lastMain as SingleValueData).value;
    priceLineRef.current = seriesRef.current.createPriceLine({
      price: livePrice,
      color: "#3b82f6",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "",
    });

    // Update legend with the latest candle
    if (!isHoveredRef.current) updateLegend(lastMain);

    // Scroll to recent candles on initial load only
    if (needsInitialScrollRef.current && chartRef.current) {
      needsInitialScrollRef.current = false;
      const total = processedData.mainData.length;
      const visible = Math.min(80, total);
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: total - visible - 0.5,
        to: total + 4.5,
      });
    }
  }, [processedData, updateLegend]);

  /* ── Binance real-time kline callback ── */

  const handleBinanceKline = useCallback((kline: BinanceKlineUpdate) => {
    if (!seriesRef.current || !lastCandleRef.current) return;
    const ct = chartTypeRef.current;
    if (ct === "renko") return;

    const candleTime = kline.time as UTCTimestamp;

    if (ct === "line") {
      const lastTime = lastCandleRef.current.time as number;
      const point = candleTime > lastTime
        ? { time: candleTime, value: kline.close }
        : { time: lastCandleRef.current.time, value: kline.close };
      seriesRef.current.update(point);
      lastCandleRef.current = point;
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
      // Candlestick / OHLC
      const lastTime = lastCandleRef.current.time as number;
      const prev = lastCandleRef.current;
      const candle = candleTime > lastTime
        // New candle period — start fresh from kline data
        ? { time: candleTime, open: kline.open, high: kline.high, low: kline.low, close: kline.close }
        // Same candle — only GROW high/low, never shrink mid-period.
        // Kline snapshots can lag behind the latest ticks by ~0.5-2s,
        // so replacing high/low would cause visible shrink→expand flicker.
        : { time: prev.time, open: prev.open, high: Math.max(prev.high, kline.high), low: Math.min(prev.low, kline.low), close: kline.close };
      seriesRef.current.update(candle);
      lastCandleRef.current = candle;
    }

    // Volume bar
    if (volumeSeriesRef.current && ct !== "renko") {
      const volColor = kline.close >= kline.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)";
      const lastVolTime = lastVolumeRef.current?.time as number | undefined;
      const volTime = (!lastVolTime || candleTime > lastVolTime) ? candleTime : lastVolumeRef.current.time;
      const vol = { time: volTime, value: kline.volume, color: volColor };
      volumeSeriesRef.current.update(vol as any);
      lastVolumeRef.current = vol;
    }

    // Update live price line
    if (priceLineRef.current) priceLineRef.current.applyOptions({ price: kline.close });

    // Update legend when not hovering
    if (!isHoveredRef.current) {
      const c = lastCandleRef.current;
      updateLegend("open" in c ? { ...c, volume: kline.volume } : c);
    }
  }, [updateLegend]);

  /* ── Sub-second trade tick callback ── */

  const handleTick = useCallback((tick: BinanceTick) => {
    if (!seriesRef.current || !lastCandleRef.current) return;
    const ct = chartTypeRef.current;
    if (ct === "renko" || ct === "heikin-ashi") return;

    // Boundary guard — don't let ticks from the next candle corrupt the current one
    const intervalSec = INTERVAL_SECONDS[timeframeRef.current] || 60;
    const candleEndTime = (lastCandleRef.current.time as number) + intervalSec;
    if (tick.time >= candleEndTime) return;

    // Throttle to ~20 fps
    const now = performance.now();
    if (now - lastTickTimeRef.current < 50) return;
    lastTickTimeRef.current = now;

    if (ct === "line") {
      const pt = { time: lastCandleRef.current.time, value: tick.price };
      seriesRef.current.update(pt);
      lastCandleRef.current = pt;
    } else {
      // Ensure high/low always encompass close — kline resets every ~2s
      const prev = lastCandleRef.current;
      const updated = {
        time: prev.time,
        open: prev.open,
        high: Math.max(prev.high, tick.price),
        low: Math.min(prev.low, tick.price),
        close: tick.price,
      };
      seriesRef.current.update(updated);
      lastCandleRef.current = updated;
    }

    // Update live price line
    if (priceLineRef.current) priceLineRef.current.applyOptions({ price: tick.price });

    // Update legend when not hovering
    if (!isHoveredRef.current) updateLegend(lastCandleRef.current);
  }, [updateLegend]);

  // Connect Binance WebSocket
  const { isConnected: binanceConnected } = useBinanceStream(symbol, timeframe, handleBinanceKline, handleTick);

  /* ── Render ── */

  if (isLoading) {
    return (
      <div className={`rounded-2xl border flex flex-col overflow-hidden ${isDark ? "bg-[#111] border-[#1e1e1e]" : "bg-white border-gray-200"} ${className || ""}`}>
        <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0" style={{ borderColor: isDark ? '#1e1e1e' : '#e5e7eb' }}>
          <div className="flex gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="w-7 h-6 rounded bg-[#1a1a1a] animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 size={24} className={`mx-auto mb-2 animate-pulse ${isDark ? "text-gray-600" : "text-gray-400"}`} />
            <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>Loading chart...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border flex flex-col overflow-hidden ${isDark ? "bg-[#111] border-[#1e1e1e]" : "bg-white border-gray-200"} ${className || ""}`}>

      {/* ── Toolbar ── */}
      <div className={`flex items-center justify-between px-3 py-2 border-b flex-shrink-0 ${isDark ? "border-[#1e1e1e]" : "border-gray-200"}`}>
        {/* Timeframes */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          <div className="flex items-center gap-1 mr-1.5 flex-shrink-0" title={binanceConnected ? "Live stream connected" : "Connecting..."}>
            {binanceConnected
              ? <Wifi size={12} className="text-emerald-400" />
              : <WifiOff size={12} className="text-gray-500 animate-pulse" />}
          </div>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                timeframe === tf.value
                  ? isDark ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]" : "bg-gray-100 text-gray-900 border border-gray-300"
                  : isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        {/* Chart type selector */}
        <div className="flex gap-0.5 flex-shrink-0">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.value}
              onClick={() => setChartType(ct.value)}
              className={`p-1.5 rounded transition-colors ${
                chartType === ct.value
                  ? isDark ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]" : "bg-gray-100 text-gray-900 border border-gray-300"
                  : isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"
              }`}
              title={ct.label}
            >
              <ct.icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart Area (relative container for legend + tooltip overlays) ── */}
      <div className="flex-1 min-h-0 relative">

        {/* Legend overlay — top-left, shows live OHLCV */}
        <div
          ref={legendRef}
          className="absolute top-2 left-3 z-10 text-[11px] leading-relaxed pointer-events-none select-none"
          style={{ fontFamily: "monospace" }}
        />

        {/* Chart mount point */}
        <div
          ref={chartContainerRef}
          className="absolute inset-0 touch-manipulation"
          style={{ WebkitOverflowScrolling: "touch", WebkitTransform: "translateZ(0)" }}
        >
          {(!candles || candles.length === 0) && !isLoading && (
            <div className="h-full flex items-center justify-center">
              <p className={`text-sm ${isDark ? "text-gray-600" : "text-gray-400"}`}>No data available</p>
            </div>
          )}
        </div>

        {/* Tooltip overlay — positioned dynamically by crosshair callback */}
        <div
          ref={tooltipRef}
          className="absolute z-20 pointer-events-none select-none rounded-lg px-3 py-2 text-xs leading-relaxed shadow-xl"
          style={{
            display: "none",
            background: isDark ? "rgba(17,17,17,0.94)" : "rgba(255,255,255,0.96)",
            border: `1px solid ${isDark ? "#1e1e1e" : "#d1d5db"}`,
            color: isDark ? "#9ca3af" : "#374151",
            minWidth: 150,
            backdropFilter: "blur(8px)",
          }}
        />
      </div>
    </div>
  );
}
