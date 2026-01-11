"use client";
import React from "react";
import { useWeb3Auth, useWeb3AuthConnect, useSwitchChain } from "@web3auth/modal/react";
import { CHAIN_NAMESPACES, getED25519Key } from "@web3auth/modal";
import { Keypair } from "@solana/web3.js";

type GlobalWalletState = {
	address: string | null;
	connected: boolean;
};

const Ctx = React.createContext<GlobalWalletState | null>(null);

export function useGlobalWallet(): GlobalWalletState {
	const ctx = React.useContext(Ctx);
	if (!ctx) {
		return { address: null, connected: false };
	}
	return ctx;
}

type Props = { children: React.ReactNode };

export default function GlobalWalletProvider({ children }: Props) {
	const { isConnected } = useWeb3AuthConnect();
	const { web3Auth } = useWeb3Auth();
	const { switchChain } = useSwitchChain();
	
	const [address, setAddress] = React.useState<string | null>(null);
	const [apiAddress, setApiAddress] = React.useState<string | null>(null);

	// Initialize chain as soon as Web3Auth is ready (before any connection)
	// This is CRITICAL for external wallet connections like Phantom
	// The chain must be set before the modal opens, otherwise external wallets will fail with "Chain null not supported"
	React.useEffect(() => {
		if (!web3Auth || !switchChain) return;

		// Use a small delay to ensure Web3Auth is fully initialized
		const initChain = async () => {
			// Check if chain is null or not set to Solana Devnet
			const currentChain = web3Auth.currentChain;
			const chainNamespace = currentChain?.chainNamespace;
			const chainId = currentChain?.chainId;

			console.log("[GlobalWalletProvider] Checking chain on initialization...", { 
				currentChain, 
				chainNamespace, 
				chainId,
				web3AuthReady: !!web3Auth
			});

			// If chain is null or not on Solana Devnet, set it immediately
			if (!chainNamespace || !chainId || chainNamespace !== CHAIN_NAMESPACES.SOLANA || chainId !== "0x3") {
				try {
					console.log("[GlobalWalletProvider] Chain not set correctly, initializing to Solana Devnet...");
					await switchChain("0x3");
					// Verify it was set
					await new Promise(resolve => setTimeout(resolve, 100));
					const verifyChain = web3Auth.currentChain;
					console.log("[GlobalWalletProvider] Chain initialized. Verification:", {
						chainNamespace: verifyChain?.chainNamespace,
						chainId: verifyChain?.chainId
					});
				} catch (error) {
					console.warn("[GlobalWalletProvider] Failed to initialize chain:", error);
					// Retry after a longer delay
					setTimeout(async () => {
						try {
							console.log("[GlobalWalletProvider] Retrying chain initialization...");
							await switchChain("0x3");
							console.log("[GlobalWalletProvider] Chain initialized on retry");
						} catch (retryError) {
							console.error("[GlobalWalletProvider] Retry chain initialization failed:", retryError);
						}
					}, 500);
				}
			} else {
				console.log("[GlobalWalletProvider] Chain already correctly set to Solana Devnet");
			}
		};

		// Small delay to ensure Web3Auth is fully initialized
		const timeoutId = setTimeout(initChain, 100);
		
		return () => clearTimeout(timeoutId);
	}, [web3Auth, switchChain]);

	// Listen for address from API (after social auth)
	React.useEffect(() => {
		const handleSetAddress = (event: Event) => {
			const customEvent = event as CustomEvent<string>;
			if (customEvent.detail) {
				setApiAddress(customEvent.detail);
			}
		};

		window.addEventListener("setUserAddress", handleSetAddress);
		return () => {
			window.removeEventListener("setUserAddress", handleSetAddress);
		};
	}, []);

	// Get address from provider when connected
	React.useEffect(() => {
		let cancelled = false;
		
		async function getAddress(retries = 3) {
			if (!isConnected || !web3Auth?.provider || !web3Auth.connected) {
				if (!cancelled) setAddress(null);
				return;
			}

			// Wait a bit for provider to be fully ready
			if (retries < 3) {
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			try {
				const provider = web3Auth.provider;
				const chainNamespace = web3Auth.currentChain?.chainNamespace;
				
				// Ensure we're on the right chain before getting address
				if (!chainNamespace) {
					// Try to switch to the correct chain if it's null
					if (web3Auth?.connected && switchChain) {
						try {
							await switchChain("0x3");
							// Wait a bit for chain switch to complete
							await new Promise(resolve => setTimeout(resolve, 300));
						} catch (switchError) {
							console.warn("[GlobalWalletProvider] Failed to switch chain during address fetch:", switchError);
						}
					}
					if (retries > 0 && !cancelled) {
						setTimeout(() => getAddress(retries - 1), 500);
					}
					return;
				}
				
				if (chainNamespace === CHAIN_NAMESPACES.SOLANA) {
					// For Solana, get private key and derive address
					try {
						const privateKey = await provider.request<never, string>({
							method: "private_key",
						});
						
						if (!cancelled && privateKey) {
							// Convert private key to Solana keypair
							const ed25519Key = getED25519Key(privateKey);
							const secretKey = new Uint8Array(Buffer.from(ed25519Key.sk.toString("hex"), "hex"));
							const keypair = Keypair.fromSecretKey(secretKey);
							const solanaAddress = keypair.publicKey.toBase58();
							
							if (!cancelled) {
								setAddress(solanaAddress);
							}
						}
					} catch (privateKeyError: any) {
						// If private_key method fails, retry a few times
						if (retries > 0 && !cancelled && privateKeyError?.code === -32603) {
							console.debug("[GlobalWalletProvider] Retrying private_key request...", retries);
							setTimeout(() => getAddress(retries - 1), 1000);
						} else {
							console.error("[GlobalWalletProvider] Error getting private key:", privateKeyError);
							if (!cancelled) setAddress(null);
						}
					}
				} else {
					// For other chains (Ethereum, etc.), use standard methods
					const accounts = await provider.request<never, string[]>({
						method: "eth_accounts",
					});
					if (!cancelled && accounts && accounts.length > 0 && accounts[0]) {
						setAddress(accounts[0]);
					}
				}
			} catch (err: any) {
				// Retry if it's a "Method not found" error and we have retries left
				if (retries > 0 && !cancelled && err?.code === -32603) {
					console.debug("[GlobalWalletProvider] Retrying address request...", retries);
					setTimeout(() => getAddress(retries - 1), 1000);
				} else {
					console.error("[GlobalWalletProvider] Error getting address:", err);
					if (!cancelled) setAddress(null);
				}
			}
		}

		getAddress();
		return () => {
			cancelled = true;
		};
	}, [isConnected, web3Auth?.provider, web3Auth?.connected, web3Auth?.currentChain?.chainNamespace, switchChain]);

	// Ensure active chain is Solana Devnet after login
	React.useEffect(() => {
		if (!isConnected || !web3Auth?.connected) return;
		
		const currentNs = web3Auth?.currentChain?.chainNamespace;
		const currentId = web3Auth?.currentChain?.chainId;
		
		// If chain is null or not on Solana Devnet (0x3), switch immediately
		if (!currentNs || !currentId || currentNs !== CHAIN_NAMESPACES.SOLANA || currentId !== "0x3") {
			(async () => {
				try {
					// Wait a bit for Web3Auth to fully initialize
					await new Promise(resolve => setTimeout(resolve, 100));
					await switchChain("0x3");
				} catch (error) {
					console.warn("[GlobalWalletProvider] Failed to switch chain:", error);
					// Retry once after a short delay
					setTimeout(async () => {
						try {
							await switchChain("0x3");
						} catch (retryError) {
							console.error("[GlobalWalletProvider] Retry switch chain failed:", retryError);
						}
					}, 500);
				}
			})();
		}
	}, [isConnected, web3Auth?.connected, web3Auth?.currentChain?.chainNamespace, web3Auth?.currentChain?.chainId, switchChain]);

	// Use API address if available, otherwise use Web3Auth address
	const effectiveAddress = apiAddress || address;

	const value: GlobalWalletState = React.useMemo(
		() => ({ 
			address: effectiveAddress, 
			connected: !!isConnected || !!apiAddress,
		}),
		[effectiveAddress, isConnected, apiAddress]
	);

	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}


