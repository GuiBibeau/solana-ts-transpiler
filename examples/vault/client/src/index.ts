// AUTO-GENERATED - DO NOT EDIT
export * from './generated';

import { Buffer } from 'buffer';
import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import type { Instruction } from '@solana/kit';
import {
  VAULT_PROGRAM_ADDRESS,
  getCreateVaultInstruction,
  getDepositInstruction,
  getWithdrawInstruction,
  type VaultState,
} from './generated';

const toAddress = (value: PublicKey | string): string => {
  if (typeof value === 'string') return value;
  return value.toBase58();
};

const toWeb3Instruction = (
  instruction: Instruction,
  keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>,
): TransactionInstruction =>
  new TransactionInstruction({
    programId: new PublicKey(instruction.programAddress),
    keys,
    data: Buffer.from(instruction.data ?? []),
  });

export const VaultClient = {
  programId: new PublicKey(VAULT_PROGRAM_ADDRESS),
  ix: {
  createVault(args: {
  underlyingMint: PublicKey;
  shareMint: PublicKey;
}, accounts: {
  payer: PublicKey;
  vault: PublicKey;
  vaultAuthority: PublicKey;
  underlyingMint: PublicKey;
  shareMint: PublicKey;
  vaultUnderlying: PublicKey;
  tokenProgram: PublicKey;
  systemProgram?: PublicKey;
}): TransactionInstruction {
    const systemProgram = accounts.systemProgram ?? SystemProgram.programId;
    const instruction = getCreateVaultInstruction({
      payer: toAddress(accounts.payer),
      vault: toAddress(accounts.vault),
      vaultAuthority: toAddress(accounts.vaultAuthority),
      underlyingMint: toAddress(accounts.underlyingMint),
      shareMint: toAddress(accounts.shareMint),
      vaultUnderlying: toAddress(accounts.vaultUnderlying),
      tokenProgram: toAddress(accounts.tokenProgram),
      systemProgram: toAddress(systemProgram),
      underlyingMintArg: toAddress(args.underlyingMint),
      shareMintArg: toAddress(args.shareMint),
    } as Parameters<typeof getCreateVaultInstruction>[0]);
    return toWeb3Instruction(instruction, [
      { pubkey: accounts.payer, isSigner: true, isWritable: true },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.underlyingMint, isSigner: false, isWritable: false },
      { pubkey: accounts.shareMint, isSigner: false, isWritable: true },
      { pubkey: accounts.vaultUnderlying, isSigner: false, isWritable: true },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
      { pubkey: systemProgram, isSigner: false, isWritable: false }
    ]);
  },

  deposit(args: {
  amount: bigint;
}, accounts: {
  user: PublicKey;
  vault: PublicKey;
  vaultAuthority: PublicKey;
  userUnderlying: PublicKey;
  vaultUnderlying: PublicKey;
  shareMint: PublicKey;
  userShares: PublicKey;
  tokenProgram: PublicKey;
}): TransactionInstruction {
    
    const instruction = getDepositInstruction({
      user: toAddress(accounts.user),
      vault: toAddress(accounts.vault),
      vaultAuthority: toAddress(accounts.vaultAuthority),
      userUnderlying: toAddress(accounts.userUnderlying),
      vaultUnderlying: toAddress(accounts.vaultUnderlying),
      shareMint: toAddress(accounts.shareMint),
      userShares: toAddress(accounts.userShares),
      tokenProgram: toAddress(accounts.tokenProgram),
      amount: args.amount,
    } as Parameters<typeof getDepositInstruction>[0]);
    return toWeb3Instruction(instruction, [
      { pubkey: accounts.user, isSigner: true, isWritable: false },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.userUnderlying, isSigner: false, isWritable: true },
      { pubkey: accounts.vaultUnderlying, isSigner: false, isWritable: true },
      { pubkey: accounts.shareMint, isSigner: false, isWritable: true },
      { pubkey: accounts.userShares, isSigner: false, isWritable: true },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false }
    ]);
  },

  withdraw(args: {
  shares: bigint;
}, accounts: {
  user: PublicKey;
  vault: PublicKey;
  vaultAuthority: PublicKey;
  userShares: PublicKey;
  shareMint: PublicKey;
  userUnderlying: PublicKey;
  vaultUnderlying: PublicKey;
  tokenProgram: PublicKey;
}): TransactionInstruction {
    
    const instruction = getWithdrawInstruction({
      user: toAddress(accounts.user),
      vault: toAddress(accounts.vault),
      vaultAuthority: toAddress(accounts.vaultAuthority),
      userShares: toAddress(accounts.userShares),
      shareMint: toAddress(accounts.shareMint),
      userUnderlying: toAddress(accounts.userUnderlying),
      vaultUnderlying: toAddress(accounts.vaultUnderlying),
      tokenProgram: toAddress(accounts.tokenProgram),
      shares: args.shares,
    } as Parameters<typeof getWithdrawInstruction>[0]);
    return toWeb3Instruction(instruction, [
      { pubkey: accounts.user, isSigner: true, isWritable: false },
      { pubkey: accounts.vault, isSigner: false, isWritable: true },
      { pubkey: accounts.vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: accounts.userShares, isSigner: false, isWritable: true },
      { pubkey: accounts.shareMint, isSigner: false, isWritable: true },
      { pubkey: accounts.userUnderlying, isSigner: false, isWritable: true },
      { pubkey: accounts.vaultUnderlying, isSigner: false, isWritable: true },
      { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false }
    ]);
  },
  },
};

export function vaultSummary(state: VaultState) {
  const exchangeRate = state.totalShares === 0n
    ? 1
    : Number(state.totalDeposits) / Number(state.totalShares);
  return {
    underlyingMint: state.underlyingMint,
    shareMint: state.shareMint,
    totalDeposits: state.totalDeposits,
    totalShares: state.totalShares,
    exchangeRate,
  };
}

export function deriveVaultPda(underlyingMint: PublicKey, programId: PublicKey = VaultClient.programId): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([
    Buffer.from('vault'),
    underlyingMint.toBuffer(),
  ], programId);
}

export function deriveVaultAuthorityPda(vault: PublicKey, programId: PublicKey = VaultClient.programId): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([
    Buffer.from('authority'),
    vault.toBuffer(),
  ], programId);
}
