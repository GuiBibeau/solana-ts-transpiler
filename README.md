# solana-ts-transpiler

A DSL (not a library) for defining Solana programs in TypeScript. The compiler transpiles your definitions into optimized Pinocchio Rust code and type-safe TypeScript clients.

> **R&D Project** — This is experimental. The DSL and generated output may change.

## How It Works

You write program definitions using the DSL → The compiler produces IR → Generators output Rust and TypeScript.

```
vault.ts  →  compiler  →  IR  →  gen-pinocchio  →  Rust program
                              →  gen-client     →  TypeScript client
```

## Examples

- `examples/vault/vault.ts` — Simple vault with deposits and share minting.
- `examples/amm/amm.ts` — Simple constant product AMM with swaps and LP shares.

### Define an Account

```typescript
import { account, pda, pubkey, u64, u8, arg } from '@solana-ts-transpiler/sdk';

Vault.accounts.vault = account({
  name: 'VaultState',
  schema: {
    admin: pubkey(),
    totalDeposits: u64(),
    bump: u8(),
  },
  pda: pda(['vault', arg('mint')]),
});
```

### Define an Instruction

```typescript
import { tx, accountMeta, state, expr, arg } from '@solana-ts-transpiler/sdk';

Vault.deposit = tx({
  name: 'deposit',
  args: {
    amount: u64(),
  },
  accounts: [
    accountMeta('user', { signer: true }),
    accountMeta('vault', { writable: true }),
  ],
  ops: [
    state.update('vault', {
      totalDeposits: expr.add(field('vault', 'totalDeposits'), expr.arg('amount')),
    }),
  ],
});
```

### Token Operations

```typescript
ops: [
  token.transfer({
    from: 'userToken',
    to: 'vaultToken',
    authority: 'user',
    amount: expr.arg('amount'),
  }),
  token.mintTo({
    mint: 'shareMint',
    to: 'userShares',
    authority: 'vaultAuthority',
    amount: sharesToMint,
  }),
]
```

### Expressions

```typescript
// Conditional logic
const shares = expr.if(
  expr.eq(field('vault', 'totalShares'), expr.const(0)),
  expr.arg('amount'),
  expr.div(
    expr.mul(expr.arg('amount'), field('vault', 'totalShares')),
    field('vault', 'totalDeposits'),
  ),
);
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/sdk` | DSL primitives (`account`, `tx`, `expr`, etc.) |
| `packages/compiler` | Parses TS definitions → IR |
| `packages/gen-pinocchio` | IR → Pinocchio Rust |
| `packages/gen-client` | IR → Codama-based TypeScript client |

## Usage

```bash
bun install
bun run generate        # Build IR + generate Rust + TS client
bun run build:program   # Compile Rust to SBF
bun run test:mollusk    # Run Mollusk tests
bun run dev:app         # Start demo app
```

## Project Structure

```
examples/vault/
  vault.ts              # Program definition (DSL)
  vault-pinocchio/      # Generated Rust program
  client/               # Generated TypeScript client
  app/                  # Demo frontend
```
