import { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type UTCTimestamp,
} from "lightweight-charts";

function LiveCandlestickChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#0f0f0f" },
        textColor: "#d1d4dc",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#1e1e2d" },
        horzLines: { color: "#1e1e2d" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: "#1e1e2d",
      },
      rightPriceScale: { borderColor: "#1e1e2d" },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.resize(width, height);
      }
    });
    resizeObserver.observe(container);

    fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1s&limit=500")
      .then((res) => res.json())
      .then((klines: any[]) => {
        const data = klines.map((k) => ({
          time: (k[0] / 1000) as UTCTimestamp,
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
        }));
        series.setData(data);

        const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_1s");
        wsRef.current = ws;

        ws.onmessage = (event) => {
          const { k } = JSON.parse(event.data);
          if (!k) return;
          series.update({
            time: (k.t / 1000) as UTCTimestamp,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
          });
        };
      })
      .catch((err) => console.error("Failed to fetch historical klines:", err));

    return () => {
      resizeObserver.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

export default LiveCandlestickChart;
