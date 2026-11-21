import { decodeEventLog, toEventSelector, type Address } from 'viem';
import { ammoraLaunchFactoryV4Abi, segmentedALCLaunchFactoryV3Abi } from '@ammora-protocol/sdk';
import baked from '../data/launches.json';
import { EXPLORER_URL, FACTORY_V3, FACTORY_V4 } from './chain';

export type Launch = {
  generation: 'v4' | 'v3';
  factory: string;
  token: Address;
  curve: Address;
  creator: Address;
  configId: string;
  configHash: string;
  protocolVersion: number;
  metadataURI: string;
  blockNumber: number;
  txHash: string;
  name: string | null;
  symbol: string | null;
  decimals: number;
  totalSupply: string | null;
  holders: number | null;
  iconUrl: string | null;
  timestamp: string | null;
};

export const bakedLaunches: Launch[] = (baked as { launches: Launch[] }).launches;
export const bakedAt: string = (baked as { generatedAt: string }).generatedAt;

const FACTORIES = [
  { generation: 'v4' as const, address: FACTORY_V4, abi: ammoraLaunchFactoryV4Abi, fromBlock: 36220000 },
  { generation: 'v3' as const, address: FACTORY_V3, abi: segmentedALCLaunchFactoryV3Abi, fromBlock: 32472683 },
];

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function enrichToken(partial: Omit<Launch, 'name' | 'symbol' | 'decimals' | 'totalSupply' | 'holders' | 'iconUrl' | 'timestamp'>): Promise<Launch> {
  let base: Launch = { ...partial, name: null, symbol: null, decimals: 18, totalSupply: null, holders: null, iconUrl: null, timestamp: null };
  try {
    const t = await fetchJson(`${EXPLORER_URL}/api/v2/tokens/${partial.token}`);
    base = {
      ...base,
      name: t.name ?? null,
      symbol: t.symbol ?? null,
      decimals: t.decimals != null ? Number(t.decimals) : 18,
      totalSupply: t.total_supply ?? null,
      holders: t.holders_count != null ? Number(t.holders_count) : null,
      iconUrl: t.icon_url ?? null,
    };
  } catch { /* keep nulls; the UI falls back to the address */ }
  try {
    const b = await fetchJson(`${EXPLORER_URL}/api/v2/blocks/${partial.blockNumber}`);
    base = { ...base, timestamp: b.timestamp ?? null };
  } catch { /* optional */ }
  return base;
}

/**
 * Live refresh of the launch list straight from the chain's explorer index:
 * LaunchCreated logs of both reviewed Ammora factories, decoded in the
 * browser with the official SDK ABIs. Falls back to the baked snapshot when
 * the explorer is unreachable.
 */
export async function refreshLaunches(known: Launch[]): Promise<Launch[]> {
  const knownByKey = new Map(known.map((l) => [`${l.txHash}:${l.token}`, l]));
  const out: Launch[] = [];
  for (const f of FACTORIES) {
    const event = f.abi.find((e) => e.type === 'event' && e.name === 'LaunchCreated')!;
    const topic = toEventSelector(event as never);
    const url =
      `${EXPLORER_URL}/api?module=logs&action=getLogs&fromBlock=${f.fromBlock}` +
      `&toBlock=latest&address=${f.address}&topic0=${topic}`;
    const json = await fetchJson(url);
    if (!Array.isArray(json.result)) throw new Error(`Explorer getLogs failed for ${f.address}`);
    for (const log of json.result) {
      const decoded = decodeEventLog({ abi: f.abi as never, data: log.data, topics: log.topics }) as any;
      const key = `${log.transactionHash}:${decoded.args.token}`;
      const existing = knownByKey.get(key);
      if (existing) {
        out.push(existing);
      } else {
        out.push(
          await enrichToken({
            generation: f.generation,
            factory: f.address,
            token: decoded.args.token,
            curve: decoded.args.curve,
            creator: decoded.args.creator,
            configId: decoded.args.configId.toString(),
            configHash: decoded.args.configHash,
            protocolVersion: decoded.args.protocolVersion,
            metadataURI: decoded.args.metadataURI ?? '',
            blockNumber: parseInt(log.blockNumber, 16),
            txHash: log.transactionHash,
          }),
        );
      }
    }
  }
  out.sort((a, b) => b.blockNumber - a.blockNumber);
  return out;
}
