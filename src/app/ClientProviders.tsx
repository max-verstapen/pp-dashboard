"use client";
import React from "react";
import { Web3AuthProvider } from "@web3auth/modal/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import web3AuthContextConfig from "./config/web3AuthContext";
import AuthProviders from "../components/AuthProviders";
import GlobalWalletProvider from "../components/GlobalWalletProvider";
import RouteGuard from "../components/RouteGuard";
import OnboardingGate from "../components/OnboardingGate";

type Props = {
	children: React.ReactNode;
};

const queryClient = new QueryClient();

export default function ClientProviders({ children }: Props) {
	return (
		<Web3AuthProvider config={web3AuthContextConfig}>
			<QueryClientProvider client={queryClient}>
				<AuthProviders>
					<GlobalWalletProvider>
						<RouteGuard>
							<OnboardingGate>{children}</OnboardingGate>
						</RouteGuard>
					</GlobalWalletProvider>
				</AuthProviders>
			</QueryClientProvider>
		</Web3AuthProvider>
	);
}


