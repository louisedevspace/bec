import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownUp, RefreshCw, Loader2, CheckCircle, AlertTriangle, ArrowRight, Snowflake, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { formatCryptoNumber, getCurrencySymbol } from "@/utils/format-utils";

import { CryptoIcon } from "@/components/crypto/crypto-icon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cryptoApi } from "@/services/crypto-api";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
}

const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=";
const HARDCODED_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  BNB: "binancecoin",
  TRX: "tron",
  DOGE: "dogecoin",
  BCH: "bitcoin-cash",
  DASH: "dash",
  DOT: "polkadot",
  LTC: "litecoin",
  XRP: "ripple",
  ADA: "cardano",
  SOL: "solana",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  SHIB: "shiba-inu",
  LINK: "chainlink",
  XMR: "monero",
  XLM: "stellar",
  ATOM: "cosmos",
  FIL: "filecoin",
  APT: "aptos",
  SUI: "sui",
  ARB: "arbitrum",
  OP: "optimism",
  PEPE: "pepe",
  INJ: "injective-protocol",
};

function useLivePrice(symbol: string) {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP'];
  const isStable = STABLECOINS.includes(symbol.toUpperCase());

  const fetchPrice = useCallback(async () => {
    if (!symbol) return;
    
    // Stablecoins are always $1
    if (isStable) {
      setPrice(1.0);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    let found = false;

    // Try Binance with specific pair endpoint (much faster than fetching all)
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}USDT`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.price) {
          setPrice(parseFloat(data.price));
          found = true;
        }
      }
    } catch {
      // Binance failed, try fallback
    }

    // Fallback to CoinGecko
    if (!found) {
      const cgId = HARDCODED_IDS[symbol.toUpperCase()];
      if (cgId) {
        try {
          const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${cgId}`);
          if (res.ok) {
            const data = await res.json();
            if (data[cgId]?.usd) {
              setPrice(parseFloat(data[cgId].usd));
              found = true;
            }
          }
        } catch {
          // CoinGecko also failed
        }
      }
    }

    // If still not found, try searching CoinGecko coin list
    if (!found && !HARDCODED_IDS[symbol.toUpperCase()]) {
      try {
        const listRes = await fetch("https://api.coingecko.com/api/v3/coins/list");
        if (listRes.ok) {
          const allCoins = await listRes.json();
          const coin = allCoins.find((c: any) => c.symbol.toLowerCase() === symbol.toLowerCase());
          if (coin) {
            const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${coin.id}`);
            if (priceRes.ok) {
              const priceData = await priceRes.json();
              if (priceData[coin.id]?.usd) {
                setPrice(parseFloat(priceData[coin.id].usd));
                found = true;
              }
            }
          }
        }
      } catch {
        // All sources failed
      }
    }

    if (!found) {
      setError("Price not available");
    }
    setLoading(false);
  }, [symbol, isStable]);

  // Fetch on mount and symbol change
  useEffect(() => {
    fetchPrice();
  }, [fetchPrice]);

  // Auto-refresh every 15 seconds for non-stablecoins
  useEffect(() => {
    if (isStable || !symbol) return;
    const interval = setInterval(fetchPrice, 15000);
    return () => clearInterval(interval);
  }, [fetchPrice, isStable, symbol]);

  return { price, loading, error, refresh: fetchPrice };
}

export function ConvertModal({ isOpen, onClose, userId }: ConvertModalProps) {
  const [step, setStep] = useState(1);
  const [fromCurrency, setFromCurrency] = useState("BTC");
  const [toCurrency, setToCurrency] = useState("USDT");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { prices } = useCryptoPrices();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get user's portfolio
  const { data: portfolio } = useQuery({
    queryKey: ["/api/portfolio", userId],
    queryFn: () => cryptoApi.getPortfolio(userId || ''),
    enabled: isOpen && !!userId,
  });

  const fromLive = useLivePrice(fromCurrency);
  const toLive = useLivePrice(toCurrency);

  // Helper function to get available balance for a currency
  const getAvailableBalance = (symbol: string) => {
    if (!portfolio) return '0';
    const asset = portfolio.find(p => p.symbol === symbol);
    return asset ? asset.available : '0';
  };

  // Helper function to check if an asset is frozen
  const isAssetFrozen = (symbol: string): boolean => {
    if (!portfolio) return false;
    const asset = portfolio.find(p => p.symbol === symbol);
    if (!asset) return false;
    return parseFloat(asset.frozen || '0') > 0;
  };

  const fromFrozen = isAssetFrozen(fromCurrency);
  const toFrozen = isAssetFrozen(toCurrency);
  const anyFrozen = fromFrozen || toFrozen;

  // Calculate converted amount between any two currencies
  let convertedAmount = "";
  if (amount && fromCurrency && toCurrency && fromLive.price && toLive.price) {
    const usdValue = parseFloat(amount) * fromLive.price;
    const targetValue = usdValue / toLive.price;
    convertedAmount = targetValue.toFixed(6);
  }

  // Validation helpers
  const parsedAmount = parseFloat(amount);
  const availableBalance = parseFloat(getAvailableBalance(fromCurrency));
  const isSameCurrency = fromCurrency === toCurrency;
  const isInvalidAmount = !amount || isNaN(parsedAmount) || parsedAmount <= 0;
  const isInsufficientBalance = !!userId && !isNaN(parsedAmount) && parsedAmount > availableBalance;
  const isPricesReady = !!fromLive.price && !!toLive.price;

  const canContinue = !isInvalidAmount && !isSameCurrency && !isInsufficientBalance && isPricesReady && !anyFrozen;
  const canConvert = canContinue && !isSubmitting;

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);
  const handleClose = () => {
    setStep(1);
    setAmount("");
    setIsSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!canConvert || !fromLive.price || !toLive.price) return;

    setIsSubmitting(true);
    try {
      const response = await apiRequest("POST", "/api/convert", {
        fromSymbol: fromCurrency,
        toSymbol: toCurrency,
        amount: parsedAmount.toString(),
        fromPrice: fromLive.price.toString(),
        toPrice: toLive.price.toString(),
      });

      const result = await response.json();

      // Invalidate portfolio cache so balances update
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });

      toast({
        title: "Conversion Successful",
        description: `Converted ${result.fromAmount} ${result.fromSymbol} to ${result.receivedAmount} ${result.toSymbol}`,
      });

      handleClose();
    } catch (error: any) {
      const msg = error?.message || "Conversion failed. Please try again.";
      // Strip HTTP status prefix if present (e.g. "400: {...}")
      let displayMsg = msg;
      try {
        const jsonMatch = msg.match(/^\d+:\s*(.+)/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[1]);
          displayMsg = parsed.message || msg;
        }
      } catch {
        displayMsg = msg;
      }
      toast({
        title: "Conversion Failed",
        description: displayMsg,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableCurrencies = prices.map(p => p.symbol);

  // Swap currencies
  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm sm:max-w-md p-0">
        <DialogHeader className="p-4 md:p-6 pb-0 border-b-0">
          <DialogTitle className="text-base md:text-lg text-foreground mb-4">
            {step === 1 ? "Convert Assets" : "Confirm Conversion"}
          </DialogTitle>

          {/* Step indicator */}
          <div className="flex items-center pb-4">
            {[{ n: 1, label: "Amount" }, { n: 2, label: "Confirm" }].map((s, i, arr) => (
              <div key={s.n} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold tabular-nums transition-colors ${
                      step === s.n
                        ? "bg-primary text-primary-foreground"
                        : step > s.n
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s.n ? <Check className="w-3.5 h-3.5" /> : s.n}
                  </div>
                  <span className={`text-[10px] ${step === s.n ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <div className={`flex-1 h-px mx-2 mb-4 ${step > s.n ? "bg-success" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="p-4 md:p-6 pt-4 border-t border-border">
          {step === 1 && (
            <div className="space-y-5">
              {/* Frozen assets alert */}
              {anyFrozen && (
                <Alert className="bg-danger/10 border-danger/20 p-3.5">
                  <Snowflake className="text-danger" size={16} />
                  <AlertDescription className="text-sm space-y-1">
                    <p className="font-medium text-danger">Assets Frozen</p>
                    {fromFrozen && <p className="text-danger/80 text-xs">{fromCurrency} assets are currently frozen. Conversions from this asset are not allowed.</p>}
                    {toFrozen && <p className="text-danger/80 text-xs">{toCurrency} assets are currently frozen. Conversions into this asset are not allowed.</p>}
                    <p className="text-muted-foreground text-xs">Please contact support for assistance.</p>
                  </AlertDescription>
                </Alert>
              )}

              {/* From Currency Card */}
              <div className="bg-muted/50 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">From</Label>
                  {userId && (
                    <span className="text-xs text-muted-foreground">
                      Balance: <span className="text-success font-medium tabular-nums">{formatCryptoNumber(availableBalance)} {fromCurrency}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Select value={fromCurrency} onValueChange={setFromCurrency}>
                    <SelectTrigger className="w-[140px] bg-muted border-border text-foreground rounded-xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-60">
                      {availableCurrencies.map(currency => (
                        <SelectItem key={currency} value={currency} className="text-foreground hover:bg-muted focus:bg-muted">
                          <div className="flex items-center gap-2">
                            <CryptoIcon symbol={currency} size="xs" />
                            <span className="font-medium">{currency}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex-1">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      max={userId ? availableBalance : undefined}
                      className="bg-transparent border-0 text-right text-lg font-semibold text-foreground placeholder-gray-600 focus-visible:ring-0 focus-visible:ring-offset-0 h-11 tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="tabular-nums">{fromLive.loading ? "Loading price..." : fromLive.price ? `1 ${fromCurrency} = $${fromLive.price.toLocaleString()}` : fromLive.error || "Price unavailable"}</span>
                    <button onClick={fromLive.refresh} className="text-muted-foreground hover:text-foreground transition-colors p-0.5" title="Refresh price">
                      <RefreshCw size={11} />
                    </button>
                  </div>
                  {userId && (
                    <button
                      type="button"
                      onClick={() => setAmount(getAvailableBalance(fromCurrency))}
                      className="text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      MAX
                    </button>
                  )}
                </div>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center -my-1">
                <button
                  onClick={handleSwap}
                  className="w-9 h-9 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 hover:border-primary/30 transition-colors duration-200"
                  title="Swap currencies"
                >
                  <ArrowDownUp size={16} />
                </button>
              </div>

              {/* To Currency Card */}
              <div className="bg-muted/50 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">To</Label>
                  {userId && (
                    <span className="text-xs text-muted-foreground">
                      Balance: <span className="text-foreground font-medium tabular-nums">{formatCryptoNumber(parseFloat(getAvailableBalance(toCurrency)))} {toCurrency}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Select value={toCurrency} onValueChange={setToCurrency}>
                    <SelectTrigger className="w-[140px] bg-muted border-border text-foreground rounded-xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-60">
                      {availableCurrencies.map(currency => (
                        <SelectItem key={currency} value={currency} className="text-foreground hover:bg-muted focus:bg-muted">
                          <div className="flex items-center gap-2">
                            <CryptoIcon symbol={currency} size="xs" />
                            <span className="font-medium">{currency}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex-1 text-right">
                    <div className={`text-lg font-semibold h-11 flex items-center justify-end pr-3 tabular-nums ${convertedAmount ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {convertedAmount || "0.00"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="tabular-nums">{toLive.loading ? "Loading price..." : toLive.price ? `1 ${toCurrency} = $${toLive.price.toLocaleString()}` : toLive.error || "Price unavailable"}</span>
                  <button onClick={toLive.refresh} className="text-muted-foreground hover:text-foreground transition-colors p-0.5" title="Refresh price">
                    <RefreshCw size={11} />
                  </button>
                </div>
              </div>

              {/* Preview & Rate Info */}
              {amount && isPricesReady && !isSameCurrency && !isInvalidAmount && (
                <div className="bg-muted/50 border border-border rounded-xl p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Exchange Rate</span>
                    <span className="text-foreground font-medium tabular-nums">
                      1 {fromCurrency} = {fromLive.price && toLive.price ? (fromLive.price / toLive.price).toFixed(6) : "..."} {toCurrency}
                    </span>
                  </div>
                  {fromLive.price && (
                    <div className="flex items-center justify-between text-xs mt-1.5">
                      <span className="text-muted-foreground">Est. Value</span>
                      <span className="text-foreground font-medium tabular-nums">
                        ≈ ${(parsedAmount * fromLive.price).toFixed(2)} USD
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Validation Errors */}
              {isSameCurrency && (
                <Alert className="bg-warning/10 border-warning/20 p-3">
                  <AlertTriangle className="text-warning" size={14} />
                  <AlertDescription className="text-xs text-warning">Cannot convert a currency to itself. Please select a different target currency.</AlertDescription>
                </Alert>
              )}
              {isInsufficientBalance && (
                <Alert className="bg-danger/10 border-danger/20 p-3">
                  <AlertTriangle className="text-danger" size={14} />
                  <AlertDescription className="text-xs text-danger">Insufficient balance. Available: <span className="tabular-nums">{availableBalance.toFixed(6)} {fromCurrency}</span></AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleNext}
                disabled={!canContinue}
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Continue</span>
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <button
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -ml-1 disabled:opacity-40"
              >
                <ArrowRight className="w-4 h-4 rotate-180" /> Back
              </button>

              {/* Conversion Summary Card */}
              <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
                {/* You Send */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-danger/10 rounded-xl flex items-center justify-center">
                      <CryptoIcon symbol={fromCurrency} size="sm" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{fromCurrency}</p>
                      <p className="text-[11px] text-muted-foreground">You send</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-danger text-sm tabular-nums">-{parsedAmount.toFixed(8)}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">≈ ${fromLive.price ? (parsedAmount * fromLive.price).toFixed(2) : "..."}</p>
                  </div>
                </div>

                {/* Divider with arrow */}
                <div className="relative border-t border-border">
                  <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-card border border-border rounded-lg flex items-center justify-center">
                    <ArrowDownUp size={13} className="text-muted-foreground" />
                  </div>
                </div>

                {/* You Receive */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
                      <CryptoIcon symbol={toCurrency} size="sm" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{toCurrency}</p>
                      <p className="text-[11px] text-muted-foreground">You receive</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-success text-sm tabular-nums">+{convertedAmount || "0.00000000"}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">≈ ${toLive.price && convertedAmount ? (parseFloat(convertedAmount) * toLive.price).toFixed(2) : "..."}</p>
                  </div>
                </div>
              </div>

              {/* Details Card */}
              <div className="bg-muted/50 border border-border rounded-xl p-4">
                <p className="font-medium text-info text-xs uppercase tracking-wider mb-3">Conversion Details</p>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exchange Rate</span>
                    <span className="text-foreground font-medium tabular-nums">1 {fromCurrency} = {fromLive.price && toLive.price ? (fromLive.price / toLive.price).toFixed(6) : "..."} {toCurrency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-foreground font-medium tabular-nums">{parsedAmount.toFixed(8)} {fromCurrency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You Receive</span>
                    <span className="text-success font-medium tabular-nums">{convertedAmount || "0.00000000"} {toCurrency}</span>
                  </div>
                  <div className="border-t border-border pt-2.5 flex justify-between">
                    <span className="text-muted-foreground">Est. USD Value</span>
                    <span className="text-foreground font-semibold tabular-nums">${fromLive.price ? (parsedAmount * fromLive.price).toFixed(2) : "..."}</span>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <Alert className="bg-warning/10 border-warning/20 p-3.5">
                <AlertTriangle className="text-warning" size={15} />
                <AlertDescription className="text-xs">
                  <p className="font-medium text-warning mb-0.5">Important</p>
                  <p className="text-warning/80">Conversion will be executed at the current market rate. Rates may fluctuate slightly at the time of execution.</p>
                </AlertDescription>
              </Alert>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleBack}
                  variant="outline"
                  disabled={isSubmitting}
                  className="flex-1 h-11 rounded-xl bg-muted border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canConvert}
                  className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm disabled:opacity-40"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      Converting...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle size={16} />
                      Confirm
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
