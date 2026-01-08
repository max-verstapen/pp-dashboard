"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useGlobalWallet } from "./GlobalWalletProvider";

type Props = {
	children: React.ReactNode;
};

export default function RouteGuard({ children }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const { connected } = useGlobalWallet();

	// Pages that don't require wallet connection
	const publicPages = ["/connect", "/leaderboard"];
	const isPublicPage = publicPages.includes(pathname);

	// Don't redirect to /connect anymore - let OnboardingGate handle authentication
	// Users can access the app and will see onboarding options if not authenticated

	return <>{children}</>;
}

