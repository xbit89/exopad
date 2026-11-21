import { useEffect, useState } from 'react';
import { getCurveState, type CurveState } from '../lib/ammora';
import type { Launch } from '../lib/launches';
import { explorerAddress, shortAddress } from '../lib/chain';
import { fmtAmount } from '../lib/format';

const ZERO = '0x0000000000000000000000000000000000000000';

export default function CurveStatePanel({ launch }: { launch: Launch }) {
  const [state, setState] = useState<CurveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCurveState(launch)
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [launch, reloadKey]);

  const progress =
    state && state.migrationQuoteThreshold > 0n
      ? Math.min(100, Number((state.quoteReserve * 10000n) / state.migrationQuoteThreshold) / 100)
      : null;

  const statusLabel = !state
    ? '—'
    : state.canonicalPool !== ZERO
      ? 'Migrated to AMM pool'
      : progress !== null && progress >= 100
        ? 'Migration threshold reached'
        : 'Trading on the launch curve';

  return (
    <div className="panel swap-panel">
      <div className="panel-head">
        <h3>Legacy curve — live state</h3>
        <span className="chip">SDK ALCClient</span>
      </div>
      <p className="hint">
        This launch used the legacy V3 segmented factory. ExoPad shows its live on-chain curve state
        (read with the SDK's <code>ALCClient.getState()</code>); swap planning in ExoPad targets the
        current V4 generation.
      </p>
      {loading && <div className="alert alert-info">Reading curve state from GIWA RPC…</div>}
      {error && (
        <div className="alert alert-error">
          {error}{' '}
          <button className="linklike" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </div>
      )}
      {state && (
        <>
          <div className="quote-grid">
            <div>
              <span className="q-label">Status</span>
              <span className="q-value">{statusLabel}</span>
            </div>
            <div>
              <span className="q-label">Trading fee</span>
              <span className="q-value dim">{(state.currentFeeBps / 100).toFixed(2)}%</span>
            </div>
            <div>
              <span className="q-label">Token reserve (curve)</span>
              <span className="q-value dim">{fmtAmount(state.baseReserve, launch.decimals)} {launch.symbol ?? ''}</span>
            </div>
            <div>
              <span className="q-label">WETH reserve (curve)</span>
              <span className="q-value dim">{fmtAmount(state.quoteReserve, 18)} WETH</span>
            </div>
            <div>
              <span className="q-label">Canonical AMM pool</span>
              <span className="q-value dim">
                {state.canonicalPool === ZERO ? 'Not migrated yet' : shortAddress(state.canonicalPool)}
              </span>
            </div>
            <div>
              <span className="q-label">Curve creator</span>
              <span className="q-value dim">{shortAddress(state.creator)}</span>
            </div>
          </div>
          {progress !== null && (
            <div className="progress-wrap">
              <div className="progress-head">
                <span>Progress to migration threshold</span>
                <span>{progress.toFixed(1)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="progress-sub">
                {fmtAmount(state.quoteReserve, 18)} / {fmtAmount(state.migrationQuoteThreshold, 18)} WETH
              </span>
            </div>
          )}
          <a className="tx-link" href={explorerAddress(launch.curve)} target="_blank" rel="noreferrer">
            View curve contract ↗
          </a>
        </>
      )}
    </div>
  );
}
