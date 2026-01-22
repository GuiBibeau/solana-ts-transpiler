#!/usr/bin/env bun
import { compileToFile } from './index.ts';

const [,, inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error('Usage: solana-ts-transpiler <input.ts> <output.json>');
}

await compileToFile(inputPath, outputPath);
console.log(`IR written to ${outputPath}`);
