import fs from 'node:fs';
import path from 'node:path';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  VaultClient,
  deriveVaultAuthorityPda,
  deriveVaultPda,
} from '@solana-ts-transpiler/client';

const DEVNET_URL = 'https://api.devnet.solana.com';

const loadKeypair = (filePath: string) => {
  const secret = JSON.parse(fs.readFileSync(filePath, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const connection = new Connection(DEVNET_URL, 'confirmed');
  const payerPath = path.join(process.env.HOME ?? '', '.config', 'solana', 'id.json');
  const payer = loadKeypair(payerPath);

  const balance = await connection.getBalance(payer.publicKey, 'confirmed');
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error(`Insufficient devnet balance: ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  }

  console.log('Using program id:', VaultClient.programId.toBase58());

  const underlyingMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    6,
  );
  const [vault] = deriveVaultPda(underlyingMint);
  const [vaultAuthority] = deriveVaultAuthorityPda(vault);

  const shareMint = await createMint(
    connection,
    payer,
    vaultAuthority,
    null,
    6,
  );

  const userUnderlying = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    underlyingMint,
    payer.publicKey,
  );
  const vaultUnderlying = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    underlyingMint,
    vaultAuthority,
    true,
  );
  const userShares = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    shareMint,
    payer.publicKey,
  );

  const depositAmount = 500_000n;
  await mintTo(
    connection,
    payer,
    underlyingMint,
    userUnderlying.address,
    payer,
    depositAmount,
  );

  const createIx = VaultClient.ix.createVault(
    { underlyingMint, shareMint },
    {
      payer: payer.publicKey,
      vault,
      vaultAuthority,
      underlyingMint,
      shareMint,
      vaultUnderlying: vaultUnderlying.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  );

  const createTx = new Transaction().add(createIx);
  await sendAndConfirmTransaction(connection, createTx, [payer]);

  const depositIx = VaultClient.ix.deposit(
    { amount: depositAmount },
    {
      user: payer.publicKey,
      vault,
      vaultAuthority,
      userUnderlying: userUnderlying.address,
      vaultUnderlying: vaultUnderlying.address,
      shareMint,
      userShares: userShares.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  );
  const depositTx = new Transaction().add(depositIx);
  await sendAndConfirmTransaction(connection, depositTx, [payer]);

  await sleep(500);
  const sharesAccount = await getAccount(connection, userShares.address);
  if (sharesAccount.amount === 0n) {
    throw new Error('Deposit did not mint any shares.');
  }

  const withdrawIx = VaultClient.ix.withdraw(
    { shares: sharesAccount.amount },
    {
      user: payer.publicKey,
      vault,
      vaultAuthority,
      userShares: userShares.address,
      shareMint,
      userUnderlying: userUnderlying.address,
      vaultUnderlying: vaultUnderlying.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  );
  const withdrawTx = new Transaction().add(withdrawIx);
  await sendAndConfirmTransaction(connection, withdrawTx, [payer]);

  await sleep(500);
  const userUnderlyingAfter = await getAccount(connection, userUnderlying.address);
  const userSharesAfter = await getAccount(connection, userShares.address);
  const vaultUnderlyingAfter = await getAccount(connection, vaultUnderlying.address);

  console.log('User underlying:', userUnderlyingAfter.amount.toString());
  console.log('User shares:', userSharesAfter.amount.toString());
  console.log('Vault underlying:', vaultUnderlyingAfter.amount.toString());

  if (userSharesAfter.amount !== 0n) {
    throw new Error('Shares were not burned on withdraw.');
  }
  if (vaultUnderlyingAfter.amount !== 0n) {
    throw new Error('Vault underlying not emptied after withdraw.');
  }

  console.log('Smoke test passed.');
};

await main();
