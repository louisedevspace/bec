import { useQuery } from '@tanstack/react-query';

interface WalletConnectStatus {
  isEnabled: boolean;
  projectId: string | null;
}

export function useWalletConnectStatus() {
  return useQuery<WalletConnectStatus>({
    queryKey: ['/api/wallet-connect/status'],
    queryFn: async () => {
      const res = await fetch('/api/wallet-connect/status');
      if (!res.ok) throw new Error('Failed to load wallet-connect status');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
