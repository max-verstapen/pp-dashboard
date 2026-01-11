"use client";
import React from "react";
import { SessionProvider } from "next-auth/react";

type Props = {
	children: React.ReactNode;
};

export default function AuthProviders({ children }: Props) {
	return (
		<SessionProvider 
			refetchInterval={0} // Disable automatic refetch, we'll handle it manually
			refetchOnWindowFocus={true} // Refetch when window regains focus (e.g., after Web3Auth modal closes)
		>
			{children}
		</SessionProvider>
	);
}



