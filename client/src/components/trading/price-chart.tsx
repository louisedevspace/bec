import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePriceHistory } from "@/hooks/use-price-history";
import { useBinanceStream, type BinanceKlineUpdate } from "@/hooks/use-binance-stream";
import { useTheme } from "@/hooks/use-theme";
import type { ChartTimeframe } from "@/types/chart";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  LineSeries,
  BarSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  UTCTimestamp,
} from "lightweight-charts";
import { BarChart3, TrendingUp, Activity, Layers, Grid3X3, Wifi, WifiOff } from "lucide-react";

// Data types for TradingView charts
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

// Theme-based chart colors
const getChartColors = (isDark: boolean) => ({
  background: isDark ? '#111111' : '#ffffff',
  text: isDark ? '#6b7280' : '#374151',
  grid: isDark ? '#1e1e1e' : '#e5e7eb',
  border: isDark ? '#1e1e1e' : '#d1d5db',
  crosshair: '#3b82f6',
  upColor: '#22c55e',
  downColor: '#ef4444',
  volumeUp: isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.4)',
  volumeDown: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.4)',
});

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

type ExtendedChartType = "candlestick" | "line" | "ohlc" | "heikin-ashi" | "renko";

const CHART_TYPES: { label: string; value: ExtendedChartType; icon: typeof BarChart3 }[] = [
  { label: "Candles", value: "candlestick", icon: BarChart3 },
  { label: "Line", value: "line", icon: TrendingUp },
  { label: "OHLC", value: "ohlc", icon: Activity },
  { label: "Heikin-Ashi", value: "heikin-ashi", icon: Layers },
  { label: "Renko", value: "renko", icon: Grid3X3 },
];

// Calculate Heikin-Ashi values from regular OHLC data
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

    result.push({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });

    prevHA = { open: haOpen, close: haClose };
  }

  return result;
}

// Calculate Renko bricks
function calculateRenko(candles: any[], brickSize?: number): OHLCData[] {
  if (!candles.length) return [];

  const prices = candles.map(c => c.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const autoSize = brickSize || Math.max(1, (maxPrice - minPrice) * 0.02);

  const bricks: OHLCData[] = [];
  let currentPrice = candles[0].close;
  let direction: 'up' | 'down' | null = null;
  let brickIndex = 0;

  for (const candle of candles) {
    const price = candle.close;

    while (true) {
      if (direction === null || direction === 'up') {
        if (price >= currentPrice + autoSize) {
          bricks.push({
            time: (Math.floor(candle.time / 1000) + brickIndex) as any,
            open: currentPrice,
            close: currentPrice + autoSize,
            high: currentPrice + autoSize,
            low: currentPrice,
          });
          currentPrice += autoSize;
          direction = 'up';
          brickIndex++;
        } else if (price <= currentPrice - autoSize * 2) {
          bricks.push({
            time: (Math.floor(candle.time / 1000) + brickIndex) as any,
            open: currentPrice,
            close: currentPrice - autoSize,
            high: currentPrice,
            low: currentPrice - autoSize,
          });
          currentPrice -= autoSize;
          direction = 'down';
          brickIndex++;
        } else {
          break;
        }
      } else {
        if (price <= currentPrice - autoSize) {
          bricks.push({
            time: (Math.floor(candle.time / 1000) + brickIndex) as any,
            open: currentPrice,
            close: currentPrice - autoSize,
            high: currentPrice,
            low: currentPrice - autoSize,
          });
          currentPrice -= autoSize;
          direction = 'down';
          brickIndex++;
        } else if (price >= currentPrice + autoSize * 2) {
          bricks.push({
            time: (Math.floor(candle.time / 1000) + brickIndex) as any,
            open: currentPrice,
            close: currentPrice + autoSize,
            high: currentPrice + autoSize,
            low: currentPrice,
          });
          currentPrice += autoSize;
          direction = 'up';
          brickIndex++;
        } else {
          break;
        }
      }
    }
  }

  return bricks.slice(-200);
}

export function PriceChart({ symbol, className }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1h");
  const [chartType, setChartType] = useState<ExtendedChartType>("candlestick");
  const { data: candles, isLoading } = usePriceHistory(symbol, timeframe, 500);
  const { isDark } = useTheme();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const lastCandleRef = useRef<any>(null);
  const lastVolumeRef = useRef<any>(null);
  const chartTypeRef = useRef<ExtendedChartType>(chartType);

  const colors = useMemo(() => getChartColors(isDark), [isDark]);

  // Keep chart type ref in sync
  useEffect(() => { chartTypeRef.current = chartType; }, [chartType]);

  // Process chart data based on chart type
  const processedData = useMemo(() => {
    if (!candles?.length) return { mainData: [], volumeData: [] };

    let mainData: OHLCData[] | SingleValueData[];

    if (chartType === "heikin-ashi") {
      mainData = calculateHeikinAshi(candles);
    } else if (chartType === "renko") {
      mainData = calculateRenko(candles);
    } else if (chartType === "line") {
      mainData = candles.map((c: any) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        value: c.close,
      }));
    } else {
      mainData = candles.map((c: any) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
    }

    const volumeData: SingleValueData[] = chartType !== "renko"
      ? candles.map((c: any) => ({
          time: Math.floor(c.time / 1000) as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? colors.volumeUp : colors.volumeDown,
        }))
      : [];

    // Store last candle for real-time updates
    if (mainData.length > 0) {
      lastCandleRef.current = mainData[mainData.length - 1];
    }
    if (volumeData.length > 0) {
      lastVolumeRef.current = volumeData[volumeData.length - 1];
    }

    return { mainData, volumeData };
  }, [candles, chartType, colors]);

  // Initialize and update chart
  useEffect(() => {
    if (!chartContainerRef.current || isLoading) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    const container = chartContainerRef.current;
    const { width, height } = container.getBoundingClientRect();

    const chart = createChart(container, {
      width: Math.max(200, width),
      height: Math.max(200, height),
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair, width: 1, style: 2 },
        horzLine: { color: colors.crosshair, width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });

    chartRef.current = chart;

    // Add volume series (background layer)
    if (processedData.volumeData.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      volumeSeries.setData(processedData.volumeData as any);
      volumeSeriesRef.current = volumeSeries;
    }

    // Add main series
    if (chartType === "line") {
      const lineSeries = chart.addSeries(LineSeries, {
        color: colors.crosshair,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: colors.background,
        crosshairMarkerBackgroundColor: colors.crosshair,
      });
      lineSeries.setData(processedData.mainData as any);
      seriesRef.current = lineSeries;
    } else if (chartType === "ohlc") {
      const barSeries = chart.addSeries(BarSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        thinBars: false,
      });
      barSeries.setData(processedData.mainData as any);
      seriesRef.current = barSeries;
    } else {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        borderUpColor: colors.upColor,
        borderDownColor: colors.downColor,
        wickUpColor: colors.upColor,
        wickDownColor: colors.downColor,
      });
      candleSeries.setData(processedData.mainData as any);
      seriesRef.current = candleSeries;
    }

    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const { width, height } = chartContainerRef.current.getBoundingClientRect();
        chartRef.current.applyOptions({
          width: Math.max(200, width),
          height: Math.max(200, height),
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [processedData, chartType, isLoading, colors]);

  // Binance real-time kline callback
  const handleBinanceKline = useCallback((kline: BinanceKlineUpdate) => {
    if (!seriesRef.current || !lastCandleRef.current) return;

    const ct = chartTypeRef.current;

    // Skip real-time for renko (needs full recalculation)
    if (ct === 'renko') return;

    const candleTime = kline.time as UTCTimestamp;

    if (ct === 'line') {
      const lastTime = lastCandleRef.current.time as number;
      if (candleTime > lastTime) {
        // New candle period
        const newPoint = { time: candleTime, value: kline.close };
        seriesRef.current.update(newPoint);
        lastCandleRef.current = newPoint;
      } else {
        // Update current point
        seriesRef.current.update({ time: lastCandleRef.current.time, value: kline.close });
        lastCandleRef.current = { ...lastCandleRef.current, value: kline.close };
      }
    } else if (ct === 'heikin-ashi') {
      // Heikin-Ashi: approximate real-time update
      const prev = lastCandleRef.current;
      const haClose = (kline.open + kline.high + kline.low + kline.close) / 4;
      const haOpen = (prev.open + prev.close) / 2;
      const lastTime = prev.time as number;

      if (candleTime > lastTime) {
        const newCandle = {
          time: candleTime,
          open: haOpen,
          high: Math.max(kline.high, haOpen, haClose),
          low: Math.min(kline.low, haOpen, haClose),
          close: haClose,
        };
        seriesRef.current.update(newCandle);
        lastCandleRef.current = newCandle;
      } else {
        const updated = {
          time: prev.time,
          open: prev.open,
          high: Math.max(prev.high, kline.high, haClose),
          low: Math.min(prev.low, kline.low, haClose),
          close: haClose,
        };
        seriesRef.current.update(updated);
        lastCandleRef.current = updated;
      }
    } else {
      // Candlestick / OHLC
      const lastTime = lastCandleRef.current.time as number;

      if (candleTime > lastTime) {
        // New candle
        const newCandle = {
          time: candleTime,
          open: kline.open,
          high: kline.high,
          low: kline.low,
          close: kline.close,
        };
        seriesRef.current.update(newCandle);
        lastCandleRef.current = newCandle;
      } else {
        // Update current candle with Binance's aggregated OHLC
        const updated = {
          time: lastCandleRef.current.time,
          open: kline.open,
          high: kline.high,
          low: kline.low,
          close: kline.close,
        };
        seriesRef.current.update(updated);
        lastCandleRef.current = updated;
      }
    }

    // Update volume bar
    if (volumeSeriesRef.current && ct !== 'renko') {
      const volColor = kline.close >= kline.open
        ? (isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.4)')
        : (isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.4)');

      const lastVolTime = lastVolumeRef.current?.time as number;
      const volTime = candleTime > lastVolTime ? candleTime : lastVolumeRef.current.time;

      const volUpdate = { time: volTime, value: kline.volume, color: volColor };
      volumeSeriesRef.current.update(volUpdate as any);
      lastVolumeRef.current = volUpdate;
    }
  }, [isDark]);

  // Connect to Binance WebSocket stream
  const { isConnected: binanceConnected } = useBinanceStream(symbol, timeframe, handleBinanceKline);

  if (isLoading) {
    return (
      <div className={`rounded-2xl border p-4 flex items-center justify-center ${isDark ? 'bg-[#111] border-[#1e1e1e]' : 'bg-white border-gray-200'} ${className || ""}`}>
        <div className="text-center">
          <BarChart3 size={24} className={`mx-auto mb-2 animate-pulse ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Loading chart...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border flex flex-col overflow-hidden ${isDark ? 'bg-[#111] border-[#1e1e1e]' : 'bg-white border-gray-200'} ${className || ""}`}>
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-3 py-2 border-b flex-shrink-0 ${isDark ? 'border-[#1e1e1e]' : 'border-gray-200'}`}>
        {/* Timeframes */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {/* Live indicator */}
          <div className="flex items-center gap-1 mr-1.5 flex-shrink-0" title={binanceConnected ? 'Live stream connected' : 'Connecting...'}>
            {binanceConnected ? (
              <Wifi size={12} className="text-emerald-400" />
            ) : (
              <WifiOff size={12} className="text-gray-500 animate-pulse" />
            )}
          </div>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                timeframe === tf.value
                  ? isDark
                    ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]"
                    : "bg-gray-100 text-gray-900 border border-gray-300"
                  : isDark
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        {/* Chart Type */}
        <div className="flex gap-0.5 flex-shrink-0">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.value}
              onClick={() => setChartType(ct.value)}
              className={`p-1.5 rounded transition-colors ${
                chartType === ct.value
                  ? isDark
                    ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]"
                    : "bg-gray-100 text-gray-900 border border-gray-300"
                  : isDark
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-500 hover:text-gray-700"
              }`}
              title={ct.label}
            >
              <ct.icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div
        ref={chartContainerRef}
        className="flex-1 min-h-[240px] touch-manipulation"
        style={{
          WebkitOverflowScrolling: 'touch',
          WebkitTransform: 'translateZ(0)',
        }}
      >
        {(!candles || candles.length === 0) && !isLoading && (
          <div className="h-full flex items-center justify-center" style={{ minHeight: '240px' }}>
            <p className={`text-sm ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
