# ExoPad — Build Summary

**ExoPad** is a launch explorer + swap app for **Ammora** on **GIWA Sepolia testnet** (chain ID 91342),
built for the Ammora Builder Mission with the official **`@ammora-protocol/sdk` v0.3.9**. It is a static
SPA (Vite + React + TypeScript) in `~/workspace/exopad/`; `npm run build` produces `dist/`.

## Deployment status — BLOCKED on Vercel account connection (one user click)

The app is finished, builds cleanly, and is verified locally, but it is **not yet publicly deployed**:
this environment's Vercel connector reports `auth_status: not_connected`, and connecting requires the
account owner to sign in — an agent cannot complete that OAuth step.

- **Remedy:** open **https://agent.meta.ai/connectors/connect/vercel** and sign in to Vercel.
  After that, deployment is a single `create_deployment` call with the prebuilt `dist/`
  (a `vercel.json` with the build command, output directory and SPA rewrite is already in the repo).
- Local run (verified): `npm run preview` → http://127.0.0.1:4173/ serves the production build.

## What was built

- **Launch explorer (real data, no mocks):** all `LaunchCreated` events from both reviewed Ammora
  launch factories on GIWA Sepolia — **163 launches** (148 V4 + 15 V3) at build time, each enriched
  with token name/symbol/decimals/supply/holders and launch timestamp. The snapshot is baked into the
  build (`src/data/launches.json`, regenerable via `npm run index`), and the app's
  **"Refresh from chain"** button re-indexes live in the browser: it fetches the factory event logs
  from the chain's official explorer index and decodes them with the SDK's own factory ABIs.
  (Why not raw RPC log scans: the public GIWA RPC caps `eth_getLogs` at 10,000-block ranges and is
  extremely slow — measured; the explorer index serves the same on-chain logs in <1 s and is CORS-open.)
  Search, V4/V3 filter, and sort (newest / oldest / most holders) are included.
- **Token detail view:** token, curve, creator and factory addresses with explorer links, launch
  block/time, total supply, holders, config ID, and metadata link.
- **Live quote + swap panel (V4 launches):** Buy/Sell tabs; the quote is planned on-chain by the SDK
  (`AmmoraSwapClient.prepareExactIn`) and shows expected out, minimum out at 1% slippage, exchange
  rate, curve fee, quote block and expiry, with auto-refresh every 30 s. An expandable
  **calldata preview** shows the exact unsigned transaction (`to` / `value` / `data`) and the SDK's
  approval requirements.
- **Execute with the visitor's own wallet (bonus):** "Connect wallet" uses the injected wallet
  (MetaMask etc.), switches/adds GIWA Sepolia, and execution goes through the SDK's
  `prepared.execute(...)` with exact-amount approvals and simulation enabled. ExoPad holds **no keys**
  and never signs anything itself; without a wallet, quotes use the launch creator as a read-only
  stand-in payer.
- **Legacy curve view (V3 launches):** live on-chain curve state via the SDK's `ALCClient.getState()` —
  status, trading fee, token/WETH reserves, and a migration-progress bar
  (quote reserve vs. migration threshold). V3 curves are view-only in ExoPad: the current SDK's swap
  planning targets the V4 generation (V3 `prepareExactIn`/`quoteExactInput` revert on the live legacy
  curves — verified by probes; `getState()` works).

## SDK functions and contracts used

SDK (`@ammora-protocol/sdk` v0.3.9, with viem):

- `AmmoraSwapClient.create(publicClient, { deploymentCatalog: { 91342: giwaSepoliaAutoRouteDeployment }, verificationBlock })`
- `AmmoraSwapClient.prepareExactIn({ model: 'dbc', pool: curve, tokenIn, amountIn, payer, recipient, slippageBps: 100, allowPartialFill: true })`
  → quote + `transaction` calldata + `approvalRequirements`; `PreparedExactInputSwap.execute(wallet, { sendApprovals, exactApproval, simulate, autoRefresh })`
- `ALCClient(publicClient, curve, legacyConfigRegistry).getState()` for V3 curves
- Event ABIs `ammoraLaunchFactoryV4Abi` / `segmentedALCLaunchFactoryV3Abi` for decoding `LaunchCreated`
- Deployment descriptors `giwaSepoliaAutoRouteDeployment` (V4) and the legacy default deployment (V3)

Contracts (GIWA Sepolia, chain 91342; explorer https://sepolia-explorer.giwa.io):

| Contract | Address |
|---|---|
| V4 launch factory (auto-route gen) | `0x35353a2Dab7426EcCAe6f5FB267702a542ab68fA` |
| V3 launch factory (legacy) | `0x42acd2531e47ea789c03915c9de195bf6250c0a2` |
| Aggregation router | `0x176d8c2b26C6373Ba7c9dd5ed8E1a626caf2f206` |
| Aggregation execution registry | `0xCCa3e38eAa4F00e43599646a75CcA164B97cC4eB` |
| Config registry (V4) | `0x6d043014972b87406C4757a5f2d655A24e0b0aF9` |
| Config registry (legacy) | `0x068d624653fe9a6b1e428fee5058aaec93c0d231` |
| WETH | `0x4200000000000000000000000000000000000006` |

Notes from grounding the API in the SDK's own types/probes: exact-input planning needs the ERC20
**WETH** path (native-token input is rejected by the SDK's deployment verification), and V4 planning
requires `allowPartialFill: true`. Launch tokens commonly use **9 decimals** — ExoPad formats every
amount with each token's own decimals.

## Verification evidence (2026-11-21 ~19:31–20:20 UTC)

- **Indexing:** explorer-index scan returned 148 V4 + 15 V3 `LaunchCreated` logs; all 163 enriched
  with symbol + timestamp (163/163). Newest launch: **GLT (GiwaLaunch Token)**,
  token `0x3e6959a94F9459af88646577d986588DC7A38c01`, curve `0x4f7dEa26e055B9138dFd599DDe9FDc0cDC293993`,
  block 41,944,365.
- **Live SDK quote (re-run at head block 41,947,141, `probe/verify-quote.mjs`):**
  buy 0.001 WETH → **expected 3,144.65408805 GLT**, minimum 3,113.207547169 GLT, fee 158227848102
  (fee token WETH), transaction to the curve with 196-byte calldata, 1 approval requirement.
  A sell-side quote (GLT → WETH) was likewise verified in probes.
- **Local app run:** production build served via `vite preview` (HTTP 200); rendered headlessly in
  Chrome — DOM + screenshot confirm the header/hero, the 163/148/15 stats, the launch list with real
  tokens (GLT, GPTEST, PPN, GIWAWA…), the GLT detail panel, and the swap panel
  (see `screenshot-home.png`). In the sandbox's headless Chrome the live RPC fetch is blocked by the
  egress proxy (known environment limit; the app shows a graceful error) — the identical SDK code path
  is proven from Node above, and the RPC/explorer APIs are CORS-open (`access-control-allow-origin: *`),
  so quotes and refresh work in a normal browser and once deployed.

## What a good X-post screenshot would show

Use the deployed site (or `screenshot-home.png` locally): the **ExoPad header and hero** with the
"163 launches indexed" stats, the **live launch list**, and the **GLT detail with the swap panel**
after clicking "Get live quote" so the expected/minimum amounts and fee are visible — that single frame
shows real factory data plus a real SDK-planned swap. A second shot of the expanded
**"Calldata preview"** makes the "calldata built by the SDK" point concrete.
