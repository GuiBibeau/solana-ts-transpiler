import { promises as fs } from 'node:fs';
import path from 'node:path';
import renderVisitor from '@codama/renderers-js';
import {
  accountNode,
  accountValueNode,
  argumentValueNode,
  camelCase,
  constantDiscriminatorNode,
  constantPdaSeedNode,
  constantValueNode,
  createFromRoot,
  instructionAccountNode,
  instructionArgumentNode,
  instructionNode,
  numberTypeNode,
  numberValueNode,
  pascalCase,
  pdaLinkNode,
  pdaNode,
  pdaSeedValueNode,
  pdaValueNode,
  programNode,
  publicKeyTypeNode,
  rootNode,
  snakeCase,
  stringTypeNode,
  stringValueNode,
  structFieldTypeNode,
  structTypeNode,
  variablePdaSeedNode,
} from 'codama';

const [,, irPath, outDir] = process.argv;

if (!irPath || !outDir) {
  throw new Error('Usage: gen-client <ir.json> <outDir>');
}

type IrType = { kind: string; [key: string]: unknown };
type IrAccount = { name: string; schema: Record<string, IrType>; pda?: { seeds: Array<any> } };
type IrInstruction = {
  name: string;
  args: Record<string, IrType>;
  accounts: Array<{ name: string; signer?: boolean; writable?: boolean; pda?: { seeds: Array<any> } }>;
  discriminator: number;
};

const irRaw = await fs.readFile(irPath, 'utf8');
const ir = JSON.parse(irRaw) as {
  name: string;
  programId: string;
  accounts: Record<string, IrAccount>;
  instructions: IrInstruction[];
};

const programName = ir.name;
const programId = ir.programId;
const accounts = ir.accounts ?? {};
const instructions = ir.instructions ?? [];

const toTypeNode = (type: IrType) => {
  switch (type.kind) {
    case 'u64':
      return numberTypeNode('u64');
    case 'u8':
      return numberTypeNode('u8');
    case 'pubkey':
      return publicKeyTypeNode();
    default:
      throw new Error(`Unsupported type kind: ${type.kind}`);
  }
};

const typeSize = (type: IrType) => {
  switch (type.kind) {
    case 'u64':
      return 8;
    case 'u8':
      return 1;
    case 'pubkey':
      return 32;
    default:
      return 0;
  }
};

const discriminatorArgName = 'instructionDiscriminator';

const pdaDefinitions = new Map<string, { seeds: Array<any> }>();

const addPdaDefinition = (name: string, pda?: { seeds: Array<any> }) => {
  if (!pda) return;
  const existing = pdaDefinitions.get(name);
  if (existing) {
    const existingJson = JSON.stringify(existing.seeds);
    const nextJson = JSON.stringify(pda.seeds);
    if (existingJson !== nextJson) {
      throw new Error(`Conflicting PDA definition for ${name}.`);
    }
    return;
  }
  pdaDefinitions.set(name, pda);
};

for (const [accountKey, account] of Object.entries(accounts)) {
  addPdaDefinition(accountKey, account.pda);
}

for (const ix of instructions) {
  for (const meta of ix.accounts) {
    addPdaDefinition(meta.name, meta.pda);
  }
}

const toPdaSeedNode = (seed: any) => {
  if (typeof seed === 'string') {
    return constantPdaSeedNode(stringTypeNode('utf8'), stringValueNode(seed));
  }
  if (seed && (seed.kind === 'arg' || seed.kind === 'account' || seed.kind === 'field')) {
    const name = seed.name ?? seed.account;
    if (typeof name !== 'string') {
      throw new Error(`Unsupported PDA seed name: ${JSON.stringify(seed)}`);
    }
    return variablePdaSeedNode(name, publicKeyTypeNode());
  }
  throw new Error(`Unsupported PDA seed: ${JSON.stringify(seed)}`);
};

const pdaNodes = [...pdaDefinitions.entries()].map(([name, pda]) =>
  pdaNode({
    name,
    seeds: pda.seeds.map(toPdaSeedNode),
  }),
);

const accountNodes = Object.entries(accounts).map(([accountKey, account]) => {
  const accountName = camelCase(account.name ?? accountKey);
  const fields = Object.entries(account.schema ?? {}).map(([name, type]) =>
    structFieldTypeNode({
      name,
      type: toTypeNode(type),
    }),
  );
  const size = Object.values(account.schema ?? {}).reduce((sum, type) => sum + typeSize(type), 0);
  return accountNode({
    name: accountName,
    data: structTypeNode(fields),
    size,
    ...(account.pda ? { pda: pdaLinkNode(accountKey) } : {}),
  });
});

const buildPdaDefaultValue = (meta: IrInstruction['accounts'][number], ix: IrInstruction) => {
  if (!meta.pda) return undefined;
  const seeds = [];
  for (const seed of meta.pda.seeds) {
    if (typeof seed === 'string') continue;
    if (seed.kind === 'arg') {
      if (!ix.args || !(seed.name in ix.args)) return undefined;
      seeds.push(pdaSeedValueNode(seed.name, argumentValueNode(seed.name)));
      continue;
    }
    if (seed.kind === 'account') {
      if (!ix.accounts.some((account) => account.name === seed.name)) return undefined;
      seeds.push(pdaSeedValueNode(seed.name, accountValueNode(seed.name)));
      continue;
    }
    return undefined;
  }
  return pdaValueNode(meta.name, seeds);
};

const instructionNodes = instructions.map((ix) => {
  if (ix.args && ix.args[discriminatorArgName]) {
    throw new Error(`Instruction ${ix.name} already defines ${discriminatorArgName}.`);
  }

  const discriminatorNode = constantDiscriminatorNode(
    constantValueNode(numberTypeNode('u8'), numberValueNode(Number(ix.discriminator))),
  );

  const discriminatorArg = instructionArgumentNode({
    name: discriminatorArgName,
    type: numberTypeNode('u8'),
    defaultValue: numberValueNode(Number(ix.discriminator)),
    defaultValueStrategy: 'omitted',
  });

  const argNodes = [
    discriminatorArg,
    ...Object.entries(ix.args ?? {}).map(([name, type]) =>
      instructionArgumentNode({
        name,
        type: toTypeNode(type),
      }),
    ),
  ];

  const accountNodesForIx = ix.accounts.map((meta) => {
    const defaultValue = buildPdaDefaultValue(meta, ix);
    return instructionAccountNode({
      name: meta.name,
      isSigner: Boolean(meta.signer),
      isWritable: Boolean(meta.writable),
      ...(defaultValue ? { defaultValue } : {}),
    });
  });

  return instructionNode({
    name: ix.name,
    accounts: accountNodesForIx,
    arguments: argNodes,
    discriminators: [discriminatorNode],
  });
});

const program = programNode({
  name: programName,
  publicKey: programId,
  version: '0.1.0',
  accounts: accountNodes,
  instructions: instructionNodes,
  definedTypes: [],
  pdas: pdaNodes,
  errors: [],
});

const codama = createFromRoot(rootNode(program));

const idlDir = path.resolve(path.dirname(irPath), '..', 'idl');
const idlPath = path.join(idlDir, `${programName.toLowerCase()}.codama.json`);
await fs.mkdir(idlDir, { recursive: true });
await fs.writeFile(idlPath, codama.getJson(), 'utf8');

const generatedDir = path.join(outDir, 'src', 'generated');
await codama.accept(
  renderVisitor(generatedDir, {
    deleteFolderBeforeRendering: true,
    syncPackageJson: true,
    packageFolder: outDir,
    useGranularImports: false,
  }),
);

const tsType = (type: IrType) => {
  switch (type.kind) {
    case 'u64':
      return 'bigint';
    case 'u8':
      return 'number';
    case 'pubkey':
      return 'PublicKey';
    default:
      return 'unknown';
  }
};

const renderArgsType = (ixName: string, args: Record<string, IrType>) => {
  const fields = Object.entries(args)
    .map(([name, type]) => `  ${name}: ${tsType(type)};`)
    .join('\n');
  return `{
${fields}
}`;
};

const renderAccountsType = (_ixName: string, accountsList: IrInstruction['accounts']) => {
  const fields = accountsList
    .map((meta) => {
      const optional = meta.name === 'systemProgram' ? '?' : '';
      return `  ${meta.name}${optional}: PublicKey;`;
    })
    .join('\n');
  return `{
${fields}
}`;
};

const renderIxBuilder = (ix: IrInstruction) => {
  const args = ix.args ?? {};
  const argsList = Object.entries(args);
  const accountNames = ix.accounts.map((meta) => camelCase(meta.name));
  const usesSystemProgram = ix.accounts.some((meta) => meta.name === 'systemProgram');
  const argInputName = (name: string) => {
    const camelName = camelCase(name);
    return accountNames.includes(camelName) ? `${camelName}Arg` : camelName;
  };
  const instructionFn = `get${pascalCase(ix.name)}Instruction`;
  const resolveAccount = (meta: IrInstruction['accounts'][number]) =>
    meta.name === 'systemProgram' ? 'systemProgram' : `accounts.${meta.name}`;

  const inputLines = [
    ...ix.accounts.map((meta) => `      ${meta.name}: toAddress(${resolveAccount(meta)}),`),
    ...argsList.map(([name, type]) => {
      const key = argInputName(name);
      const value = type.kind === 'pubkey' ? `toAddress(args.${name})` : `args.${name}`;
      return `      ${key}: ${value},`;
    }),
  ];

  const keys = ix.accounts
    .map((meta) => {
      const flags = `isSigner: ${Boolean(meta.signer)}, isWritable: ${Boolean(meta.writable)}`;
      return `      { pubkey: ${resolveAccount(meta)}, ${flags} }`;
    })
    .join(',\n');

  return `  ${ix.name}(args: ${renderArgsType(ix.name, args)}, accounts: ${renderAccountsType(ix.name, ix.accounts)}): TransactionInstruction {
    ${usesSystemProgram ? 'const systemProgram = accounts.systemProgram ?? SystemProgram.programId;' : ''}
    const instruction = ${instructionFn}({
${inputLines.join('\n')}
    } as unknown as Parameters<typeof ${instructionFn}>[0]);
    return toWeb3Instruction(instruction, [
${keys}
    ]);
  },`;
};

const ixBuilders = instructions.map(renderIxBuilder).join('\n\n');
const programAddressConstant = `${snakeCase(programName).toUpperCase()}_PROGRAM_ADDRESS`;
const usesSystemProgram = instructions.some((ix) =>
  ix.accounts.some((meta) => meta.name === 'systemProgram'),
);
const web3Imports = usesSystemProgram
  ? 'PublicKey, TransactionInstruction, SystemProgram'
  : 'PublicKey, TransactionInstruction';

const clientSource = `// AUTO-GENERATED - DO NOT EDIT
export * from './generated';

import { Buffer } from 'buffer';
import { ${web3Imports} } from '@solana/web3.js';
import type { Instruction } from '@solana/kit';
import {
  ${programAddressConstant},
  ${instructions.map((ix) => `get${pascalCase(ix.name)}Instruction`).join(',\n  ')},
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
  programId: new PublicKey(${programAddressConstant}),
  ix: {
${ixBuilders}
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
`;

await fs.mkdir(path.join(outDir, 'src'), { recursive: true });
await fs.writeFile(path.join(outDir, 'src', 'index.ts'), clientSource, 'utf8');
console.log(`Codama IDL written to ${idlPath}`);
console.log(`Client written to ${path.join(outDir, 'src', 'index.ts')}`);
