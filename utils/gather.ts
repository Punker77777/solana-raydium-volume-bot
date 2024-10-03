import {
  Keypair,
  Connection,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  BlockhashWithExpiryBlockHeight,
} from '@solana/web3.js'
import { RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from '../constants'
import { Data, readJson } from './utils'
import base58 from 'bs58'

// Export the Solana connection instance
export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
})

// Read main parameters from JSON and type it properly
const _mainParams: any = readJson('param.json')

// Decoding the private key to create the Keypair
const mainKp: Keypair = Keypair.fromSecretKey(base58.decode(_mainParams.privateKey))

// Function to gather SOL from different wallets
const gather = async (): Promise<void> => {
  // Read wallet data from JSON
  const data: Data[] = readJson()

  // Check if there's any wallet data available
  if (data.length === 0) {
    console.log('No wallet to gather')
    return
  }

  // Fetching the latest blockhash and rent exemption upfront
  const latestBlockhash: BlockhashWithExpiryBlockHeight = await solanaConnection.getLatestBlockhash()
  const rentExemption: number = await solanaConnection.getMinimumBalanceForRentExemption(32)

  // Process all wallets in parallel using Promise.all
  const gatherPromises = data.map(async (walletData: Data): Promise<void> => {
    try {
      // Create a Keypair from the wallet's private key
      const wallet: Keypair = Keypair.fromSecretKey(base58.decode(walletData.privateKey))

      // Fetch the balance of the wallet
      const balance: number = await solanaConnection.getBalance(wallet.publicKey)

      // If the wallet has zero balance, skip it
      if (balance === 0) {
        console.log(`Wallet ${wallet.publicKey.toBase58()} has zero balance, skipping...`)
        return
      }

      console.log(`Wallet ${wallet.publicKey.toBase58()} has a balance of ${balance}`)

      // Calculate the lamports to transfer, accounting for rent and fees
      const lamportsToTransfer = balance - 13_000 - rentExemption
      if (lamportsToTransfer <= 0) {
        console.log(`Wallet ${wallet.publicKey.toBase58()} does not have enough balance to cover rent and fees.`)
        return
      }

      // Create a new transaction to transfer the SOL
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 600_000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: mainKp.publicKey,
          lamports: lamportsToTransfer,
        })
      )

      // Set the latest blockhash and fee payer
      transaction.recentBlockhash = latestBlockhash.blockhash
      transaction.feePayer = wallet.publicKey

      // Simulate the transaction to check if it will succeed
      console.log(`Simulating transaction for wallet ${wallet.publicKey.toBase58()}...`)
      const simulationResult = await solanaConnection.simulateTransaction(transaction)

      // Check if the simulation encountered any errors
      if (simulationResult.value.err) {
        console.log(`Simulation failed for wallet ${wallet.publicKey.toBase58()}:`, simulationResult.value.err)
        return
      }

      // Send the transaction and wait for confirmation
      const signature = await sendAndConfirmTransaction(
        solanaConnection,
        transaction,
        [wallet],
        { skipPreflight: true }
      )

      console.log(`Transfer successful from wallet ${wallet.publicKey.toBase58()} with signature: ${signature}`)
    } catch (error: any) {
      // Log any errors that occur during the process
      console.error(`Failed to gather SOL from wallet: ${error.message}`)
    }
  })

  // Wait for all gathering promises to resolve
  await Promise.all(gatherPromises)
  console.log('Gathering process complete.')
}

// Call the gather function
gather()
