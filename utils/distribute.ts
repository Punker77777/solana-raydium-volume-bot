import {
  Keypair,
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
  BUY_UPPER_AMOUNT,
  DISTRIBUTION_AMOUNT,
  SOLANA_CONNECTION,

} from '../constants';
import { Data, saveDataToFile } from './utils';
import base58 from 'bs58';
import { execute } from '../executor/legacy';

// distribute SOL to wallets
export const distributeSol = async (mainKp: Keypair, distritbutionNum: number, filepath: string) => {
  const data: Data[] = [];
  const wallets = [];
  try {
    const sendSolTx: TransactionInstruction[] = [];
    sendSolTx.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 }),
    );
    for (let i = 0; i < distritbutionNum; i++) {
      let solAmount = DISTRIBUTION_AMOUNT;
      if (DISTRIBUTION_AMOUNT < ADDITIONAL_FEE + BUY_UPPER_AMOUNT) solAmount = ADDITIONAL_FEE + BUY_UPPER_AMOUNT;

      const wallet = Keypair.generate();
      wallets.push({ kp: wallet, buyAmount: solAmount });

      sendSolTx.push(
        SystemProgram.transfer({
          fromPubkey: mainKp.publicKey,
          toPubkey: wallet.publicKey,
          lamports: solAmount * LAMPORTS_PER_SOL,
        }),
      );
    }
    let index = 0;
    while (true) {
      try {
        if (index > 3) {
          console.log('Error in distribution');
          return null;
        }
        const siTx = new Transaction().add(...sendSolTx);
        const latestBlockhash = await SOLANA_CONNECTION.getLatestBlockhash();
        siTx.feePayer = mainKp.publicKey;
        siTx.recentBlockhash = latestBlockhash.blockhash;
        const messageV0 = new TransactionMessage({
          payerKey: mainKp.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: sendSolTx,
        }).compileToV0Message();
        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([mainKp]);
        const txSig = await execute(transaction, latestBlockhash);
        const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : '';
        console.log('SOL distributed ', tokenBuyTx);
        break;
      } catch (error) {
        index++;
      }
    }

    wallets.map((wallet) => {
      data.push({
        privateKey: base58.encode(wallet.kp.secretKey),
        pubkey: wallet.kp.publicKey.toBase58(),
        solBalance: wallet.buyAmount + ADDITIONAL_FEE,
        tokenBuyTx: null,
        tokenSellTx: null,
      });
    });
    try {
      saveDataToFile(data, filepath);
    } catch (error) {}
    console.log('Success in transferring sol');
    return wallets;
  } catch (error) {
    console.log(`Failed to transfer SOL`);
    return null;
  }
};