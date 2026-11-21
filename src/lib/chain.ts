import { createPublicClient, defineChain, http, type Address } from 'viem';

export const RPC_URL = 'https://sepolia-rpc.giwa.io';
export const EXPLORER_URL = 'https://sepolia-explorer.giwa.io';

export const giwaSepolia = defineChain({
  id: 91342,
  name: 'GIWA Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: 'GIWA Sepolia Explorer', url: EXPLORER_URL },
  },
  testnet: true,
});

/**
 * The public GIWA RPC is slow and occasionally times out, so reads use a long
 * timeout with retries. All state shown in ExoPad is read through this client
 * or through the chain's official explorer index (same on-chain data).
 */
export const publicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(RPC_URL, { timeout: 60_000, retryCount: 2, retryDelay: 1200 }),
});

export const WETH: Address = '0x4200000000000000000000000000000000000006';

export const FACTORY_V4: Address = '0x35353a2Dab7426EcCAe6f5FB267702a542ab68fA';
export const FACTORY_V3: Address = '0x42acd2531e47ea789c03915c9de195bf6250c0a2';
export const AGGREGATION_ROUTER: Address = '0x176d8c2b26C6373Ba7c9dd5ed8E1a626caf2f206';
export const LEGACY_CONFIG_REGISTRY: Address = '0x068d624653fe9a6b1e428fee5058aaec93c0d231';

export function explorerAddress(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}
export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}
export function explorerToken(address: string): string {
  return `${EXPLORER_URL}/token/${address}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
