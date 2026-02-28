import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { cryptoApi } from "@/services/crypto-api";
import { useWebSocket } from "./use-websocket";
import type { CryptoPrice } from "@/types/crypto";

const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,binancecoin,tron,dogecoin,bitcoin-cash,dash,polkadot,litecoin,ripple,cardano,solana,avalanche-2,matic-network,shiba-inu,chainlink,monero,stellar,cosmos,filecoin,aptos,sui,arbitrum,optimism,pepe,injective-protocol&vs_currencies=usd";
const SYMBOL_MAP = {
  BTC: { binance: "BTCUSDT", coingecko: "bitcoin" },
  ETH: { binance: "ETHUSDT", coingecko: "ethereum" },
  USDT: { binance: "USDTUSDT", coingecko: "tether" }, // USDT/USDT is always 1
  BNB: { binance: "BNBUSDT", coingecko: "binancecoin" },
  TRX: { binance: "TRXUSDT", coingecko: "tron" },
  DOGE: { binance: "DOGEUSDT", coingecko: "dogecoin" },
  BCH: { binance: "BCHUSDT", coingecko: "bitcoin-cash" },
  DASH: { binance: "DASHUSDT", coingecko: "dash" },
  DOT: { binance: "DOTUSDT", coingecko: "polkadot" },
  LTC: { binance: "LTCUSDT", coingecko: "litecoin" },
  XRP: { binance: "XRPUSDT", coingecko: "ripple" },
  ADA: { binance: "ADAUSDT", coingecko: "cardano" },
  SOL: { binance: "SOLUSDT", coingecko: "solana" },
  AVAX: { binance: "AVAXUSDT", coingecko: "avalanche-2" },
  MATIC: { binance: "MATICUSDT", coingecko: "matic-network" },
  SHIB: { binance: "SHIBUSDT", coingecko: "shiba-inu" },
  LINK: { binance: "LINKUSDT", coingecko: "chainlink" },
  XMR: { binance: "XMRUSDT", coingecko: "monero" },
  XLM: { binance: "XLMUSDT", coingecko: "stellar" },
  ATOM: { binance: "ATOMUSDT", coingecko: "cosmos" },
  FIL: { binance: "FILUSDT", coingecko: "filecoin" },
  APT: { binance: "APTUSDT", coingecko: "aptos" },
  SUI: { binance: "SUIUSDT", coingecko: "sui" },
  ARB: { binance: "ARBUSDT", coingecko: "arbitrum" },
  OP: { binance: "OPUSDT", coingecko: "optimism" },
  PEPE: { binance: "PEPEUSDT", coingecko: "pepe" },
  INJ: { binance: "INJUSDT", coingecko: "injective-protocol" }
};
const SYMBOLS = Object.keys(SYMBOL_MAP);

export function useCryptoPrices() {
  const [prices, setPrices] = useState<CryptoPrice[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { subscribe, isConnected: wsConnected } = useWebSocket("/ws");
  const livePricesRef = useRef<Record<string, CryptoPrice>>({});

  // Initial price fetch
  const { data: initialPrices, isLoading, error } = useQuery({
    queryKey: ["/api/crypto/prices"],
    queryFn: cryptoApi.getPrices,
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
  });

  // Fetch live prices from server API (which uses Binance first, then CoinGecko fallback)
  useEffect(() => {
    async function fetchLivePrices() {
      try {
        const response = await fetch('/api/crypto/prices');
        if (response.ok) {
          const livePrices = await response.json();
          if (Array.isArray(livePrices)) {
            const liveMap: Record<string, CryptoPrice> = {};
            livePrices.forEach((price: any) => {
              liveMap[price.symbol] = {
                id: 0,
                symbol: price.symbol,
                price: price.price,
                change24h: price.change24h || "0",
                volume24h: price.volume24h || "0",
                updatedAt: new Date().toISOString(),
              };
            });
            livePricesRef.current = liveMap;
            setPrices((prev) => mergeLivePrices(prev, liveMap));
          }
        }
      } catch (error) {
        console.warn('Failed to fetch live prices:', error);
      }
    }
    
    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Helper to merge live prices into any price array
  function mergeLivePrices(pricesArr: CryptoPrice[], live: Record<string, CryptoPrice>): CryptoPrice[] {
    let merged = pricesArr.map((p) =>
      live[p.symbol] ? { ...p, price: live[p.symbol].price, updatedAt: live[p.symbol].updatedAt } : p
    );
    // Add any live prices not present
    Object.keys(live).forEach((symbol) => {
      if (!merged.find((p) => p.symbol === symbol)) {
        merged.push(live[symbol]);
      }
    });
    return merged;
  }

  // Set initial prices
  useEffect(() => {
    if (initialPrices) {
      setPrices((prev) => mergeLivePrices(initialPrices, livePricesRef.current));
    }
  }, [initialPrices]);

  // Subscribe to real-time price updates
  useEffect(() => {
    const unsubscribe = subscribe("price_update", (updatedPrices: CryptoPrice[]) => {
      setPrices((prev) => mergeLivePrices(updatedPrices, livePricesRef.current));
      setIsConnected(true);
    });
    return unsubscribe;
  }, [subscribe]);

  // Update connection status
  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

  const getPriceBySymbol = (symbol: string): CryptoPrice | undefined => {
    return prices.find(price => price.symbol === symbol);
  };

  const getFormattedPrice = (symbol: string): string => {
    const price = getPriceBySymbol(symbol);
    if (!price) return "0.00";
    
    const numPrice = parseFloat(price.price);
    if (numPrice >= 1000) {
      return numPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (numPrice >= 1) {
      return numPrice.toFixed(4);
    } else {
      return numPrice.toFixed(6);
    }
  };

  const getChangeColor = (symbol: string): string => {
    const price = getPriceBySymbol(symbol);
    if (!price) return "text-muted-foreground";
    
    const change = parseFloat(price.change24h);
    if (change > 0) return "text-green-500";
    if (change < 0) return "text-red-500";
    return "text-muted-foreground";
  };

  return {
    prices,
    isLoading,
    error,
    isConnected,
    getPriceBySymbol,
    getFormattedPrice,
    getChangeColor,
  };
}
