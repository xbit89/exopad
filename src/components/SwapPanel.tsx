import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits, type Address, type WalletClient } from 'viem';
import type { PreparedExactInputSwap } from '../lib/ammora';
import { executeSwap, prepareSwap, type SwapSide } from '../lib/ammora';
import type { Launch } from '../lib/launches';
import { WETH, explorerTx, shortAddress } from '../lib/chain';
import { fmtAmount } from '../lib/format';

type Props = {
  launch: Launch;
  account: Address | null;
  walletClient: WalletClient | null;
  onConnect: () => void;
};

function describeStatus(status: { type: string; hash?: string }): string {
  switch (status.type) {
    case 'quote-refreshed': return 'Quote refreshed, continuing…';
    case 'approval-requested': return 'Approval requested — confirm in your wallet…';
    case 'approval-submitted': return `Approval submitted (${status.hash ? shortAddress(status.hash) : ''})…`;
    case 'approval-confirmed': return 'Approval confirmed. Sending swap…';
    case 'swap-requested': return 'Swap requested — confirm in your wallet…';
    case 'swap-submitted': return `Swap submitted (${status.hash ? shortAddress(status.hash) : ''})…`;
    case 'swap-confirmed': return 'Swap confirmed on-chain.';
    default: return status.type;
  }
}

export default function SwapPanel({ launch, account, walletClient, onConnect }: Props) {
  const symbol = launch.symbol ?? 'TOKEN';
  const [side, setSide] = useState<SwapSide>('buy');
  const [amount, setAmount] = useState('0.001');
  const [prepared, setPrepared] = useState<PreparedExactInputSwap | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [execBusy, setExecBusy] = useState(false);
  const [execLog, setExecLog] = useState<string | null>(null);
  const [resultHash, setResultHash] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const runId = useRef(0);

  const payer: Address = account ?? launch.creator;
  const inDecimals = side === 'buy' ? 18 : launch.decimals;
  const inSymbol = side === 'buy' ? 'WETH' : symbol;
  const outDecimals = side === 'buy' ? launch.decimals : 18;
  const outSymbol = side === 'buy' ? symbol : 'WETH';

  const doPrepare = useCallback(async () => {
    const id = ++runId.current;
    setPreparing(true);
    setError(null);
    try {
      const amountIn = parseUnits(amount || '0', inDecimals);
      if (amountIn <= 0n) throw new Error('Enter an amount greater than zero.');
      const p = await prepareSwap(launch, side, amountIn, payer);
      if (runId.current === id) setPrepared(p);
    } catch (e) {
      if (runId.current === id) {
        setPrepared(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (runId.current === id) setPreparing(false);
    }
  }, [launch, side, amount, inDecimals, payer]);

  // Fresh quote when the launch, side or wallet changes.
  useEffect(() => {
    void doPrepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch.token, side, payer]);

  // Keep the quote fresh while the panel is open (SDK quotes live ~30s).
  useEffect(() => {
    if (!prepared) return;
    const t = setInterval(() => void doPrepare(), 30_000);
    return () => clearInterval(t);
  }, [prepared, doPrepare]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const quote = prepared?.quote;
  const secondsLeft = quote ? Math.max(0, Math.round((quote.expiresAtMs - nowMs) / 1000)) : 0;
  const rate =
    quote && quote.amountIn > 0n
      ? Number(formatUnits(quote.expectedAmountOut, outDecimals)) / Number(formatUnits(quote.amountIn, inDecimals))
      : null;

  async function onExecute() {
    if (!prepared || !walletClient) return;
    setExecBusy(true);
    setResultHash(null);
    setExecLog('Preparing execution…');
    try {
      const result = await executeSwap(prepared, walletClient, (s) => setExecLog(describeStatus(s as { type: string; hash?: string })));
      setResultHash(result.hash);
      setExecLog(
        `Done. Received ${result.amountReceived !== null ? fmtAmount(result.amountReceived, outDecimals) : '—'} ${outSymbol}.`,
      );
      void doPrepare();
    } catch (e) {
      setExecLog(`Execution failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExecBusy(false);
    }
  }

  return (
    <div className="panel swap-panel">
      <div className="panel-head">
        <h3>Swap on the launch curve</h3>
        <span className="chip chip-live">Live via Ammora SDK</span>
      </div>

      <div className="side-toggle" role="tablist">
        <button className={side === 'buy' ? 'active buy' : ''} onClick={() => { setSide('buy'); setAmount('0.001'); setResultHash(null); }}>
          Buy {symbol}
        </button>
        <button className={side === 'sell' ? 'active sell' : ''} onClick={() => { setSide('sell'); setAmount('1000'); setResultHash(null); }}>
          Sell {symbol}
        </button>
      </div>

      <label className="amount-label">
        You {side === 'buy' ? 'pay' : 'sell'}
        <div className="amount-row">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="0.0"
            aria-label="Amount in"
          />
          <span className="amount-unit">{inSymbol}</span>
        </div>
      </label>

      <button className="btn btn-primary" onClick={() => void doPrepare()} disabled={preparing}>
        {preparing ? 'Quoting on-chain…' : 'Get live quote'}
      </button>
      <p className="hint">
        Quotes are planned by <code>AmmoraSwapClient.prepareExactIn</code> against the live curve
        (GIWA RPC can be slow — a quote may take up to a minute).
        {!account && ' Connect a wallet to execute; until then the launch creator is used as a read-only quote stand-in.'}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {quote && prepared && (
        <>
          <div className="quote-grid">
            <div>
              <span className="q-label">You receive (expected)</span>
              <span className="q-value">{fmtAmount(quote.expectedAmountOut, outDecimals)} {outSymbol}</span>
            </div>
            <div>
              <span className="q-label">Minimum (1% slippage)</span>
              <span className="q-value dim">{fmtAmount(quote.minimumAmountOut, outDecimals)} {outSymbol}</span>
            </div>
            <div>
              <span className="q-label">Rate</span>
              <span className="q-value dim">
                1 {inSymbol} ≈ {rate ? rate.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'} {outSymbol}
              </span>
            </div>
            <div>
              <span className="q-label">Curve fee</span>
              <span className="q-value dim">
                {quote.feeAmount !== null
                  ? `${fmtAmount(quote.feeAmount, quote.feeToken === launch.token ? launch.decimals : 18)} ${quote.feeToken === launch.token ? symbol : 'WETH'}`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="q-label">Quoted at block</span>
              <span className="q-value dim">#{quote.quoteBlockNumber.toString()}</span>
            </div>
            <div>
              <span className="q-label">Quote expires in</span>
              <span className="q-value dim">{secondsLeft}s</span>
            </div>
          </div>

          <details className="calldata">
            <summary>Calldata preview (unsigned)</summary>
            <div className="calldata-body">
              <div><span>to</span><code>{prepared.transaction.to}</code></div>
              <div><span>value</span><code>{(prepared.transaction.value ?? 0n).toString()} wei</code></div>
              <div><span>data</span><code className="data">{prepared.transaction.data}</code></div>
              {prepared.approvalRequirements.map((a, i) => (
                <div key={i}>
                  <span>approve</span>
                  <code>
                    {a.token === WETH ? 'WETH' : symbol} → spender {shortAddress(a.spender)} · amount {a.amount.toString()}
                  </code>
                </div>
              ))}
            </div>
          </details>

          {account ? (
            <button className="btn btn-execute" onClick={() => void onExecute()} disabled={execBusy || preparing}>
              {execBusy ? 'Executing…' : `Execute ${side} with my wallet`}
            </button>
          ) : (
            <button className="btn btn-execute" onClick={onConnect}>
              Connect wallet to execute
            </button>
          )}
          {execLog && <div className="alert alert-info">{execLog}</div>}
          {resultHash && (
            <a className="tx-link" href={explorerTx(resultHash)} target="_blank" rel="noreferrer">
              View transaction {shortAddress(resultHash)} ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}
