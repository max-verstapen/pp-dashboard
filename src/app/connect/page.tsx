"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect, useSwitchChain } from "@web3auth/modal/react";
import { useGlobalWallet } from "@/components/GlobalWalletProvider";
import PixelButton from "@/components/PixelButton";
import { CHAIN_NAMESPACES } from "@web3auth/modal";
import Image from "next/image";

function shortenMiddle(value: string, keepStart = 6, keepEnd = 6): string {
	if (!value) return value;
	const totalKeep = keepStart + keepEnd;
	if (value.length <= totalKeep) return value;
	return `${value.slice(0, keepStart)}...${value.slice(-keepEnd)}`;
}

export default function ConnectWalletPage() {
	const router = useRouter();
	const { address, connected } = useGlobalWallet();
	const { web3Auth } = useWeb3Auth();
	const { switchChain, error: switchError, loading: switching } = useSwitchChain();
	const {
		connect,
		isConnected,
		loading: connectLoading,
		error: connectError,
	} = useWeb3AuthConnect();
	const {
		disconnect,
		loading: disconnectLoading,
		error: disconnectError,
	} = useWeb3AuthDisconnect();

	// Redirect to home (which will show onboarding) after successful connection
	React.useEffect(() => {
		if (isConnected && connected && address) {
			// Small delay to ensure connection is fully established
			const timer = setTimeout(() => {
				router.push("/");
			}, 500);
			return () => clearTimeout(timer);
		}
	}, [isConnected, connected, address, router]);

	const [debugInfo, setDebugInfo] = React.useState<string>("");

	const currentChain = web3Auth?.currentChain;
	const chainNamespace = currentChain?.chainNamespace;
	const chainId = currentChain?.chainId;
	const chainName = currentChain?.displayName || "Unknown";
	const ticker = currentChain?.ticker || "";

	// Check if on Solana Devnet
	const isOnSolanaDevnet =
		chainNamespace === CHAIN_NAMESPACES.SOLANA && chainId === "0x3";

	// Check if Web3Auth is initialized
	const isWeb3AuthReady = !!web3Auth;

	React.useEffect(() => {
		if (web3Auth) {
			const info = [
				`Web3Auth initialized: ${!!web3Auth}`,
				`Provider: ${!!web3Auth.provider}`,
				`Connected: ${web3Auth.connected}`,
				`Client ID: ${process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ? "Set" : "Missing - Please set NEXT_PUBLIC_WEB3AUTH_CLIENT_ID in .env.local"}`,
			].join(", ");
			setDebugInfo(info);
		} else {
			setDebugInfo("Web3Auth not initialized yet - waiting for provider...");
		}
	}, [web3Auth]);

	const handleConnect = async () => {
		try {
			if (!web3Auth) {
				console.error("Web3Auth not initialized");
				setDebugInfo("Error: Web3Auth not initialized. Please wait...");
				return;
			}

			if (!process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID) {
				console.error("Web3Auth Client ID not set");
				setDebugInfo("Error: NEXT_PUBLIC_WEB3AUTH_CLIENT_ID is not set. Please add it to .env.local");
				alert("Web3Auth Client ID is missing. Please set NEXT_PUBLIC_WEB3AUTH_CLIENT_ID in your .env.local file.");
				return;
			}
			
			console.log("Attempting to connect...", { web3Auth, isConnected });
			setDebugInfo("Opening connection modal...");
			
			const result = await connect();
			
			console.log("Connect call completed", result);
			setDebugInfo("Connection attempt completed. Check if modal opened.");
		} catch (error) {
			console.error("Connection error:", error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			setDebugInfo(`Connection error: ${errorMessage}`);
			alert(`Connection failed: ${errorMessage}. Check console for details.`);
		}
	};


	const handleDisconnect = async () => {
		try {
			await disconnect();
		} catch (error) {
			console.error("Disconnection error:", error);
		}
	};

	const handleSwitchToSolana = async () => {
		try {
			await switchChain("0x3");
		} catch (error) {
			console.error("Chain switch error:", error);
		}
	};

	return (
		<div className="flex min-h-[100svh] items-center justify-center font-sans">
			<main className="mx-auto w-full max-w-2xl px-4 py-8">
				<div className="panel">
					<div className="flex flex-col gap-6">
						{/* Header */}
						<div className="flex flex-col gap-2">
							<h1 className="font-extrabold uppercase tracking-wide text-3xl text-[#3f5125]">
								Connect Wallet
							</h1>
							<p className="text-zinc-100/90">
								Connect your wallet using MetaMask Embedded Wallets to get started.
							</p>
						</div>

						{/* Connection Status */}
						<div className="flex flex-col gap-4">
							<div className="border border-[#3f5125] rounded px-3 py-2">
								<span>
									Status: {isConnected ? "Connected" : "Not Connected"}
								</span>
							</div>

							{/* Wallet Address */}
							{isConnected && address && (
								<div className="flex flex-col gap-2">
									<label className="text-sm font-semibold uppercase text-[#3f5125]">
										Wallet Address
									</label>
									<div className="pixel-chip">
										<span className="pixel-chip__text font-mono">
											{shortenMiddle(address, 8, 8)}
										</span>
									</div>
									<button
										onClick={() => {
											navigator.clipboard.writeText(address);
										}}
										className="text-xs text-zinc-300 hover:text-zinc-100 underline"
									>
										Copy full address
									</button>
								</div>
							)}

							{/* Chain Information */}
							{isConnected && currentChain && (
								<div className="flex flex-col gap-2">
									<label className="text-sm font-semibold uppercase text-[#3f5125]">
										Current Chain
									</label>
									<div className="flex flex-col gap-1">
										<div className="pixel-chip">
											<span className="pixel-chip__text">
												{chainName} ({ticker})
											</span>
										</div>
										<div className="text-xs text-zinc-300">
											Namespace: {chainNamespace} | Chain ID: {chainId}
										</div>
										{!isOnSolanaDevnet && (
											<div className="text-xs text-yellow-300">
												⚠️ Not on Solana Devnet. Switch to continue.
											</div>
										)}
									</div>
								</div>
							)}

							{/* Action Buttons */}
							<div className="flex flex-col gap-3">
								{!isConnected ? (
									<PixelButton
										variant="green"
										size="lg"
										onClick={handleConnect}
										disabled={connectLoading || !isWeb3AuthReady}
										className="flex items-center gap-2 border border-[#3f5125]"
									>
										<Image 
											src="/assets/wallet.png" 
											alt="Wallet" 
											width={22} 
											height={22} 
											data-darkreader-ignore 
											suppressHydrationWarning 
										/>
										{!isWeb3AuthReady 
											? "Initializing..." 
											: connectLoading 
											? "Connecting..." 
											: "Connect"}
									</PixelButton>
								) : (
									<div className="flex flex-col gap-2">
										{!isOnSolanaDevnet && (
											<PixelButton
												variant="tab"
												size="md"
												onClick={handleSwitchToSolana}
												disabled={switching}
											>
												{switching ? "Switching..." : "Switch to Solana Devnet"}
											</PixelButton>
										)}
										<PixelButton
											variant="tab"
											size="md"
											onClick={handleDisconnect}
											disabled={disconnectLoading}
										>
											{disconnectLoading ? "Disconnecting..." : "Disconnect Wallet"}
										</PixelButton>
									</div>
								)}
							</div>

							{/* Debug Info */}
							{debugInfo && (
								<div className="flex flex-col gap-2 rounded border border-blue-500/50 bg-blue-500/10 p-3">
									<label className="text-sm font-semibold uppercase text-blue-300">
										Debug Info
									</label>
									<div className="text-xs text-blue-300">
										{debugInfo}
									</div>
									<div className="text-xs text-blue-300">
										Web3Auth Ready: {isWeb3AuthReady ? "Yes" : "No"}
									</div>
									<div className="text-xs text-blue-300">
										Client ID: {process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ? "Set" : "Missing"}
									</div>
								</div>
							)}

							{/* Error Messages */}
							{(connectError || disconnectError || switchError) && (
								<div className="flex flex-col gap-2 rounded border border-red-500/50 bg-red-500/10 p-3">
									<label className="text-sm font-semibold uppercase text-red-300">
										Errors
									</label>
									{connectError && (
										<div className="text-xs text-red-300">
											Connection: {connectError.message}
										</div>
									)}
									{disconnectError && (
										<div className="text-xs text-red-300">
											Disconnection: {disconnectError.message}
										</div>
									)}
									{switchError && (
										<div className="text-xs text-red-300">
											Chain Switch: {switchError.message}
										</div>
									)}
								</div>
							)}

							{/* Info Section */}
							<div className="mt-4 flex flex-col gap-2 rounded border border-zinc-600/50 bg-zinc-800/30 p-4">
								<h2 className="text-sm font-semibold uppercase text-[#3f5125]">
									About MetaMask Embedded Wallets
								</h2>
								<ul className="space-y-2 text-xs text-zinc-300">
									<li>
										• Connect using social logins, email, or external wallets
									</li>
									<li>
										• Your wallet is securely managed by MetaMask
									</li>
									<li>
										• Supports Solana and Ethereum networks
									</li>
									<li>
										• No need to install browser extensions
									</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}

