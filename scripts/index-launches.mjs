/**
 * ExoPad launch indexer.
 *
 * Indexes LaunchCreated events from both reviewed Ammora launch factories on
 * GIWA Sepolia and writes src/data/launches.json.
 *
 * Why the explorer API: the public GIWA RPC (https://sepolia-rpc.giwa.io)
 * caps eth_getLogs at 10,000-block ranges and, measured 2026-11-21, frequently
 * takes >120s / times out on log scans, so a full RPC scan of ~5.7M blocks is
 * impractical. The chain's official Blockscout explorer indexes the same
 * on-chain events; every record here is decoded from the raw event data with
 * the official SDK factory ABIs, and token metadata is cross-checked against
 * the explorer's token index. Quotes/state in the app are read live via RPC.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { decodeEventLog, toEventSelector } from 'viem';
import { ammoraLaunchFactoryV4Abi, segmentedALCLaunchFactoryV3Abi } from '@ammora-protocol/sdk';

const EXPLORER = 'https://sepolia-explorer.giwa.io';

const FACTORIES = [
  {
    generation: 'v4',
    label: 'Ammora V4 Factory (auto-route generation)',
    address: '0x35353a2Dab7426EcCAe6f5FB267702a542ab68fA',
    abi: ammoraLaunchFactoryV4Abi,
    fromBlock: 36220000,
  },
  {
    generation: 'v3',
    label: 'Ammora Segmented Launch Factory V3 (legacy)',
    address: '0x42acd2531e47ea789c03915c9de195bf6250c0a2',
    abi: segmentedALCLaunchFactoryV3Abi,
    fromBlock: 32472683,
  },
];

async function fetchJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function indexFactory(factory) {
  const event = factory.abi.find((e) => e.type === 'event' && e.name === 'LaunchCreated');
  const topic = toEventSelector(event);
  const url =
    `${EXPLORER}/api?module=logs&action=getLogs&fromBlock=${factory.fromBlock}` +
    `&toBlock=latest&address=${factory.address}&topic0=${topic}`;
  const json = await fetchJson(url);
  if (!Array.isArray(json.result)) {
    throw new Error(`getLogs for ${factory.address}: ${json.message ?? 'unknown error'}`);
  }
  return json.result.map((log) => {
    const decoded = decodeEventLog({ abi: factory.abi, data: log.data, topics: log.topics });
    return {
      generation: factory.generation,
      factory: factory.address,
      token: decoded.args.token,
      curve: decoded.args.curve,
      creator: decoded.args.creator,
      configId: decoded.args.configId.toString(),
      configHash: decoded.args.configHash,
      protocolVersion: decoded.args.protocolVersion,
      metadataURI: decoded.args.metadataURI ?? '',
      blockNumber: parseInt(log.blockNumber, 16),
      txHash: log.transactionHash,
    };
  });
}

async function enrichToken(launch) {
  try {
    const t = await fetchJson(`${EXPLORER}/api/v2/tokens/${launch.token}`);
    return {
      ...launch,
      name: t.name ?? null,
      symbol: t.symbol ?? null,
      decimals: t.decimals != null ? Number(t.decimals) : 18,
      totalSupply: t.total_supply ?? null,
      holders: t.holders_count != null ? Number(t.holders_count) : null,
      iconUrl: t.icon_url ?? null,
    };
  } catch {
    return { ...launch, name: null, symbol: null, decimals: 18, totalSupply: null, holders: null, iconUrl: null };
  }
}

const blockTimeCache = new Map();
async function enrichBlockTime(launch) {
  let ts = blockTimeCache.get(launch.blockNumber);
  if (ts === undefined) {
    try {
      const b = await fetchJson(`${EXPLORER}/api/v2/blocks/${launch.blockNumber}`);
      ts = b.timestamp ?? null;
    } catch {
      ts = null;
    }
    blockTimeCache.set(launch.blockNumber, ts);
  }
  return { ...launch, timestamp: ts };
}

const all = [];
for (const factory of FACTORIES) {
  const launches = await indexFactory(factory);
  console.log(`${factory.generation} factory ${factory.address}: ${launches.length} launches`);
  all.push(...launches);
}
all.sort((a, b) => b.blockNumber - a.blockNumber);

const enriched = await mapPool(all, 6, enrichToken);
const withTimes = await mapPool(enriched, 6, enrichBlockTime);

const out = {
  generatedAt: new Date().toISOString(),
  chainId: 91342,
  source:
    'LaunchCreated events of the reviewed Ammora factories, indexed via the GIWA Sepolia Blockscout explorer and decoded with @ammora-protocol/sdk ABIs',
  factories: FACTORIES.map((f) => ({ generation: f.generation, label: f.label, address: f.address, fromBlock: f.fromBlock })),
  count: withTimes.length,
  launches: withTimes,
};

await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
const path = new URL('../src/data/launches.json', import.meta.url);
await writeFile(path, JSON.stringify(out, null, 2));
console.log(`wrote ${withTimes.length} launches to src/data/launches.json`);
