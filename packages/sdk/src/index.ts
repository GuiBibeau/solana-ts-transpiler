export type ScalarType =
  | { kind: 'u64' }
  | { kind: 'u8' }
  | { kind: 'pubkey' };

export type Schema = Record<string, ScalarType>;

export type ArgRef = { kind: 'arg'; name: string };
export type FieldRef = { kind: 'field'; account: string; name: string };
export type AccountRef = { kind: 'account'; name: string };
export type BumpRef = { kind: 'bump'; account: string };

export type Seed = string | ArgRef | FieldRef | AccountRef;
export type Pda = { kind: 'pda'; seeds: Seed[] };

export type Expr =
  | { kind: 'const'; value: bigint }
  | ArgRef
  | FieldRef
  | { kind: 'add' | 'sub' | 'mul' | 'div' | 'eq'; left: Expr; right: Expr }
  | { kind: 'if'; cond: Expr; then: Expr; else: Expr };

export type AccountDef = {
  __kind: 'account';
  name: string;
  schema: Schema;
  pda?: Pda;
};

export type AccountMeta = {
  name: string;
  signer?: boolean;
  writable?: boolean;
  kind?: 'account' | 'mint' | 'ata' | 'program';
  address?: ArgRef | FieldRef | AccountRef;
  pda?: Pda;
  owner?: ArgRef | FieldRef | AccountRef;
  mint?: ArgRef | FieldRef | AccountRef;
};

export type TokenTransferOp = {
  op: 'token.transfer';
  from: string;
  to: string;
  authority: string;
  amount: Expr;
  program?: string;
  signer?: string;
};

export type TokenMintToOp = {
  op: 'token.mintTo';
  mint: string;
  to: string;
  authority: string;
  amount: Expr;
  program?: string;
  signer?: string;
};

export type TokenBurnOp = {
  op: 'token.burn';
  mint: string;
  from: string;
  authority: string;
  amount: Expr;
  program?: string;
};

export type StateInitOp = {
  op: 'state.init';
  account: string;
  fields: Record<string, Expr | ArgRef | FieldRef | AccountRef | BumpRef>;
};

export type StateUpdateOp = {
  op: 'state.update';
  account: string;
  fields: Record<string, Expr>;
};

export type EventOp = {
  op: 'event';
  name: string;
  data: Record<string, Expr | ArgRef | FieldRef | AccountRef>;
};

export type Op =
  | TokenTransferOp
  | TokenMintToOp
  | TokenBurnOp
  | StateInitOp
  | StateUpdateOp
  | EventOp;

export type IxDef = {
  __kind: 'tx';
  name: string;
  args: Record<string, ScalarType>;
  accounts: AccountMeta[];
  ops: Op[];
};

export type ViewDef = {
  __kind: 'view';
  name: string;
  args: Record<string, ScalarType>;
  returns: Record<string, ScalarType | 'ratio'>;
};

export type ProgramDef = {
  __kind: 'program';
  name: string;
  programId: string;
  accounts: Record<string, AccountDef>;
  [key: string]: unknown;
};

export const u64 = (): ScalarType => ({ kind: 'u64' });
export const u8 = (): ScalarType => ({ kind: 'u8' });
export const pubkey = (): ScalarType => ({ kind: 'pubkey' });

export const arg = (name: string): ArgRef => ({ kind: 'arg', name });
export const field = (account: string, name: string): FieldRef => ({
  kind: 'field',
  account,
  name,
});
export const accountRef = (name: string): AccountRef => ({
  kind: 'account',
  name,
});
export const bump = (account: string): BumpRef => ({
  kind: 'bump',
  account,
});

export const expr = {
  const: (value: bigint | number): Expr => ({
    kind: 'const',
    value: BigInt(value),
  }),
  arg: (name: string): Expr => arg(name),
  field: (account: string, name: string): Expr => field(account, name),
  add: (left: Expr, right: Expr): Expr => ({ kind: 'add', left, right }),
  sub: (left: Expr, right: Expr): Expr => ({ kind: 'sub', left, right }),
  mul: (left: Expr, right: Expr): Expr => ({ kind: 'mul', left, right }),
  div: (left: Expr, right: Expr): Expr => ({ kind: 'div', left, right }),
  eq: (left: Expr, right: Expr): Expr => ({ kind: 'eq', left, right }),
  if: (cond: Expr, thenExpr: Expr, elseExpr: Expr): Expr => ({
    kind: 'if',
    cond,
    then: thenExpr,
    else: elseExpr,
  }),
};

export const pda = (seeds: Seed[]): Pda => ({ kind: 'pda', seeds });

export const account = (def: {
  name: string;
  schema: Schema;
  pda?: Pda;
}): AccountDef => ({ __kind: 'account', ...def });

export const accountMeta = (name: string, meta: Omit<AccountMeta, 'name'>): AccountMeta => ({
  name,
  ...meta,
});

export const ata = (
  name: string,
  owner: ArgRef | FieldRef | AccountRef,
  mint: ArgRef | FieldRef | AccountRef,
  meta: Omit<AccountMeta, 'name' | 'kind' | 'owner' | 'mint'> = {},
): AccountMeta => ({
  name,
  kind: 'ata',
  owner,
  mint,
  ...meta,
});

export const mint = (
  name: string,
  address: ArgRef | FieldRef | AccountRef,
  meta: Omit<AccountMeta, 'name' | 'kind' | 'address'> = {},
): AccountMeta => ({
  name,
  kind: 'mint',
  address,
  ...meta,
});

export const programAccount = (
  name: string,
  meta: Omit<AccountMeta, 'name' | 'kind'> = {},
): AccountMeta => ({
  name,
  kind: 'program',
  ...meta,
});

export const tx = (def: {
  name: string;
  args: Record<string, ScalarType>;
  accounts: AccountMeta[];
  ops: Op[];
}): IxDef => ({ __kind: 'tx', ...def });

export const view = (def: {
  name: string;
  args: Record<string, ScalarType>;
  returns: Record<string, ScalarType | 'ratio'>;
}): ViewDef => ({ __kind: 'view', ...def });

export const token = {
  transfer: (def: Omit<TokenTransferOp, 'op'>): TokenTransferOp => ({
    op: 'token.transfer',
    ...def,
  }),
  mintTo: (def: Omit<TokenMintToOp, 'op'>): TokenMintToOp => ({
    op: 'token.mintTo',
    ...def,
  }),
  burn: (def: Omit<TokenBurnOp, 'op'>): TokenBurnOp => ({
    op: 'token.burn',
    ...def,
  }),
};

export const state = {
  init: (
    accountName: string,
    fields: Record<string, Expr | ArgRef | FieldRef | AccountRef | BumpRef>,
  ): StateInitOp => ({
    op: 'state.init',
    account: accountName,
    fields,
  }),
  update: (accountName: string, fields: Record<string, Expr>): StateUpdateOp => ({
    op: 'state.update',
    account: accountName,
    fields,
  }),
};

export const program = (def: { name: string; programId: string }): ProgramDef => ({
  __kind: 'program',
  ...def,
  accounts: {},
});
