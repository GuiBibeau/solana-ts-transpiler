import { promises as fs } from 'node:fs';
import path from 'node:path';

const [,, irPath, outDir] = process.argv;

if (!irPath || !outDir) {
  throw new Error('Usage: gen-pinocchio <ir.json> <outDir>');
}

const irRaw = await fs.readFile(irPath, 'utf8');
const ir = JSON.parse(irRaw);

const instructions = ir.instructions as Array<any>;
const accounts = ir.accounts as Record<string, any>;

const vaultAccount = accounts.vault;
if (!vaultAccount) {
  throw new Error('Expected vault account definition in IR.');
}

const getInitAccounts = (ix: any) =>
  (ix.ops as Array<any>)
    .filter((op) => op.op === 'state.init')
    .map((op) => op.account);

const hasStateInit = (ix: any) => getInitAccounts(ix).length > 0;

const findPayerAccount = (ix: any) =>
  (ix.accounts as Array<any>).find((meta) => meta.name === 'payer') ??
  (ix.accounts as Array<any>).find((meta) => meta.signer && meta.writable);

const toSnake = (input: string) =>
  input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();

const toPascal = (input: string) =>
  toSnake(input)
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join('');

const renderRustType = (type: any) => {
  if (type.kind === 'u64') return 'u64';
  if (type.kind === 'u8') return 'u8';
  if (type.kind === 'pubkey') return 'Pubkey';
  throw new Error(`Unsupported type: ${type.kind}`);
};

const fieldNames = Object.keys(vaultAccount.schema);
const fieldMap = new Map(fieldNames.map((name) => [name, toSnake(name)]));

const exprToRust = (expr: any): string => {
  switch (expr.kind) {
    case 'const':
      return `${expr.value}u64`;
    case 'arg':
      return `args.${toSnake(expr.name)}`;
    case 'field':
      return `vault_state.${fieldMap.get(expr.name)}`;
    case 'add':
      return `checked_add(${exprToRust(expr.left)}, ${exprToRust(expr.right)})?`;
    case 'sub':
      return `checked_sub(${exprToRust(expr.left)}, ${exprToRust(expr.right)})?`;
    case 'mul':
      return `checked_mul(${exprToRust(expr.left)}, ${exprToRust(expr.right)})?`;
    case 'div': {
      if (expr.left?.kind === 'mul') {
        return `checked_mul_div(${exprToRust(expr.left.left)}, ${exprToRust(expr.left.right)}, ${exprToRust(expr.right)})?`;
      }
      return `checked_div(${exprToRust(expr.left)}, ${exprToRust(expr.right)})?`;
    }
    case 'eq':
      return `${exprToRust(expr.left)} == ${exprToRust(expr.right)}`;
    case 'if':
      return `if ${exprToRust(expr.cond)} { ${exprToRust(expr.then)} } else { ${exprToRust(expr.else)} }`;
    default:
      throw new Error(`Unsupported expr: ${expr.kind}`);
  }
};

const initValueToRust = (value: any, fieldType: any): string => {
  if (value.kind === 'arg') {
    return `args.${toSnake(value.name)}`;
  }
  if (value.kind === 'account') {
    return `*${toSnake(value.name)}.key()`;
  }
  if (value.kind === 'field') {
    return `vault_state.${fieldMap.get(value.name)}`;
  }
  if (value.kind === 'bump') {
    return `${toSnake(value.account)}_bump`;
  }
  if (value.kind === 'const') {
    if (fieldType.kind === 'u8') {
      return `${value.value}u8`;
    }
    return `${value.value}u64`;
  }
  return exprToRust(value);
};

const renderArgsStruct = (ix: any) => {
  const structName = `${toPascal(ix.name)}Args`;
  const fields = Object.entries(ix.args)
    .map(([name, type]) => `    pub ${toSnake(name)}: ${renderRustType(type)},`)
    .join('\n');
  if (!fields) return `struct ${structName} {}\n`;
  return `struct ${structName} {\n${fields}\n}\n`;
};

const renderArgsDecoder = (ix: any) => {
  const structName = `${toPascal(ix.name)}Args`;
  const argEntries = Object.entries(ix.args);
  if (argEntries.length === 0) {
    return `fn decode_${toSnake(ix.name)}_args(_data: &[u8]) -> Result<${structName}, ProgramError> {\n    Ok(${structName} {})\n}\n`;
  }
  let offset = 0;
  const reads = argEntries.map(([name, type]) => {
    const rustName = toSnake(name);
    if (type.kind === 'u64') {
      const code = `let ${rustName} = read_u64(data, ${offset})?;`;
      offset += 8;
      return code;
    }
    if (type.kind === 'u8') {
      const code = `let ${rustName} = read_u8(data, ${offset})?;`;
      offset += 1;
      return code;
    }
    if (type.kind === 'pubkey') {
      const code = `let ${rustName} = read_pubkey(data, ${offset})?;`;
      offset += 32;
      return code;
    }
    throw new Error(`Unsupported arg type: ${type.kind}`);
  });
  const assigns = argEntries
    .map(([name]) => `        ${toSnake(name)},`)
    .join('\n');
  return `fn decode_${toSnake(ix.name)}_args(data: &[u8]) -> Result<${structName}, ProgramError> {\n    ${reads.join('\n    ')}\n    Ok(${structName} {\n${assigns}\n    })\n}\n`;
};

const seedExpr = (seed: any) => {
  if (typeof seed === 'string') {
    return `b"${seed}"`;
  }
  if (seed.kind === 'arg') {
    return `args.${toSnake(seed.name)}.as_ref()`;
  }
  if (seed.kind === 'account') {
    return `${toSnake(seed.name)}.key().as_ref()`;
  }
  if (seed.kind === 'field') {
    return `vault_state.${fieldMap.get(seed.name)}.as_ref()`;
  }
  throw new Error(`Unsupported seed kind: ${seed.kind}`);
};

const renderAccountChecks = (ix: any) => {
  const list = ix.accounts as Array<any>;
  const checks: string[] = [];
  const usedAccounts = new Set<string>();
  const neededBumps = new Set<string>();

  (ix.ops as Array<any>).forEach((op) => {
    if (op.op === 'state.init') {
      if (typeof op.account === 'string') {
        neededBumps.add(op.account);
      }
      Object.values(op.fields).forEach((value: any) => {
        if (value?.kind === 'bump') {
          neededBumps.add(value.account);
        }
      });
    }
    if (op.signer) neededBumps.add(op.signer);
    ['from', 'to', 'authority', 'mint', 'program'].forEach((key) => {
      const value = op[key];
      if (typeof value === 'string') usedAccounts.add(value);
    });
  });

  list.forEach((meta, index) => {
    const name = toSnake(meta.name);
    checks.push(`let ${name} = &accounts[${index}];`);
    if (meta.signer) {
      checks.push(`if !${name}.is_signer() { return Err(ProgramError::MissingRequiredSignature); }`);
    }
    if (meta.writable) {
      checks.push(`if !${name}.is_writable() { return Err(ProgramError::InvalidAccountData); }`);
    }
    if (meta.pda) {
      const seeds = meta.pda.seeds as Array<any>;
      const seedExprs = seeds.map(seedExpr).join(', ');
      const bumpVar = neededBumps.has(meta.name) ? `${name}_bump` : `_${name}_bump`;
      checks.push(`let (${name}_key, ${bumpVar}) = pubkey::find_program_address(&[${seedExprs}], program_id);`);
      checks.push(`if ${name}.key() != &${name}_key { return Err(ProgramError::InvalidSeeds); }`);
    }

    if (!meta.signer && !meta.writable && !meta.pda && !usedAccounts.has(meta.name)) {
      checks.push(`let _ = ${name};`);
    }
  });
  return checks.join('\n    ');
};

const renderSignerInit = (ix: any) => {
  const signerNames = new Set<string>();
  (ix.ops as Array<any>).forEach((op) => {
    if (op.signer) signerNames.add(op.signer);
  });
  if (signerNames.size === 0) return '';

  const accountsList = ix.accounts as Array<any>;
  const lines: string[] = [];

  signerNames.forEach((name) => {
    const meta = accountsList.find((entry) => entry.name === name);
    if (!meta || !meta.pda) {
      throw new Error(`Signer ${name} must reference a PDA account.`);
    }
    const seeds = meta.pda.seeds as Array<any>;
    const seedExprs = seeds.map(seedExpr).join(', ');
    const rustName = toSnake(name);
    lines.push(`let ${rustName}_bump_ref = [${rustName}_bump];`);
    lines.push(`let ${rustName}_seeds = seeds!(${seedExprs}, &${rustName}_bump_ref);`);
    lines.push(`let ${rustName}_signer = Signer::from(&${rustName}_seeds);`);
  });

  return lines.join('\n    ');
};

const renderOps = (ix: any) => {
  const ops = ix.ops as Array<any>;
  const lines: string[] = [];
  let vaultStateLoaded = false;

  const ensureVaultState = () => {
    if (!vaultStateLoaded) {
      lines.push('let mut vault_state = VaultState::load(vault)?;');
      vaultStateLoaded = true;
    }
  };

  const initAccounts = getInitAccounts(ix);
  if (initAccounts.length > 1) {
    throw new Error(`Multiple state.init ops are not supported in ${ix.name}.`);
  }
  const initAccountName = initAccounts[0];
  const initMeta = initAccountName
    ? (ix.accounts as Array<any>).find((meta) => meta.name === initAccountName)
    : null;
  const payerMeta = initAccountName ? findPayerAccount(ix) : null;

  ops.forEach((op) => {
    switch (op.op) {
      case 'state.init': {
        if (!initMeta) {
          throw new Error(`state.init account ${initAccountName} not found in ${ix.name} accounts.`);
        }
        if (!payerMeta) {
          throw new Error(`state.init in ${ix.name} requires a signer+writable payer account.`);
        }
        const initVar = toSnake(initMeta.name);
        const payerVar = toSnake(payerMeta.name);
        if (!initMeta.pda && !initMeta.signer) {
          throw new Error(`state.init account ${initMeta.name} must be a PDA or signer in ${ix.name}.`);
        }
        if (initMeta.pda?.seeds?.some((seed: any) => seed?.kind === 'field')) {
          throw new Error(`state.init PDA seeds cannot reference fields: ${initMeta.name} in ${ix.name}.`);
        }
        lines.push(`if !${initVar}.is_owned_by(program_id) {`);
        if (initMeta.pda) {
          const seedExprs = (initMeta.pda.seeds as Array<any>).map(seedExpr).join(', ');
          lines.push(`    let ${initVar}_bump_ref = [${initVar}_bump];`);
          lines.push(`    let ${initVar}_seeds = seeds!(${seedExprs}, &${initVar}_bump_ref);`);
          lines.push(`    let ${initVar}_signer = Signer::from(&${initVar}_seeds);`);
          lines.push(`    create_program_account(${payerVar}, ${initVar}, program_id, VaultState::LEN, Some(&${initVar}_signer))?;`);
        } else {
          lines.push(`    create_program_account(${payerVar}, ${initVar}, program_id, VaultState::LEN, None)?;`);
        }
        lines.push('}');
        lines.push(`if !${initVar}.is_owned_by(program_id) { return Err(ProgramError::IncorrectProgramId); }`);
        ensureVaultState();
        Object.entries(op.fields).forEach(([fieldName, value]) => {
          const fieldType = vaultAccount.schema[fieldName];
          const rustField = fieldMap.get(fieldName);
          lines.push(`vault_state.${rustField} = ${initValueToRust(value, fieldType)};`);
        });
        lines.push('VaultState::store(vault, &vault_state)?;');
        break;
      }
      case 'state.update': {
        ensureVaultState();
        const updates = Object.entries(op.fields);
        updates.forEach(([fieldName, expr]) => {
          const rustField = fieldMap.get(fieldName);
          lines.push(`let next_${rustField} = ${exprToRust(expr)};`);
        });
        updates.forEach(([fieldName]) => {
          const rustField = fieldMap.get(fieldName);
          lines.push(`vault_state.${rustField} = next_${rustField};`);
        });
        lines.push('VaultState::store(vault, &vault_state)?;');
        break;
      }
      case 'token.transfer': {
        ensureVaultState();
        if (op.signer) {
          const signerVar = `${toSnake(op.signer)}_signer`;
          lines.push(`Transfer {\n        source: ${toSnake(op.from)},\n        destination: ${toSnake(op.to)},\n        authority: ${toSnake(op.authority)},\n        amount: ${exprToRust(op.amount)},\n        program_id: Some(${toSnake(op.program ?? 'tokenProgram')}.key()),\n    }.invoke_signed(&[${signerVar}])?;`);
        } else {
          lines.push(`Transfer {\n        source: ${toSnake(op.from)},\n        destination: ${toSnake(op.to)},\n        authority: ${toSnake(op.authority)},\n        amount: ${exprToRust(op.amount)},\n        program_id: Some(${toSnake(op.program ?? 'tokenProgram')}.key()),\n    }.invoke()?;`);
        }
        break;
      }
      case 'token.mintTo': {
        ensureVaultState();
        if (op.signer) {
          const signerVar = `${toSnake(op.signer)}_signer`;
          lines.push(`MintTo {\n        mint: ${toSnake(op.mint)},\n        destination: ${toSnake(op.to)},\n        authority: ${toSnake(op.authority)},\n        amount: ${exprToRust(op.amount)},\n        program_id: Some(${toSnake(op.program ?? 'tokenProgram')}.key()),\n    }.invoke_signed(&[${signerVar}])?;`);
        } else {
          lines.push(`MintTo {\n        mint: ${toSnake(op.mint)},\n        destination: ${toSnake(op.to)},\n        authority: ${toSnake(op.authority)},\n        amount: ${exprToRust(op.amount)},\n        program_id: Some(${toSnake(op.program ?? 'tokenProgram')}.key()),\n    }.invoke()?;`);
        }
        break;
      }
      case 'token.burn': {
        ensureVaultState();
        lines.push(`Burn {\n        source: ${toSnake(op.from)},\n        mint: ${toSnake(op.mint)},\n        authority: ${toSnake(op.authority)},\n        amount: ${exprToRust(op.amount)},\n        program_id: Some(${toSnake(op.program ?? 'tokenProgram')}.key()),\n    }.invoke()?;`);
        break;
      }
      default:
        break;
    }
  });

  return lines.join('\n    ');
};

const renderInstructionHandler = (ix: any) => {
  const argsStruct = renderArgsStruct(ix);
  const argsDecoder = renderArgsDecoder(ix);
  const accountChecks = renderAccountChecks(ix);
  const signerInit = renderSignerInit(ix);
  const ops = renderOps(ix);
  const ownerCheck = hasStateInit(ix)
    ? ''
    : '    // Vault must be owned by this program\n    if !vault.is_owned_by(program_id) {\n        return Err(ProgramError::IncorrectProgramId);\n    }\n';

  return `\n${argsStruct}
${argsDecoder}
fn handle_${toSnake(ix.name)}(\n    program_id: &Pubkey,\n    accounts: &[AccountInfo],\n    data: &[u8],\n) -> ProgramResult {\n    if accounts.len() < ${ix.accounts.length} {\n        return Err(ProgramError::NotEnoughAccountKeys);\n    }\n    let args = decode_${toSnake(ix.name)}_args(data)?;\n    ${accountChecks}\n    ${signerInit}\n${ownerCheck}    ${ops}\n    Ok(())\n}\n`;
};

const renderVaultState = () => {
  const fields = Object.entries(vaultAccount.schema)
    .map(([name, type]) => `    pub ${fieldMap.get(name)}: ${renderRustType(type)},`)
    .join('\n');

  const readFields: string[] = [];
  let offset = 0;
  Object.entries(vaultAccount.schema).forEach(([name, type]) => {
    const rustField = fieldMap.get(name);
    if (type.kind === 'pubkey') {
      readFields.push(`let ${rustField} = read_pubkey(&data, ${offset})?;`);
      offset += 32;
    } else if (type.kind === 'u64') {
      readFields.push(`let ${rustField} = read_u64(&data, ${offset})?;`);
      offset += 8;
    } else if (type.kind === 'u8') {
      readFields.push(`let ${rustField} = read_u8(&data, ${offset})?;`);
      offset += 1;
    }
  });

  const writeFields: string[] = [];
  let writeOffset = 0;
  Object.entries(vaultAccount.schema).forEach(([name, type]) => {
    const rustField = fieldMap.get(name);
    if (type.kind === 'pubkey') {
      writeFields.push(`write_pubkey(&mut data, ${writeOffset}, &state.${rustField})?;`);
      writeOffset += 32;
    } else if (type.kind === 'u64') {
      writeFields.push(`write_u64(&mut data, ${writeOffset}, state.${rustField})?;`);
      writeOffset += 8;
    } else if (type.kind === 'u8') {
      writeFields.push(`write_u8(&mut data, ${writeOffset}, state.${rustField})?;`);
      writeOffset += 1;
    }
  });

  return `#[derive(Clone, Copy)]
struct VaultState {
${fields}
}

impl VaultState {
    const LEN: usize = ${writeOffset};

    fn load(account: &AccountInfo) -> Result<Self, ProgramError> {
        let data = account.try_borrow_data()?;
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        ${readFields.join('\n        ')}
        Ok(Self {
${Object.keys(vaultAccount.schema).map((name) => `            ${fieldMap.get(name)},`).join('\n')}
        })
    }

    fn store(account: &AccountInfo, state: &Self) -> Result<(), ProgramError> {
        let mut data = account.try_borrow_mut_data()?;
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        ${writeFields.join('\n        ')}
        Ok(())
    }
}
`;
};

const renderInitHelpers = () => `const SYSTEM_PROGRAM_ID: Pubkey = [0u8; 32];

fn minimum_balance(space: usize) -> u64 {
    if let Ok(rent) = Rent::get() {
        return rent.minimum_balance(space);
    }
    let bytes = space as u64 + ACCOUNT_STORAGE_OVERHEAD;
    ((bytes * DEFAULT_LAMPORTS_PER_BYTE_YEAR) as f64 * DEFAULT_EXEMPTION_THRESHOLD) as u64
}

fn create_program_account(
    payer: &AccountInfo,
    new_account: &AccountInfo,
    owner: &Pubkey,
    space: usize,
    signer: Option<&Signer>,
) -> ProgramResult {
    let lamports = minimum_balance(space);
    let mut data = [0u8; 4 + 8 + 8 + 32];
    data[..4].copy_from_slice(&0u32.to_le_bytes());
    data[4..12].copy_from_slice(&lamports.to_le_bytes());
    data[12..20].copy_from_slice(&(space as u64).to_le_bytes());
    data[20..52].copy_from_slice(owner);
    let ix_accounts = [
        AccountMeta::writable_signer(payer.key()),
        AccountMeta::writable_signer(new_account.key()),
    ];
    let ix = Instruction {
        program_id: &SYSTEM_PROGRAM_ID,
        data: &data,
        accounts: &ix_accounts,
    };
    if let Some(signer) = signer {
        let signers = [signer.clone()];
        invoke_signed::<2>(&ix, &[payer, new_account], &signers)?;
    } else {
        invoke_signed::<2>(&ix, &[payer, new_account], &[])?;
    }
    Ok(())
}
`;

const renderLib = () => {
  const handlers = instructions.map(renderInstructionHandler).join('\n');
  const dispatchArms = instructions
    .map((ix) => `        ${ix.discriminator} => handle_${toSnake(ix.name)}(program_id, accounts, &data[1..]),`)
    .join('\n');
  const usesInit = instructions.some((ix) => hasStateInit(ix));
  const pinocchioImports = usesInit
    ? `use pinocchio::{
    account_info::AccountInfo,
    cpi::invoke_signed,
    instruction::{AccountMeta, Instruction, Signer},
    program_entrypoint,
    program_error::ProgramError,
    pubkey,
    pubkey::Pubkey,
    seeds,
    sysvars::{
        rent::{Rent, ACCOUNT_STORAGE_OVERHEAD, DEFAULT_EXEMPTION_THRESHOLD, DEFAULT_LAMPORTS_PER_BYTE_YEAR},
        Sysvar,
    },
    ProgramResult,
};`
    : `use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_entrypoint,
    program_error::ProgramError,
    pubkey,
    pubkey::Pubkey,
    seeds,
    ProgramResult,
};`;
  const initHelpers = usesInit ? renderInitHelpers() : '';

  return `// AUTO-GENERATED - DO NOT EDIT
#![no_std]

${pinocchioImports}
use pinocchio_tkn::common::{Burn, MintTo, Transfer};

program_entrypoint!(process_instruction);

#[cfg(target_arch = "bpf")]
use pinocchio::default_allocator;

#[cfg(target_arch = "bpf")]
default_allocator!();

#[cfg(target_arch = "bpf")]
#[panic_handler]
fn panic_handler(_info: &core::panic::PanicInfo<'_>) -> ! {
    unsafe {
        pinocchio::syscalls::abort();
    }
}

#[cfg(not(target_arch = "bpf"))]
extern crate std;

${renderVaultState()}

${initHelpers}

fn read_pubkey(data: &[u8], offset: usize) -> Result<Pubkey, ProgramError> {
    if data.len() < offset + 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&data[offset..offset + 32]);
    Ok(out)
}

fn read_u64(data: &[u8], offset: usize) -> Result<u64, ProgramError> {
    if data.len() < offset + 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&data[offset..offset + 8]);
    Ok(u64::from_le_bytes(buf))
}

fn read_u8(data: &[u8], offset: usize) -> Result<u8, ProgramError> {
    if data.len() <= offset {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(data[offset])
}

fn write_pubkey(data: &mut [u8], offset: usize, value: &Pubkey) -> Result<(), ProgramError> {
    if data.len() < offset + 32 {
        return Err(ProgramError::InvalidAccountData);
    }
    data[offset..offset + 32].copy_from_slice(value);
    Ok(())
}

fn write_u64(data: &mut [u8], offset: usize, value: u64) -> Result<(), ProgramError> {
    if data.len() < offset + 8 {
        return Err(ProgramError::InvalidAccountData);
    }
    data[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn write_u8(data: &mut [u8], offset: usize, value: u8) -> Result<(), ProgramError> {
    if data.len() <= offset {
        return Err(ProgramError::InvalidAccountData);
    }
    data[offset] = value;
    Ok(())
}

#[allow(dead_code)]
fn checked_add(a: u64, b: u64) -> Result<u64, ProgramError> {
    a.checked_add(b).ok_or(ProgramError::InvalidInstructionData)
}

#[allow(dead_code)]
fn checked_sub(a: u64, b: u64) -> Result<u64, ProgramError> {
    a.checked_sub(b).ok_or(ProgramError::InvalidInstructionData)
}

#[allow(dead_code)]
fn checked_mul(a: u64, b: u64) -> Result<u64, ProgramError> {
    let value = (a as u128).checked_mul(b as u128).ok_or(ProgramError::InvalidInstructionData)?;
    if value > u64::MAX as u128 {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(value as u64)
}

#[allow(dead_code)]
fn checked_div(a: u64, b: u64) -> Result<u64, ProgramError> {
    if b == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(a / b)
}

#[allow(dead_code)]
fn checked_mul_div(a: u64, b: u64, c: u64) -> Result<u64, ProgramError> {
    if c == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let value = (a as u128)
        .checked_mul(b as u128)
        .ok_or(ProgramError::InvalidInstructionData)?
        / (c as u128);
    if value > u64::MAX as u128 {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(value as u64)
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    match data[0] {
${dispatchArms}
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

${handlers}
`;
};

const cargoToml = `# AUTO-GENERATED - DO NOT EDIT
[package]
name = "vault_pinocchio"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
pinocchio = { version = "0.9", default-features = false }
pinocchio-tkn = { version = "0.2.2" }

[dev-dependencies]
mollusk-svm = "0.10.1"
mollusk-svm-programs-token = "0.10.1"
litesvm = "0.9.1"
solana-sdk = "3.0.0"
solana-sdk-ids = "3.0.0"
solana-program-pack = "3.0.0"
solana-program-option = "3.0.0"
solana-rent = "3.0.0"
solana-keypair = "3.0.0"
solana-message = "3.0.1"
solana-signer = "3.0.0"
solana-transaction = "3.0.0"
solana-system-interface = "3.0.0"
spl-token-interface = "2.0.0"
`; 

await fs.mkdir(path.join(outDir, 'src'), { recursive: true });
await fs.writeFile(path.join(outDir, 'src', 'lib.rs'), renderLib(), 'utf8');
await fs.writeFile(path.join(outDir, 'Cargo.toml'), cargoToml, 'utf8');
console.log(`Pinocchio program written to ${outDir}`);
