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
struct PoolState {
    pub admin: Pubkey,
    pub token_mint_a: Pubkey,
    pub token_mint_b: Pubkey,
    pub lp_mint: Pubkey,
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub total_lp: u64,
    pub bump: u8,
}

impl PoolState {
    const LEN: usize = 153;

    fn load(account: &AccountInfo) -> Result<Self, ProgramError> {
        let data = account.try_borrow_data()?;
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let admin = read_pubkey(&data, 0)?;
        let token_mint_a = read_pubkey(&data, 32)?;
        let token_mint_b = read_pubkey(&data, 64)?;
        let lp_mint = read_pubkey(&data, 96)?;
        let reserve_a = read_u64(&data, 128)?;
        let reserve_b = read_u64(&data, 136)?;
        let total_lp = read_u64(&data, 144)?;
        let bump = read_u8(&data, 152)?;
        Ok(Self {
            admin,
            token_mint_a,
            token_mint_b,
            lp_mint,
            reserve_a,
            reserve_b,
            total_lp,
            bump,
        })
    }

    fn store(account: &AccountInfo, state: &Self) -> Result<(), ProgramError> {
        let mut data = account.try_borrow_mut_data()?;
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        write_pubkey(&mut data, 0, &state.admin)?;
        write_pubkey(&mut data, 32, &state.token_mint_a)?;
        write_pubkey(&mut data, 64, &state.token_mint_b)?;
        write_pubkey(&mut data, 96, &state.lp_mint)?;
        write_u64(&mut data, 128, state.reserve_a)?;
        write_u64(&mut data, 136, state.reserve_b)?;
        write_u64(&mut data, 144, state.total_lp)?;
        write_u8(&mut data, 152, state.bump)?;
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
        0 => handle_create_pool(program_id, accounts, &data[1..]),
        1 => handle_add_liquidity(program_id, accounts, &data[1..]),
        2 => handle_remove_liquidity(program_id, accounts, &data[1..]),
        3 => handle_swap_afor_b(program_id, accounts, &data[1..]),
        4 => handle_swap_bfor_a(program_id, accounts, &data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}


struct CreatePoolArgs {
    pub token_mint_a: Pubkey,
    pub token_mint_b: Pubkey,
    pub lp_mint: Pubkey,
}

fn decode_create_pool_args(data: &[u8]) -> Result<CreatePoolArgs, ProgramError> {
    let token_mint_a = read_pubkey(data, 0)?;
    let token_mint_b = read_pubkey(data, 32)?;
    let lp_mint = read_pubkey(data, 64)?;
    Ok(CreatePoolArgs {
        token_mint_a,
        token_mint_b,
        lp_mint,
    })
}

fn handle_create_pool(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 10 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let args = decode_create_pool_args(data)?;
    let payer = &accounts[0];
    if !payer.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    if !payer.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let pool = &accounts[1];
    if !pool.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let (pool_key, pool_bump) = pubkey::find_program_address(&[b"pool", args.token_mint_a.as_ref(), args.token_mint_b.as_ref()], program_id);
    if pool.key() != &pool_key { return Err(ProgramError::InvalidSeeds); }
    let pool_authority = &accounts[2];
    let (pool_authority_key, _pool_authority_bump) = pubkey::find_program_address(&[b"authority", pool.key().as_ref()], program_id);
    if pool_authority.key() != &pool_authority_key { return Err(ProgramError::InvalidSeeds); }
    let token_mint_a = &accounts[3];
    let _ = token_mint_a;
    let token_mint_b = &accounts[4];
    let _ = token_mint_b;
    let lp_mint = &accounts[5];
    if !lp_mint.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_a = &accounts[6];
    if !vault_a.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_b = &accounts[7];
    if !vault_b.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let token_program = &accounts[8];
    let _ = token_program;
    let system_program = &accounts[9];
    let _ = system_program;
    
    if !pool.is_owned_by(program_id) {
        let pool_bump_ref = [pool_bump];
        let pool_seeds = seeds!(b"pool", args.token_mint_a.as_ref(), args.token_mint_b.as_ref(), &pool_bump_ref);
        let pool_signer = Signer::from(&pool_seeds);
        create_program_account(payer, pool, program_id, PoolState::LEN, Some(&pool_signer))?;
    }
    if !pool.is_owned_by(program_id) { return Err(ProgramError::IncorrectProgramId); }
    let mut pool_state = PoolState::load(pool)?;
    pool_state.admin = *payer.key();
    pool_state.token_mint_a = args.token_mint_a;
    pool_state.token_mint_b = args.token_mint_b;
    pool_state.lp_mint = args.lp_mint;
    pool_state.reserve_a = 0u64;
    pool_state.reserve_b = 0u64;
    pool_state.total_lp = 0u64;
    pool_state.bump = pool_bump;
    PoolState::store(pool, &pool_state)?;
    Ok(())
}


struct AddLiquidityArgs {
    pub amount_a: u64,
    pub amount_b: u64,
}

fn decode_add_liquidity_args(data: &[u8]) -> Result<AddLiquidityArgs, ProgramError> {
    let amount_a = read_u64(data, 0)?;
    let amount_b = read_u64(data, 8)?;
    Ok(AddLiquidityArgs {
        amount_a,
        amount_b,
    })
}

fn handle_add_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 10 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let args = decode_add_liquidity_args(data)?;
    let user = &accounts[0];
    if !user.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    let pool = &accounts[1];
    if !pool.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let pool_authority = &accounts[2];
    let (pool_authority_key, pool_authority_bump) = pubkey::find_program_address(&[b"authority", pool.key().as_ref()], program_id);
    if pool_authority.key() != &pool_authority_key { return Err(ProgramError::InvalidSeeds); }
    let user_a = &accounts[3];
    if !user_a.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let user_b = &accounts[4];
    if !user_b.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_a = &accounts[5];
    if !vault_a.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_b = &accounts[6];
    if !vault_b.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let lp_mint = &accounts[7];
    if !lp_mint.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let user_lp = &accounts[8];
    if !user_lp.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let token_program = &accounts[9];
    let pool_authority_bump_ref = [pool_authority_bump];
    let pool_authority_seeds = seeds!(b"authority", pool.key().as_ref(), &pool_authority_bump_ref);
    let pool_authority_signer = Signer::from(&pool_authority_seeds);
    // State account must be owned by this program
    if !pool.is_owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let mut pool_state = PoolState::load(pool)?;
    Transfer {
        source: user_a,
        destination: vault_a,
        authority: user,
        amount: args.amount_a,
        program_id: Some(token_program.key()),
    }.invoke()?;
    Transfer {
        source: user_b,
        destination: vault_b,
        authority: user,
        amount: args.amount_b,
        program_id: Some(token_program.key()),
    }.invoke()?;
    MintTo {
        mint: lp_mint,
        destination: user_lp,
        authority: pool_authority,
        amount: if pool_state.total_lp == 0u64 { args.amount_a } else { checked_mul_div(args.amount_a, pool_state.total_lp, pool_state.reserve_a)? },
        program_id: Some(token_program.key()),
    }.invoke_signed(&[pool_authority_signer.clone()])?;
    let next_reserve_a = checked_add(pool_state.reserve_a, args.amount_a)?;
    let next_reserve_b = checked_add(pool_state.reserve_b, args.amount_b)?;
    let next_total_lp = checked_add(pool_state.total_lp, if pool_state.total_lp == 0u64 { args.amount_a } else { checked_mul_div(args.amount_a, pool_state.total_lp, pool_state.reserve_a)? })?;
    pool_state.reserve_a = next_reserve_a;
    pool_state.reserve_b = next_reserve_b;
    pool_state.total_lp = next_total_lp;
    PoolState::store(pool, &pool_state)?;
    Ok(())
}


struct RemoveLiquidityArgs {
    pub lp_amount: u64,
}

fn decode_remove_liquidity_args(data: &[u8]) -> Result<RemoveLiquidityArgs, ProgramError> {
    let lp_amount = read_u64(data, 0)?;
    Ok(RemoveLiquidityArgs {
        lp_amount,
    })
}

fn handle_remove_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 10 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let args = decode_remove_liquidity_args(data)?;
    let user = &accounts[0];
    if !user.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    let pool = &accounts[1];
    if !pool.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let pool_authority = &accounts[2];
    let (pool_authority_key, pool_authority_bump) = pubkey::find_program_address(&[b"authority", pool.key().as_ref()], program_id);
    if pool_authority.key() != &pool_authority_key { return Err(ProgramError::InvalidSeeds); }
    let user_lp = &accounts[3];
    if !user_lp.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let lp_mint = &accounts[4];
    if !lp_mint.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let user_a = &accounts[5];
    if !user_a.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let user_b = &accounts[6];
    if !user_b.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_a = &accounts[7];
    if !vault_a.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_b = &accounts[8];
    if !vault_b.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let token_program = &accounts[9];
    let pool_authority_bump_ref = [pool_authority_bump];
    let pool_authority_seeds = seeds!(b"authority", pool.key().as_ref(), &pool_authority_bump_ref);
    let pool_authority_signer = Signer::from(&pool_authority_seeds);
    // State account must be owned by this program
    if !pool.is_owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let mut pool_state = PoolState::load(pool)?;
    Burn {
        source: user_lp,
        mint: lp_mint,
        authority: user,
        amount: args.lp_amount,
        program_id: Some(token_program.key()),
    }.invoke()?;
    Transfer {
        source: vault_a,
        destination: user_a,
        authority: pool_authority,
        amount: checked_mul_div(args.lp_amount, pool_state.reserve_a, pool_state.total_lp)?,
        program_id: Some(token_program.key()),
    }.invoke_signed(&[pool_authority_signer.clone()])?;
    Transfer {
        source: vault_b,
        destination: user_b,
        authority: pool_authority,
        amount: checked_mul_div(args.lp_amount, pool_state.reserve_b, pool_state.total_lp)?,
        program_id: Some(token_program.key()),
    }.invoke_signed(&[pool_authority_signer.clone()])?;
    let next_reserve_a = checked_sub(pool_state.reserve_a, checked_mul_div(args.lp_amount, pool_state.reserve_a, pool_state.total_lp)?)?;
    let next_reserve_b = checked_sub(pool_state.reserve_b, checked_mul_div(args.lp_amount, pool_state.reserve_b, pool_state.total_lp)?)?;
    let next_total_lp = checked_sub(pool_state.total_lp, args.lp_amount)?;
    pool_state.reserve_a = next_reserve_a;
    pool_state.reserve_b = next_reserve_b;
    pool_state.total_lp = next_total_lp;
    PoolState::store(pool, &pool_state)?;
    Ok(())
}


struct SwapAforBArgs {
    pub amount_in: u64,
}

fn decode_swap_afor_b_args(data: &[u8]) -> Result<SwapAforBArgs, ProgramError> {
    let amount_in = read_u64(data, 0)?;
    Ok(SwapAforBArgs {
        amount_in,
    })
}

fn handle_swap_afor_b(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let args = decode_swap_afor_b_args(data)?;
    let user = &accounts[0];
    if !user.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    let pool = &accounts[1];
    if !pool.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let pool_authority = &accounts[2];
    let (pool_authority_key, pool_authority_bump) = pubkey::find_program_address(&[b"authority", pool.key().as_ref()], program_id);
    if pool_authority.key() != &pool_authority_key { return Err(ProgramError::InvalidSeeds); }
    let user_a = &accounts[3];
    if !user_a.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let user_b = &accounts[4];
    if !user_b.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_a = &accounts[5];
    if !vault_a.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_b = &accounts[6];
    if !vault_b.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let token_program = &accounts[7];
    let pool_authority_bump_ref = [pool_authority_bump];
    let pool_authority_seeds = seeds!(b"authority", pool.key().as_ref(), &pool_authority_bump_ref);
    let pool_authority_signer = Signer::from(&pool_authority_seeds);
    // State account must be owned by this program
    if !pool.is_owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let mut pool_state = PoolState::load(pool)?;
    Transfer {
        source: user_a,
        destination: vault_a,
        authority: user,
        amount: args.amount_in,
        program_id: Some(token_program.key()),
    }.invoke()?;
    Transfer {
        source: vault_b,
        destination: user_b,
        authority: pool_authority,
        amount: checked_mul_div(args.amount_in, pool_state.reserve_b, checked_add(pool_state.reserve_a, args.amount_in)?)?,
        program_id: Some(token_program.key()),
    }.invoke_signed(&[pool_authority_signer.clone()])?;
    let next_reserve_a = checked_add(pool_state.reserve_a, args.amount_in)?;
    let next_reserve_b = checked_sub(pool_state.reserve_b, checked_mul_div(args.amount_in, pool_state.reserve_b, checked_add(pool_state.reserve_a, args.amount_in)?)?)?;
    pool_state.reserve_a = next_reserve_a;
    pool_state.reserve_b = next_reserve_b;
    PoolState::store(pool, &pool_state)?;
    Ok(())
}


struct SwapBforAArgs {
    pub amount_in: u64,
}

fn decode_swap_bfor_a_args(data: &[u8]) -> Result<SwapBforAArgs, ProgramError> {
    let amount_in = read_u64(data, 0)?;
    Ok(SwapBforAArgs {
        amount_in,
    })
}

fn handle_swap_bfor_a(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let args = decode_swap_bfor_a_args(data)?;
    let user = &accounts[0];
    if !user.is_signer() { return Err(ProgramError::MissingRequiredSignature); }
    let pool = &accounts[1];
    if !pool.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let pool_authority = &accounts[2];
    let (pool_authority_key, pool_authority_bump) = pubkey::find_program_address(&[b"authority", pool.key().as_ref()], program_id);
    if pool_authority.key() != &pool_authority_key { return Err(ProgramError::InvalidSeeds); }
    let user_a = &accounts[3];
    if !user_a.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let user_b = &accounts[4];
    if !user_b.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_a = &accounts[5];
    if !vault_a.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let vault_b = &accounts[6];
    if !vault_b.is_writable() { return Err(ProgramError::InvalidAccountData); }
    let token_program = &accounts[7];
    let pool_authority_bump_ref = [pool_authority_bump];
    let pool_authority_seeds = seeds!(b"authority", pool.key().as_ref(), &pool_authority_bump_ref);
    let pool_authority_signer = Signer::from(&pool_authority_seeds);
    // State account must be owned by this program
    if !pool.is_owned_by(program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let mut pool_state = PoolState::load(pool)?;
    Transfer {
        source: user_b,
        destination: vault_b,
        authority: user,
        amount: args.amount_in,
        program_id: Some(token_program.key()),
    }.invoke()?;
    Transfer {
        source: vault_a,
        destination: user_a,
        authority: pool_authority,
        amount: checked_mul_div(args.amount_in, pool_state.reserve_a, checked_add(pool_state.reserve_b, args.amount_in)?)?,
        program_id: Some(token_program.key()),
    }.invoke_signed(&[pool_authority_signer.clone()])?;
    let next_reserve_a = checked_sub(pool_state.reserve_a, checked_mul_div(args.amount_in, pool_state.reserve_a, checked_add(pool_state.reserve_b, args.amount_in)?)?)?;
    let next_reserve_b = checked_add(pool_state.reserve_b, args.amount_in)?;
    pool_state.reserve_a = next_reserve_a;
    pool_state.reserve_b = next_reserve_b;
    PoolState::store(pool, &pool_state)?;
    Ok(())
}

