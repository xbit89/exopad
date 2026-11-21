import { useEffect, useMemo, useState } from 'react';
import type { Address, WalletClient } from 'viem';
import { bakedAt, bakedLaunches, refreshLaunches, type Launch } from './lib/launches';
import { connectWallet } from './lib/wallet';
import {
  AGGREGATION_ROUTER,
  FACTORY_V3,
  FACTORY_V4,
  explorerAddress,
  explorerToken,
  explorerTx,
  publicClient,
  shortAddress,
} from './lib/chain';
import { fmtAmount, fmtDateTime, timeAgo } from './lib/format';
import SwapPanel from './components/SwapPanel';
import CurveStatePanel from './components/CurveStatePanel';

type GenFilter = 'all' | 'v4' | 'v3';
type SortMode = 'newest' | 'oldest' | 'holders';

export default function App() {
  const [launches, setLaunches] = useState<Launch[]>(bakedLaunches);
  const [selectedKey, setSelectedKey] = useState<string>(`${bakedLaunches[0].txHash}:${bakedLaunches[0].token}`);
  const [query, setQuery] = useState('');
  const [gen, setGen] = useState<GenFilter>('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [block, setBlock] = useState<bigint | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  const selected = useMemo(
    () => launches.find((l) => `${l.txHash}:${l.token}` === selectedKey) ?? launches[0],
    [launches, selectedKey],
  );

  useEffect(() => {
    let stop = false;
    const tick = () => {
      publicClient
        .getBlockNumber()
        .then((b) => {
          if (!stop) setBlock(b);
        })
        .catch(() => undefined);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const fresh = await refreshLaunches(launches);
      setLaunches(fresh);
      setRefreshNote(`Live list updated — ${fresh.length} launches indexed from chain events.`);
    } catch (e) {
      setRefreshNote(
        `Live refresh failed (${e instanceof Error ? e.message : String(e)}). Showing the snapshot from ${new Date(bakedAt).toLocaleString()}.`,
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function onConnect() {
    setWalletError(null);
    try {
      const { address, walletClient: wc } = await connectWallet();
      setAccount(address);
      setWalletClient(wc);
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : String(e));
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = launches.filter((l) => {
      if (gen !== 'all' && l.generation !== gen) return false;
      if (!q) return true;
      return (
        (l.symbol ?? '').toLowerCase().includes(q) ||
        (l.name ?? '').toLowerCase().includes(q) ||
        l.token.toLowerCase().includes(q) ||
        l.creator.toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === 'newest') return b.blockNumber - a.blockNumber;
      if (sort === 'oldest') return a.blockNumber - b.blockNumber;
      return (b.holders ?? 0) - (a.holders ?? 0);
    });
    return list;
  }, [launches, query, gen, sort]);

  const v4Count = launches.filter((l) => l.generation === 'v4').length;
  const v3Count = launches.length - v4Count;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" aria-hidden>◆</div>
          <div>
            <div className="brand-name">ExoPad</div>
            <div className="brand-sub">Ammora launch explorer &amp; swap</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="chip chip-chain" title="Current GIWA Sepolia head block">
            GIWA Sepolia{block !== null ? ` · block ${block.toString()}` : ''}
          </span>
          {account ? (
            <span className="chip chip-wallet" title={account}>● {shortAddress(account)}</span>
          ) : (
            <button className="btn btn-connect" onClick={() => void onConnect()}>Connect wallet</button>
          )}
        </div>
      </header>

      <section className="hero">
        <h1>Every token launched on <span className="grad">Ammora</span>, one pad.</h1>
        <p>
          ExoPad indexes real <strong>LaunchCreated</strong> events from Ammora's reviewed factories on
          GIWA Sepolia and plans live swaps with the official <code>@ammora-protocol/sdk</code> — quotes,
          calldata and execution are all produced by the SDK against the live chain. Testnet only; no real funds.
        </p>
        <div className="stats">
          <div className="stat"><span className="stat-num">{launches.length}</span><span className="stat-label">Launches indexed</span></div>
          <div className="stat"><span className="stat-num">{v4Count}</span><span className="stat-label">V4 generation</span></div>
          <div className="stat"><span className="stat-num">{v3Count}</span><span className="stat-label">V3 legacy</span></div>
          <div className="stat"><span className="stat-num">91342</span><span className="stat-label">Chain ID</span></div>
        </div>
        {walletError && <div className="alert alert-error">{walletError}</div>}
      </section>

      <section className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, symbol, token or creator address…"
          aria-label="Search launches"
        />
        <div className="gen-toggle">
          {(['all', 'v4', 'v3'] as GenFilter[]).map((g) => (
            <button key={g} className={gen === g ? 'active' : ''} onClick={() => setGen(g)}>
              {g === 'all' ? 'All' : g === 'v4' ? 'V4' : 'V3 legacy'}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Sort launches">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="holders">Most holders</option>
        </select>
        <button className="btn btn-ghost" onClick={() => void onRefresh()} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '↻ Refresh from chain'}
        </button>
      </section>
      {refreshNote && <p className="refresh-note">{refreshNote}</p>}

      <main className="layout">
        <section className="list" aria-label="Launches">
          {filtered.length === 0 && <div className="empty">No launches match your filters.</div>}
          {filtered.map((l) => {
            const key = `${l.txHash}:${l.token}`;
            const active = selected && `${selected.txHash}:${selected.token}` === key;
            return (
              <button key={key} className={`row${active ? ' active' : ''}`} onClick={() => setSelectedKey(key)}>
                <span className="avatar">{(l.symbol ?? '?').slice(0, 2).toUpperCase()}</span>
                <span className="row-main">
                  <span className="row-title">
                    {l.name ?? 'Unknown token'} <span className="sym">${l.symbol ?? '—'}</span>
                  </span>
                  <span className="row-sub">
                    {timeAgo(l.timestamp)} · block {l.blockNumber.toLocaleString()} · by {shortAddress(l.creator)}
                  </span>
                </span>
                <span className="row-side">
                  <span className={`badge ${l.generation}`}>{l.generation.toUpperCase()}</span>
                  <span className="holders">{l.holders ?? '—'} holders</span>
                </span>
              </button>
            );
          })}
        </section>

        {selected && (
          <aside className="detail" aria-label="Launch detail">
            <div className="detail-head">
              <span className="avatar big">{(selected.symbol ?? '?').slice(0, 2).toUpperCase()}</span>
              <div>
                <h2>{selected.name ?? 'Unknown token'} <span className="sym">${selected.symbol ?? '—'}</span></h2>
                <span className={`badge ${selected.generation}`}>
                  {selected.generation === 'v4' ? 'V4 · auto-route generation' : 'V3 · legacy generation'}
                </span>
              </div>
            </div>

            <dl className="meta">
              <div><dt>Token</dt><dd><a href={explorerToken(selected.token)} target="_blank" rel="noreferrer">{shortAddress(selected.token)} ↗</a></dd></div>
              <div><dt>Launch curve</dt><dd><a href={explorerAddress(selected.curve)} target="_blank" rel="noreferrer">{shortAddress(selected.curve)} ↗</a></dd></div>
              <div><dt>Creator</dt><dd><a href={explorerAddress(selected.creator)} target="_blank" rel="noreferrer">{shortAddress(selected.creator)} ↗</a></dd></div>
              <div><dt>Factory</dt><dd><a href={explorerAddress(selected.factory)} target="_blank" rel="noreferrer">{shortAddress(selected.factory)} ↗</a></dd></div>
              <div><dt>Launched</dt><dd>{fmtDateTime(selected.timestamp)} (block {selected.blockNumber.toLocaleString()})</dd></div>
              <div><dt>Launch tx</dt><dd><a href={explorerTx(selected.txHash)} target="_blank" rel="noreferrer">{shortAddress(selected.txHash)} ↗</a></dd></div>
              <div><dt>Total supply</dt><dd>{fmtAmount(selected.totalSupply, selected.decimals)} {selected.symbol ?? ''}</dd></div>
              <div><dt>Holders</dt><dd>{selected.holders ?? '—'}</dd></div>
              <div><dt>Config ID</dt><dd>{selected.configId}</dd></div>
              {selected.metadataURI && (
                <div><dt>Metadata</dt><dd className="break">{selected.metadataURI.startsWith('http')
                  ? <a href={selected.metadataURI} target="_blank" rel="noreferrer">token metadata ↗</a>
                  : 'inline data URI'}</dd></div>
              )}
            </dl>

            {selected.generation === 'v4' ? (
              <SwapPanel
                key={selected.token}
                launch={selected}
                account={account}
                walletClient={walletClient}
                onConnect={() => void onConnect()}
              />
            ) : (
              <CurveStatePanel key={selected.token} launch={selected} />
            )}
          </aside>
        )}
      </main>

      <footer className="footer">
        <p>
          Built with <strong>@ammora-protocol/sdk</strong> (v0.3.9) for the Ammora Builder Mission.
          Contracts: V4 factory <a href={explorerAddress(FACTORY_V4)} target="_blank" rel="noreferrer">{shortAddress(FACTORY_V4)}</a> ·
          V3 factory <a href={explorerAddress(FACTORY_V3)} target="_blank" rel="noreferrer">{shortAddress(FACTORY_V3)}</a> ·
          Aggregation router <a href={explorerAddress(AGGREGATION_ROUTER)} target="_blank" rel="noreferrer">{shortAddress(AGGREGATION_ROUTER)}</a>
        </p>
        <p className="dim">
          ExoPad is an independent community build, not affiliated with Ammora or GIWA. GIWA Sepolia is a
          testnet — tokens have no monetary value. Launch data is indexed from on-chain factory events via
          the official explorer; quotes and curve state are read live from the chain through the SDK.
          Always verify transactions in your own wallet before signing.
        </p>
      </footer>
    </div>
  );
}
