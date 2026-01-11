"use client";
import React from "react";
import { useWeb3Auth, useWeb3AuthConnect, useSwitchChain } from "@web3auth/modal/react";
import { CHAIN_NAMESPACES } from "@web3auth/modal";

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
				
				// If chain namespace is not available, retry (don't try to switch before connection)
				if (!chainNamespace) {
					if (retries > 0 && !cancelled) {
						setTimeout(() => getAddress(retries - 1), 500);
					}
					return;
				}
				
				if (chainNamespace === CHAIN_NAMESPACES.SOLANA) {
					// For Solana, try getAccounts first, then fallback to getPublicKey
					try {
						// Try getAccounts first (most reliable for Solana)
						const accounts = await provider.request<never, string[]>({
							method: "getAccounts",
						});
						
						if (!cancelled && accounts && accounts.length > 0 && accounts[0]) {
							setAddress(accounts[0]);
							return;
						}
					} catch (accountsError: any) {
						// If getAccounts fails, try getPublicKey
						try {
							const publicKey = await provider.request<never, string>({
								method: "getPublicKey",
							});
							
							if (!cancelled && publicKey) {
								setAddress(publicKey);
								return;
							}
						} catch (publicKeyError: any) {
							// If both fail, retry if retries available
							if (retries > 0 && !cancelled) {
								console.debug("[GlobalWalletProvider] Both getAccounts and getPublicKey failed, retrying...", retries);
								setTimeout(() => getAddress(retries - 1), 1000);
							} else {
								console.error("[GlobalWalletProvider] Error getting Solana address:", publicKeyError || accountsError);
								if (!cancelled) setAddress(null);
							}
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
	}, [isConnected, web3Auth?.provider, web3Auth?.connected, web3Auth?.currentChain?.chainNamespace]);

	// Ensure active chain is Solana Mainnet after connection (ONLY post-connect)
	React.useEffect(() => {
		if (!isConnected || !web3Auth?.connected || !switchChain) return;
		
		const currentNs = web3Auth?.currentChain?.chainNamespace;
		
		// Only switch if connected and not on Solana
		if (currentNs !== CHAIN_NAMESPACES.SOLANA) {
			switchChain("0x1").catch((error) => {
				console.warn("[GlobalWalletProvider] Failed to switch chain:", error);
			});
		}
	}, [isConnected, web3Auth?.connected, web3Auth?.currentChain?.chainNamespace, switchChain]);

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


