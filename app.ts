import { NATIVE_MINT, getAssociatedTokenAddress } from '@solana/spl-token';
import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  VersionedTransaction,
  TransactionInstruction,
  TransactionMessage,
  ComputeBudgetProgram,
  Transaction,
} from '@solana/web3.js';
import {
  ADDITIONAL_FEE,
  BUY_AMOUNT,
  BUY_INTERVAL_MAX,
  BUY_INTERVAL_MIN,
  BUY_LOWER_AMOUNT,
  BUY_UPPER_AMOUNT,
  DISTRIBUTION_AMOUNT,
  IS_RANDOM,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  SOLANA_CONNECTION,
} from './constants';
import { Data, editJson, getPrice, readJson, saveDataToFile, sleep } from './utils';
import base58 from 'bs58';
import { getBuyTx, getBuyTxWithJupiter, getSellTx, getSellTxWithJupiter } from './utils/swapOnlyAmm';
import { execute } from './executor/legacy';
import { getPoolKeys } from './utils/getPoolInfo';
import { SWAP_ROUTING } from './constants';
import BN from 'bn.js';
import { distributeSol } from './utils/distribute';


const RETRY_DELAY_MS = 2000;
const MAX_RETRY = 10;

export const main = async () => {
  const _mainParams: any = readJson('param.json');
  if (Object.keys(_mainParams).length === 0) return;

  const privateKey = _mainParams.privateKey;
  const mainKp = Keypair.fromSecretKey(base58.decode(privateKey));
  const baseMint = new PublicKey(_mainParams.tokenCA);
  const poolId = new PublicKey(_mainParams.poolId);
  const numUsedWallets = _mainParams.numUsedWallets;
  const distritbutionNum = _mainParams.numGeneratedWallets;

  const solBalance = (await SOLANA_CONNECTION.getBalance(mainKp.publicKey)) / LAMPORTS_PER_SOL;

  logBotInfo(mainKp, baseMint, solBalance, poolId, distritbutionNum);

  let initialPrice = await getPrice(poolId);
  if (!initialPrice) {
    console.error('Initial price unknown, exiting process.');
    return;
  }

  let quoteVault: PublicKey | null = null;
  let poolKeys = null;

  if (SWAP_ROUTING) {
    console.log('Using Jupiter Swap V6 routing for buy and sell.');
  } else {
    poolKeys = await getPoolKeys(SOLANA_CONNECTION, baseMint);
    if (!poolKeys) {
      console.error('Failed to fetch pool keys, exiting.');
      return;
    }
    quoteVault = new PublicKey(poolKeys.quoteVault);
    console.log(`Successfully fetched pool info. Pool ID: ${poolId.toBase58()}`);
  }

  let wallets = readJson('data.json');
  let data: { kp: Keypair; buyAmount: number }[] | null = null;

  if (solBalance < (BUY_LOWER_AMOUNT + ADDITIONAL_FEE) * distritbutionNum) {
    console.error('Not enough SOL for distribution.');
    return;
  }

  data = await prepareWallets(wallets, mainKp, _mainParams.numGeneratedWallets);
  if (!data) return;

  console.log(`Using ${numUsedWallets} wallets for transactions.`);
  await processWallets(data, numUsedWallets, baseMint, poolId, initialPrice);
};

const logBotInfo = (
  mainKp: Keypair,
  baseMint: PublicKey,
  solBalance: number,
  poolId: PublicKey,
  distritbutionNum: number,
) => {
  console.log(`Volume bot is running`);
  console.log(`Wallet address: ${mainKp.publicKey.toBase58()}`);
  console.log(`Pool token mint: ${baseMint.toBase58()}`);
  console.log(`Wallet SOL balance: ${solBalance.toFixed(3)} SOL`);
  console.log(`Buying interval max: ${BUY_INTERVAL_MAX}ms`);
  console.log(`Buying interval min: ${BUY_INTERVAL_MIN}ms`);
  console.log(`Buy upper limit: ${BUY_UPPER_AMOUNT} SOL`);
  console.log(`Buy lower limit: ${BUY_LOWER_AMOUNT} SOL`);
  console.log(`Distribute SOL to ${distritbutionNum} wallets`);
  console.log(`Pool ID: ${poolId.toBase58()}`);
};

const prepareWallets = async (wallets: any[], mainKp: Keypair, numGeneratedWallets: number) => {
  if (wallets.length > 0) {
    console.log('No need to distribute SOL.');
    return wallets.map((wallet) => ({
      kp: Keypair.fromSecretKey(base58.decode(wallet.privateKey)),
      buyAmount: 0,
    }));
  } else {
    const data = await distributeSol(mainKp, numGeneratedWallets, 'data.json');
    if (!data) {
      console.error('Distribution failed.');
    }
    return data;
  }
};

const processWallets = async (
  wallets: { kp: Keypair; buyAmount: number }[],
  numUsedWallets: number,
  baseMint: PublicKey,
  poolId: PublicKey,
  initialPrice: number,
) => {
  await Promise.all(
    wallets.slice(0, numUsedWallets).map(async ({ kp }, i) => {
      await sleep(((BUY_INTERVAL_MAX + BUY_INTERVAL_MIN) * i) / 2); // Optional delay

      let active = true;
      while (active) {
        const params: any = readJson('param.json');
        if (params.power === 'off') {
          console.log('Process is set to OFF, exiting.');
          active = false;
          break;
        }

        await performBuyAndSell(kp, baseMint, poolId, initialPrice, params);
        await sleep(
          5000 +
            Number(params.numUsedWallets) * (Math.random() * (BUY_INTERVAL_MAX - BUY_INTERVAL_MIN) + BUY_INTERVAL_MIN),
        );
      }
    }),
  );
};

const performBuyAndSell = async (
  kp: Keypair,
  baseMint: PublicKey,
  poolId: PublicKey,
  initialPrice: number,
  params: any,
) => {
  const solBalance = (await SOLANA_CONNECTION.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  if (solBalance < ADDITIONAL_FEE) {
    console.log(`Wallet ${kp.publicKey.toBase58()} has insufficient balance (${solBalance} SOL).`);
    return;
  }

  const buyAmount = IS_RANDOM
    ? Number((Math.random() * (BUY_UPPER_AMOUNT - BUY_LOWER_AMOUNT) + BUY_LOWER_AMOUNT).toFixed(6))
    : BUY_AMOUNT;

  console.log('Attempting to buy...');
  await retryTransaction(() => buy(kp, baseMint, buyAmount, poolId), MAX_RETRY);

  await sleep(Number(params.interval));

  console.log('Attempting to sell...');
  await retryTransaction(() => sell(params.poolId, baseMint, kp), MAX_RETRY);
};

const retryTransaction = async (fn: () => Promise<boolean>, maxRetry: number) => {
  let attempt = 0;
  while (attempt < maxRetry) {
    const result = await fn();
    if (result) {
      console.log('Transaction successful.');
      return;
    }
    attempt++;
    console.error(`Transaction failed (Attempt ${attempt}/${maxRetry}), retrying...`);
    await sleep(RETRY_DELAY_MS);
  }
  console.error('Max retry attempts reached, aborting transaction.');
};



const buy = async (newWallet: Keypair, baseMint: PublicKey, buyAmount: number, poolId: PublicKey): Promise<boolean> => {
  let solBalance: number = 0;
  try {
    solBalance = await SOLANA_CONNECTION.getBalance(newWallet.publicKey);
  } catch (error) {
    console.log('Error getting balance of wallet');
    return false;
  }
  if (solBalance == 0) {
    return false;
  }
  try {
    let tx;
    if (SWAP_ROUTING) tx = await getBuyTxWithJupiter(newWallet, baseMint, buyAmount);
    else tx = await getBuyTx(SOLANA_CONNECTION, newWallet, baseMint, NATIVE_MINT, buyAmount, poolId.toBase58());
    if (tx == null) {
      console.log(`Error getting buy transaction`);
      return false;
    }
    const latestBlockhash = await SOLANA_CONNECTION.getLatestBlockhash();
    const txSig = await execute(tx, latestBlockhash);
    const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : '';
    editJson({
      tokenBuyTx,
      pubkey: newWallet.publicKey.toBase58(),
      solBalance: solBalance / 10 ** 9 - buyAmount,
    });
    console.log('Buy Transaction: ', tokenBuyTx);
    return true;
  } catch (error) {
    return false;
  }
};

const sell = async (
  poolId: PublicKey,
  baseMint: PublicKey,
  wallet: Keypair,
  isHalfSell: boolean = false,
  filePath: number = 0,
): Promise<boolean> => {
  try {
    const data: Data[] =
      filePath === 0
        ? readJson()
        : filePath === 1
          ? readJson('./data/twapWallet.json')
          : readJson('./data/limitWallet.json');
    console.log('data', data);
    if (data.length == 0) {
      await sleep(1000);
      return false;
    }

    const tokenAta = await getAssociatedTokenAddress(baseMint, wallet.publicKey);
    const tokenBalInfo = await SOLANA_CONNECTION.getTokenAccountBalance(tokenAta);
    if (!tokenBalInfo) {
      console.log('Balance incorrect');
      return false;
    }
    let tokenBalance = tokenBalInfo.value.amount;
    console.log(tokenBalance);
    if (isHalfSell) tokenBalance = new BN(tokenBalInfo.value.amount).div(new BN(2)).toString();

    try {
      let sellTx;
      if (SWAP_ROUTING) sellTx = await getSellTxWithJupiter(wallet, baseMint, tokenBalance);
      else sellTx = await getSellTx(SOLANA_CONNECTION, wallet, baseMint, NATIVE_MINT, tokenBalance, poolId.toBase58());

      if (sellTx == null) {
        console.log(`Error getting sell transaction`);
        return false;
      }

      const latestBlockhashForSell = await SOLANA_CONNECTION.getLatestBlockhash();
      const txSellSig = await execute(sellTx, latestBlockhashForSell, false);
      const tokenSellTx = txSellSig ? `https://solscan.io/tx/${txSellSig}` : '';
      const solBalance = await SOLANA_CONNECTION.getBalance(wallet.publicKey);
      editJson({
        pubkey: wallet.publicKey.toBase58(),
        tokenSellTx,
        solBalance,
      });

      console.log('Sell Transaction: ', tokenSellTx);
      return true;
    } catch (error) {
      return false;
    }
  } catch (error) {
    return false;
  }
};
