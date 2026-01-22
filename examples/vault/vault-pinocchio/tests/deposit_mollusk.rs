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
use spl_token_interface::state::{Account as TokenAccount, AccountState, Mint};
use spl_token_interface::ID as TOKEN_PROGRAM_ID;

const VAULT_STATE_LEN: usize = 113;

#[derive(Debug)]
struct VaultState {
    total_deposits: u64,
    total_shares: u64,
}

fn pack_vault_state(
    admin: Pubkey,
    underlying_mint: Pubkey,
    share_mint: Pubkey,
    total_deposits: u64,
    total_shares: u64,
    bump: u8,
) -> Vec<u8> {
    let mut data = vec![0u8; VAULT_STATE_LEN];
    data[0..32].copy_from_slice(admin.as_ref());
    data[32..64].copy_from_slice(underlying_mint.as_ref());
    data[64..96].copy_from_slice(share_mint.as_ref());
    data[96..104].copy_from_slice(&total_deposits.to_le_bytes());
    data[104..112].copy_from_slice(&total_shares.to_le_bytes());
    data[112] = bump;
    data
}

fn decode_vault_state(data: &[u8]) -> VaultState {
    let mut total_deposits_bytes = [0u8; 8];
    total_deposits_bytes.copy_from_slice(&data[96..104]);
    let mut total_shares_bytes = [0u8; 8];
    total_shares_bytes.copy_from_slice(&data[104..112]);

    VaultState {
        total_deposits: u64::from_le_bytes(total_deposits_bytes),
        total_shares: u64::from_le_bytes(total_shares_bytes),
    }
}

fn mint_account(mint_authority: Pubkey, decimals: u8) -> Account {
    let mint = Mint {
        mint_authority: COption::Some(mint_authority),
        supply: 0,
        decimals,
        is_initialized: true,
        freeze_authority: COption::None,
    };
    let mut data = vec![0u8; Mint::LEN];
    Mint::pack(mint, &mut data).unwrap();
    Account {
        lamports: 1_000_000,
        data,
        owner: TOKEN_PROGRAM_ID,
        executable: false,
        rent_epoch: 0,
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
fn deposit_mints_shares() {
    let program_id = Pubkey::new_unique();
    let user = Pubkey::new_unique();
    let underlying_mint = Pubkey::new_unique();
    let share_mint = Pubkey::new_unique();
    let vault = Pubkey::new_unique();
    let (vault_authority, _vault_bump) =
        Pubkey::find_program_address(&[b"authority", vault.as_ref()], &program_id);
    let user_underlying = Pubkey::new_unique();
    let vault_underlying = Pubkey::new_unique();
    let user_shares = Pubkey::new_unique();

    let mut mollusk = Mollusk::default();
    token::add_program(&mut mollusk);
    let program_path = format!(
        "{}/target/deploy/vault_pinocchio",
        env!("CARGO_MANIFEST_DIR")
    );
    mollusk.add_program(&program_id, &program_path);

    let vault_state_data = pack_vault_state(user, underlying_mint, share_mint, 0, 0, 0);
    let vault_account = Account {
        lamports: 1_000_000,
        data: vault_state_data,
        owner: program_id,
        executable: false,
        rent_epoch: 0,
    };

    let amount: u64 = 500_000;

    let accounts = vec![
        (user, Account {
            lamports: 1_000_000,
            data: vec![],
            owner: system_program::id(),
            executable: false,
            rent_epoch: 0,
        }),
        (vault, vault_account),
        (vault_authority, Account {
            lamports: 1,
            data: vec![],
            owner: program_id,
            executable: false,
            rent_epoch: 0,
        }),
        (user_underlying, token_account(user, underlying_mint, amount)),
        (vault_underlying, token_account(vault_authority, underlying_mint, 0)),
        (share_mint, mint_account(vault_authority, 6)),
        (user_shares, token_account(user, share_mint, 0)),
        (TOKEN_PROGRAM_ID, Account {
            lamports: 1,
            data: vec![],
            owner: bpf_loader_upgradeable::id(),
            executable: true,
            rent_epoch: 0,
        }),
    ];

    let mut data = vec![1u8];
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(user, true),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(vault_authority, false),
            AccountMeta::new(user_underlying, false),
            AccountMeta::new(vault_underlying, false),
            AccountMeta::new(share_mint, false),
            AccountMeta::new(user_shares, false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
        ],
        data,
    };

    let result = mollusk.process_and_validate_instruction(&ix, &accounts, &[Check::success()]);
    assert!(result.raw_result.is_ok());

    let vault_after = result.get_account(&vault).unwrap();
    let state = decode_vault_state(&vault_after.data);
    assert_eq!(state.total_deposits, amount);
    assert_eq!(state.total_shares, amount);

    let user_underlying_after =
        TokenAccount::unpack(&result.get_account(&user_underlying).unwrap().data).unwrap();
    let vault_underlying_after =
        TokenAccount::unpack(&result.get_account(&vault_underlying).unwrap().data).unwrap();
    let user_shares_after =
        TokenAccount::unpack(&result.get_account(&user_shares).unwrap().data).unwrap();

    assert_eq!(user_underlying_after.amount, 0);
    assert_eq!(vault_underlying_after.amount, amount);
    assert_eq!(user_shares_after.amount, amount);
}
