import { describe, expect, it } from 'bun:test';
import { compileToFile } from '@solana-ts-transpiler/compiler';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dir, '../../..');

const compileExample = async (relativeInput: string, outputName: string) => {
  const inputPath = path.join(repoRoot, relativeInput);
  const outDir = await mkdtemp(path.join(tmpdir(), 'transpiler-ir-'));
  const outputPath = path.join(outDir, outputName);
  const ir = await compileToFile(inputPath, outputPath);
  const json = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;
  return { ir, json, outputPath };
};

const collectConstValues = (node: unknown, values: unknown[] = []): unknown[] => {
  if (!node || typeof node !== 'object') return values;
  if (Array.isArray(node)) {
    for (const item of node) collectConstValues(item, values);
    return values;
  }
  const record = node as Record<string, unknown>;
  if (record.kind === 'const' && 'value' in record) {
    values.push(record.value);
  }
  for (const value of Object.values(record)) {
    collectConstValues(value, values);
  }
  return values;
};

const hasSystemProgram = (ix: { accounts: Array<{ name: string; kind?: string }> }) =>
  ix.accounts.some((meta) => meta.name === 'systemProgram' && meta.kind === 'program');

const runCli = async (inputPath: string, outputPath: string) =>
  await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'packages/compiler/src/cli.ts'), inputPath, outputPath], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`CLI exited with code ${code}\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });


describe('transpiler integration', () => {
  it('compiles the vault example with stable instruction metadata', async () => {
    const { ir, json } = await compileExample('examples/vault/vault.ts', 'vault.json');

    expect(ir.name).toBe('Vault');
    expect(ir.programId).toBe('GTcXWNZ8Ytmkcgzfr3V1R9X3tHxo7hC49DUh7ggMzvCV');

    const instructionNames = ir.instructions.map((ix) => ix.name);
    expect(instructionNames).toEqual(['createVault', 'deposit', 'withdraw']);
    expect(ir.instructions.map((ix) => ix.discriminator)).toEqual([0, 1, 2]);

    const createVault = ir.instructions.find((ix) => ix.name === 'createVault');
    const deposit = ir.instructions.find((ix) => ix.name === 'deposit');

    expect(createVault).toBeDefined();
    expect(deposit).toBeDefined();

    expect(hasSystemProgram(createVault!)).toBe(true);
    expect(hasSystemProgram(deposit!)).toBe(false);

    expect(ir.views.map((view) => view.name)).toEqual(['vaultSummary']);

    const constValues = collectConstValues(json);
    expect(constValues.length).toBeGreaterThan(0);
    expect(constValues.every((value) => typeof value === 'string')).toBe(true);
  });

  it('compiles the AMM example with expected instruction counts', async () => {
    const { ir } = await compileExample('examples/amm/amm.ts', 'amm.json');

    expect(ir.name).toBe('Amm');
    expect(ir.instructions).toHaveLength(5);
    expect(ir.views).toHaveLength(1);

    const createPool = ir.instructions.find((ix) => ix.name === 'createPool');
    const addLiquidity = ir.instructions.find((ix) => ix.name === 'addLiquidity');

    expect(createPool).toBeDefined();
    expect(addLiquidity).toBeDefined();

    expect(hasSystemProgram(createPool!)).toBe(true);
    expect(hasSystemProgram(addLiquidity!)).toBe(false);
  });

  it('writes IR output via the CLI entrypoint', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'transpiler-cli-'));
    const inputPath = path.join(repoRoot, 'examples/vault/vault.ts');
    const outputPath = path.join(outDir, 'vault-cli.json');

    const { stdout } = await runCli(inputPath, outputPath);

    expect(stdout).toContain('IR written to');
    await access(outputPath, fsConstants.F_OK);

    const json = JSON.parse(await readFile(outputPath, 'utf8')) as { name?: string };
    expect(json.name).toBe('Vault');
  });
});
