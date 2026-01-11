import { WEB3AUTH_NETWORK, CHAIN_NAMESPACES, WALLET_CONNECTORS } from "@web3auth/modal";
import { type Web3AuthContextConfig } from "@web3auth/modal/react";


const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID as string,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    ssr: true,
    // Prefer Solana by default
    chains: [
      {
        chainNamespace: CHAIN_NAMESPACES.SOLANA,
        chainId: "0x3", // Solana Devnet (per MetaMask/Web3Auth docs: 0x1=mainnet, 0x2=testnet, 0x3=devnet)
        rpcTarget: "https://api.devnet.solana.com",
        displayName: "Solana Devnet",
        ticker: "SOL",
        tickerName: "Solana",
        blockExplorerUrl: "https://explorer.solana.com/?cluster=devnet",
        logo: "",
      },
    ],
    defaultChainId: "0x3",
    modalConfig: {
      connectors: {
        [WALLET_CONNECTORS.AUTH]: {
          label: "auth",
          loginMethods: {
            google: {
              name: "Google",
              // Use "bakeland" verifier to match Unity configuration
              // IMPORTANT: "bakeland" must be registered in Web3Auth dashboard with Google OAuth client ID:
              // 463702371949-5hinmse4t4i3rjm4ipkj680h5t9eto49.apps.googleusercontent.com
              authConnectionId: "bakeland",
            },
            discord: {
              name: "Discord",
              // Use "pp-dashboard" verifier to match Unity configuration
              // IMPORTANT: "pp-dashboard" must be registered in Web3Auth dashboard with Discord Client ID:
              // 1207248987896422400
              authConnectionId: "pp-dashboard",
            },
          },
          showOnModal: true,
        },
      },
      // Explicitly enable external wallet discovery (e.g., Phantom, Solflare, etc.)
      // Set to false to show external wallets in the connection modal
      hideWalletDiscovery: false,
    },
  },
};

export default web3AuthContextConfig;