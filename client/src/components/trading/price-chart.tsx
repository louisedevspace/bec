import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePriceHistory } from "@/hooks/use-price-history";
import { useTheme } from "@/hooks/use-theme";
import { useWebSocket } from "@/hooks/use-websocket";
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
import { BarChart3, TrendingUp, Activity, Layers, Grid3X3 } from "lucide-react";

// Define data types for TradingView charts
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
      time: Math.floor(c.time / 1000) as any, // Convert ms to seconds
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });
    
    prevHA = { open: haOpen, close: haClose };
  }
  
  return result;
}

// Calculate Renko bricks from price data
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
  
  return bricks.slice(-100);
}

export function PriceChart({ symbol, className }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1h");
  const [chartType, setChartType] = useState<ExtendedChartType>("candlestick");
  const { data: candles, isLoading } = usePriceHistory(symbol, timeframe, 300);
  const { isDark } = useTheme();
  const { subscribe, isConnected } = useWebSocket("/ws");
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const lastCandleRef = useRef<any>(null);
  const currentChartTypeRef = useRef<ExtendedChartType>(chartType);
  const timeframeRef = useRef<ChartTimeframe>(timeframe);
  
  // Get current theme colors
  const colors = useMemo(() => getChartColors(isDark), [isDark]);

  // Keep refs in sync
  useEffect(() => { currentChartTypeRef.current = chartType; }, [chartType]);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);

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
      // Candlestick, OHLC, Bar
      mainData = candles.map((c: any) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
    }
    
    // Volume data (skip for Renko)
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
    
    // Create chart with theme-aware styling
    const chart = createChart(container, {
      width: Math.max(200, width),
      height: Math.max(200, height),
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        attributionLogo: false, // Remove TradingView branding
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
    
    // Add volume series first (background)
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
    
    // Add main series based on chart type
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
      // OHLC Bar chart
      const barSeries = chart.addSeries(BarSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        thinBars: false,
      });
      barSeries.setData(processedData.mainData as any);
      seriesRef.current = barSeries;
    } else {
      // Candlestick, Heikin-Ashi, Renko
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
    
    // Fit content
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
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 100);
      setTimeout(handleResize, 500);
    });
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [processedData, chartType, isLoading, colors]);

  // Real-time price updates via WebSocket
  useEffect(() => {
    if (!isConnected || !seriesRef.current || chartType === 'renko') return;

    // Timeframe durations in seconds for candle boundary detection
    const TIMEFRAME_SECONDS: Record<string, number> = {
      '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800,
    };

    const unsubscribe = subscribe('price_update', (priceData: any) => {
      if (!priceData || !seriesRef.current || !lastCandleRef.current) return;

      // Extract symbol from the current trading pair (e.g., "BTC" from "BTCUSDT")
      const symbolBase = symbol.replace('USDT', '').toUpperCase();

      // Find matching price from the update
      const matchingPrice = priceData.find?.((p: any) =>
        p.symbol?.toUpperCase() === symbolBase ||
        p.symbol?.toUpperCase() === symbol.toUpperCase()
      );

      if (!matchingPrice?.price) return;

      const newPrice = parseFloat(matchingPrice.price);
      const lastCandle = lastCandleRef.current;
      const tf = timeframeRef.current;
      const tfSeconds = TIMEFRAME_SECONDS[tf] || 3600;

      // Check if we need to create a new candle (timeframe boundary crossed)
      const nowSeconds = Math.floor(Date.now() / 1000);
      const currentCandleEnd = (lastCandle.time as number) + tfSeconds;

      if (currentChartTypeRef.current === 'line') {
        if (nowSeconds >= currentCandleEnd) {
          // Create new data point for line chart
          const newTime = (Math.floor(nowSeconds / tfSeconds) * tfSeconds) as UTCTimestamp;
          const newPoint = { time: newTime, value: newPrice };
          seriesRef.current.update(newPoint);
          lastCandleRef.current = newPoint;
        } else {
          seriesRef.current.update({
            time: lastCandle.time,
            value: newPrice,
          });
          lastCandleRef.current = { ...lastCandle, value: newPrice };
        }
      } else {
        if (nowSeconds >= currentCandleEnd) {
          // Create a new candle at the next boundary
          const newTime = (Math.floor(nowSeconds / tfSeconds) * tfSeconds) as UTCTimestamp;
          const newCandle = {
            time: newTime,
            open: newPrice,
            high: newPrice,
            low: newPrice,
            close: newPrice,
          };
          seriesRef.current.update(newCandle);
          lastCandleRef.current = newCandle;
        } else {
          // Update existing candle
          const updatedCandle = {
            time: lastCandle.time,
            open: lastCandle.open,
            high: Math.max(lastCandle.high, newPrice),
            low: Math.min(lastCandle.low, newPrice),
            close: newPrice,
          };
          seriesRef.current.update(updatedCandle);
          lastCandleRef.current = updatedCandle;
        }
      }
    });

    return unsubscribe;
  }, [isConnected, subscribe, symbol, chartType]);

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
        <div className="flex gap-0.5 overflow-x-auto">
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
