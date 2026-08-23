import { useEffect, useRef } from "react";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { TrendingUp, TrendingDown } from "lucide-react";

// Measures its own height and writes it to --ticker-height, mirroring the
// exact mechanism client/src/components/pwa/*-banner.tsx already use for
// --pwa-banner-top, so client/src/components/layout/main-layout.tsx's sticky
// nav bars (which read var(--ticker-height, 0px) in their marginTop calc)
// offset below it correctly whether or not it's currently rendered.
export function PriceTickerStrip() {
  const { prices, isLoading, getFormattedPrice, getChangeColor } = useCryptoPrices();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const height = el.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--ticker-height", `${height}px`);
    return () => {
      document.documentElement.style.setProperty("--ticker-height", "0px");
    };
  }, [isLoading]);

  if (isLoading || prices.length === 0) return null;

  const items = [...prices, ...prices]; // duplicated for a seamless loop

  return (
    <div
      ref={ref}
      className="fixed top-0 left-0 right-0 z-40 bg-card border-b border-border overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      aria-label="Live cryptocurrency prices"
    >
      <div className="flex w-max animate-ticker-scroll">
        {items.map((p, i) => {
          const change = parseFloat(p.change24h || "0");
          const positive = change >= 0;
          const TrendIcon = positive ? TrendingUp : TrendingDown;
          return (
            <div
              key={`${p.symbol}-${i}`}
              className="flex items-center gap-1.5 px-4 py-2 border-r border-border/60 flex-shrink-0"
            >
              <CryptoIcon symbol={p.symbol} size="xs" />
              <span className="text-xs font-semibold text-foreground">{p.symbol}</span>
              <span className="text-xs text-muted-foreground tabular-nums">${getFormattedPrice(p.symbol)}</span>
              <span className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${getChangeColor(p.symbol)}`}>
                <TrendIcon className="h-3 w-3" />
                {positive ? "+" : ""}{change.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
