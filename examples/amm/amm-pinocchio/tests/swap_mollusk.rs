use mollusk_svm::{result::Check, Mollusk};
use mollusk_svm_programs_token::token;
use solana_program_option::COption;
use solana_program_pack::Pack;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
};
use solana_sdk_ids::{bpf_loader_upgradeable, system_program};
use spl_token_interface::state::{Account as TokenAccount, AccountState};
use spl_token_interface::ID as TOKEN_PROGRAM_ID;

const POOL_STATE_LEN: usize = 153;

#[derive(Debug)]
struct PoolState {
    reserve_a: u64,
    reserve_b: u64,
    total_lp: u64,
}

fn pack_pool_state(
    admin: Pubkey,
    token_mint_a: Pubkey,
    token_mint_b: Pubkey,
    lp_mint: Pubkey,
    reserve_a: u64,
    reserve_b: u64,
    total_lp: u64,
    bump: u8,
) -> Vec<u8> {
    let mut data = vec![0u8; POOL_STATE_LEN];
    data[0..32].copy_from_slice(admin.as_ref());
    data[32..64].copy_from_slice(token_mint_a.as_ref());
    data[64..96].copy_from_slice(token_mint_b.as_ref());
    data[96..128].copy_from_slice(lp_mint.as_ref());
    data[128..136].copy_from_slice(&reserve_a.to_le_bytes());
    data[136..144].copy_from_slice(&reserve_b.to_le_bytes());
    data[144..152].copy_from_slice(&total_lp.to_le_bytes());
    data[152] = bump;
    data
}

fn decode_pool_state(data: &[u8]) -> PoolState {
    let mut reserve_a_bytes = [0u8; 8];
    reserve_a_bytes.copy_from_slice(&data[128..136]);
    let mut reserve_b_bytes = [0u8; 8];
    reserve_b_bytes.copy_from_slice(&data[136..144]);
    let mut total_lp_bytes = [0u8; 8];
    total_lp_bytes.copy_from_slice(&data[144..152]);

    PoolState {
        reserve_a: u64::from_le_bytes(reserve_a_bytes),
        reserve_b: u64::from_le_bytes(reserve_b_bytes),
        total_lp: u64::from_le_bytes(total_lp_bytes),
    }
}

fn token_account(owner: Pubkey, mint: Pubkey, amount: u64) -> Account {
    let token = TokenAccount {
        mint,
        owner,
        amount,
        delegate: COption::None,
        state: AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    };
    let mut data = vec![0u8; TokenAccount::LEN];
    TokenAccount::pack(token, &mut data).unwrap();
    Account {
        lamports: 1_000_000,
        data,
        owner: TOKEN_PROGRAM_ID,
        executable: false,
        rent_epoch: 0,
    }
}

#[test]
fn swap_a_for_b_updates_reserves_and_balances() {
    let program_id = Pubkey::new_unique();
    let user = Pubkey::new_unique();
    let token_mint_a = Pubkey::new_unique();
    let token_mint_b = Pubkey::new_unique();
    let lp_mint = Pubkey::new_unique();
    let pool = Pubkey::new_unique();
    let (pool_authority, _auth_bump) =
        Pubkey::find_program_address(&[b"authority", pool.as_ref()], &program_id);
    let user_a = Pubkey::new_unique();
    let user_b = Pubkey::new_unique();
    let vault_a = Pubkey::new_unique();
    let vault_b = Pubkey::new_unique();

    let mut mollusk = Mollusk::default();
    token::add_program(&mut mollusk);
    let program_path = format!(
        "{}/target/deploy/amm_pinocchio",
        env!("CARGO_MANIFEST_DIR")
    );
    mollusk.add_program(&program_id, &program_path);

    let reserve_a: u64 = 1_000_000;
    let reserve_b: u64 = 2_000_000;
    let amount_in: u64 = 100_000;
    let amount_out = ((amount_in as u128) * (reserve_b as u128)
        / ((reserve_a + amount_in) as u128)) as u64;

    let pool_state_data = pack_pool_state(
        user,
        token_mint_a,
        token_mint_b,
        lp_mint,
        reserve_a,
        reserve_b,
        0,
        0,
    );
    let pool_account = Account {
        lamports: 1_000_000,
        data: pool_state_data,
        owner: program_id,
        executable: false,
        rent_epoch: 0,
    };

    let accounts = vec![
        (
            user,
            Account {
                lamports: 1_000_000,
                data: vec![],
                owner: system_program::id(),
                executable: false,
                rent_epoch: 0,
            },
        ),
        (pool, pool_account),
        (
            pool_authority,
            Account {
                lamports: 1,
                data: vec![],
                owner: program_id,
                executable: false,
                rent_epoch: 0,
            },
        ),
        (user_a, token_account(user, token_mint_a, amount_in)),
        (user_b, token_account(user, token_mint_b, 0)),
        (vault_a, token_account(pool_authority, token_mint_a, reserve_a)),
        (vault_b, token_account(pool_authority, token_mint_b, reserve_b)),
        (
            TOKEN_PROGRAM_ID,
            Account {
                lamports: 1,
                data: vec![],
                owner: bpf_loader_upgradeable::id(),
                executable: true,
                rent_epoch: 0,
            },
        ),
    ];

    let mut data = vec![3u8];
    data.extend_from_slice(&amount_in.to_le_bytes());

    let ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(user, true),
            AccountMeta::new(pool, false),
            AccountMeta::new_readonly(pool_authority, false),
            AccountMeta::new(user_a, false),
            AccountMeta::new(user_b, false),
            AccountMeta::new(vault_a, false),
            AccountMeta::new(vault_b, false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
        ],
        data,
    };

    let result = mollusk.process_and_validate_instruction(&ix, &accounts, &[Check::success()]);
    assert!(result.raw_result.is_ok());

    let pool_after = result.get_account(&pool).unwrap();
    let state = decode_pool_state(&pool_after.data);
    assert_eq!(state.reserve_a, reserve_a + amount_in);
    assert_eq!(state.reserve_b, reserve_b - amount_out);
    assert_eq!(state.total_lp, 0);

    let user_a_after =
        TokenAccount::unpack(&result.get_account(&user_a).unwrap().data).unwrap();
    let user_b_after =
        TokenAccount::unpack(&result.get_account(&user_b).unwrap().data).unwrap();
    let vault_a_after =
        TokenAccount::unpack(&result.get_account(&vault_a).unwrap().data).unwrap();
    let vault_b_after =
        TokenAccount::unpack(&result.get_account(&vault_b).unwrap().data).unwrap();

    assert_eq!(user_a_after.amount, 0);
    assert_eq!(user_b_after.amount, amount_out);
    assert_eq!(vault_a_after.amount, reserve_a + amount_in);
    assert_eq!(vault_b_after.amount, reserve_b - amount_out);
}
