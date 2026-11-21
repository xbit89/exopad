import { createWalletClient, custom, type Address, type WalletClient } from 'viem';
import { giwaSepolia } from './chain';

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

/**
 * Connects the visitor's own injected wallet (MetaMask etc.) and makes sure
 * it is on GIWA Sepolia. ExoPad never holds keys; signing happens entirely
 * inside the visitor's wallet.
 */
export async function connectWallet(): Promise<{ address: Address; walletClient: WalletClient }> {
  const provider = (window as { ethereum?: Eip1193Provider }).ethereum;
  if (!provider) {
    throw new Error('No injected EVM wallet found. Install MetaMask (or another EVM wallet) to execute swaps.');
  }
  const walletClient = createWalletClient({ chain: giwaSepolia, transport: custom(provider as never) });
  const [address] = await walletClient.requestAddresses();
  const chainId = await walletClient.getChainId();
  if (chainId !== giwaSepolia.id) {
    try {
      await walletClient.switchChain({ id: giwaSepolia.id });
    } catch {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${giwaSepolia.id.toString(16)}`,
            chainName: 'GIWA Sepolia',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://sepolia-rpc.giwa.io'],
            blockExplorerUrls: ['https://sepolia-explorer.giwa.io'],
          },
        ],
      });
      await walletClient.switchChain({ id: giwaSepolia.id });
    }
  }
  return { address, walletClient };
}
