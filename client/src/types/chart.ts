export interface CandlestickData {
  time: number;   // Unix timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartTimeframe = "1s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";
export type ChartType = "candlestick" | "line" | "area";
