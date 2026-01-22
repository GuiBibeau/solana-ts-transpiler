import {
  account,
  accountMeta,
  accountRef,
  arg,
  ata,
  bump,
  expr,
  field,
  mint,
  pda,
  program,
  programAccount,
  pubkey,
  state,
  token,
  tx,
  u64,
  u8,
  view,
} from '@solana-ts-transpiler/sdk';

export const Vault = program({
  name: 'Vault',
  programId: 'GTcXWNZ8Ytmkcgzfr3V1R9X3tHxo7hC49DUh7ggMzvCV',
});

Vault.accounts.vault = account({
  name: 'VaultState',
  schema: {
    admin: pubkey(),
    underlyingMint: pubkey(),
    shareMint: pubkey(),
    totalDeposits: u64(),
    totalShares: u64(),
    bump: u8(),
  },
  pda: pda(['vault', arg('underlyingMint')]),
});

Vault.createVault = tx({
  name: 'createVault',
  args: {
    underlyingMint: pubkey(),
    shareMint: pubkey(),
  },
  accounts: [
    accountMeta('payer', { signer: true, writable: true }),
    accountMeta('vault', {
      writable: true,
      pda: pda(['vault', arg('underlyingMint')]),
    }),
    accountMeta('vaultAuthority', {
      pda: pda(['authority', accountRef('vault')]),
    }),
    mint('underlyingMint', arg('underlyingMint')),
    mint('shareMint', arg('shareMint'), { writable: true }),
    ata('vaultUnderlying', accountRef('vaultAuthority'), arg('underlyingMint'), {
      writable: true,
    }),
    programAccount('tokenProgram'),
  ],
  ops: [
    state.init('vault', {
      admin: accountRef('payer'),
      underlyingMint: arg('underlyingMint'),
      shareMint: arg('shareMint'),
      totalDeposits: expr.const(0),
      totalShares: expr.const(0),
      bump: bump('vault'),
    }),
  ],
});

const sharesToMint = expr.if(
  expr.eq(field('vault', 'totalShares'), expr.const(0)),
  expr.arg('amount'),
  expr.div(
    expr.mul(expr.arg('amount'), field('vault', 'totalShares')),
    field('vault', 'totalDeposits'),
  ),
);

Vault.deposit = tx({
  name: 'deposit',
  args: {
    amount: u64(),
  },
  accounts: [
    accountMeta('user', { signer: true }),
    accountMeta('vault', { writable: true }),
    accountMeta('vaultAuthority', {
      pda: pda(['authority', accountRef('vault')]),
    }),
    ata('userUnderlying', accountRef('user'), field('vault', 'underlyingMint'), {
      writable: true,
    }),
    ata(
      'vaultUnderlying',
      accountRef('vaultAuthority'),
      field('vault', 'underlyingMint'),
      { writable: true },
    ),
    mint('shareMint', field('vault', 'shareMint'), { writable: true }),
    ata('userShares', accountRef('user'), field('vault', 'shareMint'), {
      writable: true,
    }),
    programAccount('tokenProgram'),
  ],
  ops: [
    token.transfer({
      from: 'userUnderlying',
      to: 'vaultUnderlying',
      authority: 'user',
      amount: expr.arg('amount'),
      program: 'tokenProgram',
    }),
    token.mintTo({
      mint: 'shareMint',
      to: 'userShares',
      authority: 'vaultAuthority',
      signer: 'vaultAuthority',
      amount: sharesToMint,
      program: 'tokenProgram',
    }),
    state.update('vault', {
      totalDeposits: expr.add(field('vault', 'totalDeposits'), expr.arg('amount')),
      totalShares: expr.add(field('vault', 'totalShares'), sharesToMint),
    }),
  ],
});

const underlyingToReturn = expr.div(
  expr.mul(expr.arg('shares'), field('vault', 'totalDeposits')),
  field('vault', 'totalShares'),
);

Vault.withdraw = tx({
  name: 'withdraw',
  args: {
    shares: u64(),
  },
  accounts: [
    accountMeta('user', { signer: true }),
    accountMeta('vault', { writable: true }),
    accountMeta('vaultAuthority', {
      pda: pda(['authority', accountRef('vault')]),
    }),
    ata('userShares', accountRef('user'), field('vault', 'shareMint'), {
      writable: true,
    }),
    mint('shareMint', field('vault', 'shareMint'), { writable: true }),
    ata('userUnderlying', accountRef('user'), field('vault', 'underlyingMint'), {
      writable: true,
    }),
    ata(
      'vaultUnderlying',
      accountRef('vaultAuthority'),
      field('vault', 'underlyingMint'),
      { writable: true },
    ),
    programAccount('tokenProgram'),
  ],
  ops: [
    token.burn({
      mint: 'shareMint',
      from: 'userShares',
      authority: 'user',
      amount: expr.arg('shares'),
      program: 'tokenProgram',
    }),
    token.transfer({
      from: 'vaultUnderlying',
      to: 'userUnderlying',
      authority: 'vaultAuthority',
      signer: 'vaultAuthority',
      amount: underlyingToReturn,
      program: 'tokenProgram',
    }),
    state.update('vault', {
      totalDeposits: expr.sub(field('vault', 'totalDeposits'), underlyingToReturn),
      totalShares: expr.sub(field('vault', 'totalShares'), expr.arg('shares')),
    }),
  ],
});

Vault.vaultSummary = view({
  name: 'vaultSummary',
  args: {
    vault: pubkey(),
  },
  returns: {
    underlyingMint: pubkey(),
    shareMint: pubkey(),
    totalDeposits: u64(),
    totalShares: u64(),
    exchangeRate: 'ratio',
  },
});
