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
	}, [isConnected, web3Auth?.provider, web3Auth?.connected, web3Auth?.currentChain?.chainNamespace]);

	// Ensure active chain is Solana Devnet after login
	React.useEffect(() => {
		const currentNs = web3Auth?.currentChain?.chainNamespace;
		const currentId = web3Auth?.currentChain?.chainId;
		if (!isConnected) return;
		// If not on Solana Devnet (0x3), switch
		if (currentNs !== CHAIN_NAMESPACES.SOLANA || currentId !== "0x3") {
			(async () => {
				try {
					await switchChain("0x3");
				} catch {
					// ignore; user can switch via UI if needed
				}
			})();
		}
	}, [isConnected, web3Auth?.currentChain?.chainNamespace, web3Auth?.currentChain?.chainId, switchChain]);

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


