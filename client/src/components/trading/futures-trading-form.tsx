import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Futures Trading</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="symbol">Symbol</Label>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BTC/USDT">BTC/USDT</SelectItem>
              <SelectItem value="ETH/USDT">ETH/USDT</SelectItem>
              <SelectItem value="BNB/USDT">BNB/USDT</SelectItem>
              <SelectItem value="ADA/USDT">ADA/USDT</SelectItem>
              <SelectItem value="DOT/USDT">DOT/USDT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="side">Side</Label>
          <Select value={side} onValueChange={(value: 'long' | 'short') => setSide(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount (USDT)</Label>
          <Input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            min="0"
            step="0.01"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration">Duration</Label>
          <Select value={duration.toString()} onValueChange={(value) => setDuration(parseInt(value))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {durationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value.toString()}>
                  {option.label} ({option.profitRatio}% profit)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {currentPrice && (
          <div className="text-sm text-muted-foreground">
            Current Price: ${formatUsdNumber(currentPrice)}
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          Profit Ratio: {profitRatio}%
        </div>

        <Button
          onClick={handleSubmitTrade}
          disabled={isLoading}
          className="w-full"
          variant="default"
        >
          {isLoading ? 'Starting Trade...' : 'Start Trade'}
        </Button>
      </CardContent>
    </Card>
  );
}

