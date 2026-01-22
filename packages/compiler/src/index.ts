import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IxDef, ProgramDef, ViewDef } from '@solana-ts-transpiler/sdk';

export type IrInstruction = IxDef & { discriminator: number };
export type IrProgram = {
  name: string;
  programId: string;
  accounts: ProgramDef['accounts'];
  instructions: IrInstruction[];
  views: ViewDef[];
};

export const loadProgramFromModule = async (inputPath: string): Promise<ProgramDef> => {
  const inputUrl = pathToFileURL(path.resolve(inputPath)).href;
  const mod = await import(inputUrl);

  const program = Object.values(mod).find(
    (value): value is ProgramDef =>
      typeof value === 'object' && value !== null && (value as ProgramDef).__kind === 'program',
  );

  if (!program) {
    throw new Error('No program export found in input module.');
  }

  return program;
};

export const buildIr = (program: ProgramDef): IrProgram => {
  const instructions: IrInstruction[] = [];
  const views: ViewDef[] = [];

  const withInitAccounts = (ix: IxDef): IxDef => {
    const needsSystemProgram = ix.ops.some((op) => op.op === 'state.init');
    if (!needsSystemProgram) return ix;
    const hasSystemProgram = ix.accounts.some((meta) => meta.name === 'systemProgram');
    if (hasSystemProgram) return ix;
    return {
      ...ix,
      accounts: [
        ...ix.accounts,
        {
          name: 'systemProgram',
          kind: 'program',
        },
      ],
    };
  };

  for (const [key, value] of Object.entries(program)) {
    if (value && typeof value === 'object' && '__kind' in value) {
      if ((value as IxDef).__kind === 'tx') {
        const ix = value as IxDef;
        const normalizedIx = withInitAccounts(ix);
        instructions.push({ ...normalizedIx, name: normalizedIx.name ?? key, discriminator: 0 });
      }
      if ((value as ViewDef).__kind === 'view') {
        const v = value as ViewDef;
        views.push({ ...v, name: v.name ?? key });
      }
    }
  }

  instructions.forEach((ix, index) => {
    ix.discriminator = index;
  });

  return {
    name: program.name,
    programId: program.programId,
    accounts: program.accounts,
    instructions,
    views,
  };
};

export const serializeIr = (ir: IrProgram): string =>
  JSON.stringify(
    ir,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  );

export const compileToFile = async (inputPath: string, outputPath: string): Promise<IrProgram> => {
  const program = await loadProgramFromModule(inputPath);
  const ir = buildIr(program);
  const json = serializeIr(ir);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, json, 'utf8');

  return ir;
};
