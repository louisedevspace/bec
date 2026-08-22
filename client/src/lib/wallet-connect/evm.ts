import { BrowserProvider, parseEther } from 'ethers';

export interface EvmConnection {
  address: string;
  provider: BrowserProvider;
}

let wcProviderInstance: any = null;

export async function connectInjectedEvmWallet(): Promise<EvmConnection> {
  const eth = (window as any).ethereum;
  if (!eth) {
    throw new Error('No injected wallet found. Please install MetaMask, Trust Wallet, or Coinbase Wallet.');
  }

  const provider = new BrowserProvider(eth);
  const accounts = await provider.send('eth_requestAccounts', []);
  if (!accounts || accounts.length === 0) {
    throw new Error('No account was returned by the wallet.');
  }

  return { address: accounts[0], provider };
}

export async function connectWalletConnectEvm(projectId: string): Promise<EvmConnection> {
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');

  const wcProvider = await EthereumProvider.init({
    projectId,
    chains: [1],
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

  return { address: accounts[0], provider };
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
