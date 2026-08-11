import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePriceHistory } from "@/hooks/use-price-history";
import { useBinanceStream, type BinanceKlineUpdate, type BinanceTick } from "@/hooks/use-binance-stream";
import { useTheme } from "@/hooks/use-theme";
import { useAccentTheme } from "@/hooks/use-exchange-name";
import type { ChartTimeframe } from "@/types/chart";
import {
  createChart, createTextWatermark, IChartApi, ISeriesApi,
  CandlestickSeries, AreaSeries, BarSeries, HistogramSeries,
  ColorType, CrosshairMode, LineType, LastPriceAnimationMode,
  LineStyle, UTCTimestamp, type IPriceLine, type Time,
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

// Canvas-rendered chart libraries can't read CSS custom properties directly
// (var() only resolves in the DOM/CSSOM, not in a 2D context's fillStyle), so
// we resolve the app's design tokens to literal hsl() strings once per theme
// change. This keeps the chart's palette locked to index.css instead of
// drifting to arbitrary hardcoded hex.
function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}
function hslVar(name: string, fallback: string): string {
  const raw = readCssVar(name, fallback);
  const parts = raw.split(/\s+/);
  if (parts.length < 3) return `hsl(${raw})`;
  return `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

export function PriceChart({ symbol, className }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1s");
  const [chartType, setChartType] = useState<ExtendedChartType>("candlestick");
  const { data: candles, isLoading } = usePriceHistory(symbol, timeframe, 500);
  const { isDark } = useTheme();
  const accentTheme = useAccentTheme();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const watermarkRef = useRef<ReturnType<typeof createTextWatermark<Time>> | null>(null);
  const lastLegendHtmlRef = useRef<string>("");
  const lastCandleRef = useRef<any>(null);
  const lastVolumeRef = useRef<any>(null);
  const chartTypeRef = useRef(chartType);
  const timeframeRef = useRef(timeframe);
  const symbolRef = useRef(symbol);
  const lastTickTimeRef = useRef(0);
  const needsScrollRef = useRef(true);
  const isHoveredRef = useRef(false);

  // Resolved once per theme toggle — mirrors index.css tokens exactly
  // (--success / --danger are theme-invariant; --card, --border, --primary
  // switch between light/dark and follow the active accent color).
  const colors = useMemo(() => {
    const up = hslVar("--success", "142 71% 45%");
    const down = hslVar("--danger", "0 84% 60%");
    const primary = hslVar("--primary", "42 78% 52%");
    return {
      bg: hslVar("--card", isDark ? "0 0% 7%" : "0 0% 100%"),
      text: hslVar("--muted-foreground", isDark ? "0 0% 55%" : "215 16% 47%"),
      grid: hslVar("--border", isDark ? "0 0% 12%" : "214 32% 91%"),
      border: hslVar("--border", isDark ? "0 0% 12%" : "214 32% 91%"),
      crosshair: primary,
      up, down,
      volUp: up.replace("hsl(", "hsla(").replace(")", ", 0.4)"),
      volDown: down.replace("hsl(", "hsla(").replace(")", ", 0.4)"),
      areaTop: up.replace("hsl(", "hsla(").replace(")", ", 0.28)"),
      areaBottom: up.replace("hsl(", "hsla(").replace(")", ", 0.02)"),
      line: up,
    };
  }, [isDark, accentTheme]);

  useEffect(() => { chartTypeRef.current = chartType; }, [chartType]);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);

  const updateLegend = useCallback((data: any) => {
    if (!legendRef.current) return;
    const sym = symbolRef.current;
    let html: string;
    if ("open" in data) {
      const up = data.close >= data.open;
      const c = up ? colors.up : colors.down;
      html =
        `<span style="color:${colors.text};font-weight:600">${sym}/USDT</span>` +
        `<span style="margin-left:8px">` +
        `O <span style="color:${c}">${formatPrice(data.open)}</span> ` +
        `H <span style="color:${c}">${formatPrice(data.high)}</span> ` +
        `L <span style="color:${c}">${formatPrice(data.low)}</span> ` +
        `C <span style="color:${c}">${formatPrice(data.close)}</span>` +
        `</span>` +
        (data.volume != null ? `<span style="color:${colors.text};margin-left:8px">V ${formatVolume(data.volume)}</span>` : "");
    } else if ("value" in data) {
      html =
        `<span style="color:${colors.text};font-weight:600">${sym}/USDT</span>` +
        `<span style="color:${colors.text};margin-left:8px">${formatPrice(data.value)}</span>`;
    } else {
      return;
    }
    // Ticks arrive at up to ~20/sec; skip the DOM write when nothing changed.
    if (html === lastLegendHtmlRef.current) return;
    lastLegendHtmlRef.current = html;
    legendRef.current.innerHTML = html;
  }, [colors]);

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

  // Create chart — mount + dark/light + accent-color changes only. Symbol,
  // timeframe, and chart-type switches are handled by the lighter effects
  // below, which update the existing instance instead of tearing it down.
  useEffect(() => {
    if (!chartContainerRef.current || isLoading) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; volumeSeriesRef.current = null; priceLineRef.current = null; watermarkRef.current = null; }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: colors.bg }, textColor: colors.text, attributionLogo: false, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
      grid: { vertLines: { color: colors.grid, style: LineStyle.SparseDotted }, horzLines: { color: colors.grid, style: LineStyle.SparseDotted } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: colors.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.crosshair }, horzLine: { color: colors.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.crosshair } },
      rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.1, bottom: 0.2 }, borderVisible: false },
      timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: timeframeRef.current === "1s" || timeframeRef.current === "1m", borderVisible: false, rightOffset: 5 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const volSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeriesRef.current = volSeries;

    // lightweight-charts v5 moved the watermark out of chart options and
    // into a pane primitive plugin (createChart's `watermark` option no
    // longer exists as of v5 — see TextWatermarkOptions in the typings).
    watermarkRef.current = createTextWatermark(chart.panes()[0], {
      horzAlign: "center", vertAlign: "center",
      lines: [{
        text: `${symbolRef.current}USDT`,
        color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        fontSize: 48,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }],
    });

    // Reads series refs at call time (not via closure) so it keeps working
    // after the series-type effect below swaps seriesRef.current out.
    chart.subscribeCrosshairMove((param) => {
      const mainSeries = seriesRef.current;
      if (!param.point || param.point.x < 0 || param.point.y < 0 || !param.time) {
        isHoveredRef.current = false;
        if (lastCandleRef.current) updateLegend(lastCandleRef.current);
        return;
      }
      isHoveredRef.current = true;
      if (!mainSeries) return;
      const cd = param.seriesData.get(mainSeries) as any;
      const currentVolSeries = volumeSeriesRef.current;
      const vd = currentVolSeries ? (param.seriesData.get(currentVolSeries) as any) : undefined;
      if (cd) updateLegend({ ...cd, volume: vd?.value });
    });

    needsScrollRef.current = true;
    lastCandleRef.current = null;
    lastVolumeRef.current = null;

    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; volumeSeriesRef.current = null; priceLineRef.current = null; watermarkRef.current = null; } };
  }, [isLoading, colors, isDark, updateLegend]);

  // Switch main series type — removes/re-adds only the main series (not the
  // whole chart) when the user picks a different chart type, or when the
  // color palette changes and existing series need restyling.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (seriesRef.current) {
      try { chart.removeSeries(seriesRef.current); } catch {}
      seriesRef.current = null;
    }
    priceLineRef.current = null; // belonged to the removed series

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
  }, [chartType, colors]);

  // Timeframe only changes a chart option, not the series/data — no rebuild needed.
  useEffect(() => {
    chartRef.current?.applyOptions({ timeScale: { secondsVisible: timeframe === "1s" || timeframe === "1m" } });
  }, [timeframe]);

  // Pair/timeframe switch — reset per-symbol tracking so the next data load
  // re-fits the visible range and live-update handlers don't blend the
  // previous symbol's last candle into the new one.
  useEffect(() => {
    needsScrollRef.current = true;
    lastCandleRef.current = null;
    lastVolumeRef.current = null;
  }, [symbol, timeframe]);

  // Watermark text/color follows the current pair and theme without a chart rebuild.
  useEffect(() => {
    watermarkRef.current?.applyOptions({
      lines: [{
        text: `${symbol}USDT`,
        color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        fontSize: 48,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }],
    });
  }, [symbol, isDark]);

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
    priceLineRef.current = seriesRef.current.createPriceLine({ price: livePrice, color: colors.crosshair, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });

    if (!isHoveredRef.current) updateLegend(lastMain);
    if (needsScrollRef.current && chartRef.current) {
      needsScrollRef.current = false;
      const total = processedData.mainData.length;
      const visible = Math.min(80, total);
      chartRef.current.timeScale().setVisibleLogicalRange({ from: total - visible - 0.5, to: total + 4.5 });
    }
  }, [processedData, updateLegend, colors]);

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
      const volColor = kline.close >= kline.open ? colors.volUp : colors.volDown;
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
  }, [updateLegend, colors]);

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

  const { isConnected, isFallback } = useBinanceStream(symbol, timeframe, handleKline, handleTick);

  if (isLoading) {
    return (
      <div className={`rounded-xl border flex flex-col overflow-hidden bg-card border-border ${className || ""}`} style={{ minHeight: 0 }}>
        <div className="flex items-center px-3 py-2 border-b border-border flex-shrink-0">
          <div className="flex gap-1">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-7 h-6 rounded bg-muted animate-pulse" />)}</div>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 size={24} className="mx-auto mb-2 animate-pulse text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading chart...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border flex flex-col overflow-hidden bg-card border-border ${className || ""}`} style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          <div
            className="flex items-center gap-1 mr-1.5 flex-shrink-0"
            title={isFallback ? "Live (relayed via server — direct feed unavailable)" : isConnected ? "Live" : "Connecting..."}
          >
            {isConnected
              ? <Wifi size={12} className={isFallback ? "text-amber-500" : "text-buy"} />
              : <WifiOff size={12} className="text-muted-foreground animate-pulse" />}
          </div>
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} onClick={() => setTimeframe(tf.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${timeframe === tf.value ? "bg-muted text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}>
              {tf.label}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          {CHART_TYPES.map((ct) => (
            <button key={ct.value} onClick={() => setChartType(ct.value)}
              className={`p-1.5 rounded transition-colors ${chartType === ct.value ? "bg-muted text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}
              title={ct.label}>
              <ct.icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 min-h-0 relative">
        <div ref={legendRef} className="absolute top-2 left-3 z-10 text-[11px] leading-relaxed pointer-events-none select-none tabular-nums" style={{ fontFamily: "monospace" }} />
        <div ref={chartContainerRef} className="absolute inset-0" style={{ WebkitOverflowScrolling: "touch" }}>
          {(!candles || candles.length === 0) && !isLoading && (
            <div className="h-full flex items-center justify-center"><p className="text-sm text-muted-foreground">No data available</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
