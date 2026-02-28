import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, RefreshCw } from "lucide-react";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cryptoApi } from "@/services/crypto-api";

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
  const { prices } = useCryptoPrices();

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

  // Calculate converted amount between any two currencies
  let convertedAmount = "";
  if (amount && fromCurrency && toCurrency && fromLive.price && toLive.price) {
    // Convert from source currency to USD, then to target currency
    const usdValue = parseFloat(amount) * fromLive.price;
    const targetValue = usdValue / toLive.price;
    convertedAmount = targetValue.toFixed(6);
  }

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);
  const handleClose = () => {
    setStep(1);
    setAmount("");
    onClose();
  };
  const handleSubmit = async () => {
    // Placeholder function - does nothing
    console.log("Convert button clicked - placeholder function");
    handleClose();
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
                      {currency}
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
                  Available: {parseFloat(getAvailableBalance(fromCurrency)).toFixed(6)} {fromCurrency}
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
                      {currency}
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
                  Available: {parseFloat(getAvailableBalance(toCurrency)).toFixed(6)} {toCurrency}
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
                  max={userId ? parseFloat(getAvailableBalance(fromCurrency)) : undefined}
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
              {amount && fromLive.price && toLive.price && (
                <div className="text-xs mt-1 text-gray-500">
                  Preview: {amount} {fromCurrency} = {convertedAmount} {toCurrency}
                </div>
              )}
              {userId && amount && parseFloat(amount) > parseFloat(getAvailableBalance(fromCurrency)) && (
                <div className="text-xs mt-1 text-red-500">
                  Insufficient balance. Available: {parseFloat(getAvailableBalance(fromCurrency)).toFixed(6)} {fromCurrency}
                </div>
              )}
            </div>

              <Button 
              onClick={handleNext} 
              className="w-full" 
                disabled={
                  !amount || (
                    !!userId && !!amount && 
                    parseFloat(amount) > parseFloat(getAvailableBalance(fromCurrency))
                  )
                }
            >
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-4">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                ← Back
              </Button>
            </div>

            <div>
              <Label>Select currency</Label>
              <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4 max-h-60 overflow-y-auto">
                <div className="space-y-2">
                  {availableCurrencies.map(currency => (
                    <div
                      key={currency}
                      className={`flex items-center justify-between p-2 hover:bg-[#1a1a1a] rounded cursor-pointer ${
                        currency === fromCurrency ? "bg-primary text-primary-foreground" : ""
                      }`}
                      onClick={() => setFromCurrency(currency)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{currency}</span>
                        {userId && (
                          <span className={`text-xs ${
                            currency === fromCurrency ? "text-primary-foreground/80" : "text-green-500"
                          }`}>
                            Available: {portfolio ? parseFloat(getAvailableBalance(currency)).toFixed(6) : "Loading..."}
                          </span>
                        )}
                      </div>
                      <span className={`text-sm ${
                        currency === fromCurrency ? "text-primary-foreground/80" : "text-gray-500"
                      }`}>
                        {currency === "BTC" ? "Bitcoin" : 
                         currency === "ETH" ? "Ethereum" : 
                         currency === "USDT" ? "Tether" : 
                         currency}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-gray-300">Amount</Label>
              <div className="flex gap-2">
                <Input
                  id="amount-step2"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
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
            </div>

            <div>
              <Label className="text-gray-300">Get quantity ({toCurrency})</Label>
              <Input 
                value={convertedAmount ? `${convertedAmount} ${toCurrency}` : `0.00 ${toCurrency}`} 
                readOnly 
                className="bg-[#0a0a0a] border-[#2a2a2a] text-gray-500"
              />
              <div className="text-xs mt-1 text-gray-500">
                Live conversion: {amount} {fromCurrency} = {convertedAmount || "0.00"} {toCurrency}
              </div>
            </div>

            <Button 
              onClick={handleSubmit} 
              className="w-full" 
              disabled={
                !!userId && !!amount && 
                parseFloat(amount) > parseFloat(getAvailableBalance(fromCurrency))
              }
            >
              Convert
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
