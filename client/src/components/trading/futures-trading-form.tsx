import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatUsdNumber } from '@/utils/format-utils';

import { useUser } from '@/hooks/use-user';

interface FuturesTradingFormProps {
  onTradeSubmitted?: () => void;
}

const durationOptions = [
  { value: 60, label: '60 seconds', profitRatio: 30 },
  { value: 120, label: '120 seconds', profitRatio: 40 },
  { value: 180, label: '180 seconds', profitRatio: 50 },
  { value: 240, label: '240 seconds', profitRatio: 60 },
  { value: 360, label: '360 seconds', profitRatio: 70 },
  { value: 480, label: '480 seconds', profitRatio: 80 },
  { value: 600, label: '600 seconds', profitRatio: 100 },
];

export function FuturesTradingForm({ onTradeSubmitted }: FuturesTradingFormProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState<number>(60);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const selectedDuration = durationOptions.find(d => d.value === duration);
  const profitRatio = selectedDuration?.profitRatio || 30;

  useEffect(() => {
    // Fetch current price for the selected symbol
    const fetchPrice = async () => {
      try {
        const response = await fetch('/api/crypto/prices');
        const data = await response.json();
        const symbolData = data.find((item: any) => item.symbol === symbol.split('/')[0]);
        if (symbolData) {
          setCurrentPrice(parseFloat(symbolData.price));
        }
      } catch (error) {
        console.error('Error fetching price:', error);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [symbol]);

  const handleSubmitTrade = async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to submit a trade.',
        variant: 'destructive',
      });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid amount.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/future-trade/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          amount: parseFloat(amount),
          duration,
          side,
          profitRatio,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit trade');
      }

      const data = await response.json();

      toast({
        title: 'Success',
        description: 'Trade started successfully! It will run in the background.',
      });

      setAmount('');
      onTradeSubmitted?.();
    } catch (error) {
      console.error('Error submitting trade:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start trade.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="w-full max-w-md bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">Futures Trading</h3>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Symbol</label>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="h-10 bg-background border-border rounded-lg text-foreground text-sm focus:ring-1 focus:ring-ring">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="BTC/USDT">BTC/USDT</SelectItem>
              <SelectItem value="ETH/USDT">ETH/USDT</SelectItem>
              <SelectItem value="BNB/USDT">BNB/USDT</SelectItem>
              <SelectItem value="ADA/USDT">ADA/USDT</SelectItem>
              <SelectItem value="DOT/USDT">DOT/USDT</SelectItem>
              <SelectItem value="XAU/USDT">XAU/USDT (Gold)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Long/Short Buttons */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Side</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSide('long')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                side === 'long'
                  ? 'bg-buy text-success-foreground'
                  : 'bg-muted text-muted-foreground border border-border hover:text-foreground'
              }`}
            >
              LONG
            </button>
            <button
              type="button"
              onClick={() => setSide('short')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                side === 'short'
                  ? 'bg-sell text-danger-foreground'
                  : 'bg-muted text-muted-foreground border border-border hover:text-foreground'
              }`}
            >
              SHORT
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Amount (USDT)</label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            min="0"
            step="0.01"
            className="h-10 bg-background border-border rounded-lg text-foreground text-sm tabular-nums focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Duration</label>
          <Select value={duration.toString()} onValueChange={(value) => setDuration(parseInt(value))}>
            <SelectTrigger className="h-10 bg-background border-border rounded-lg text-foreground text-sm focus:ring-1 focus:ring-ring">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {durationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value.toString()}>
                  {option.label} ({option.profitRatio}% profit)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {currentPrice && (
          <div className="flex justify-between items-center bg-muted/40 rounded-lg px-3 py-2.5 border border-border">
            <span className="text-muted-foreground text-xs">Current Price</span>
            <span className="text-foreground text-xs font-medium tabular-nums">${formatUsdNumber(currentPrice)}</span>
          </div>
        )}

        <div className="flex justify-between items-center bg-muted/40 rounded-lg px-3 py-2.5 border border-border">
          <span className="text-muted-foreground text-xs">Profit Ratio</span>
          <span className="text-buy text-xs font-medium tabular-nums">{profitRatio}%</span>
        </div>

        <button
          type="button"
          onClick={handleSubmitTrade}
          disabled={isLoading}
          className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
            side === 'long'
              ? 'bg-buy hover:bg-buy/90 text-success-foreground'
              : 'bg-sell hover:bg-sell/90 text-danger-foreground'
          }`}
        >
          {isLoading ? 'Starting Trade...' : 'Start Trade'}
        </button>
      </div>
    </div>
  );
}
