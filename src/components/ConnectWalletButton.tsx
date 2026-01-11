"use client";
import React from "react";
import { useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect, useSwitchChain } from "@web3auth/modal/react";
import { useGlobalWallet } from "./GlobalWalletProvider";
import PixelButton from "./PixelButton";
import { CHAIN_NAMESPACES } from "@web3auth/modal";

function shortenMiddle(value: string, keepStart = 4, keepEnd = 4): string {
	if (!value) return value;
	const totalKeep = keepStart + keepEnd;
	if (value.length <= totalKeep) return value;
	return `${value.slice(0, keepStart)}...${value.slice(-keepEnd)}`;
}

export default function ConnectWalletButton() {
	const { address } = useGlobalWallet();
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

	// If connected but not on Solana Mainnet, offer a quick switch
	const onWrongChain =
		isConnected &&
		(web3Auth?.currentChain?.chainNamespace !== CHAIN_NAMESPACES.SOLANA ||
			web3Auth?.currentChain?.chainId !== "0x1");

	if (isConnected) {
		return (
			<div className="flex items-center gap-2">
				{address ? (
					<div className="pixel-chip">
						<span className="pixel-chip__text">{shortenMiddle(address ?? "", 4, 4)}</span>
					</div>
				) : (
					<PixelButton
						variant="tab"
						size="sm"
						onClick={() => switchChain("0x1")}
						disabled={switching}
					>
						{switching ? "Switching..." : "Switch to Solana"}
					</PixelButton>
				)}
				<PixelButton
					variant="tab"
					size="sm"
					onClick={() => disconnect()}
					disabled={disconnectLoading}
				>
					{disconnectLoading ? "Disconnecting..." : "Disconnect"}
				</PixelButton>
				{disconnectError && (
					<span className="text-xs text-red-300">{disconnectError.message}</span>
				)}
				{onWrongChain && !address && !disconnectLoading && !switching && (
					<span className="text-xs opacity-80">Not on Solana. Please switch.</span>
				)}
				{switchError && <span className="text-xs text-red-300">{switchError.message}</span>}
			</div>
		);
	}

	const handleConnect = async () => {
		try {
			console.log("Current chain before connect:", web3Auth?.currentChain);
			await connect();
		} catch (error) {
			console.error("[ConnectWalletButton] Connection error:", error);
		}
	};

	return (
		<div className="flex items-center gap-2">
			<PixelButton
				variant="tab"
				size="sm"
				onClick={handleConnect}
				disabled={connectLoading}
			>
				{connectLoading ? "Connecting..." : "Connect Wallet"}
			</PixelButton>
			{connectError && <span className="text-xs text-red-300">{connectError.message}</span>}
		</div>
	);
}


