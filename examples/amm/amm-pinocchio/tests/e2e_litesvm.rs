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
struct PoolState {
    reserve_a: u64,
    reserve_b: u64,
    total_lp: u64,
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

fn encode_create_pool(token_mint_a: Pubkey, token_mint_b: Pubkey, lp_mint: Pubkey) -> Vec<u8> {
    let mut data = vec![0u8];
    data.extend_from_slice(token_mint_a.as_ref());
    data.extend_from_slice(token_mint_b.as_ref());
    data.extend_from_slice(lp_mint.as_ref());
    data
}

fn encode_add_liquidity(amount_a: u64, amount_b: u64) -> Vec<u8> {
    let mut data = vec![1u8];
    data.extend_from_slice(&amount_a.to_le_bytes());
    data.extend_from_slice(&amount_b.to_le_bytes());
    data
}

fn encode_u64(ix_discriminator: u8, value: u64) -> Vec<u8> {
    let mut data = vec![ix_discriminator];
    data.extend_from_slice(&value.to_le_bytes());
    data
}

#[test]
fn e2e_create_add_and_swap() {
    let mut svm = LiteSVM::new();

    let program_id = Pubkey::new_unique();
    let program_bytes = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/target/deploy/amm_pinocchio.so"
    ));
    svm.add_program(program_id, program_bytes).unwrap();

    let payer = Keypair::new();
    let payer_pubkey = payer.pubkey();
    svm.airdrop(&payer_pubkey, 2_000_000_000).unwrap();

    let token_mint_a = Keypair::new();
    let token_mint_b = Keypair::new();
    let lp_mint = Keypair::new();

    let (pool, _pool_bump) = Pubkey::find_program_address(
        &[b"pool", token_mint_a.pubkey().as_ref(), token_mint_b.pubkey().as_ref()],
        &program_id,
    );
    let (pool_authority, _auth_bump) =
        Pubkey::find_program_address(&[b"authority", pool.as_ref()], &program_id);

    let rent = svm.get_sysvar::<Rent>();

    let create_token_mint_a = create_account(
        &payer_pubkey,
        &token_mint_a.pubkey(),
        rent.minimum_balance(Mint::LEN),
        Mint::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_token_mint_a = token_instruction::initialize_mint2(
        &TOKEN_PROGRAM_ID,
        &token_mint_a.pubkey(),
        &payer_pubkey,
        None,
        6,
    )
    .unwrap();

    let create_token_mint_b = create_account(
        &payer_pubkey,
        &token_mint_b.pubkey(),
        rent.minimum_balance(Mint::LEN),
        Mint::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_token_mint_b = token_instruction::initialize_mint2(
        &TOKEN_PROGRAM_ID,
        &token_mint_b.pubkey(),
        &payer_pubkey,
        None,
        6,
    )
    .unwrap();

    let create_lp_mint = create_account(
        &payer_pubkey,
        &lp_mint.pubkey(),
        rent.minimum_balance(Mint::LEN),
        Mint::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_lp_mint = token_instruction::initialize_mint2(
        &TOKEN_PROGRAM_ID,
        &lp_mint.pubkey(),
        &pool_authority,
        None,
        6,
    )
    .unwrap();

    let user_a = Keypair::new();
    let user_b = Keypair::new();
    let vault_a = Keypair::new();
    let vault_b = Keypair::new();
    let user_lp = Keypair::new();

    let create_user_a = create_account(
        &payer_pubkey,
        &user_a.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_user_a = token_instruction::initialize_account3(
        &TOKEN_PROGRAM_ID,
        &user_a.pubkey(),
        &token_mint_a.pubkey(),
        &payer_pubkey,
    )
    .unwrap();

    let create_user_b = create_account(
        &payer_pubkey,
        &user_b.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_user_b = token_instruction::initialize_account3(
        &TOKEN_PROGRAM_ID,
        &user_b.pubkey(),
        &token_mint_b.pubkey(),
        &payer_pubkey,
    )
    .unwrap();

    let create_vault_a = create_account(
        &payer_pubkey,
        &vault_a.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_vault_a = token_instruction::initialize_account3(
        &TOKEN_PROGRAM_ID,
        &vault_a.pubkey(),
        &token_mint_a.pubkey(),
        &pool_authority,
    )
    .unwrap();

    let create_vault_b = create_account(
        &payer_pubkey,
        &vault_b.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_vault_b = token_instruction::initialize_account3(
        &TOKEN_PROGRAM_ID,
        &vault_b.pubkey(),
        &token_mint_b.pubkey(),
        &pool_authority,
    )
    .unwrap();

    let create_user_lp = create_account(
        &payer_pubkey,
        &user_lp.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init_user_lp = token_instruction::initialize_account3(
        &TOKEN_PROGRAM_ID,
        &user_lp.pubkey(),
        &lp_mint.pubkey(),
        &payer_pubkey,
    )
    .unwrap();

    let mint_user_a = token_instruction::mint_to(
        &TOKEN_PROGRAM_ID,
        &token_mint_a.pubkey(),
        &user_a.pubkey(),
        &payer_pubkey,
        &[],
        1_200_000,
    )
    .unwrap();
    let mint_user_b = token_instruction::mint_to(
        &TOKEN_PROGRAM_ID,
        &token_mint_b.pubkey(),
        &user_b.pubkey(),
        &payer_pubkey,
        &[],
        2_000_000,
    )
    .unwrap();

    let setup_tx = Transaction::new_signed_with_payer(
        &[
            create_token_mint_a,
            init_token_mint_a,
            create_token_mint_b,
            init_token_mint_b,
            create_lp_mint,
            init_lp_mint,
            create_user_a,
            init_user_a,
            create_user_b,
            init_user_b,
            create_vault_a,
            init_vault_a,
            create_vault_b,
            init_vault_b,
            create_user_lp,
            init_user_lp,
            mint_user_a,
            mint_user_b,
        ],
        Some(&payer_pubkey),
        &[
            &payer,
            &token_mint_a,
            &token_mint_b,
            &lp_mint,
            &user_a,
            &user_b,
            &vault_a,
            &vault_b,
            &user_lp,
        ],
        svm.latest_blockhash(),
    );
    svm.send_transaction(setup_tx).unwrap();

    let create_pool_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer_pubkey, true),
            AccountMeta::new(pool, false),
            AccountMeta::new_readonly(pool_authority, false),
            AccountMeta::new_readonly(token_mint_a.pubkey(), false),
            AccountMeta::new_readonly(token_mint_b.pubkey(), false),
            AccountMeta::new(lp_mint.pubkey(), false),
            AccountMeta::new(vault_a.pubkey(), false),
            AccountMeta::new(vault_b.pubkey(), false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: encode_create_pool(token_mint_a.pubkey(), token_mint_b.pubkey(), lp_mint.pubkey()),
    };

    let add_liquidity_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(payer_pubkey, true),
            AccountMeta::new(pool, false),
            AccountMeta::new_readonly(pool_authority, false),
            AccountMeta::new(user_a.pubkey(), false),
            AccountMeta::new(user_b.pubkey(), false),
            AccountMeta::new(vault_a.pubkey(), false),
            AccountMeta::new(vault_b.pubkey(), false),
            AccountMeta::new(lp_mint.pubkey(), false),
            AccountMeta::new(user_lp.pubkey(), false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
        ],
        data: encode_add_liquidity(1_000_000, 2_000_000),
    };

    let swap_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(payer_pubkey, true),
            AccountMeta::new(pool, false),
            AccountMeta::new_readonly(pool_authority, false),
            AccountMeta::new(user_a.pubkey(), false),
            AccountMeta::new(user_b.pubkey(), false),
            AccountMeta::new(vault_a.pubkey(), false),
            AccountMeta::new(vault_b.pubkey(), false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
        ],
        data: encode_u64(3, 100_000),
    };

    let tx = Transaction::new_signed_with_payer(
        &[create_pool_ix, add_liquidity_ix, swap_ix],
        Some(&payer_pubkey),
        &[&payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).unwrap();

    let pool_account = svm.get_account(&pool).unwrap();
    let state = decode_pool_state(&pool_account.data);
    let expected_swap_out = ((100_000u128) * (2_000_000u128) / (1_000_000u128 + 100_000u128)) as u64;

    assert_eq!(state.reserve_a, 1_000_000 + 100_000);
    assert_eq!(state.reserve_b, 2_000_000 - expected_swap_out);
    assert_eq!(state.total_lp, 1_000_000);

    let user_a_account = svm.get_account(&user_a.pubkey()).unwrap();
    let user_a_state = TokenAccount::unpack(&user_a_account.data).unwrap();
    let user_b_account = svm.get_account(&user_b.pubkey()).unwrap();
    let user_b_state = TokenAccount::unpack(&user_b_account.data).unwrap();
    let user_lp_account = svm.get_account(&user_lp.pubkey()).unwrap();
    let user_lp_state = TokenAccount::unpack(&user_lp_account.data).unwrap();
    let vault_a_account = svm.get_account(&vault_a.pubkey()).unwrap();
    let vault_a_state = TokenAccount::unpack(&vault_a_account.data).unwrap();
    let vault_b_account = svm.get_account(&vault_b.pubkey()).unwrap();
    let vault_b_state = TokenAccount::unpack(&vault_b_account.data).unwrap();

    assert_eq!(user_a_state.amount, 100_000);
    assert_eq!(user_b_state.amount, expected_swap_out);
    assert_eq!(user_lp_state.amount, 1_000_000);
    assert_eq!(vault_a_state.amount, 1_000_000 + 100_000);
    assert_eq!(vault_b_state.amount, 2_000_000 - expected_swap_out);
}
