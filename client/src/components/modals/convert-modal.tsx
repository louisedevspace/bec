import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownUp, RefreshCw, Loader2, CheckCircle, AlertTriangle, ArrowRight, Snowflake } from "lucide-react";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { formatCryptoNumber, getCurrencySymbol } from "@/utils/format-utils";
import { useEffect } from "react";
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
  const [cgId, setCgId] = useState<string | null>(null);

  // Dynamically fetch CoinGecko ID if not in hardcoded map
  useEffect(() => {
    let cancelled = false;
    async function fetchCgId() {
      if (HARDCODED_IDS[symbol.toUpperCase()]) {
        setCgId(HARDCODED_IDS[symbol.toUpperCase()]);
      } else {
        try {
          const res = await fetch("https://api.coingecko.com/api/v3/coins/list");
          const allCoins = await res.json();
          const found = allCoins.find((c: any) => c.symbol.toLowerCase() === symbol.toLowerCase());
          if (!cancelled) setCgId(found ? found.id : null);
        } catch {
          if (!cancelled) setCgId(null);
        }
      }
    }
    if (symbol) fetchCgId();
    return () => { cancelled = true; };
  }, [symbol]);

  async function fetchPrice() {
    setLoading(true);
    setError(null);
    let found = false;
    
    // Handle stablecoins specially (they're pegged to $1)
    const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP'];
    if (stablecoins.includes(symbol.toUpperCase())) {
      setPrice(1.0);
      setLoading(false);
      return;
    }
    
    // Try Binance first
    try {
      const res = await fetch(BINANCE_URL);
      const data = await res.json();
      if (Array.isArray(data)) {
        const ticker = data.find((t: any) => t.symbol === symbol + "USDT");
        if (ticker && ticker.price) {
          setPrice(parseFloat(ticker.price));
          found = true;
        }
      }
    } catch {}
    // Fallback to CoinGecko
    if (!found && cgId) {
      try {
        const res = await fetch(COINGECKO_URL + cgId);
        const data = await res.json();
        if (data[cgId] && data[cgId].usd) {
          setPrice(parseFloat(data[cgId].usd));
          found = true;
        }
      } catch {}
    }
    if (!found) {
      setError("Price not available");
      setPrice(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP'];
    if (symbol && (stablecoins.includes(symbol.toUpperCase()) || HARDCODED_IDS[symbol.toUpperCase()] || cgId)) fetchPrice();
    // eslint-disable-next-line
  }, [symbol, cgId]);

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
      <DialogContent className="max-w-sm sm:max-w-md max-h-[95vh] overflow-y-auto bg-[#111] border border-[#1e1e1e] text-white p-0">
        <DialogHeader className="p-4 md:p-6 border-b border-[#1e1e1e]">
          <DialogTitle className="text-base md:text-lg text-white">
            {step === 1 ? "Convert" : "Confirm Conversion"}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 md:p-6">
          {step === 1 && (
            <div className="space-y-5">
              {/* Frozen assets alert */}
              {anyFrozen && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5">
                  <div className="flex items-start gap-2.5">
                    <Snowflake className="text-red-400 mt-0.5 flex-shrink-0" size={16} />
                    <div className="text-sm space-y-1">
                      <p className="font-medium text-red-400">Assets Frozen</p>
                      {fromFrozen && <p className="text-red-400/80 text-xs">{fromCurrency} assets are currently frozen. Conversions from this asset are not allowed.</p>}
                      {toFrozen && <p className="text-red-400/80 text-xs">{toCurrency} assets are currently frozen. Conversions into this asset are not allowed.</p>}
                      <p className="text-gray-500 text-xs">Please contact support for assistance.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* From Currency Card */}
              <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">From</Label>
                  {userId && (
                    <span className="text-xs text-gray-500">
                      Balance: <span className="text-green-400 font-medium">{formatCryptoNumber(availableBalance)} {fromCurrency}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Select value={fromCurrency} onValueChange={setFromCurrency}>
                    <SelectTrigger className="w-[140px] bg-[#161616] border-[#2a2a2a] text-white rounded-xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111] border-[#2a2a2a] max-h-60">
                      {availableCurrencies.map(currency => (
                        <SelectItem key={currency} value={currency} className="text-white hover:bg-[#1a1a1a] focus:bg-[#1a1a1a]">
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
                      className="bg-transparent border-0 text-right text-lg font-semibold text-white placeholder-gray-600 focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <span>{fromLive.loading ? "Loading price..." : fromLive.price ? `1 ${fromCurrency} = $${fromLive.price.toLocaleString()}` : fromLive.error || "Price unavailable"}</span>
                    <button onClick={fromLive.refresh} className="text-gray-600 hover:text-gray-400 transition-colors p-0.5" title="Refresh price">
                      <RefreshCw size={11} />
                    </button>
                  </div>
                  {userId && (
                    <button
                      type="button"
                      onClick={() => setAmount(getAvailableBalance(fromCurrency))}
                      className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
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
                  className="w-9 h-9 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#222] hover:border-blue-500/30 transition-all duration-200"
                  title="Swap currencies"
                >
                  <ArrowDownUp size={16} />
                </button>
              </div>

              {/* To Currency Card */}
              <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">To</Label>
                  {userId && (
                    <span className="text-xs text-gray-500">
                      Balance: <span className="text-gray-400 font-medium">{formatCryptoNumber(parseFloat(getAvailableBalance(toCurrency)))} {toCurrency}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Select value={toCurrency} onValueChange={setToCurrency}>
                    <SelectTrigger className="w-[140px] bg-[#161616] border-[#2a2a2a] text-white rounded-xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111] border-[#2a2a2a] max-h-60">
                      {availableCurrencies.map(currency => (
                        <SelectItem key={currency} value={currency} className="text-white hover:bg-[#1a1a1a] focus:bg-[#1a1a1a]">
                          <div className="flex items-center gap-2">
                            <CryptoIcon symbol={currency} size="xs" />
                            <span className="font-medium">{currency}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex-1 text-right">
                    <div className={`text-lg font-semibold h-11 flex items-center justify-end pr-3 ${convertedAmount ? 'text-white' : 'text-gray-600'}`}>
                      {convertedAmount || "0.00"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>{toLive.loading ? "Loading price..." : toLive.price ? `1 ${toCurrency} = $${toLive.price.toLocaleString()}` : toLive.error || "Price unavailable"}</span>
                  <button onClick={toLive.refresh} className="text-gray-600 hover:text-gray-400 transition-colors p-0.5" title="Refresh price">
                    <RefreshCw size={11} />
                  </button>
                </div>
              </div>

              {/* Preview & Rate Info */}
              {amount && isPricesReady && !isSameCurrency && !isInvalidAmount && (
                <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Exchange Rate</span>
                    <span className="text-gray-300 font-medium">
                      1 {fromCurrency} = {fromLive.price && toLive.price ? (fromLive.price / toLive.price).toFixed(6) : "..."} {toCurrency}
                    </span>
                  </div>
                  {fromLive.price && (
                    <div className="flex items-center justify-between text-xs mt-1.5">
                      <span className="text-gray-500">Est. Value</span>
                      <span className="text-gray-300 font-medium">
                        ≈ ${(parsedAmount * fromLive.price).toFixed(2)} USD
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Validation Errors */}
              {isSameCurrency && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="text-yellow-500 mt-0.5 flex-shrink-0" size={14} />
                    <p className="text-xs text-yellow-400">Cannot convert a currency to itself. Please select a different target currency.</p>
                  </div>
                </div>
              )}
              {isInsufficientBalance && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="text-red-400 mt-0.5 flex-shrink-0" size={14} />
                    <p className="text-xs text-red-400">Insufficient balance. Available: {availableBalance.toFixed(6)} {fromCurrency}</p>
                  </div>
                </div>
              )}

              <Button
                onClick={handleNext}
                disabled={!canContinue}
                className="w-full h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 transition-all duration-150 hover:translate-y-[1px] disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Continue</span>
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center mb-2">
                <Button variant="ghost" size="sm" onClick={handleBack} disabled={isSubmitting} className="text-gray-400 hover:text-white hover:bg-[#1a1a1a] rounded-lg -ml-2 h-8 px-2 text-xs">
                  ← Back
                </Button>
              </div>

              {/* Conversion Summary Card */}
              <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl overflow-hidden">
                {/* You Send */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl flex items-center justify-center">
                      <CryptoIcon symbol={fromCurrency} size="sm" />
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">{fromCurrency}</p>
                      <p className="text-[11px] text-gray-500">You send</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-red-400 text-sm">-{parsedAmount.toFixed(8)}</p>
                    <p className="text-[11px] text-gray-500">≈ ${fromLive.price ? (parsedAmount * fromLive.price).toFixed(2) : "..."}</p>
                  </div>
                </div>

                {/* Divider with arrow */}
                <div className="relative border-t border-[#1e1e1e]">
                  <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-[#111] border border-[#2a2a2a] rounded-lg flex items-center justify-center">
                    <ArrowDownUp size={13} className="text-gray-500" />
                  </div>
                </div>

                {/* You Receive */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl flex items-center justify-center">
                      <CryptoIcon symbol={toCurrency} size="sm" />
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">{toCurrency}</p>
                      <p className="text-[11px] text-gray-500">You receive</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-400 text-sm">+{convertedAmount || "0.00000000"}</p>
                    <p className="text-[11px] text-gray-500">≈ ${toLive.price && convertedAmount ? (parseFloat(convertedAmount) * toLive.price).toFixed(2) : "..."}</p>
                  </div>
                </div>
              </div>

              {/* Details Card */}
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
                <p className="font-medium text-blue-400 text-xs uppercase tracking-wider mb-3">Conversion Details</p>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Exchange Rate</span>
                    <span className="text-gray-300 font-medium">1 {fromCurrency} = {fromLive.price && toLive.price ? (fromLive.price / toLive.price).toFixed(6) : "..."} {toCurrency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount</span>
                    <span className="text-white font-medium">{parsedAmount.toFixed(8)} {fromCurrency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">You Receive</span>
                    <span className="text-green-400 font-medium">{convertedAmount || "0.00000000"} {toCurrency}</span>
                  </div>
                  <div className="border-t border-[#2a2a2a] pt-2.5 flex justify-between">
                    <span className="text-gray-500">Est. USD Value</span>
                    <span className="text-white font-semibold">${fromLive.price ? (parsedAmount * fromLive.price).toFixed(2) : "..."}</span>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3.5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="text-yellow-500 mt-0.5 flex-shrink-0" size={15} />
                  <div className="text-xs">
                    <p className="font-medium text-yellow-400 mb-0.5">Important</p>
                    <p className="text-yellow-400/70">Conversion will be executed at the current market rate. Rates may fluctuate slightly at the time of execution.</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleBack}
                  variant="outline"
                  disabled={isSubmitting}
                  className="flex-1 h-11 rounded-xl bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a] hover:text-white font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canConvert}
                  className="flex-1 h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all duration-150 hover:translate-y-[1px] disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
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
