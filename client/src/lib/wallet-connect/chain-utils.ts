export type ChainFamily = 'evm' | 'tron' | 'unsupported';

export function detectChainFamily(network: string | undefined | null, symbol: string | undefined | null): ChainFamily {
  const n = (network || '').toLowerCase();
  const s = (symbol || '').toUpperCase();
  if (/tron|trc/.test(n) || s === 'TRX') return 'tron';
  if (/bitcoin|btc/.test(n) || s === 'BTC') return 'unsupported';
  if (/erc|eth|bep|bsc|polygon|matic|arbitrum|optimism|avax|avalanche/.test(n) || s === 'ETH') return 'evm';
  return 'unsupported';
}

export function explorerTxUrl(chain: ChainFamily, txHash: string): string | null {
  if (chain === 'evm') return `https://etherscan.io/tx/${txHash}`;
  if (chain === 'tron') return `https://tronscan.org/#/transaction/${txHash}`;
  return null;
}
