import { useQuery } from "@tanstack/react-query";
import { useUserDataSync } from "@/hooks/use-data-sync";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cryptoApi } from "@/services/crypto-api";
import { useCryptoPrices } from "@/hooks/use-crypto-prices";
import { formatBalance, formatUsdNumber, formatCryptoNumber, getCurrencySymbol } from "@/utils/format-utils";
import { supabase } from "@/lib/supabaseClient";
import { useState, useEffect } from "react";
import type { Portfolio } from "@/types/crypto";

interface PortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PortfolioModal({ isOpen, onClose }: PortfolioModalProps) {
  const { prices, getFormattedPrice } = useCryptoPrices();
  const [userId, setUserId] = useState<string | null>(null);
  
  // Use the comprehensive data sync hook
  useUserDataSync(userId || '', {
    enabled: isOpen && !!userId
  });
  
  // Get current user ID
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    
    if (isOpen) {
      getUser();
    }
  }, [isOpen]);


  
  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["/api/portfolio", userId],
    queryFn: () => userId ? cryptoApi.getPortfolio(userId) : Promise.resolve([]),
    enabled: isOpen && !!userId,
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnWindowFocus: true,
  });

  const { data: stakingPositions, isLoading: stakingLoading } = useQuery({
    queryKey: ["/api/staking/positions", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`/api/staking/${userId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch staking positions');
      }

      return response.json();
    },
    enabled: isOpen && !!userId,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const calculateTotalValue = () => {
    if (!portfolio || !prices.length) return { available: "$0.00", staked: "$0.00" };
    
    let totalAvailable = 0;
    let totalStaked = 0;
    
    // Calculate available portfolio value (converted to USD)
    portfolio.forEach((asset: Portfolio) => {
      const price = prices.find(p => p.symbol === asset.symbol);
      if (price) {
        const priceValue = parseFloat(price.price);
        const available = parseFloat(asset.available) || 0;
        totalAvailable += available * priceValue;
      }
    });
    
    // Calculate total staked value (converted to USD)
    if (stakingPositions && stakingPositions.length > 0) {
      stakingPositions.forEach((position: any) => {
        const price = prices.find(p => p.symbol === position.symbol);
        if (price && position.status === 'active') {
          const priceValue = parseFloat(price.price);
          const stakedAmount = parseFloat(position.amount) || 0;
          totalStaked += stakedAmount * priceValue;
        }
      });
    }
    
    return {
      available: '$' + formatUsdNumber(totalAvailable),
      staked: '$' + formatUsdNumber(totalStaked),
    };
  };

  const calculateAssetValue = (asset: Portfolio) => {
    const price = prices.find(p => p.symbol === asset.symbol);
    if (!price) return "$0.00";
    
    const available = parseFloat(asset.available) || 0;
    const frozen = parseFloat(asset.frozen) || 0;
    const total = available + frozen;
    const priceValue = parseFloat(price.price);
    const usdValue = total * priceValue;
    // Show USD value with $ symbol
    return '$' + formatUsdNumber(usdValue);
  };

  const totals = calculateTotalValue();

  const getCryptoIcon = (symbol: string) => {
    const iconMap: { [key: string]: string } = {
      'BTC': '₿',
      'ETH': 'Ξ',
      'TRX': 'T',
      'USDT': '₮',
      'XAU': '🥇',
      'XAG': '🥈',
      'DOGE': '🐕',
      'LTC': 'Ł',
      'XRP': 'X',
      'BCH': '₿',
      'ETC': 'Ξ',
      'EOS': 'E',
      'BNB': 'B',
      'DOT': '●',
    };
    return iconMap[symbol] || symbol[0];
  };

  const getIconColor = (symbol: string) => {
    const colorMap: { [key: string]: string } = {
      'BTC': 'bg-orange-500',
      'ETH': 'bg-blue-500',
      'TRX': 'bg-red-500',
      'USDT': 'bg-green-500',
      'XAU': 'bg-yellow-500',
      'XAG': 'bg-gray-400',
      'DOGE': 'bg-yellow-400',
      'LTC': 'bg-gray-500',
      'XRP': 'bg-blue-600',
      'BCH': 'bg-orange-600',
      'ETC': 'bg-green-600',
      'EOS': 'bg-purple-600',
      'BNB': 'bg-yellow-500',
      'DOT': 'bg-pink-600',
    };
    return colorMap[symbol] || 'bg-primary';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm sm:max-w-md md:max-w-6xl max-h-[95vh] overflow-y-auto bg-[#111] border border-[#1e1e1e] text-white">
        <DialogHeader className="p-4 md:p-6">
          <DialogTitle className="text-base md:text-lg">Portfolio</DialogTitle>
        </DialogHeader>

        {/* Portfolio Summary */}
        <div className="space-y-3 mb-6 p-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-gray-500 mb-2">Available (USD)</div>
              <div className="text-lg font-semibold text-red-500 break-all">{totals.available}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-gray-500 mb-2">Staked (USD)</div>
              <div className="text-lg font-semibold text-blue-500 break-all">{totals.staked}</div>
            </CardContent>
          </Card>
        </div>

        {/* Holdings Table */}
        <Card className="p-4">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-border">
                    <th className="text-left py-2 px-2">Asset</th>
                    <th className="text-center py-2 px-2 hidden md:table-cell">Frozen</th>
                    <th className="text-right py-2 px-2">Current worth</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="py-4 px-4">
                          <div className="flex items-center space-x-3">
                            <Skeleton className="w-8 h-8 rounded-full" />
                            <div>
                              <Skeleton className="h-4 w-12 mb-1" />
                              <Skeleton className="h-3 w-16" />
                            </div>
                          </div>
                        </td>
                        <td className="text-center py-4 px-4 hidden md:table-cell">
                          <Skeleton className="h-4 w-16 mx-auto" />
                        </td>
                        <td className="text-right py-4 px-4">
                          <Skeleton className="h-4 w-20 ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : portfolio && portfolio.length > 0 ? (
                    portfolio.map((asset: Portfolio, index: number) => (
                      <tr key={`${asset.symbol}-${asset.user_id || 'unknown'}-${index}`} className="border-b border-border hover:bg-[#1a1a1a]">
                        <td className="py-2 px-2">
                          <div className="flex items-center space-x-2">
                            <div className={`w-6 h-6 ${getIconColor(asset.symbol)} rounded-full flex items-center justify-center`}>
                              <span className="text-white text-xs font-bold">
                                {getCryptoIcon(asset.symbol)}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-xs">{asset.symbol}</div>
                              <div className="text-xs text-gray-500 truncate">
                                Available: {formatCryptoNumber(parseFloat(asset.available) || 0)} {asset.symbol}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="text-center py-2 px-2 hidden md:table-cell">
                          <div className="font-semibold text-xs">
                            {(parseFloat(asset.frozen) || 0).toFixed(8)} {asset.symbol}
                          </div>
                        </td>
                        <td className="text-right py-2 px-2">
                          <div className="font-semibold text-xs">
                            {calculateAssetValue(asset)}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="text-center py-12 text-gray-500">
                        <div className="w-16 h-16 bg-[#0a0a0a] border border-[#2a2a2a] rounded-full mx-auto mb-4 flex items-center justify-center">
                          <span className="text-2xl">📊</span>
                        </div>
                        <p>No assets found</p>
                        <p className="text-sm mt-1">Your portfolio will appear here after you make deposits</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
