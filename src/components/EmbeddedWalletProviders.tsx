"use client";
import React from "react";

type Props = { children: React.ReactNode };

// Pass-through: disable Web3Auth Modal Provider to avoid any modal UI.
export default function EmbeddedWalletProviders({ children }: Props) {
	return <>{children}</>;
}

