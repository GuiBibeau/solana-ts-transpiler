// AUTO-GENERATED - DO NOT EDIT
#![no_std]

use pinocchio::{
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
};
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

#[derive(Clone, Copy)]
struct VaultState {
    pub admin: Pubkey,
    pub underlying_mint: Pubkey,
    pub share_mint: Pubkey,
    pub total_deposits: u64,
    pub total_shares: u64,
    pub bump: u8,
}

impl VaultState {
    const LEN: usize = 113;

    fn load(account: &AccountInfo) -> Result<Self, ProgramError> {
        let data = account.try_borrow_data()?;
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let admin = read_pubkey(&data, 0)?;
        let underlying_mint = read_pubkey(&data, 32)?;
        let share_mint = read_pubkey(&data, 64)?;
        let total_deposits = read_u64(&data, 96)?;
        let total_shares = read_u64(&data, 104)?;
        let bump = read_u8(&data, 112)?;
        Ok(Self {
            admin,
            underlying_mint,
            share_mint,
            total_deposits,
            total_shares,
            bump,
        })
    }

    fn store(account: &AccountInfo, state: &Self) -> Result<(), ProgramError> {
        let mut data = account.try_borrow_mut_data()?;
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        write_pubkey(&mut data, 0, &state.admin)?;
        write_pubkey(&mut data, 32, &state.underlying_mint)?;
        write_pubkey(&mut data, 64, &state.share_mint)?;
        write_u64(&mut data, 96, state.total_deposits)?;
        write_u64(&mut data, 104, state.total_shares)?;
        write_u8(&mut data, 112, state.bump)?;
        Ok(())
    }
}


const SYSTEM_PROGRAM_ID: Pubkey = [0u8; 32];

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
        0 => handle_create_vault(program_id, accounts, &data[1..]),
        1 => handle_deposit(program_id, accounts, &data[1..]),
        2 => handle_withdraw(program_id, accounts, &data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}


struct CreateVaultArgs {
    pub underlying_mint: Pubkey,
    pub share_mint: Pubkey,
}

fn decode_create_vault_args(data: &[u8]) -> Result<CreateVaultArgs, ProgramError> {
    let underlying_mint = read_pubkey(data, 0)?;
    let share_mint = read_pubkey(data, 32)?;
    Ok(CreateVaultArgs {
        underlying_mint,
        share_mint,
    })
}

fn handle_create_vault(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let args = decode_create_vault_args(data)?;
    let payer = &accounts[0];
    if !payer.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    if !payer.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault = &accounts[1];
    if !vault.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let (vault_key, vault_bump) = pubkey::find_program_address(&[b"vault", args.underlying_mint.as_ref()], program_id);
    if vault.key() != &vault_key { return Err(ProgramError::InvalidSeeds); }
    let vault_authority = &accounts[2];
    let (vault_authority_key, _vault_authority_bump) = pubkey::find_program_address(&[b"authority", vault.key().as_ref()], program_id);
    if vault_authority.key() != &vault_authority_key { return Err(ProgramError::InvalidSeeds); }
    let underlying_mint = &accounts[3];
    let _ = underlying_mint;
    let share_mint = &accounts[4];
    if !share_mint.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_underlying = &accounts[5];
    if !vault_underlying.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let token_program = &accounts[6];
    let _ = token_program;
    let system_program = &accounts[7];
    let _ = system_program;
    
    if !vault.is_owned_by(program_id) {
        let vault_bump_ref = [vault_bump];
        let vault_seeds = seeds!(b"vault", args.underlying_mint.as_ref(), &vault_bump_ref);
        let vault_signer = Signer::from(&vault_seeds);
        create_program_account(payer, vault, program_id, VaultState::LEN, Some(&vault_signer))?;
    }
    if !vault.is_owned_by(program_id) { return Err(ProgramError::IncorrectProgramId); }
    let mut vault_state = VaultState::load(vault)?;
    vault_state.admin = *payer.key();
    vault_state.underlying_mint = args.underlying_mint;
    vault_state.share_mint = args.share_mint;
    vault_state.total_deposits = 0u64;
    vault_state.total_shares = 0u64;
    vault_state.bump = vault_bump;
    VaultState::store(vault, &vault_state)?;
    Ok(())
}


struct DepositArgs {
    pub amount: u64,
}

fn decode_deposit_args(data: &[u8]) -> Result<DepositArgs, ProgramError> {
    let amount = read_u64(data, 0)?;
    Ok(DepositArgs {
        amount,
    })
}

fn handle_deposit(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let args = decode_deposit_args(data)?;
    let user = &accounts[0];
    if !user.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    let vault = &accounts[1];
    if !vault.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_authority = &accounts[2];
    let (vault_authority_key, vault_authority_bump) = pubkey::find_program_address(&[b"authority", vault.key().as_ref()], program_id);
    if vault_authority.key() != &vault_authority_key { return Err(ProgramError::InvalidSeeds); }
    let user_underlying = &accounts[3];
    if !user_underlying.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_underlying = &accounts[4];
    if !vault_underlying.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let share_mint = &accounts[5];
    if !share_mint.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let user_shares = &accounts[6];
    if !user_shares.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let token_program = &accounts[7];
    let vault_authority_bump_ref = [vault_authority_bump];
    let vault_authority_seeds = seeds!(b"authority", vault.key().as_ref(), &vault_authority_bump_ref);
    let vault_authority_signer = Signer::from(&vault_authority_seeds);
    // Vault must be owned by this program
    if !vault.is_owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let mut vault_state = VaultState::load(vault)?;
    Transfer {
        source: user_underlying,
        destination: vault_underlying,
        authority: user,
        amount: args.amount,
        program_id: Some(token_program.key()),
    }.invoke()?;
    MintTo {
        mint: share_mint,
        destination: user_shares,
        authority: vault_authority,
        amount: if vault_state.total_shares == 0u64 { args.amount } else { checked_mul_div(args.amount, vault_state.total_shares, vault_state.total_deposits)? },
        program_id: Some(token_program.key()),
    }.invoke_signed(&[vault_authority_signer])?;
    let next_total_deposits = checked_add(vault_state.total_deposits, args.amount)?;
    let next_total_shares = checked_add(vault_state.total_shares, if vault_state.total_shares == 0u64 { args.amount } else { checked_mul_div(args.amount, vault_state.total_shares, vault_state.total_deposits)? })?;
    vault_state.total_deposits = next_total_deposits;
    vault_state.total_shares = next_total_shares;
    VaultState::store(vault, &vault_state)?;
    Ok(())
}


struct WithdrawArgs {
    pub shares: u64,
}

fn decode_withdraw_args(data: &[u8]) -> Result<WithdrawArgs, ProgramError> {
    let shares = read_u64(data, 0)?;
    Ok(WithdrawArgs {
        shares,
    })
}

fn handle_withdraw(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let args = decode_withdraw_args(data)?;
    let user = &accounts[0];
    if !user.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    let vault = &accounts[1];
    if !vault.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_authority = &accounts[2];
    let (vault_authority_key, vault_authority_bump) = pubkey::find_program_address(&[b"authority", vault.key().as_ref()], program_id);
    if vault_authority.key() != &vault_authority_key { return Err(ProgramError::InvalidSeeds); }
    let user_shares = &accounts[3];
    if !user_shares.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let share_mint = &accounts[4];
    if !share_mint.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let user_underlying = &accounts[5];
    if !user_underlying.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_underlying = &accounts[6];
    if !vault_underlying.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let token_program = &accounts[7];
    let vault_authority_bump_ref = [vault_authority_bump];
    let vault_authority_seeds = seeds!(b"authority", vault.key().as_ref(), &vault_authority_bump_ref);
    let vault_authority_signer = Signer::from(&vault_authority_seeds);
    // Vault must be owned by this program
    if !vault.is_owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let mut vault_state = VaultState::load(vault)?;
    Burn {
        source: user_shares,
        mint: share_mint,
        authority: user,
        amount: args.shares,
        program_id: Some(token_program.key()),
    }.invoke()?;
    Transfer {
        source: vault_underlying,
        destination: user_underlying,
        authority: vault_authority,
        amount: checked_mul_div(args.shares, vault_state.total_deposits, vault_state.total_shares)?,
        program_id: Some(token_program.key()),
    }.invoke_signed(&[vault_authority_signer])?;
    let next_total_deposits = checked_sub(vault_state.total_deposits, checked_mul_div(args.shares, vault_state.total_deposits, vault_state.total_shares)?)?;
    let next_total_shares = checked_sub(vault_state.total_shares, args.shares)?;
    vault_state.total_deposits = next_total_deposits;
    vault_state.total_shares = next_total_shares;
    VaultState::store(vault, &vault_state)?;
    Ok(())
}

