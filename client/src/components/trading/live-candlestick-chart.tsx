import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type UTCTimestamp,
} from "lightweight-charts";

const REST_PRIMARY =
  "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1s&limit=500";
const REST_FALLBACK =
  "https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1s&limit=500";
const WS_PRIMARY = "wss://stream.binance.com:9443/ws/btcusdt@kline_1s";
const WS_FALLBACK = "wss://stream.binance.com:443/ws/btcusdt@kline_1s";

// Canvas-rendered chart libraries can't read CSS custom properties directly,
// so we resolve the app's design tokens to literal hsl() strings once at
// mount. --success/--danger are theme-invariant in index.css, so this stays
// in sync with the buy/sell tokens without re-subscribing to theme changes.
function hslVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return `hsl(${fallback})`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const parts = raw.split(/\s+/);
  if (parts.length < 3) return `hsl(${raw})`;
  return `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

function CandlestickChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;
    const container = containerRef.current;

    const upColor = hslVar("--success", "142 71% 45%");
    const downColor = hslVar("--danger", "0 84% 60%");
    const bgColor = hslVar("--card", "0 0% 7%");
    const textColor = hslVar("--muted-foreground", "0 0% 55%");
    const gridColor = hslVar("--border", "0 0% 12%");

    // ── Chart — matches app design tokens (card bg, border, buy/sell) ──
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: gridColor,
      },
      rightPriceScale: { borderColor: gridColor },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });
    seriesRef.current = series;

    // ── Resize ──
    const resizeObserver = new ResizeObserver((entries) => {
      if (destroyed) return;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.resize(width, height);
      }
    });
    resizeObserver.observe(container);

    // ── WebSocket with auto-reconnect ──
    let useFallbackWs = false;

    function connectWs() {
      if (destroyed) return;

      const url = useFallbackWs ? WS_FALLBACK : WS_PRIMARY;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (destroyed) { ws.close(); return; }
        setConnected(true);
        useFallbackWs = false; // primary worked, reset
      };

      ws.onmessage = (event) => {
        if (destroyed) return;
        try {
          const { k } = JSON.parse(event.data);
          if (!k) return;
          if (seriesRef.current) {
            seriesRef.current.update({
              time: (k.t / 1000) as UTCTimestamp,
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
            });
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        if (destroyed) return;
        useFallbackWs = !useFallbackWs; // toggle to other endpoint
        ws.close();
      };

      ws.onclose = () => {
        if (destroyed) return;
        setConnected(false);
        setTimeout(connectWs, 2000);
      };
    }

    // ── Historical REST with fallback ──
    async function fetchHistory() {
      let klines: any[];
      try {
        const res = await fetch(REST_PRIMARY);
        if (!res.ok) throw new Error(res.statusText);
        klines = await res.json();
      } catch {
        const res = await fetch(REST_FALLBACK);
        klines = await res.json();
      }
      return klines;
    }

    fetchHistory()
      .then((klines) => {
        if (destroyed) return;
        const data = klines.map((k: any) => ({
          time: (k[0] / 1000) as UTCTimestamp,
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
        }));
        series.setData(data);
        connectWs();
      })
      .catch((err) => {
        console.error("Failed to fetch historical klines:", err);
        // Still connect WS even if history fails
        if (!destroyed) connectWs();
      });

    // ── Cleanup ──
    return () => {
      destroyed = true;
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

  return (
    <div className="relative w-full h-full rounded-xl border bg-card border-border overflow-hidden" style={{ minHeight: 0 }}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* Status badge */}
      <div className="absolute top-2 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded bg-background/70 text-xs text-muted-foreground pointer-events-none">
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-buy" : "bg-sell"}`}
        />
        {connected ? "Live" : "Connecting…"}
      </div>
    </div>
  );
}

export default CandlestickChart;
