export interface TronConnection {
  address: string;
  tronWeb: any;
}

const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// A wallet pointed at Shasta/Nile testnet will "successfully" call
// tronWeb.contract().at(...) against an address that isn't the real USDT
// contract there, which reverts during TronLink's pre-send simulation — this
// is what "smart contract simulation failed" actually meant. Catch it early
// with a clear message instead of a cryptic on-chain revert.
function isTronMainnet(tronWeb: any): boolean {
  const host: string = tronWeb?.fullNode?.host || tronWeb?.fullHost || '';
  return /trongrid\.io|tronstack\.io/i.test(host) && !/shasta|nile/i.test(host);
}

export async function connectTronLink(): Promise<TronConnection> {
  const tronLink = (window as any).tronLink;
  if (!tronLink) {
    throw new Error('TronLink wallet extension not found. Please install TronLink.');
  }

  try {
    await tronLink.request({ method: 'tron_requestAccounts' });
  } catch (err) {
    throw new Error('Wallet connection was rejected or failed.');
  }

  const tronWeb = (window as any).tronWeb;
  if (!tronWeb?.defaultAddress?.base58) {
    throw new Error('TronLink wallet is locked or no account is selected.');
  }

  if (!isTronMainnet(tronWeb)) {
    throw new Error('Your TronLink wallet is set to a test network. Please switch TronLink to Tron Mainnet and try again.');
  }

  return { address: tronWeb.defaultAddress.base58, tronWeb };
}

export async function sendTronDeposit(tronWeb: any, toAddress: string, amount: string, symbol: string): Promise<string> {
  if (symbol.toUpperCase() === 'TRX') {
    const sun = tronWeb.toSun(parseFloat(amount));
    const balanceSun = await tronWeb.trx.getBalance(tronWeb.defaultAddress.base58);
    if (balanceSun < sun) {
      throw new Error('Insufficient TRX balance in this wallet for the amount entered.');
    }
    const result = await tronWeb.trx.sendTransaction(toAddress, sun);
    const txId = result?.txid || result?.transaction?.txID;
    if (!txId) throw new Error('Transaction failed or was rejected');
    return txId;
  } else if (symbol.toUpperCase() === 'USDT') {
    let contract;
    try {
      contract = await tronWeb.contract().at(USDT_TRC20_CONTRACT);
    } catch {
      throw new Error('Could not load the USDT contract — make sure TronLink is set to Tron Mainnet.');
    }

    const amountInSun = Math.round(parseFloat(amount) * 1_000_000); // USDT-TRC20 uses 6 decimals

    try {
      const rawBalance = await contract.balanceOf(tronWeb.defaultAddress.base58).call();
      const balance = Number(rawBalance?.toString?.() ?? rawBalance ?? 0);
      if (balance < amountInSun) {
        throw new Error('Insufficient USDT balance in this wallet for the amount entered.');
      }
    } catch (err: any) {
      if (err instanceof Error && err.message.startsWith('Insufficient')) throw err;
      // If the balance check itself fails (e.g. RPC hiccup), fall through and let the real send surface any error.
    }

    try {
      const txId = await contract.transfer(toAddress, amountInSun).send();
      if (!txId) throw new Error('Transaction failed or was rejected');
      return txId;
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : '';
      if (/simulation|revert/i.test(message)) {
        throw new Error('Transaction simulation failed — check that this wallet has enough USDT and enough TRX for fees, and that TronLink is set to Tron Mainnet.');
      }
      throw new Error(message || 'Transaction failed or was rejected');
    }
  } else {
    throw new Error(`Wallet-connect deposits for ${symbol} on Tron are not supported yet`);
  }
}
