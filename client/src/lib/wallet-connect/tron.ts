export interface TronConnection {
  address: string;
  tronWeb: any;
}

const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

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

  return { address: tronWeb.defaultAddress.base58, tronWeb };
}

export async function sendTronDeposit(tronWeb: any, toAddress: string, amount: string, symbol: string): Promise<string> {
  if (symbol.toUpperCase() === 'TRX') {
    const sun = tronWeb.toSun(parseFloat(amount));
    const result = await tronWeb.trx.sendTransaction(toAddress, sun);
    const txId = result?.txid || result?.transaction?.txID;
    if (!txId) throw new Error('Transaction failed or was rejected');
    return txId;
  } else if (symbol.toUpperCase() === 'USDT') {
    const contract = await tronWeb.contract().at(USDT_TRC20_CONTRACT);
    const amountInSun = Math.round(parseFloat(amount) * 1_000_000);
    const txId = await contract.transfer(toAddress, amountInSun).send();
    if (!txId) throw new Error('Transaction failed or was rejected');
    return txId;
  } else {
    throw new Error(`Wallet-connect deposits for ${symbol} on Tron are not supported yet`);
  }
}
