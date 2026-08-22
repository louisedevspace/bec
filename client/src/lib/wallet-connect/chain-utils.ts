export type ChainFamily = 'evm' | 'tron' | 'unsupported';

export function detectChainFamily(network: string | undefined | null, symbol: string | undefined | null): ChainFamily {
  const n = (network || '').toLowerCase();
  const s = (symbol || '').toUpperCase();
  if (/tron|trc/.test(n) || s === 'TRX') return 'tron';
  if (/bitcoin|btc/.test(n) || s === 'BTC') return 'unsupported';
  if (/erc|eth|bep|bsc|polygon|matic|arbitrum|optimism|avax|avalanche/.test(n) || s === 'ETH') return 'evm';
  return 'unsupported';
}

const EVM_CHAIN_IDS: Record<string, number> = {
  bsc: 56,
  bep: 56,
  binance: 56,
  polygon: 137,
  matic: 137,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
  avax: 43114,
  erc: 1,
  eth: 1,
};

const EVM_EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  43114: 'https://snowtrace.io',
};

const EVM_CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  56: 'BNB Smart Chain',
  137: 'Polygon',
  42161: 'Arbitrum One',
  10: 'Optimism',
  43114: 'Avalanche C-Chain',
};

// Maps the admin-configured network string (e.g. "ERC-20", "BEP-20", "Polygon")
// to the EVM chain ID the connected wallet must actually be on before sending.
// Without this check, a wallet left on the wrong chain can target a
// same-address-different-contract on another network, or simply revert.
export function getExpectedEvmChainId(network: string | undefined | null): number | null {
  const n = (network || '').toLowerCase();
  for (const key of Object.keys(EVM_CHAIN_IDS)) {
    if (n.includes(key)) return EVM_CHAIN_IDS[key];
  }
  return null;
}

export function evmChainName(chainId: number): string {
  return EVM_CHAIN_NAMES[chainId] || `chain ${chainId}`;
}

export function explorerTxUrl(chain: ChainFamily, txHash: string, evmChainId?: number | null): string | null {
  if (chain === 'evm') {
    const base = (evmChainId && EVM_EXPLORERS[evmChainId]) || EVM_EXPLORERS[1];
    return `${base}/tx/${txHash}`;
  }
  if (chain === 'tron') return `https://tronscan.org/#/transaction/${txHash}`;
  return null;
}
