import { useQuery } from '@tanstack/react-query';

interface BankDepositStatus {
  isEnabled: boolean;
}

export function useBankDepositStatus() {
  return useQuery<BankDepositStatus>({
    queryKey: ['/api/bank-deposits/status'],
    queryFn: async () => {
      const res = await fetch('/api/bank-deposits/status');
      if (!res.ok) throw new Error('Failed to load bank-deposit status');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
