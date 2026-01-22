use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_program_pack::Pack;
use solana_rent::Rent;
use solana_signer::Signer;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
};
use solana_system_interface::instruction::create_account;
use solana_transaction::Transaction;
use solana_sdk_ids::system_program;
use spl_token_interface::{
  instruction as token_instruction,
  state::{Account as TokenAccount, Mint},
  ID as TOKEN_PROGRAM_ID,
};

#[derive(Debug)]
struct VaultState {
    total_deposits: u64,
    total_shares: u64,
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

fn encode_create_vault(underlying_mint: Pubkey, share_mint: Pubkey) -> Vec<u8> {
    let mut data = vec![0u8];
    data.extend_from_slice(underlying_mint.as_ref());
    data.extend_from_slice(share_mint.as_ref());
    data
}

fn encode_u64(ix_discriminator: u8, value: u64) -> Vec<u8> {
    let mut data = vec![ix_discriminator];
    data.extend_from_slice(&value.to_le_bytes());
    data
}

#[test]
fn e2e_create_deposit_withdraw() {
    let mut svm = LiteSVM::new();

    let program_id = Pubkey::new_unique();
    let program_bytes = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/target/deploy/vault_pinocchio.so"
    ));
    svm.add_program(program_id, program_bytes).unwrap();

    let payer = Keypair::new();
    let payer_pubkey = payer.pubkey();
    svm.airdrop(&payer_pubkey, 2_000_000_000).unwrap();

    let underlying_mint = Keypair::new();
    let share_mint = Keypair::new();

    let (vault, _vault_bump) = Pubkey::find_program_address(
        &[b"vault", underlying_mint.pubkey().as_ref()],
        &program_id,
    );
    let (vault_authority, _auth_bump) =
        Pubkey::find_program_address(&[b"authority", vault.as_ref()], &program_id);

    let rent = svm.get_sysvar::<Rent>();

    let create_underlying_mint = create_account(
        &payer_pubkey,
        &underlying_mint.pubkey(),
        rent.minimum_balance(Mint::LEN),
        Mint::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_underlying_mint = token_instruction::initialize_mint2(
        &TOKEN_PROGRAM_ID,
        &underlying_mint.pubkey(),
        &payer_pubkey,
        None,
        6,
    )
    .unwrap();

    let create_share_mint = create_account(
        &payer_pubkey,
        &share_mint.pubkey(),
        rent.minimum_balance(Mint::LEN),
        Mint::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_share_mint = token_instruction::initialize_mint2(
        &TOKEN_PROGRAM_ID,
        &share_mint.pubkey(),
        &vault_authority,
        None,
        6,
    )
    .unwrap();

    let user_underlying = Keypair::new();
    let vault_underlying = Keypair::new();
    let user_shares = Keypair::new();

    let create_user_underlying = create_account(
        &payer_pubkey,
        &user_underlying.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_user_underlying = token_instruction::initialize_account3(
        &TOKEN_PROGRAM_ID,
        &user_underlying.pubkey(),
        &underlying_mint.pubkey(),
        &payer_pubkey,
    )
    .unwrap();

    let create_vault_underlying = create_account(
        &payer_pubkey,
        &vault_underlying.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_vault_underlying = token_instruction::initialize_account3(
        &TOKEN_PROGRAM_ID,
        &vault_underlying.pubkey(),
        &underlying_mint.pubkey(),
        &vault_authority,
    )
    .unwrap();

    let create_user_shares = create_account(
        &payer_pubkey,
        &user_shares.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_user_shares = token_instruction::initialize_account3(
        &TOKEN_PROGRAM_ID,
        &user_shares.pubkey(),
        &share_mint.pubkey(),
        &payer_pubkey,
    )
    .unwrap();

    let mint_underlying = token_instruction::mint_to(
        &TOKEN_PROGRAM_ID,
        &underlying_mint.pubkey(),
        &user_underlying.pubkey(),
        &payer_pubkey,
        &[],
        1_000_000,
    )
    .unwrap();

    let setup_tx = Transaction::new_signed_with_payer(
        &[
            create_underlying_mint,
            init_underlying_mint,
            create_share_mint,
            init_share_mint,
            create_user_underlying,
            init_user_underlying,
            create_vault_underlying,
            init_vault_underlying,
            create_user_shares,
            init_user_shares,
            mint_underlying,
        ],
        Some(&payer_pubkey),
        &[
            &payer,
            &underlying_mint,
            &share_mint,
            &user_underlying,
            &vault_underlying,
            &user_shares,
        ],
        svm.latest_blockhash(),
    );
    svm.send_transaction(setup_tx).unwrap();

    let create_vault_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer_pubkey, true),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(vault_authority, false),
            AccountMeta::new_readonly(underlying_mint.pubkey(), false),
            AccountMeta::new(share_mint.pubkey(), false),
            AccountMeta::new(vault_underlying.pubkey(), false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode_create_vault(underlying_mint.pubkey(), share_mint.pubkey()),
    };

    let deposit_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(payer_pubkey, true),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(vault_authority, false),
            AccountMeta::new(user_underlying.pubkey(), false),
            AccountMeta::new(vault_underlying.pubkey(), false),
            AccountMeta::new(share_mint.pubkey(), false),
            AccountMeta::new(user_shares.pubkey(), false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
        ],
        data: encode_u64(1, 1_000_000),
    };

    let withdraw_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(payer_pubkey, true),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(vault_authority, false),
            AccountMeta::new(user_shares.pubkey(), false),
            AccountMeta::new(share_mint.pubkey(), false),
            AccountMeta::new(user_underlying.pubkey(), false),
            AccountMeta::new(vault_underlying.pubkey(), false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
        ],
        data: encode_u64(2, 1_000_000),
    };

    let tx = Transaction::new_signed_with_payer(
        &[create_vault_ix, deposit_ix, withdraw_ix],
        Some(&payer_pubkey),
        &[&payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).unwrap();

    let vault_account = svm.get_account(&vault).unwrap();
    let state = decode_vault_state(&vault_account.data);
    assert_eq!(state.total_deposits, 0);
    assert_eq!(state.total_shares, 0);

    let user_underlying_account = svm.get_account(&user_underlying.pubkey()).unwrap();
    let user_underlying_state = TokenAccount::unpack(&user_underlying_account.data).unwrap();
    let user_shares_account = svm.get_account(&user_shares.pubkey()).unwrap();
    let user_shares_state = TokenAccount::unpack(&user_shares_account.data).unwrap();

    assert_eq!(user_underlying_state.amount, 1_000_000);
    assert_eq!(user_shares_state.amount, 0);
}
