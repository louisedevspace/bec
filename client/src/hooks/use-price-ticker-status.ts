import { useQuery } from '@tanstack/react-query';

interface PriceTickerStatus {
  isEnabled: boolean;
}

export function usePriceTickerStatus() {
  return useQuery<PriceTickerStatus>({
    queryKey: ['/api/price-ticker/status'],
    queryFn: async () => {
      const res = await fetch('/api/price-ticker/status');
      if (!res.ok) throw new Error('Failed to load price ticker status');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
