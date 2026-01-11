"use client";
import React, { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import PixelButton from "./PixelButton";
import { useGlobalWallet } from "./GlobalWalletProvider";
import { useWeb3AuthConnect } from "@web3auth/modal/react";

type Props = {
	children: React.ReactNode;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CachedValue<T> = {
	value: T;
	ts: number;
};

function getCachedJson<T>(key: string): T | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.sessionStorage.getItem(key);
		if (!raw) return null;
		const parsed: CachedValue<T> = JSON.parse(raw);
		if (!parsed || typeof parsed.ts !== "number") return null;
		if (Date.now() - parsed.ts > CACHE_TTL_MS) {
			window.sessionStorage.removeItem(key);
			return null;
		}
		return parsed.value;
	} catch {
		return null;
	}
}

function setCachedJson<T>(key: string, value: T) {
	if (typeof window === "undefined") return;
	try {
		const payload: CachedValue<T> = { value, ts: Date.now() };
		window.sessionStorage.setItem(key, JSON.stringify(payload));
	} catch {
		// ignore storage errors
	}
}

export default function OnboardingGate({ children }: Props) {
	const pathname = usePathname();
	const { data: session, update: updateSession } = useSession();
	const gw = useGlobalWallet();
	const { connect: connectWallet, loading: walletConnectLoading } = useWeb3AuthConnect();
	const [cachedGoogle, setCachedGoogle] = useState<string | null>(null);
	const [cachedTwitter, setCachedTwitter] = useState<string | null>(null);
	const [cachedDiscord, setCachedDiscord] = useState<string | null>(null);
	const [userExists, setUserExists] = useState<boolean | null>(null);
	const [checkedAddress, setCheckedAddress] = useState<string | null>(null);
	const [fetchingAddress, setFetchingAddress] = useState(false);
	// Track which auth-identifiers we've already attempted an address lookup for,
	// so we don't loop forever when upstream returns 404/403.
	const [addressLookupKey, setAddressLookupKey] = useState<string | null>(null);
	// True when we've confirmed a user record exists upstream via email/X/Discord.
	const [hasUpstreamUser, setHasUpstreamUser] = useState(false);

	// Identify connect route (we'll branch in render, not before hooks)
	const isConnectPage = pathname === "/connect";

	const effectiveAddress = gw.address || null;
	const googleEmail: string | null = (session as any)?.googleEmail ?? null;
	const twitterUsername: string | null = (session as any)?.twitterUsername ?? null;
	const discordUsername: string | null = (session as any)?.discordUsername ?? null;
	const effectiveGoogle = googleEmail || cachedGoogle || null;
	const effectiveTwitter = twitterUsername || cachedTwitter || null;
	const effectiveDiscord = discordUsername || cachedDiscord || null;
	const hasGoogle = !!effectiveGoogle;
	const hasX = !!effectiveTwitter;
	const hasDiscord = !!effectiveDiscord;

	// Fetch user address from API after authentication
		useEffect(() => {
		let cancelled = false;

		async function fetchUserAddress() {
			// If we already have an address, skip
			if (effectiveAddress || fetchingAddress) return;

			// Need at least one auth method to fetch address
			if (!effectiveGoogle && !effectiveTwitter && !effectiveDiscord) return;

			// Check if user has a saved wallet address (they want to link, not switch accounts)
			const savedWalletAddress = typeof window !== "undefined" 
				? window.localStorage.getItem("pp_last_wallet_address") 
				: null;
			// If user has a saved wallet address, they're trying to link, not switch accounts
			// So don't auto-switch to the account that owns the social handle
			if (savedWalletAddress) return;

			// Normalize identifiers to match upstream expectations
			const normalizedGoogle = effectiveGoogle?.toLowerCase().trim() || null;
			const normalizedTwitter = effectiveTwitter
				? (effectiveTwitter.startsWith("@") ? effectiveTwitter.slice(1) : effectiveTwitter).trim()
				: null;
			const normalizedDiscord = effectiveDiscord ? effectiveDiscord.trim() : null;

			// Build a stable key for this combination of normalized identifiers.
			const key = `${normalizedGoogle ?? ""}|${normalizedTwitter ?? ""}|${normalizedDiscord ?? ""}`;
			// If we've already tried this exact combo, don't hammer the API again.
			if (addressLookupKey && addressLookupKey === key) return;

			// Check short-lived cache (clears on refresh; TTL 5m)
			const cachedUser = getCachedJson<{ found: boolean; data: any }>(`pp_user_combo_${key}`);
			if (cachedUser) {
				setAddressLookupKey(key);
				if (cachedUser.found) {
					setHasUpstreamUser(true);
					const normalizedAddress =
						cachedUser.data?.userAddress ||
						cachedUser.data?.address ||
						cachedUser.data?.walletAddress ||
						cachedUser.data?.wallet_address ||
						cachedUser.data?.user?.address ||
						cachedUser.data?.user?.walletAddress ||
						cachedUser.data?.user?.wallet_address ||
						null;

					if (normalizedAddress) {
						window.dispatchEvent(new CustomEvent("setUserAddress", {
							detail: normalizedAddress,
						}));
					}
				}
				return;
			}

			setFetchingAddress(true);

			try {
				let userData: any = null;
				let userDataByGoogle: any = null;

				// Try Google email first (send raw value; upstream API expects literal '@')
				if (normalizedGoogle) {
					try {
						const res = await fetch(`/api/user/by-email/${normalizedGoogle}`, {
							cache: "no-store",
						});
						if (res.ok) {
							const json = await res.json();
							// eslint-disable-next-line no-console
							console.info("[OnboardingGate] /by-email response", json);
							userData = json;
							userDataByGoogle = json;
						}
					} catch (error) {
						// eslint-disable-next-line no-console
						console.error("[OnboardingGate] Error fetching user by email:", error);
					}
				}

				// Get the address from Google account if found
				const googleAccountAddress = userDataByGoogle?.userAddress ||
					userDataByGoogle?.address ||
					userDataByGoogle?.walletAddress ||
					userDataByGoogle?.wallet_address ||
					userDataByGoogle?.user?.address ||
					userDataByGoogle?.user?.walletAddress ||
					userDataByGoogle?.user?.wallet_address ||
					null;

				// If user has Google account, check X/Discord but don't switch if they belong to different account
				if (googleAccountAddress && (normalizedTwitter || normalizedDiscord)) {
					// User already has an account via Google - check if X/Discord belongs to same account
					if (normalizedTwitter && !userData) {
						try {
							const res = await fetch(`/api/user/by-x/${encodeURIComponent(normalizedTwitter)}`, {
								cache: "no-store",
							});
							if (res.ok) {
								const json = await res.json();
								const xAccountAddress = json?.userAddress || json?.address || json?.walletAddress || json?.wallet_address || json?.user?.address || json?.user?.walletAddress || json?.user?.wallet_address || null;
								// Only use X account if it's the same as Google account
								if (xAccountAddress && xAccountAddress.toLowerCase() === googleAccountAddress.toLowerCase()) {
									userData = json;
								}
								// If X belongs to different account, don't switch - user is trying to link
							}
						} catch (error) {
							console.error("[OnboardingGate] Error fetching user by X handle:", error);
						}
					}

					if (normalizedDiscord && !userData) {
						try {
							const res = await fetch(`/api/user/by-discord/${encodeURIComponent(normalizedDiscord)}`, {
								cache: "no-store",
							});
							if (res.ok) {
								const json = await res.json();
								const discordAccountAddress = json?.userAddress || json?.address || json?.walletAddress || json?.wallet_address || json?.user?.address || json?.user?.walletAddress || json?.user?.wallet_address || null;
								// Only use Discord account if it's the same as Google account
								if (discordAccountAddress && discordAccountAddress.toLowerCase() === googleAccountAddress.toLowerCase()) {
									userData = json;
								}
								// If Discord belongs to different account, don't switch - user is trying to link
							}
						} catch (error) {
							console.error("[OnboardingGate] Error fetching user by Discord handle:", error);
						}
					}

					// Use Google account data since user already has an account
					if (!userData) {
						userData = userDataByGoogle;
					}
				} else {
					// No Google account or no X/Discord - normal lookup flow
					// Try X handle if no user found yet
					if (!userData && normalizedTwitter) {
						try {
							const res = await fetch(`/api/user/by-x/${encodeURIComponent(normalizedTwitter)}`, {
								cache: "no-store",
							});
							if (res.ok) {
								const json = await res.json();
								// eslint-disable-next-line no-console
								console.info("[OnboardingGate] /by-x response", json);
								userData = json;
							}
						} catch (error) {
							// eslint-disable-next-line no-console
							console.error("[OnboardingGate] Error fetching user by X handle:", error);
						}
					}

					// Try Discord handle if no user found yet
					if (!userData && normalizedDiscord) {
						try {
							const res = await fetch(`/api/user/by-discord/${encodeURIComponent(normalizedDiscord)}`, {
								cache: "no-store",
							});
							if (res.ok) {
								const json = await res.json();
								// eslint-disable-next-line no-console
								console.info("[OnboardingGate] /by-discord response", json);
								userData = json;
							}
						} catch (error) {
							// eslint-disable-next-line no-console
							console.error("[OnboardingGate] Error fetching user by Discord handle:", error);
						}
					}
				}

				if (!cancelled) {
					// Remember that we've attempted a lookup for this identifier combo
					setAddressLookupKey(key);

					setCachedJson(`pp_user_combo_${key}`, { found: !!userData, data: userData });

					if (userData) {
						setHasUpstreamUser(true);

						// Normalize possible address fields from upstream responses
						const normalizedAddress =
							userData?.userAddress ||
							userData?.address ||
							userData?.walletAddress ||
							userData?.wallet_address ||
							userData?.user?.address ||
							userData?.user?.walletAddress ||
							userData?.user?.wallet_address ||
							null;

						if (normalizedAddress) {
							// Set address in GlobalWalletProvider via a custom event or context method
							// For now, we'll store it and let GlobalWalletProvider pick it up
							window.dispatchEvent(new CustomEvent("setUserAddress", {
								detail: normalizedAddress,
							}));
						}
					}
				}
			} catch (error) {
				if (!cancelled) {
					console.error("[OnboardingGate] Error fetching user address:", error);
				}
			} finally {
				if (!cancelled) {
					setFetchingAddress(false);
				}
			}
		}

		fetchUserAddress();
		return () => {
			cancelled = true;
		};
	}, [effectiveGoogle, effectiveTwitter, effectiveDiscord, effectiveAddress, fetchingAddress, addressLookupKey]);

	// Check if upstream user exists for this wallet address
	useEffect(() => {
		let cancelled = false;

		const addr: string | null = gw.address || null;
		if (!addr) {
			setUserExists(null);
			setCheckedAddress(null);
			return;
		}

		// Don't re-check the same address
		if (checkedAddress === addr) return;

		// Check short-lived cache (per-refresh) for user existence
		const cachedExists = getCachedJson<{ exists: boolean }>(`pp_user_exists_${addr}`);
		if (cachedExists) {
			setCheckedAddress(addr);
			setUserExists(cachedExists.exists);
			return;
		}

		async function checkUser() {
			try {
				// At this point addr is guaranteed non-null
				const res = await fetch(`/api/user/${encodeURIComponent(addr as string)}`, {
					cache: "no-store",
				});

				if (cancelled) return;
				setCheckedAddress(addr);

				if (res.ok) {
					setUserExists(true);
					setCachedJson(`pp_user_exists_${addr}`, { exists: true });
				} else if (res.status === 403 || res.status === 404) {
					// 403/404 -> user does not exist; don't retry
					setUserExists(false);
					setCachedJson(`pp_user_exists_${addr}`, { exists: false });
				} else {
					// Other errors: log and treat as non-existing (no onboarding)
					// eslint-disable-next-line no-console
					console.error("[OnboardingGate] Error checking user:", res.status, res.statusText);
					setUserExists(false);
					setCachedJson(`pp_user_exists_${addr}`, { exists: false });
				}
			} catch (error) {
				if (cancelled) return;
				// eslint-disable-next-line no-console
				console.error("[OnboardingGate] Error checking user:", error);
				setCheckedAddress(addr);
				setUserExists(false);
				setCachedJson(`pp_user_exists_${addr}`, { exists: false });
			}
		}

		checkUser();
		return () => {
			cancelled = true;
		};
	}, [gw.address, checkedAddress]);

	// Hydrate from localStorage once for smoother persistence across redirects
	useEffect(() => {
		try {
			const g = typeof window !== "undefined" ? window.localStorage.getItem("pp_google_email") : null;
			const t = typeof window !== "undefined" ? window.localStorage.getItem("pp_twitter_username") : null;
			const d = typeof window !== "undefined" ? window.localStorage.getItem("pp_discord_username") : null;
			if (g && !googleEmail) setCachedGoogle(g);
			if (t && !twitterUsername) setCachedTwitter(t);
			if (d && !discordUsername) setCachedDiscord(d);
		} catch {
			// ignore
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Persist when fresh values arrive from session
	useEffect(() => {
		if (googleEmail) {
			setCachedGoogle(googleEmail);
			try {
				if (typeof window !== "undefined") window.localStorage.setItem("pp_google_email", googleEmail);
			} catch {}
		}
	}, [googleEmail]);
	useEffect(() => {
		if (twitterUsername) {
			setCachedTwitter(twitterUsername);
			try {
				if (typeof window !== "undefined") window.localStorage.setItem("pp_twitter_username", twitterUsername);
			} catch {}
		}
	}, [twitterUsername]);
	useEffect(() => {
		if (discordUsername) {
			setCachedDiscord(discordUsername);
			try {
				if (typeof window !== "undefined") window.localStorage.setItem("pp_discord_username", discordUsername);
			} catch {}
		}
	}, [discordUsername]);

	// User is done when they have at least one auth method connected.
	// For now, as soon as they have any auth method (Google / X / Discord / Wallet),
	// we allow them through to the dashboard and don't block on wallet address.
	const hasWallet = !!effectiveAddress;
	const allDone = hasGoogle || hasX || hasDiscord || hasWallet;
	const readyForDashboard = allDone;


	// Debug: log onboarding state
	useEffect(() => {
		// eslint-disable-next-line no-console
		console.info("[Onboarding] state", {
			gwConnected: gw.connected,
			gwAddress: gw.address,
			adapterConnected: false,
			adapterPk: null,
			effectiveAddress,
			hasGoogle,
			hasX,
			hasDiscord,
			fetchingAddress,
		});
	}, [gw.connected, gw.address, effectiveAddress, hasGoogle, hasX, hasDiscord, fetchingAddress]);

	// Sync linked accounts to wallet address
	useEffect(() => {
		let cancelled = false;

		async function syncAccounts() {
			// Try to get address from current state or localStorage
			const addr = effectiveAddress || 
				(typeof window !== "undefined" ? window.localStorage.getItem("pp_last_wallet_address") : null);
			
			if (!addr) return;

			// Sync Google email
			if (effectiveGoogle) {
				try {
					const res = await fetch(`/api/user/${encodeURIComponent(addr)}/email`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ email: effectiveGoogle }),
					});
					if (!res.ok) {
						const errorData = await res.json().catch(() => ({}));
						if (res.status === 409) {
							console.error("[OnboardingGate] Email already linked to another account:", errorData.error);
							// Don't auto-switch to that account - user is trying to link to current account
						} else {
							console.error("[OnboardingGate] Error syncing email:", errorData);
						}
					} else {
						// Restore wallet address if we used localStorage address
						if (!effectiveAddress && addr) {
							window.dispatchEvent(new CustomEvent("setUserAddress", {
								detail: addr,
							}));
						}
					}
				} catch (error) {
					console.error("[OnboardingGate] Error syncing email:", error);
				}
			}

			// Sync X handle
			if (effectiveTwitter) {
				try {
					const res = await fetch(`/api/user/${encodeURIComponent(addr)}/x-handle`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ xHandle: effectiveTwitter }),
					});
					if (!res.ok) {
						const errorData = await res.json().catch(() => ({}));
						if (res.status === 409) {
							console.error("[OnboardingGate] X handle already linked to another account:", errorData.error);
							// Don't auto-switch to that account - user is trying to link to current account
						} else {
							console.error("[OnboardingGate] Error syncing X handle:", errorData);
						}
					} else {
						// Restore wallet address if we used localStorage address
						if (!effectiveAddress && addr) {
							window.dispatchEvent(new CustomEvent("setUserAddress", {
								detail: addr,
							}));
						}
					}
				} catch (error) {
					console.error("[OnboardingGate] Error syncing X handle:", error);
				}
			}

			// Sync Discord handle
			if (effectiveDiscord) {
				try {
					const res = await fetch(`/api/user/${encodeURIComponent(addr)}/discord-handle`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ discordHandle: effectiveDiscord }),
					});
					if (!res.ok) {
						const errorData = await res.json().catch(() => ({}));
						if (res.status === 409) {
							console.error("[OnboardingGate] Discord handle already linked to another account:", errorData.error);
							// Don't auto-switch to that account - user is trying to link to current account
						} else {
							console.error("[OnboardingGate] Error syncing Discord handle:", errorData);
						}
					} else {
						// Restore wallet address if we used localStorage address
						if (!effectiveAddress && addr) {
							window.dispatchEvent(new CustomEvent("setUserAddress", {
								detail: addr,
							}));
						}
					}
				} catch (error) {
					console.error("[OnboardingGate] Error syncing Discord handle:", error);
				}
			}
		}

		if (!cancelled) {
			syncAccounts();
		}

		return () => {
			cancelled = true;
		};
	}, [effectiveAddress, effectiveGoogle, effectiveTwitter, effectiveDiscord]);

	function shortenMiddle(value: string, keepStart = 4, keepEnd = 4): string {
		if (!value) return value;
		const totalKeep = keepStart + keepEnd;
		if (value.length <= totalKeep) return value;
		return `${value.slice(0, keepStart)}...${value.slice(-keepEnd)}`;
	}

	// Handle wallet connection
	const handleWalletConnect = async () => {
		try {
			await connectWallet();
			// Refresh session after wallet connection to ensure linked accounts persist
			await updateSession();
		} catch (error) {
			console.error("[OnboardingGate] Wallet connection error:", error);
		}
	};

	// If we're on the connect page, skip onboarding entirely
	if (isConnectPage) {
		return <>{children}</>;
	}

	// If user has at least one auth method connected and is ready, show the app
	if (readyForDashboard) {
		return <>{children}</>;
	}

	// If fetching address, show loading state
	if (fetchingAddress) {
		return (
			<div className="min-h-[100svh] w-full flex items-center justify-center">
				<div className="pixel-window max-w-2xl w-[94vw]">
					<div className="pixel-window__inner p-4 md:p-6">
						<p className="text-center">Loading...</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-[100svh] w-full flex items-center justify-center">
			{/* Logo in top left corner */}
			<Image
				src="/assets/logo.png"
				alt="Logo"
				width={28}
				height={28}
				className="fixed top-4 left-4 rounded-sm z-50"
				style={{ width: '25px' }}
				data-darkreader-ignore
				suppressHydrationWarning
			/>
			<div className="pixel-window max-w-2xl w-[94vw]">
				<div className="pixel-window__inner p-4 md:p-6">
					<div className="mb-4">
						<h2 className="text-xl md:text-2xl font-bold">Set up your access</h2>
					</div>

					<p className="opacity-90 mb-4">
						Connect with one of the options below to get started.
					</p>

					<ol className="space-y-3">
						<li className="panel p-3 flex items-center justify-between gap-3 opacity-100">
							<div className="flex items-center gap-3">
								<Image src="/assets/google.png" alt="Google" width={22} height={22} data-darkreader-ignore suppressHydrationWarning />
								<div>
									<div className="font-semibold">Connect Google</div>
									<div className="text-xs opacity-80">
										Sign in with your Google account.
									</div>
								</div>
							</div>
							{hasGoogle ? (
								<PixelButton disabled>{effectiveGoogle}</PixelButton>
							) : (
								<PixelButton onClick={() => signIn("google", { callbackUrl: "/" })}>
									Connect
								</PixelButton>
							)}
						</li>

						<li className="panel p-3 flex items-center justify-between gap-3 opacity-100">
							<div className="flex items-center gap-3">
								<Image src="/assets/x.png" alt="X" width={22} height={22} data-darkreader-ignore suppressHydrationWarning />
								<div>
									<div className="font-semibold">Connect X (Twitter)</div>
									<div className="text-xs opacity-80">
										Authorize your X account to link your handle.
									</div>
								</div>
							</div>
							{hasX ? (
								<PixelButton disabled>@{effectiveTwitter}</PixelButton>
							) : (
								<PixelButton onClick={() => signIn("twitter", { callbackUrl: "/" })}>
									Connect
								</PixelButton>
							)}
						</li>

						<li className="panel p-3 flex items-center justify-between gap-3">
							<div className="flex items-center gap-3">
								<Image src="/assets/discord.png" alt="Discord" width={22} height={22} data-darkreader-ignore suppressHydrationWarning />
								<div>
									<div className="font-semibold">Connect Discord</div>
									<div className="text-xs opacity-80">
										Authorize your Discord account to finalize access.
									</div>
								</div>
							</div>
							{hasDiscord ? (
								<PixelButton disabled>{effectiveDiscord}</PixelButton>
							) : (
								<PixelButton onClick={() => signIn("discord", { callbackUrl: "/" })}>
									Connect
								</PixelButton>
							)}
						</li>

						{/* External Wallet Option */}
						<li className="panel p-3 flex items-center justify-between gap-3">
							<div className="flex items-center gap-3">
								<Image src="/assets/wallet.png" alt="Wallet" width={22} height={22} data-darkreader-ignore suppressHydrationWarning />
								<div>
									<div className="font-semibold">Connect External Wallet</div>
									<div className="text-xs opacity-80">
										Connect using an external wallet (MetaMask, etc.)
									</div>
								</div>
							</div>
							{hasWallet ? (
								<PixelButton disabled>{shortenMiddle(effectiveAddress || "", 4, 4)}</PixelButton>
							) : (
								<PixelButton onClick={handleWalletConnect} disabled={walletConnectLoading}>
									{walletConnectLoading ? "Connecting..." : "Connect"}
								</PixelButton>
							)}
						</li>
					</ol>
				</div>
			</div>
		</div>
	);
}


