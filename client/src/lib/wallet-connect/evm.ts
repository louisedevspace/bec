import { BrowserProvider, parseEther } from 'ethers';
import { evmChainName } from './chain-utils';

export interface EvmConnection {
  address: string;
  provider: BrowserProvider;
  chainId: number;
}

let wcProviderInstance: any = null;

// Injected wallets (MetaMask etc.) stay on whatever chain the user last used —
// they do NOT automatically match the chain the admin's deposit address is on.
// Sending without checking this can silently target a same-address-different-
// contract on the wrong chain, which is what was producing CALL_EXCEPTION /
// "missing revert data" errors. Ask the wallet to switch before sending.
async function ensureEvmChain(eth: any, provider: BrowserProvider, expectedChainId: number | null): Promise<number> {
  const network = await provider.getNetwork();
  const currentChainId = Number(network.chainId);
  if (expectedChainId === null || currentChainId === expectedChainId) return currentChainId;

  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + expectedChainId.toString(16) }] });
  } catch {
    throw new Error(`Please switch your wallet to ${evmChainName(expectedChainId)} and try again.`);
  }

  const updatedNetwork = await provider.getNetwork();
  const updatedChainId = Number(updatedNetwork.chainId);
  if (updatedChainId !== expectedChainId) {
    throw new Error(`Please switch your wallet to ${evmChainName(expectedChainId)} and try again.`);
  }
  return updatedChainId;
}

export async function connectInjectedEvmWallet(expectedChainId?: number | null): Promise<EvmConnection> {
  const eth = (window as any).ethereum;
  if (!eth) {
    throw new Error('No injected wallet found. Please install MetaMask, Trust Wallet, or Coinbase Wallet.');
  }

  const provider = new BrowserProvider(eth);
  const accounts = await provider.send('eth_requestAccounts', []);
  if (!accounts || accounts.length === 0) {
    throw new Error('No account was returned by the wallet.');
  }

  const chainId = await ensureEvmChain(eth, provider, expectedChainId ?? null);

  return { address: accounts[0], provider, chainId };
}

export async function connectWalletConnectEvm(projectId: string, expectedChainId?: number | null): Promise<EvmConnection> {
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');

  const targetChainId = expectedChainId ?? 1;

  const wcProvider = await EthereumProvider.init({
    projectId,
    chains: [targetChainId],
    showQrModal: true,
    metadata: {
      name: 'Deposit',
      description: 'Connect your wallet to deposit',
      url: window.location.origin,
      icons: [],
    },
  });

  await wcProvider.enable();
  wcProviderInstance = wcProvider;

  const provider = new BrowserProvider(wcProvider as any);
  const accounts = await provider.send('eth_accounts', []);
  if (!accounts || accounts.length === 0) {
    throw new Error('No account was returned by the wallet.');
  }

  return { address: accounts[0], provider, chainId: targetChainId };
}

export async function disconnectWalletConnectEvm(): Promise<void> {
  if (wcProviderInstance) {
    try {
      await wcProviderInstance.disconnect();
    } catch {}
    wcProviderInstance = null;
  }
}

export async function sendNativeEvmDeposit(provider: BrowserProvider, toAddress: string, amount: string): Promise<string> {
  const signer = await provider.getSigner();
  const tx = await signer.sendTransaction({ to: toAddress, value: parseEther(amount) });
  return tx.hash;
}
