import type { Address, WalletClient } from 'viem';
import {
  ALCClient,
  AmmoraSwapClient,
  giwaSepoliaAutoRouteDeployment,
  type PreparedExactInputSwap,
} from '@ammora-protocol/sdk';
import { LEGACY_CONFIG_REGISTRY, WETH, publicClient } from './chain';
import type { Launch } from './launches';

export type { PreparedExactInputSwap };
export type CurveState = Awaited<ReturnType<ALCClient['getState']>>;

/**
 * AmmoraSwapClient for the current (V4 auto-route) generation. The SDK
 * verifies the pinned deployment at `verificationBlock`; the client is
 * rebuilt when the chain head has moved on materially.
 */
let swapClientPromise: Promise<AmmoraSwapClient> | null = null;
let swapClientBlock = 0n;

export async function getSwapClient(): Promise<AmmoraSwapClient> {
  const head = await publicClient.getBlockNumber();
  if (!swapClientPromise || head - swapClientBlock > 600n) {
    swapClientBlock = head;
    swapClientPromise = AmmoraSwapClient.create(publicClient, {
      deploymentCatalog: { [giwaSepoliaAutoRouteDeployment.chain.id]: giwaSepoliaAutoRouteDeployment },
      verificationBlock: head,
    });
    swapClientPromise.catch(() => {
      swapClientPromise = null;
    });
  }
  return swapClientPromise;
}

export type SwapSide = 'buy' | 'sell';

/**
 * Builds a fully planned exact-input swap for a V4 launch curve with the
 * Ammora SDK: live quote (expected/minimum out, fee) plus the exact
 * transaction calldata and approval requirements. Nothing is signed here.
 *
 * `account` is the payer/recipient. When no wallet is connected the caller
 * passes the launch creator as a read-only stand-in so quotes still work.
 */
export async function prepareSwap(
  launch: Launch,
  side: SwapSide,
  amountIn: bigint,
  account: Address,
): Promise<PreparedExactInputSwap> {
  const swaps = await getSwapClient();
  return swaps.prepareExactIn({
    model: 'dbc',
    pool: launch.curve,
    tokenIn: side === 'buy' ? WETH : launch.token,
    amountIn,
    payer: account,
    recipient: account,
    slippageBps: 100,
    allowPartialFill: true,
  });
}

type ExecuteOptions = NonNullable<Parameters<PreparedExactInputSwap['execute']>[1]>;

/**
 * Executes a prepared swap with the visitor's own wallet (approvals handled
 * by the SDK with exact amounts, simulation on). Only ever called after an
 * explicit click by the connected wallet owner.
 */
export async function executeSwap(
  prepared: PreparedExactInputSwap,
  wallet: WalletClient,
  onStatus?: ExecuteOptions['onStatus'],
) {
  return prepared.execute(wallet, {
    sendApprovals: true,
    exactApproval: true,
    simulate: true,
    autoRefresh: true,
    onStatus,
  });
}

/** Live on-chain state of a legacy (V3) segmented launch curve. */
export async function getCurveState(launch: Launch): Promise<CurveState> {
  const alc = new ALCClient(publicClient, launch.curve, LEGACY_CONFIG_REGISTRY);
  return alc.getState();
}
