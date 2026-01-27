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

export const Amm = program({
  name: 'Amm',
  programId: '4mm1hQK4R7c1yD4g8MsjvKZxQxJ7f5WmB1a2c3d4e5f6',
});

Amm.accounts.pool = account({
  name: 'PoolState',
  schema: {
    admin: pubkey(),
    tokenMintA: pubkey(),
    tokenMintB: pubkey(),
    lpMint: pubkey(),
    reserveA: u64(),
    reserveB: u64(),
    totalLp: u64(),
    bump: u8(),
  },
  pda: pda(['pool', arg('tokenMintA'), arg('tokenMintB')]),
});

Amm.createPool = tx({
  name: 'createPool',
  args: {
    tokenMintA: pubkey(),
    tokenMintB: pubkey(),
    lpMint: pubkey(),
  },
  accounts: [
    accountMeta('payer', { signer: true, writable: true }),
    accountMeta('pool', {
      writable: true,
      pda: pda(['pool', arg('tokenMintA'), arg('tokenMintB')]),
    }),
    accountMeta('poolAuthority', {
      pda: pda(['authority', accountRef('pool')]),
    }),
    mint('tokenMintA', arg('tokenMintA')),
    mint('tokenMintB', arg('tokenMintB')),
    mint('lpMint', arg('lpMint'), { writable: true }),
    ata('vaultA', accountRef('poolAuthority'), arg('tokenMintA'), { writable: true }),
    ata('vaultB', accountRef('poolAuthority'), arg('tokenMintB'), { writable: true }),
    programAccount('tokenProgram'),
  ],
  ops: [
    state.init('pool', {
      admin: accountRef('payer'),
      tokenMintA: arg('tokenMintA'),
      tokenMintB: arg('tokenMintB'),
      lpMint: arg('lpMint'),
      reserveA: expr.const(0),
      reserveB: expr.const(0),
      totalLp: expr.const(0),
      bump: bump('pool'),
    }),
  ],
});

const lpToMint = expr.if(
  expr.eq(field('pool', 'totalLp'), expr.const(0)),
  expr.arg('amountA'),
  expr.div(
    expr.mul(expr.arg('amountA'), field('pool', 'totalLp')),
    field('pool', 'reserveA'),
  ),
);

Amm.addLiquidity = tx({
  name: 'addLiquidity',
  args: {
    amountA: u64(),
    amountB: u64(),
  },
  accounts: [
    accountMeta('user', { signer: true }),
    accountMeta('pool', { writable: true }),
    accountMeta('poolAuthority', {
      pda: pda(['authority', accountRef('pool')]),
    }),
    ata('userA', accountRef('user'), field('pool', 'tokenMintA'), { writable: true }),
    ata('userB', accountRef('user'), field('pool', 'tokenMintB'), { writable: true }),
    ata('vaultA', accountRef('poolAuthority'), field('pool', 'tokenMintA'), { writable: true }),
    ata('vaultB', accountRef('poolAuthority'), field('pool', 'tokenMintB'), { writable: true }),
    mint('lpMint', field('pool', 'lpMint'), { writable: true }),
    ata('userLp', accountRef('user'), field('pool', 'lpMint'), { writable: true }),
    programAccount('tokenProgram'),
  ],
  ops: [
    token.transfer({
      from: 'userA',
      to: 'vaultA',
      authority: 'user',
      amount: expr.arg('amountA'),
      program: 'tokenProgram',
    }),
    token.transfer({
      from: 'userB',
      to: 'vaultB',
      authority: 'user',
      amount: expr.arg('amountB'),
      program: 'tokenProgram',
    }),
    token.mintTo({
      mint: 'lpMint',
      to: 'userLp',
      authority: 'poolAuthority',
      signer: 'poolAuthority',
      amount: lpToMint,
      program: 'tokenProgram',
    }),
    state.update('pool', {
      reserveA: expr.add(field('pool', 'reserveA'), expr.arg('amountA')),
      reserveB: expr.add(field('pool', 'reserveB'), expr.arg('amountB')),
      totalLp: expr.add(field('pool', 'totalLp'), lpToMint),
    }),
  ],
});

const amountAOut = expr.div(
  expr.mul(expr.arg('lpAmount'), field('pool', 'reserveA')),
  field('pool', 'totalLp'),
);

const amountBOut = expr.div(
  expr.mul(expr.arg('lpAmount'), field('pool', 'reserveB')),
  field('pool', 'totalLp'),
);

Amm.removeLiquidity = tx({
  name: 'removeLiquidity',
  args: {
    lpAmount: u64(),
  },
  accounts: [
    accountMeta('user', { signer: true }),
    accountMeta('pool', { writable: true }),
    accountMeta('poolAuthority', {
      pda: pda(['authority', accountRef('pool')]),
    }),
    ata('userLp', accountRef('user'), field('pool', 'lpMint'), { writable: true }),
    mint('lpMint', field('pool', 'lpMint'), { writable: true }),
    ata('userA', accountRef('user'), field('pool', 'tokenMintA'), { writable: true }),
    ata('userB', accountRef('user'), field('pool', 'tokenMintB'), { writable: true }),
    ata('vaultA', accountRef('poolAuthority'), field('pool', 'tokenMintA'), { writable: true }),
    ata('vaultB', accountRef('poolAuthority'), field('pool', 'tokenMintB'), { writable: true }),
    programAccount('tokenProgram'),
  ],
  ops: [
    token.burn({
      mint: 'lpMint',
      from: 'userLp',
      authority: 'user',
      amount: expr.arg('lpAmount'),
      program: 'tokenProgram',
    }),
    token.transfer({
      from: 'vaultA',
      to: 'userA',
      authority: 'poolAuthority',
      signer: 'poolAuthority',
      amount: amountAOut,
      program: 'tokenProgram',
    }),
    token.transfer({
      from: 'vaultB',
      to: 'userB',
      authority: 'poolAuthority',
      signer: 'poolAuthority',
      amount: amountBOut,
      program: 'tokenProgram',
    }),
    state.update('pool', {
      reserveA: expr.sub(field('pool', 'reserveA'), amountAOut),
      reserveB: expr.sub(field('pool', 'reserveB'), amountBOut),
      totalLp: expr.sub(field('pool', 'totalLp'), expr.arg('lpAmount')),
    }),
  ],
});

const swapAOut = expr.div(
  expr.mul(expr.arg('amountIn'), field('pool', 'reserveB')),
  expr.add(field('pool', 'reserveA'), expr.arg('amountIn')),
);

Amm.swapAForB = tx({
  name: 'swapAForB',
  args: {
    amountIn: u64(),
  },
  accounts: [
    accountMeta('user', { signer: true }),
    accountMeta('pool', { writable: true }),
    accountMeta('poolAuthority', {
      pda: pda(['authority', accountRef('pool')]),
    }),
    ata('userA', accountRef('user'), field('pool', 'tokenMintA'), { writable: true }),
    ata('userB', accountRef('user'), field('pool', 'tokenMintB'), { writable: true }),
    ata('vaultA', accountRef('poolAuthority'), field('pool', 'tokenMintA'), { writable: true }),
    ata('vaultB', accountRef('poolAuthority'), field('pool', 'tokenMintB'), { writable: true }),
    programAccount('tokenProgram'),
  ],
  ops: [
    token.transfer({
      from: 'userA',
      to: 'vaultA',
      authority: 'user',
      amount: expr.arg('amountIn'),
      program: 'tokenProgram',
    }),
    token.transfer({
      from: 'vaultB',
      to: 'userB',
      authority: 'poolAuthority',
      signer: 'poolAuthority',
      amount: swapAOut,
      program: 'tokenProgram',
    }),
    state.update('pool', {
      reserveA: expr.add(field('pool', 'reserveA'), expr.arg('amountIn')),
      reserveB: expr.sub(field('pool', 'reserveB'), swapAOut),
    }),
  ],
});

const swapBOut = expr.div(
  expr.mul(expr.arg('amountIn'), field('pool', 'reserveA')),
  expr.add(field('pool', 'reserveB'), expr.arg('amountIn')),
);

Amm.swapBForA = tx({
  name: 'swapBForA',
  args: {
    amountIn: u64(),
  },
  accounts: [
    accountMeta('user', { signer: true }),
    accountMeta('pool', { writable: true }),
    accountMeta('poolAuthority', {
      pda: pda(['authority', accountRef('pool')]),
    }),
    ata('userA', accountRef('user'), field('pool', 'tokenMintA'), { writable: true }),
    ata('userB', accountRef('user'), field('pool', 'tokenMintB'), { writable: true }),
    ata('vaultA', accountRef('poolAuthority'), field('pool', 'tokenMintA'), { writable: true }),
    ata('vaultB', accountRef('poolAuthority'), field('pool', 'tokenMintB'), { writable: true }),
    programAccount('tokenProgram'),
  ],
  ops: [
    token.transfer({
      from: 'userB',
      to: 'vaultB',
      authority: 'user',
      amount: expr.arg('amountIn'),
      program: 'tokenProgram',
    }),
    token.transfer({
      from: 'vaultA',
      to: 'userA',
      authority: 'poolAuthority',
      signer: 'poolAuthority',
      amount: swapBOut,
      program: 'tokenProgram',
    }),
    state.update('pool', {
      reserveA: expr.sub(field('pool', 'reserveA'), swapBOut),
      reserveB: expr.add(field('pool', 'reserveB'), expr.arg('amountIn')),
    }),
  ],
});

Amm.poolSummary = view({
  name: 'poolSummary',
  args: {
    pool: pubkey(),
  },
  returns: {
    tokenMintA: pubkey(),
    tokenMintB: pubkey(),
    lpMint: pubkey(),
    reserveA: u64(),
    reserveB: u64(),
    totalLp: u64(),
    priceAInB: 'ratio',
    priceBInA: 'ratio',
  },
});
