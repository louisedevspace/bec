import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-[#111] border border-[#1e1e1e] text-white">
        <DialogHeader>
          <DialogTitle>Convert</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="from-currency" className="text-gray-300">From</Label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111] border-[#2a2a2a]">
                  {availableCurrencies.map(currency => (
                    <SelectItem key={currency} value={currency} className="text-white">
                      <div className="flex items-center gap-2">
                        <CryptoIcon symbol={currency} size="xs" />
                        <span>{currency}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs mt-1 flex items-center gap-2">
                <span>
                  Price: {fromLive.loading ? "Loading..." : fromLive.price ? `$${fromLive.price}` : fromLive.error}
                </span>
                <Button size="icon" variant="ghost" onClick={fromLive.refresh} title="Refresh price" className="h-5 w-5 p-0">
                  <RefreshCw size={14} />
                </Button>
              </div>
              {userId && (
                <div className="text-xs mt-1 text-green-500 font-medium">
                  Available: {formatCryptoNumber(availableBalance)} {fromCurrency}
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <ArrowUpDown className="text-gray-500" size={16} />
            </div>

            <div>
              <Label htmlFor="to-currency" className="text-gray-300">To</Label>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111] border-[#2a2a2a]">
                  {availableCurrencies.map(currency => (
                    <SelectItem key={currency} value={currency} className="text-white">
                      <div className="flex items-center gap-2">
                        <CryptoIcon symbol={currency} size="xs" />
                        <span>{currency}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs mt-1 flex items-center gap-2">
                <span>
                  Price: {toLive.loading ? "Loading..." : toLive.price ? `$${toLive.price}` : toLive.error}
                </span>
                <Button size="icon" variant="ghost" onClick={toLive.refresh} title="Refresh price" className="h-5 w-5 p-0">
                  <RefreshCw size={14} />
                </Button>
              </div>
              {userId && (
                <div className="text-xs mt-1 text-green-500 font-medium">
                  Available: {formatCryptoNumber(parseFloat(getAvailableBalance(toCurrency)))} {toCurrency}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="amount" className="text-gray-300">Amount</Label>
              <div className="flex gap-2">
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  max={userId ? availableBalance : undefined}
                  className="flex-1 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
                />
                {userId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(getAvailableBalance(fromCurrency))}
                    className="px-3 bg-[#1a1a1a] border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a]"
                  >
                    Max
                  </Button>
                )}
              </div>
              {amount && isPricesReady && !isSameCurrency && (
                <div className="text-xs mt-1 text-gray-500">
                  Preview: {amount} {fromCurrency} = {convertedAmount} {toCurrency}
                </div>
              )}
              {isSameCurrency && (
                <div className="text-xs mt-1 text-red-500">
                  Cannot convert a currency to itself. Please select a different target currency.
                </div>
              )}
              {isInsufficientBalance && (
                <div className="text-xs mt-1 text-red-500">
                  Insufficient balance. Available: {availableBalance.toFixed(6)} {fromCurrency}
                </div>
              )}
            </div>

            {anyFrozen && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400 space-y-1">
                <p className="font-semibold">Assets Frozen</p>
                {fromFrozen && <p>{fromCurrency} assets are currently frozen. Conversions from this asset are not allowed.</p>}
                {toFrozen && <p>{toCurrency} assets are currently frozen. Conversions into this asset are not allowed.</p>}
                <p className="text-gray-500">Please contact support for assistance.</p>
              </div>
            )}

            <Button 
              onClick={handleNext} 
              className="w-full" 
              disabled={!canContinue}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-4">
              <Button variant="ghost" size="sm" onClick={handleBack} disabled={isSubmitting}>
                ← Back
              </Button>
            </div>

            {/* Conversion Summary */}
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Conversion Summary</h3>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CryptoIcon symbol={fromCurrency} size="sm" />
                  <div>
                    <div className="font-medium">{fromCurrency}</div>
                    <div className="text-xs text-gray-500">You send</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-red-400">-{parsedAmount.toFixed(6)}</div>
                  <div className="text-xs text-gray-500">≈ ${fromLive.price ? (parsedAmount * fromLive.price).toFixed(2) : "..."}</div>
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowUpDown className="text-gray-600" size={14} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CryptoIcon symbol={toCurrency} size="sm" />
                  <div>
                    <div className="font-medium">{toCurrency}</div>
                    <div className="text-xs text-gray-500">You receive</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-green-400">+{convertedAmount || "0.000000"}</div>
                  <div className="text-xs text-gray-500">≈ ${toLive.price && convertedAmount ? (parseFloat(convertedAmount) * toLive.price).toFixed(2) : "..."}</div>
                </div>
              </div>

              <div className="border-t border-[#2a2a2a] pt-3 mt-3">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Rate</span>
                  <span>1 {fromCurrency} = {fromLive.price && toLive.price ? (fromLive.price / toLive.price).toFixed(6) : "..."} {toCurrency}</span>
                </div>
              </div>
            </div>

            <Button 
              onClick={handleSubmit} 
              className="w-full" 
              disabled={!canConvert}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={16} />
                  Converting...
                </span>
              ) : (
                "Confirm Conversion"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
