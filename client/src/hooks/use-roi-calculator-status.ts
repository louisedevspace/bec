import { useQuery } from '@tanstack/react-query';

interface RoiCalculatorStatus {
  isEnabled: boolean;
}

export function useRoiCalculatorStatus() {
  return useQuery<RoiCalculatorStatus>({
    queryKey: ['/api/roi-calculator/status'],
    queryFn: async () => {
      const res = await fetch('/api/roi-calculator/status');
      if (!res.ok) throw new Error('Failed to load ROI calculator status');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
