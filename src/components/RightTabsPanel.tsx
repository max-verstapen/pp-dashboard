"use client";
import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSession, signIn, signOut } from "next-auth/react";
import { useWeb3AuthUser, useWeb3AuthConnect } from "@web3auth/modal/react";
import { useGlobalWallet } from "./GlobalWalletProvider";
import PixelButton from "./PixelButton";
// Solana imports commented out for now - will add back after basic connection works
// import { useSolanaWallet } from "@web3auth/modal/react/solana";
// import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

type UserAllResponse = {
  username?: string;
  referralCount?: number;
  playerPoints?: number;
  // allow additional fields without enforcing a strict shape
  [key: string]: any;
};

const TAB_LABELS = ["My Stats", "Game", "Daily", "Leaderboard"] as const;
type TabKey = (typeof TAB_LABELS)[number];

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

// Cache cleanup utility - clears expired caches
function clearExpiredCaches() {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(window.sessionStorage);
    const now = Date.now();
    for (const key of keys) {
      if (key.startsWith("pp_tab_cache_")) {
        try {
          const raw = window.sessionStorage.getItem(key);
          if (raw) {
            const parsed: CachedValue<any> = JSON.parse(raw);
            if (parsed && typeof parsed.ts === "number" && now - parsed.ts > CACHE_TTL_MS) {
              window.sessionStorage.removeItem(key);
            }
          }
        } catch {
          // ignore individual cache errors
        }
      }
    }
  } catch {
    // ignore
  }
}

function shortenMiddle(value: string, keepStart = 2, keepEnd = 4): string {
  if (!value) return value;
  const totalKeep = keepStart + keepEnd;
  if (value.length <= totalKeep) return value;
  const start = value.slice(0, keepStart);
  const end = value.slice(-keepEnd);
  return `${start}...${end}`;
}

export default function RightTabsPanel() {
  const [activeTab, setActiveTab] = useState<TabKey>("My Stats");
  const { address: globalWalletAddress } = useGlobalWallet();
  const { userInfo } = useWeb3AuthUser();

  // Clear expired caches on mount and set up interval
  useEffect(() => {
    clearExpiredCaches();
    const interval = setInterval(clearExpiredCaches, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Log Web3Auth user details when available
  useEffect(() => {
    if (userInfo) {
      // eslint-disable-next-line no-console
      console.info("[Web3Auth] userInfo", userInfo);
    }
  }, [userInfo]);

  // Resolve best-available address for API checks
  const addressForApi = useMemo(
    () => globalWalletAddress || null,
    [globalWalletAddress]
  );

  // Whether a user record exists upstream. Null while checking.
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [showRestricted, setShowRestricted] = useState<boolean>(false);
  const [checkedAddress, setCheckedAddress] = useState<string | null>(null);

  // Reset state when address changes
  useEffect(() => {
    if (addressForApi !== checkedAddress && checkedAddress !== null) {
      setCheckedAddress(null);
      setUserExists(null);
    }
  }, [addressForApi, checkedAddress]);

  // Check if user exists; if not, we'll restrict all tabs except Leaderboard
  useEffect(() => {
    let cancelled = false;
    
    // Don't check if we already checked this address or if there's no address
    if (!addressForApi || checkedAddress === addressForApi) {
      return;
    }
    
    async function check() {
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(addressForApi)}`, { cache: "no-store" });
        
        if (cancelled) return;
        
        // Mark that we've checked this address
        setCheckedAddress(addressForApi);
        
        if (res.ok) {
          setUserExists(true);
        } else if (res.status === 403 || res.status === 404) {
          // 403 or 404 means user doesn't exist - don't retry
          setUserExists(false);
        } else {
          // Other errors - don't retry, assume false
          console.error("[RightTabsPanel] Error checking user:", res.status, res.statusText);
          setUserExists(false);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("[RightTabsPanel] Error checking user:", error);
        setCheckedAddress(addressForApi);
        setUserExists(false);
      }
    }
    
    check();
    return () => {
      cancelled = true;
    };
  }, [addressForApi, checkedAddress]);

  // If user doesn't exist, force active tab to Leaderboard
  useEffect(() => {
    if (userExists === false && activeTab !== "Leaderboard") {
      setActiveTab("Leaderboard");
    }
  }, [userExists, activeTab]);

  return (
    <div className="pixel-window h-full w-full">
      {/* Tabs header */}
      <div className="pixel-tabs">
        {TAB_LABELS.map((label) => {
          const isActive = label === activeTab;
          const isRestricted = userExists === false && label !== "Leaderboard";
          return (
            <button
              key={label}
              type="button"
              className={`pixel-tab${isRestricted ? " opacity-50 grayscale cursor-not-allowed" : ""}`}
              data-state={isActive ? "active" : "inactive"}
              onClick={() => {
                if (isRestricted) {
                  setShowRestricted(true);
                  return;
                }
                setActiveTab(label);
              }}
            >
              <span className="pixel-tab__label">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Inner content panel */}
      <div className="pixel-window__inner">
        {activeTab === "Leaderboard" && <LeaderboardContent />}
        {activeTab === "Daily" && <DailyContent />}
        {activeTab === "Game" && <GameContent />}
        {activeTab === "My Stats" && <MyStatsContent />}
      </div>

      {/* Restricted modal */}
      {showRestricted && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowRestricted(false)}
        >
          <div className="pixel-window max-w-md w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <div className="pixel-window__inner p-4 md:p-6">
              <div className="mb-3">
                <h3 className="text-lg md:text-xl font-bold">Access Limited</h3>
              </div>
              <p className="opacity-90 mb-2">
                Your wallet isn&apos;t registered in the campaign yet, so only the leaderboard is available here.
              </p>
              <p className="opacity-80 text-sm">
                To play the full game and earn points, continue in the main Bakeland experience.
              </p>
              <div className="mt-5 flex items-center justify-center">
                <PixelButton
                  variant="tab"
                  size="md"
                  onClick={() => {
                    const href = process.env.NEXT_PUBLIC_GAME_APP_URL || "/";
                    if (typeof window !== "undefined") {
                      window.open(href, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  Open Game App
                </PixelButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MyStatsContent() {
  const currentPP = 4200;
  const referrals = 7;

  const { data: session } = useSession();
  const { address: globalWalletAddress, connected: globalWalletConnected } = useGlobalWallet();
  const { connect: connectWallet, loading: walletConnectLoading } = useWeb3AuthConnect();
  const rawAdapterPk = useMemo(() => null as string | null, []);

  const googleEmail: string | null = (session as any)?.googleEmail ?? null;
  const twitterUsername: string | null = (session as any)?.twitterUsername ?? null;
  const discordUsername: string | null = (session as any)?.discordUsername ?? null;
  // Local persistence for social handles and last-known wallet address
  const [cachedTwitter, setCachedTwitter] = useState<string | null>(null);
  const [cachedDiscord, setCachedDiscord] = useState<string | null>(null);

  const [apiUser, setApiUser] = useState<UserAllResponse | null>(null);
  const [apiLoading, setApiLoading] = useState<boolean>(false);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [apiUsername, setApiUsername] = useState<string | null>(null);

  const adapterAddress = useMemo(() => globalWalletAddress || rawAdapterPk || null, [globalWalletAddress, rawAdapterPk]);
  const addressForApi = useMemo(
    () =>
      adapterAddress
        ? adapterAddress
        : null,
    [adapterAddress]
  );
  const [didSyncX, setDidSyncX] = useState<boolean>(false);
  const [didSyncDiscord, setDidSyncDiscord] = useState<boolean>(false);
  const [didSyncGoogle, setDidSyncGoogle] = useState<boolean>(false);
  
  // Store wallet address before OAuth redirect to preserve it during linking
  const storeWalletBeforeLink = () => {
    if (addressForApi) {
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("pp_last_wallet_address", addressForApi);
        }
      } catch {
        // ignore
      }
    }
  };

  // Debug: log address resolution changes
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info("[MyStats] address resolution", {
      globalWalletAddress,
      rawAdapterPk,
      adapterAddress,
      addressForApi,
    });
  }, [globalWalletAddress, rawAdapterPk, adapterAddress, addressForApi]);

  // Resolve effective handles preferring live session, falling back to cached values
  const effectiveTwitter = twitterUsername || cachedTwitter || null;
  const effectiveDiscord = discordUsername || cachedDiscord || null;

  // Hydrate from localStorage on mount (handles only)
  useEffect(() => {
    try {
      const t = typeof window !== "undefined" ? window.localStorage.getItem("pp_twitter_username") : null;
      const d = typeof window !== "undefined" ? window.localStorage.getItem("pp_discord_username") : null;
      if (t && !twitterUsername) setCachedTwitter(t);
      if (d && !discordUsername) setCachedDiscord(d);
    } catch {
      // ignore storage issues
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist handles when they arrive from session
  useEffect(() => {
    if (twitterUsername) {
      setCachedTwitter(twitterUsername);
      // Reset sync flag when handle changes so it syncs again
      setDidSyncX(false);
      try {
        if (typeof window !== "undefined") window.localStorage.setItem("pp_twitter_username", twitterUsername);
      } catch {
        // ignore
      }
    }
  }, [twitterUsername]);
  useEffect(() => {
    if (discordUsername) {
      setCachedDiscord(discordUsername);
      // Reset sync flag when handle changes so it syncs again
      setDidSyncDiscord(false);
      try {
        if (typeof window !== "undefined") window.localStorage.setItem("pp_discord_username", discordUsername);
      } catch {
        // ignore
      }
    }
  }, [discordUsername]);

  // Persist last-known wallet address for display between redirects
  useEffect(() => {
    const latest = adapterAddress || null;
    try {
      if (typeof window !== "undefined") {
        if (latest) {
          window.localStorage.setItem("pp_last_wallet_address", latest);
        } else {
          window.localStorage.removeItem("pp_last_wallet_address");
        }
      }
    } catch {
      // ignore
    }
  }, [adapterAddress]);

  // If we don't yet have an address to query by, fall back to social/email lookups
  // so we can at least show username / stats for the upstream user. When those
  // responses include a userAddress, we also push it into the global wallet.
  useEffect(() => {
    let cancelled = false;
    async function loadBySocial() {
      // If we already have an address, let the address-based effects handle stats.
      if (addressForApi) return;

      const normalizedEmail = googleEmail?.toLowerCase().trim() || null;
      const normalizedTwitter = twitterUsername
        ? (twitterUsername.startsWith("@") ? twitterUsername.slice(1) : twitterUsername).trim()
        : null;
      const normalizedDiscord = discordUsername ? discordUsername.trim() : null;

      if (!normalizedEmail && !normalizedTwitter && !normalizedDiscord) return;

      // Build cache key from social identifiers
      const socialKey = `${normalizedEmail ?? ""}|${normalizedTwitter ?? ""}|${normalizedDiscord ?? ""}`;
      const cacheKey = `pp_tab_cache_mystats_social_${socialKey}`;
      
      // Check cache first
      const cached = getCachedJson<UserAllResponse>(cacheKey);
      if (cached) {
        setApiUser((prev) => prev ?? cached);
        return;
      }

      let userData: any = null;

      try {
        if (normalizedEmail) {
          try {
            // eslint-disable-next-line no-console
            console.info("[MyStats] fallback /api/user/by-email", normalizedEmail);
            const res = await fetch(`/api/user/by-email/${normalizedEmail}`, { cache: "no-store" });
            if (res.ok) {
              userData = await res.json();
            }
          } catch {
            // ignore and try next strategy
          }
        }

        if (!userData && normalizedTwitter) {
          try {
            // eslint-disable-next-line no-console
            console.info("[MyStats] fallback /api/user/by-x", normalizedTwitter);
            const res = await fetch(`/api/user/by-x/${encodeURIComponent(normalizedTwitter)}`, {
              cache: "no-store",
            });
            if (res.ok) {
              userData = await res.json();
            }
          } catch {
            // ignore
          }
        }

        if (!userData && normalizedDiscord) {
          try {
            // eslint-disable-next-line no-console
            console.info("[MyStats] fallback /api/user/by-discord", normalizedDiscord);
            const res = await fetch(`/api/user/by-discord/${encodeURIComponent(normalizedDiscord)}`, {
              cache: "no-store",
            });
            if (res.ok) {
              userData = await res.json();
            }
          } catch {
            // ignore
          }
        }

        if (!cancelled && userData) {
          setApiUser((prev) => prev ?? (userData as UserAllResponse));
          // Cache the social lookup result
          setCachedJson(cacheKey, userData as UserAllResponse);

          const normalizedAddress =
            userData?.userAddress ||
            userData?.address ||
            userData?.walletAddress ||
            userData?.wallet_address ||
            userData?.user?.address ||
            userData?.user?.walletAddress ||
            userData?.user?.wallet_address ||
            null;

          if (normalizedAddress && typeof window !== "undefined") {
            // eslint-disable-next-line no-console
            console.info("[MyStats] dispatch setUserAddress from social/email lookup", normalizedAddress);
            window.dispatchEvent(
              new CustomEvent("setUserAddress", {
                detail: normalizedAddress,
              })
            );
          }
        }
      } catch {
        // swallow; stats will just stay empty
      }
    }

    void loadBySocial();
    return () => {
      cancelled = true;
    };
  }, [addressForApi, googleEmail, twitterUsername, discordUsername]);

  useEffect(() => {
    let abort = false;
    async function load() {
      const addr = addressForApi;
      if (!addr) {
        setApiUser(null);
        setApiUsername(null);
        return;
      }
      
      // Check cache first
      const cacheKey = `pp_tab_cache_mystats_all_${addr}`;
      const cached = getCachedJson<UserAllResponse>(cacheKey);
      if (cached) {
        setApiUser(cached);
        setApiLoading(false);
        return;
      }
      
      setApiLoading(true);
      try {
        // eslint-disable-next-line no-console
        console.info("[MyStats] GET /api/user/[address]/all ->", addr);
        const res = await fetch(`/api/user/${encodeURIComponent(addr)}/all`, { cache: "no-store" });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn("[MyStats] /api/user/[address]/all non-OK", res.status);
          setApiUser(null);
          return;
        }
        const data = (await res.json()) as UserAllResponse;
        if (!abort) {
          setApiUser(data || null);
          // Cache the response
          if (data) setCachedJson(cacheKey, data);
        }
      } catch {
        // eslint-disable-next-line no-console
        console.error("[MyStats] /api/user/[address]/all fetch failed");
        if (!abort) setApiUser(null);
      } finally {
        if (!abort) setApiLoading(false);
      }
    }
    load();
    return () => {
      abort = true;
    };
  }, [addressForApi]);

  // Fetch username from upstream /users/{address} (Lambda) explicitly for display
  useEffect(() => {
    let abort = false;
    const addr = addressForApi;
    if (!addr) {
      setApiUsername(null);
      return;
    }
    async function loadUsername() {
      // Check cache first
      const cacheKey = `pp_tab_cache_mystats_username_${addr}`;
      const cached = getCachedJson<string>(cacheKey);
      if (cached) {
        setApiUsername(cached);
        return;
      }
      
      try {
        // eslint-disable-next-line no-console
        console.info("[MyStats] GET /api/user/[address] ->", addr);
        const res = await fetch(`/api/user/${encodeURIComponent(addr)}`, { cache: "no-store" });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn("[MyStats] /api/user/[address] non-OK", res.status);
          if (!abort) setApiUsername(null);
          return;
        }
        const data = await res.json();
        const uname: string | null =
          data?.username ??
          data?.user?.username ??
          data?.profile?.username ??
          null;
        if (!abort) {
          setApiUsername(uname ?? null);
          // Cache the username
          if (uname) setCachedJson(cacheKey, uname);
        }
      } catch {
        if (!abort) setApiUsername(null);
      }
    }
    loadUsername();
    return () => {
      abort = true;
    };
  }, [addressForApi]);

  // Reset sync flag when email changes
  useEffect(() => {
    if (googleEmail) {
      setDidSyncGoogle(false);
    }
  }, [googleEmail]);

  // When we have a connected address and a social handle, push it to backend once
  useEffect(() => {
    let cancelled = false;
    async function syncGoogle() {
      // Try to get address from current state, localStorage, or API lookup
      const addr = addressForApi || 
        (typeof window !== "undefined" ? window.localStorage.getItem("pp_last_wallet_address") : null);
      
      if (!addr || !googleEmail || didSyncGoogle) return;
      
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(addr)}/email`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: googleEmail }),
        });
        if (!cancelled && res.ok) {
          setDidSyncGoogle(true);
          // Restore wallet address if we used localStorage address
          if (!addressForApi && addr) {
            window.dispatchEvent(new CustomEvent("setUserAddress", {
              detail: addr,
            }));
          }
        }
      } catch {
        // ignore transient errors; will retry on re-render
      }
    }
    syncGoogle();
    return () => {
      cancelled = true;
    };
  }, [addressForApi, googleEmail, didSyncGoogle]);

  useEffect(() => {
    let cancelled = false;
    async function syncX() {
      // Try to get address from current state, localStorage, or API lookup
      const addr = addressForApi || 
        (typeof window !== "undefined" ? window.localStorage.getItem("pp_last_wallet_address") : null);
      
      if (!addr || !effectiveTwitter || didSyncX) return;
      
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(addr)}/x-handle`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ xHandle: effectiveTwitter }),
        });
        if (!cancelled && res.ok) {
          setDidSyncX(true);
          // Restore wallet address if we used localStorage address
          if (!addressForApi && addr) {
            window.dispatchEvent(new CustomEvent("setUserAddress", {
              detail: addr,
            }));
          }
        }
      } catch {
        // ignore transient errors; will retry on re-render
      }
    }
    syncX();
    return () => {
      cancelled = true;
    };
  }, [addressForApi, effectiveTwitter, didSyncX]);

  useEffect(() => {
    let cancelled = false;
    async function syncDiscord() {
      // Try to get address from current state, localStorage, or API lookup
      const addr = addressForApi || 
        (typeof window !== "undefined" ? window.localStorage.getItem("pp_last_wallet_address") : null);
      
      if (!addr || !effectiveDiscord || didSyncDiscord) return;
      
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(addr)}/discord-handle`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discordHandle: effectiveDiscord }),
        });
        if (!cancelled && res.ok) {
          setDidSyncDiscord(true);
          // Restore wallet address if we used localStorage address
          if (!addressForApi && addr) {
            window.dispatchEvent(new CustomEvent("setUserAddress", {
              detail: addr,
            }));
          }
        }
      } catch {
        // ignore
      }
    }
    syncDiscord();
    return () => {
      cancelled = true;
    };
  }, [addressForApi, effectiveDiscord, didSyncDiscord]);

  // Fetch player rank
  useEffect(() => {
    let abort = false;
    const unifiedAddr = addressForApi;
    if (!unifiedAddr) {
      setPlayerRank(null);
      return;
    }
    async function loadRank() {
      // Check cache first
      const cacheKey = `pp_tab_cache_mystats_rank_${unifiedAddr}`;
      const cached = getCachedJson<number>(cacheKey);
      if (cached !== null) {
        setPlayerRank(cached);
        return;
      }
      
      try {
        // eslint-disable-next-line no-console
        console.info("[MyStats] GET /api/player-points/[address]/rank ->", unifiedAddr);
        const res = await fetch(`/api/player-points/${encodeURIComponent(unifiedAddr)}/rank`, { cache: "no-store" });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn("[MyStats] /api/player-points/[address]/rank non-OK", res.status);
          setPlayerRank(null);
          return;
        }
        const data = await res.json();
        // Handle different possible response shapes: { rank: number } or just number
        const rank = typeof data === "number" ? data : data?.rank ?? data?.playerRank ?? null;
        if (!abort && rank !== null && rank !== undefined) {
          const rankNum = typeof rank === "number" ? rank : parseInt(String(rank), 10);
          setPlayerRank(rankNum);
          // Cache the rank
          setCachedJson(cacheKey, rankNum);
        }
      } catch {
        // eslint-disable-next-line no-console
        console.error("[MyStats] /api/player-points/[address]/rank fetch failed");
        if (!abort) setPlayerRank(null);
      }
    }
    loadRank();
    return () => {
      abort = true;
    };
  }, [addressForApi]);

  const adapterConnected = globalWalletConnected;
  const isConnected = globalWalletConnected || !!effectiveTwitter || !!effectiveDiscord;
  const anyConnected = !!effectiveTwitter || !!effectiveDiscord || globalWalletConnected;

  // Prefer the raw public key if present regardless of the adapter 'connected' flag.
  const adapterPk = globalWalletAddress || rawAdapterPk || null;
  const hasWallet = !!adapterPk;
  const walletAddressDisplay =
    (adapterPk ? shortenMiddle(adapterPk, 4, 4) : null) ||
    "--";

  function handleUnifiedDisconnect() {
    if (effectiveTwitter || effectiveDiscord) {
      // This signs out of all NextAuth providers (no fine-grained unlink available here)
      void signOut({ callbackUrl: "/" });
    }
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("pp_last_wallet_address");
        window.localStorage.removeItem("pp_twitter_username");
        window.localStorage.removeItem("pp_discord_username");
      }
    } catch {
      // ignore
    }
  }

  const usernameFromApi = apiUsername || apiUser?.username;
  // Only use Twitter handle as fallback if we have no username from API at all
  // Don't replace existing usernames with Twitter handle
  const displayUsername =
    isConnected && usernameFromApi
      ? `@${usernameFromApi}`
      : isConnected && effectiveTwitter && !usernameFromApi
      ? `@${effectiveTwitter}`
      : "--";

  const displayReferrals =
    isConnected && (apiUser?.referralCount ?? null) !== null && (apiUser?.referralCount ?? undefined) !== undefined
      ? String(apiUser?.referralCount)
      : "--";

  const displayPP =
    isConnected &&
    ((apiUser?.playerPoints ?? apiUser?.totalPoints ?? null) !== null &&
      (apiUser?.playerPoints ?? apiUser?.totalPoints ?? undefined) !== undefined)
      ? `${(apiUser?.playerPoints ?? apiUser?.totalPoints) as number} PP`
      : "--";

  const displayRank =
    isConnected && playerRank !== null && playerRank !== undefined
      ? `Rank: ${playerRank}`
      : "--";

  return (
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col">
      <h2 className="text-2xl md:text-3xl drop-shadow font-bold mb-4">My Stats</h2>

      {/* No user creation flow; we only display existing data */}

      <div className="stats-scroll">
        {/* Primary stats */}
        <div className="stats-list">
          <div className="stats-row">
            <Image src="/assets/Green Icons Outlined/at.png" alt="username" width={26} height={26} className="stats-icon" />
            <div className="pixel-chip pixel-chip--entry">
              <span className="pixel-chip__text">{isConnected ? displayUsername : "--"}</span>
            </div>
          </div>
          <div className="stats-row">
            <Image src="/assets/Green Icons Outlined/power_B.png" alt="PP" width={26} height={26} className="stats-icon" />
            <div className="pixel-chip pixel-chip--entry">
              <span className="pixel-chip__text">{displayPP}</span>
            </div>
          </div>
          <div className="stats-row">
            <Image src="/assets/Green Icons Outlined/stats_A.png" alt="Rank" width={26} height={26} className="stats-icon" />
            <div className="pixel-chip pixel-chip--entry">
              <span className="pixel-chip__text">{displayRank}</span>
            </div>
          </div>
          <div className="stats-row">
            <Image src="/assets/Green Icons Outlined/friend_add.png" alt="Referrals" width={26} height={26} className="stats-icon" />
            <div className="pixel-chip pixel-chip--entry">
              <span className="pixel-chip__text">{displayReferrals === "--" ? "--" : `${displayReferrals} Referrals`}</span>
            </div>
          </div>
          {/* SOL balance - will add back after basic connection works */}
          {/* <div className="stats-row">
            <Image src="/assets/wallet.png" alt="SOL Balance" width={26} height={26} className="stats-icon" />
            <div className="pixel-chip pixel-chip--entry">
              <span className="pixel-chip__text">
                {balanceLoading ? "Loading..." : balanceError ? "Error" : solBalance !== null ? `${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL` : "--"}
              </span>
            </div>
          </div> */}
        </div>

        {/* Linked Accounts */}
        <div className="mt-6">
          <div className="stats-section__title">Linked Accounts:</div>
          <div className="stats-list">
            {/* Google Account */}
            <div className="stats-row">
              <Image src="/assets/google.png" alt="Google" width={26} height={26} className="stats-icon" />
              {googleEmail ? (
                <div className="flex items-center gap-2">
                  <div className="pixel-chip pixel-chip--entry">
                    <span className="pixel-chip__text">{googleEmail}</span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="pixel-chip pixel-chip--entry"
                  onClick={() => {
                    storeWalletBeforeLink();
                    signIn("google", { callbackUrl: "/" });
                  }}
                >
                  <span className="pixel-chip__text">Link</span>
                </button>
              )}
            </div>
            {/* X/Twitter Account */}
            <div className="stats-row">
              <Image src="/assets/x.png" alt="X" width={26} height={26} className="stats-icon" />
              {effectiveTwitter ? (
                <div className="flex items-center gap-2">
                  <div className="pixel-chip pixel-chip--entry">
                    <span className="pixel-chip__text">@{effectiveTwitter}</span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="pixel-chip pixel-chip--entry"
                  onClick={() => {
                    storeWalletBeforeLink();
                    signIn("twitter", { callbackUrl: "/" });
                  }}
                >
                  <span className="pixel-chip__text">Link</span>
                </button>
              )}
            </div>
            {/* Discord Account */}
            <div className="stats-row">
              <Image src="/assets/discord.png" alt="Discord" width={26} height={26} className="stats-icon" />
              {effectiveDiscord ? (
                <div className="flex items-center gap-2">
                  <div className="pixel-chip pixel-chip--entry">
                    <span className="pixel-chip__text">{effectiveDiscord}</span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="pixel-chip pixel-chip--entry"
                  onClick={() => {
                    storeWalletBeforeLink();
                    signIn("discord", { callbackUrl: "/" });
                  }}
                >
                  <span className="pixel-chip__text">Link</span>
                </button>
              )}
            </div>
            {/* Wallet Account */}
            <div className="stats-row">
              <Image src="/assets/wallet.png" alt="Wallet" width={26} height={26} className="stats-icon" />
              {addressForApi ? (
                <div className="flex items-center gap-2">
                  <div className="pixel-chip pixel-chip--entry">
                    <span className="pixel-chip__text">{shortenMiddle(addressForApi, 4, 4)}</span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="pixel-chip pixel-chip--entry"
                  onClick={async () => {
                    try {
                      await connectWallet();
                    } catch (error) {
                      console.error("[MyStats] Wallet connection error:", error);
                    }
                  }}
                  disabled={walletConnectLoading}
                >
                  <span className="pixel-chip__text">{walletConnectLoading ? "Connecting..." : "Link Wallet"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type GameTask = {
  id: string;
  title: string;
  rewardPP: number;
  done: boolean;
};

function GameContent() {
  const currentPP = 4200;
  const walletAddress = useMemo(() => null as string | null, []);

  const [tasks, setTasks] = useState<GameTask[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string> | null>(null);

  // Load catalog of tasks (static for now)
  useEffect(() => {
    const controller = new AbortController();
    const fetchTasks = async () => {
      // Check cache first
      const cacheKey = "pp_tab_cache_game_tasks";
      const cached = getCachedJson<GameTask[]>(cacheKey);
      if (cached) {
        // If we already know completed ids, mark accordingly
        setTasks(
          Array.isArray(cached)
            ? cached.map((t) => ({ ...t, done: completedIds?.has(t.id) ?? t.done ?? false }))
            : []
        );
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/game/tasks", { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Failed to load tasks (${res.status})`);
        }
        const data: GameTask[] = await res.json();
        // Cache the tasks
        if (Array.isArray(data)) {
          setCachedJson(cacheKey, data);
        }
        // If we already know completed ids, mark accordingly
        setTasks(
          Array.isArray(data)
            ? data.map((t) => ({ ...t, done: completedIds?.has(t.id) ?? t.done ?? false }))
            : []
        );
      } catch (err: unknown) {
        if ((err as any)?.name === "AbortError") return;
        setError("Unable to load tasks. Showing placeholders.");
        // Fallback placeholders keep UI functional until API is wired
        const fallbackTasks: GameTask[] = [
          { id: "fw", title: "Complete 'Firmware Update'", rewardPP: 10, done: true },
          { id: "travel", title: "Complete 'Gotta Go Places'", rewardPP: 20, done: false },
          { id: "ramen", title: "Complete 'Ramen Rush'", rewardPP: 15, done: false },
          { id: "mead", title: "Complete 'Honey Mead'", rewardPP: 75, done: false },
          { id: "fractured", title: "Complete 'Fractured Realms'", rewardPP: 100, done: false },
          { id: "solana", title: "Open a Solana Lootbox", rewardPP: 100, done: false },
          { id: "honeycub", title: "Open a Honeycub Lootbox", rewardPP: 125, done: false },
        ];
        setTasks(fallbackTasks);
        // Cache fallback tasks too
        setCachedJson(cacheKey, fallbackTasks);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
    return () => controller.abort();
  }, [completedIds]);

  // Load completed one-time tasks for connected user and merge into list
  useEffect(() => {
    let abort = false;
    if (!walletAddress) {
      setCompletedIds(null);
      // Reset done flags to whatever tasks currently have
      setTasks((prev) => prev ? prev.map((t) => ({ ...t, done: t.done ?? false })) : prev);
      return;
    }
    async function loadCompleted() {
      // Check cache first
      const cacheKey = `pp_tab_cache_game_completed_${walletAddress}`;
      const cached = getCachedJson<string[]>(cacheKey);
      if (cached && Array.isArray(cached)) {
        const ids = new Set(cached);
        setCompletedIds(ids);
        // Update tasks with cached completed ids
        setTasks((prev) =>
          Array.isArray(prev)
            ? prev.map((t) => ({ ...t, done: ids.has(t.id) || !!t.done }))
            : prev
        );
        return;
      }
      
      try {
        const res = await fetch(`/api/player-points/${encodeURIComponent(walletAddress)}/completed/one`, { cache: "no-store" });
        if (!res.ok) {
          setCompletedIds(new Set());
          return;
        }
        const data = await res.json();
        const list: Array<{ taskId?: string; metadata?: any }> = Array.isArray(data?.completed) ? data.completed : [];
        const ids = new Set<string>();
        for (const it of list) {
          const id = String(it?.taskId ?? "").trim();
          if (id) ids.add(id);
        }
        if (abort) return;
        setCompletedIds(ids);
        // Cache the completed ids (convert Set to Array for JSON serialization)
        setCachedJson(cacheKey, Array.from(ids));
        // If we already have tasks loaded, update their done flags
        setTasks((prev) =>
          Array.isArray(prev)
            ? prev.map((t) => ({ ...t, done: ids.has(t.id) || !!t.done }))
            : prev
        );
      } catch {
        if (!abort) setCompletedIds(new Set());
      }
    }
    loadCompleted();
    return () => {
      abort = true;
    };
  }, [walletAddress]);

  const list = tasks ?? [];

  return (
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col">
      {/* Header with title and PP chip */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-2xl md:text-3xl drop-shadow font-bold">Game</h2>
        <div className="pixel-chip" aria-label="PP balance">
          <span className="pixel-chip__text">{currentPP} PP</span>
        </div>
      </div>

      <div className="tasks-scroll">
        <div className="tasks-section">
          <div className="tasks-section__title">Primary Tasks</div>
          {error && (
            <div className="mb-2 text-yellow-200/90">{error}</div>
          )}
          <div className="tasks-list">
            {list.map((t) => (
              <div key={t.id} className="task-row">
                <div className="task-left">
                  <span className="task-checkbox" aria-hidden="true">
                    {t.done && (
                      <Image
                        src="/assets/Green Icons Outlined/checkmark.png"
                        alt="checked"
                        width={16}
                        height={16}
                        className="task-checkbox__mark"
                      />
                    )}
                  </span>
                  <span className="task-title">{t.title}</span>
                </div>
                <div className="task-reward">+{t.rewardPP} PP</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="mt-3 opacity-80">Loading tasks...</div>
      )}
    </div>
  );
}

function LeaderboardContent() {
  const [rows, setRows] = useState<{ rank?: number; name?: string; pp?: number }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let abort = false;
    async function load() {
      // Check cache first
      const cacheKey = "pp_tab_cache_leaderboard_overall";
      const cached = getCachedJson<{ rank?: number; name?: string; pp?: number }[]>(cacheKey);
      if (cached && Array.isArray(cached)) {
        setRows(cached);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        // eslint-disable-next-line no-console
        console.info("[Leaderboard] GET /api/leaderboard/overall");
        const res = await fetch("/api/leaderboard/overall", { cache: "no-store" });
        if (!res.ok) {
          setRows([]);
          return;
        }
        const data = await res.json();
        const normalized =
          Array.isArray(data)
            ? data
            : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.leaderboard)
            ? data.leaderboard
            : [];
        const mapped = normalized.map((it: any, idx: number) => ({
          rank: it.rank ?? idx + 1,
          name: it.username || it.name || it.user?.username || "--",
          pp: it.playerPoints ?? it.totalPoints ?? it.pp ?? it.points ?? 0,
        }));
        if (!abort) {
          setRows(mapped);
          // Cache the leaderboard data
          setCachedJson(cacheKey, mapped);
        }
      } catch {
        if (!abort) setRows([]);
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => {
      abort = true;
    };
  }, []);

  return (
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col">
      {/* Header row */}
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-2xl md:text-3xl drop-shadow font-bold flex items-center gap-2">
          <Image
            src="/assets/Green Icons Outlined/globe.png"
            alt="Leaderboard"
            width={24}
            height={24}
            className="pixel-icon"
          />
          <span>Leaderboard</span>
        </h2>
      </div>

      {/* Table header */}
      <div className="lb-header-row">
        <div>Rank</div>
        <div>Username</div>
        <div>Play Points (PP)</div>
      </div>

      {/* Rows */}
      <div className="lb-rows">
        {rows.map((r, idx) => (
          <div key={`${r.name ?? "row"}-${idx}`} className="lb-row">
            <div className="lb-rank">{r.rank ?? idx + 1}</div>
            <div className="lb-name">{r.name ?? "--"}</div>
            <div className="lb-pp">{r.pp ?? 0}</div>
          </div>
        ))}
        {rows.length === 0 && !loading && (
          <div className="mt-2 opacity-80">No leaderboard data.</div>
        )}
      </div>
    </div>
  );
}

function DailyContent() {
  const currentPP = 4200;
  const walletAddress = useMemo(() => null as string | null, []);

  const socialTasks = [
    { done: true, title: "Refer a friend", reward: 50 },
    { done: false, title: "Follow @bakelandxyz on X", reward: 25 },
    { done: false, title: "Post a Gameplay Clip on X", reward: 150 },
  ];
  type DailyTask = { id: string; title: string; reward: number; done: boolean };
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([
    { id: "harvest_carrots_50", title: "Harvest x50 Carrots", reward: 25, done: false },
    { id: "harvest_cabbage_25", title: "Harvest x25 Cabbages", reward: 25, done: false },
    { id: "deliver_ramen_100", title: "Deliver x100 Ramen Bowls", reward: 75, done: false },
    { id: "harvest_mugwort_50", title: "Harvest x50 Mugwort", reward: 50, done: false },
  ]);

  useEffect(() => {
    let abort = false;
    if (!walletAddress) {
      // Reset to defaults (not completed)
      setDailyTasks((prev) => prev.map((t) => ({ ...t, done: false })));
      return;
    }
    async function loadCompletedDaily() {
      // Check cache first
      const cacheKey = `pp_tab_cache_daily_completed_${walletAddress}`;
      const cached = getCachedJson<{ idSet: string[]; titleSet: string[] }>(cacheKey);
      if (cached && cached.idSet && cached.titleSet) {
        const idSet = new Set(cached.idSet);
        const titleSet = new Set(cached.titleSet);
        setDailyTasks((prev) =>
          prev.map((t) => {
            const isDoneById = idSet.has(t.id);
            const isDoneByTitle = titleSet.has(t.title.toLowerCase());
            return { ...t, done: isDoneById || isDoneByTitle || t.done };
          })
        );
        return;
      }
      
      try {
        const res = await fetch(`/api/player-points/${encodeURIComponent(walletAddress)}/completed/daily`, { cache: "no-store" });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        const completed: Array<{ taskId?: string; metadata?: any }> = Array.isArray(data?.completed) ? data.completed : [];
        const idSet = new Set<string>();
        const titleSet = new Set<string>(
          completed
            .map((c) => String(c?.metadata?.title ?? c?.metadata?.name ?? "").toLowerCase())
            .filter((s) => !!s)
        );
        for (const c of completed) {
          const id = String(c?.taskId ?? "").trim();
          if (id) idSet.add(id);
        }
        if (abort) return;
        // Cache the completed sets
        setCachedJson(cacheKey, {
          idSet: Array.from(idSet),
          titleSet: Array.from(titleSet),
        });
        setDailyTasks((prev) =>
          prev.map((t) => {
            const isDoneById = idSet.has(t.id);
            const isDoneByTitle = titleSet.has(t.title.toLowerCase());
            return { ...t, done: isDoneById || isDoneByTitle || t.done };
          })
        );
      } catch {
        // ignore
      }
    }
    loadCompletedDaily();
    return () => {
      abort = true;
    };
  }, [walletAddress]);

  return (
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col">
      {/* Header with title and PP chip */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-2xl md:text-3xl drop-shadow font-bold">Daily</h2>
        <div className="pixel-chip" aria-label="PP balance">
          <span className="pixel-chip__text">{currentPP} PP</span>
        </div>
      </div>

      <div className="tasks-scroll">
        {/* Social Tasks */}
        <div className="tasks-section">
          <div className="tasks-section__title">Social Tasks</div>
          <div className="tasks-list">
            {socialTasks.map((t) => (
              <div key={t.title} className="task-row">
                <div className="task-left">
                  <span className="task-checkbox" aria-hidden="true">
                    {t.done && (
                      <Image
                        src="/assets/Green Icons Outlined/checkmark.png"
                        alt="checked"
                        width={16}
                        height={16}
                        className="task-checkbox__mark"
                      />
                    )}
                  </span>
                  <span className="task-title">{t.title}</span>
                </div>
                <div className="task-reward">+{t.reward} PP</div>
              </div>
            ))}
          </div>

          <div className="task-notes">
            <div>• Posts must tag @bakelandxyz to be eligible</div>
            <div>• Posts must include gameplay and/or Bakker footage showing Bakeland to be eligible</div>
          </div>
        </div>

        {/* Daily Tasks */}
        <div className="tasks-section mt-6">
          <div className="tasks-section__title">Daily Tasks</div>
          <div className="tasks-list">
            {dailyTasks.map((t) => (
              <div key={t.id} className="task-row">
                <div className="task-left">
                  <span className="task-checkbox" aria-hidden="true">
                    {t.done && (
                      <Image
                        src="/assets/Green Icons Outlined/checkmark.png"
                        alt="checked"
                        width={16}
                        height={16}
                        className="task-checkbox__mark"
                      />
                    )}
                  </span>
                  <span className="task-title">{t.title}</span>
                </div>
                <div className="task-reward">+{t.reward} PP</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}




