import { useCallback, useMemo, useState } from 'react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  VaultClient,
  decodeVaultState,
  deriveVaultAuthorityPda,
  deriveVaultPda,
  vaultSummary,
  type VaultState,
} from '@solana-ts-transpiler/client';

const RPC_DECIMALS = Number(import.meta.env.VITE_UNDERLYING_DECIMALS ?? 6);
const UNDERLYING_MINT = import.meta.env.VITE_UNDERLYING_MINT as string | undefined;
const VAULT_ADDRESS = import.meta.env.VITE_VAULT as string | undefined;

const toBaseUnits = (ui: string, decimals: number) => {
  const parsed = Number(ui);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return BigInt(Math.round(parsed * 10 ** decimals));
};

export default function App() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amountUi, setAmountUi] = useState('');
  const [vaultState, setVaultState] = useState<VaultState | null>(null);
  const [status, setStatus] = useState<string>('');

  const underlyingMint = useMemo(() => {
    if (!UNDERLYING_MINT) return null;
    return new PublicKey(UNDERLYING_MINT);
  }, []);

  const vault = useMemo(() => {
    if (VAULT_ADDRESS) return new PublicKey(VAULT_ADDRESS);
    if (!underlyingMint) return null;
    return deriveVaultPda(underlyingMint)[0];
  }, [underlyingMint]);

  const refresh = useCallback(async () => {
    if (!vault) return;
    const account = await connection.getAccountInfo(vault);
    if (!account) {
      setVaultState(null);
      return;
    }
    setVaultState(decodeVaultState(account.data));
  }, [connection, vault]);

  const onDeposit = useCallback(async () => {
    if (!publicKey) {
      setStatus('Connect a wallet to deposit.');
      return;
    }
    if (!vault || !vaultState) {
      setStatus('Vault is not configured or not initialized.');
      return;
    }

    const amount = toBaseUnits(amountUi, RPC_DECIMALS);
    if (!amount) {
      setStatus('Enter a valid deposit amount.');
      return;
    }

    const [vaultAuthority] = deriveVaultAuthorityPda(vault);
    const shareMint = vaultState.shareMint;
    const underlying = vaultState.underlyingMint;

    const userUnderlying = getAssociatedTokenAddressSync(
      underlying,
      publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const vaultUnderlying = getAssociatedTokenAddressSync(
      underlying,
      vaultAuthority,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const userShares = getAssociatedTokenAddressSync(
      shareMint,
      publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const instructions: TransactionInstruction[] = [];

    const [userUnderlyingInfo, vaultUnderlyingInfo, userSharesInfo] = await Promise.all([
      connection.getAccountInfo(userUnderlying),
      connection.getAccountInfo(vaultUnderlying),
      connection.getAccountInfo(userShares),
    ]);

    if (!userUnderlyingInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          publicKey,
          userUnderlying,
          publicKey,
          underlying,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }

    if (!vaultUnderlyingInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          publicKey,
          vaultUnderlying,
          vaultAuthority,
          underlying,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }

    if (!userSharesInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          publicKey,
          userShares,
          publicKey,
          shareMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }

    const depositIx = VaultClient.ix.deposit(
      { amount },
      {
        user: publicKey,
        vault,
        vaultAuthority,
        userUnderlying,
        vaultUnderlying,
        shareMint,
        userShares,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    );

    const tx = new Transaction().add(...instructions, depositIx);

    setStatus('Submitting deposit...');
    const sig = await sendTransaction(tx, connection);
    await connection.confirmTransaction(sig, 'confirmed');
    setStatus('Deposit confirmed.');
    await refresh();
  }, [amountUi, connection, publicKey, refresh, sendTransaction, vault, vaultState]);

  const summary = vaultState ? vaultSummary(vaultState) : null;

  return (
    <div className="page">
      <div className="glow" />
      <header className="hero">
        <div>
          <p className="eyebrow">Pinocchio Vault</p>
          <h1>Tokenized vault, TypeScript-first.</h1>
          <p className="subhead">
            Generated client + Pinocchio program. Deposit underlying, receive shares.
          </p>
        </div>
        <div className="cta">
          <button className="refresh" onClick={refresh}>
            Refresh
          </button>
          <div className="wallet">
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <section className="grid">
        <div className="card">
          <h2>Vault summary</h2>
          {summary ? (
            <div className="stats">
              <div>
                <span>Total deposits</span>
                <strong>{summary.totalDeposits.toString()}</strong>
              </div>
              <div>
                <span>Total shares</span>
                <strong>{summary.totalShares.toString()}</strong>
              </div>
              <div>
                <span>Exchange rate</span>
                <strong>{summary.exchangeRate.toFixed(4)}</strong>
              </div>
            </div>
          ) : (
            <p className="muted">Provide VITE_UNDERLYING_MINT or VITE_VAULT to load state.</p>
          )}
          <div className="meta">
            <div>
              <span>Vault</span>
              <code>{vault?.toBase58() ?? '—'}</code>
            </div>
            <div>
              <span>Program</span>
              <code>{VaultClient.programId.toBase58()}</code>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Deposit</h2>
          <label className="field">
            <span>Amount (UI)</span>
            <input
              value={amountUi}
              onChange={(event) => setAmountUi(event.target.value)}
              placeholder="0.0"
            />
          </label>
          <button className="primary" onClick={onDeposit}>
            Deposit
          </button>
          {status && <p className="status">{status}</p>}
        </div>
      </section>
    </div>
  );
}
