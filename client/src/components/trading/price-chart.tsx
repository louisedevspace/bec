import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePriceHistory } from "@/hooks/use-price-history";
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
  const { data: candles, isLoading } = usePriceHistory(symbol, timeframe, 100);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);

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
          color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        }))
      : [];
    
    return { mainData, volumeData };
  }, [candles, chartType]);

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
    
    // Create chart with dark theme
    const chart = createChart(container, {
      width: Math.max(200, width),
      height: Math.max(200, height),
      layout: {
        background: { type: ColorType.Solid, color: '#111111' },
        textColor: '#6b7280',
      },
      grid: {
        vertLines: { color: '#1e1e1e' },
        horzLines: { color: '#1e1e1e' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3b82f6', width: 1, style: 2 },
        horzLine: { color: '#3b82f6', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#1e1e1e',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#1e1e1e',
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
        color: '#3b82f6',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: '#111111',
        crosshairMarkerBackgroundColor: '#3b82f6',
      });
      lineSeries.setData(processedData.mainData as any);
      seriesRef.current = lineSeries;
    } else if (chartType === "ohlc") {
      // OHLC Bar chart
      const barSeries = chart.addSeries(BarSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        thinBars: false,
      });
      barSeries.setData(processedData.mainData as any);
      seriesRef.current = barSeries;
    } else {
      // Candlestick, Heikin-Ashi, Renko
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
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
  }, [processedData, chartType, isLoading]);

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
    <div className={`bg-[#111] rounded-2xl border border-[#1e1e1e] flex flex-col overflow-hidden ${className || ""}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e1e] flex-shrink-0">
        {/* Timeframes */}
        <div className="flex gap-0.5 overflow-x-auto">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
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
        <div className="flex gap-0.5 flex-shrink-0">
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
            <p className="text-gray-600 text-sm">No data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
