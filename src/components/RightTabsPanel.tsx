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
  totalPoints?: number;
  email?: string;
  xHandle?: string;
  discordHandle?: string;
  raw?: {
    all?: any;
    user?: any;
    referrals?: any;
    points?: any;
  };
  // allow additional fields without enforcing a strict shape
  [key: string]: any;
};

const TAB_LABELS = ["My Stats", "Game", "Bounties", "Leaderboard", "Invite"] as const;
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

function cleanAccountName(name: string | null): string | null {
  if (!name) return null;
  // Trim whitespace
  let cleaned = name.trim();
  // Remove @ from start
  while (cleaned.startsWith('@')) {
    cleaned = cleaned.slice(1);
  }
  // Remove @ from end
  while (cleaned.endsWith('@')) {
    cleaned = cleaned.slice(0, -1);
  }
  // Trim whitespace again after removing @
  cleaned = cleaned.trim();
  return cleaned || null;
}

export default function RightTabsPanel() {
  const [activeTab, setActiveTab] = useState<TabKey>("My Stats");
  const { address: globalWalletAddress } = useGlobalWallet();
  const { userInfo } = useWeb3AuthUser();
  const { data: session } = useSession();

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
  const [showCreateUserFlow, setShowCreateUserFlow] = useState<boolean>(false);

  // Reset state when address changes
  useEffect(() => {
    if (addressForApi !== checkedAddress && checkedAddress !== null) {
      setCheckedAddress(null);
      setUserExists(null);
    }
  }, [addressForApi, checkedAddress]);

  // Check if user exists; if not, check by email/X/Discord and link if found
  useEffect(() => {
    let cancelled = false;
    
    // Don't check if we already checked this address or if there's no address
    if (!addressForApi || checkedAddress === addressForApi) {
      return;
    }
    
    async function check() {
      // Guard against null address inside the function
      if (!addressForApi) return;
      
      try {
        // First, check if user exists by wallet address
        const res = await fetch(`/api/user/${encodeURIComponent(addressForApi)}`, { cache: "no-store" });
        
        if (cancelled) return;
        
        // Mark that we've checked this address
        setCheckedAddress(addressForApi);
        
        if (res.ok) {
          setUserExists(true);
          return;
        } 
        
        // If user doesn't exist by wallet address, check if user exists by email/X/Discord
        if (res.status === 403 || res.status === 404) {
          const googleEmail: string | null = (session as any)?.googleEmail ?? null;
          const twitterUsername: string | null = (session as any)?.twitterUsername ?? null;
          const discordUsername: string | null = (session as any)?.discordUsername ?? null;
          
          let existingUser: any = null;
          
          // Check by email first
          if (googleEmail) {
            try {
              const emailRes = await fetch(`/api/user/by-email/${encodeURIComponent(googleEmail.toLowerCase().trim())}`, { cache: "no-store" });
              if (emailRes.ok) {
                existingUser = await emailRes.json();
                console.log("[RightTabsPanel] Found existing user by email, linking wallet...");
              }
            } catch (error) {
              console.error("[RightTabsPanel] Error checking user by email:", error);
            }
          }
          
          // Check by X handle if not found by email
          if (!existingUser && twitterUsername) {
            try {
              const normalizedTwitter = twitterUsername.startsWith("@") ? twitterUsername.slice(1) : twitterUsername;
              const xRes = await fetch(`/api/user/by-x/${encodeURIComponent(normalizedTwitter.trim())}`, { cache: "no-store" });
              if (xRes.ok) {
                existingUser = await xRes.json();
                console.log("[RightTabsPanel] Found existing user by X handle, linking wallet...");
              }
            } catch (error) {
              console.error("[RightTabsPanel] Error checking user by X handle:", error);
            }
          }
          
          // Check by Discord if not found by email or X
          if (!existingUser && discordUsername) {
            try {
              const discordRes = await fetch(`/api/user/by-discord/${encodeURIComponent(discordUsername.trim())}`, { cache: "no-store" });
              if (discordRes.ok) {
                existingUser = await discordRes.json();
                console.log("[RightTabsPanel] Found existing user by Discord handle, linking wallet...");
              }
            } catch (error) {
              console.error("[RightTabsPanel] Error checking user by Discord handle:", error);
            }
          }
          
          // If user exists by social auth, link the wallet to that user
          if (existingUser && existingUser.address && existingUser.address.toLowerCase() !== addressForApi.toLowerCase()) {
            // User exists but with different wallet address - this means we need to link the new wallet
            // The backend should handle updating the wallet address, but we'll mark userExists=true
            // since the user record exists (just needs wallet linking)
            console.log("[RightTabsPanel] User exists by social auth, wallet will be linked via sync");
            setUserExists(true);
            return;
          }
          
          // User doesn't exist by wallet or social auth
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
  }, [addressForApi, checkedAddress, session]);

  // If user doesn't exist, show create user flow instead of forcing Leaderboard
  useEffect(() => {
    if (userExists === false) {
      setShowCreateUserFlow(true);
    } else if (userExists === true) {
      setShowCreateUserFlow(false);
    }
  }, [userExists]);

  // Handler for successful user creation
  const handleUserCreated = () => {
    setUserExists(true);
    setShowCreateUserFlow(false);
    setActiveTab("Invite");
    // Clear cache to force refresh
    if (addressForApi) {
      const cacheKey = `pp_user_exists_${addressForApi}`;
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(cacheKey);
        }
      } catch {
        // ignore
      }
    }
  };

  // Show create user flow if user doesn't exist
  if (showCreateUserFlow) {
    return (
      <div className="pixel-window w-full lg:h-full">
        <div className="pixel-window__inner">
          <CreateUserFlow 
            walletAddress={addressForApi || ""}
            onUserCreated={handleUserCreated}
            onCancel={() => {
              setShowCreateUserFlow(false);
              setActiveTab("Leaderboard");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pixel-window w-full lg:h-full">
      {/* Tabs header */}
      <div className="pixel-tabs">
        {TAB_LABELS.map((label) => {
          const isActive = label === activeTab;
          // Restrict all tabs except Leaderboard if user doesn't exist
          // Invite tab is only available after user creation
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
        {activeTab === "Bounties" && <DailyContent />}
        {activeTab === "Game" && <GameContent />}
        {activeTab === "My Stats" && <MyStatsContent />}
        {activeTab === "Invite" && <InviteContent />}
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

  const { data: session, update: updateSession } = useSession();
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
  const [socialLoading, setSocialLoading] = useState<boolean>(false);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [apiUsername, setApiUsername] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);

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
        console.log("[MyStats] Using cached social lookup data");
        setApiUser((prev) => prev ?? cached);
        setSocialLoading(false);
        setIsInitialLoad(false);
        return;
      }

      setSocialLoading(true);
      let userData: any = null;
      let foundAddress: string | null = null;

      try {
        // Try to find user by email/X/Discord
        if (normalizedEmail) {
          try {
            console.info("[MyStats] fallback /api/user/by-email", normalizedEmail);
            // Pass email directly - Next.js route will handle it, and upstream expects literal email
            const res = await fetch(`/api/user/by-email/${normalizedEmail}`, { cache: "no-store" });
            console.log("[MyStats] Email lookup response status:", res.status);
            if (res.ok) {
              userData = await res.json();
              console.log("[MyStats] User data from email lookup:", JSON.stringify(userData, null, 2));
              foundAddress =
                userData?.userAddress ||
                userData?.address ||
                userData?.walletAddress ||
                userData?.wallet_address ||
                userData?.user?.address ||
                userData?.user?.walletAddress ||
                userData?.user?.wallet_address ||
                null;
              console.log("[MyStats] Found address from email lookup:", foundAddress);
            } else {
              const errorText = await res.text().catch(() => "");
              console.warn("[MyStats] Email lookup failed:", res.status, errorText);
            }
          } catch (error) {
            console.error("[MyStats] Error fetching by email:", error);
          }
        }

        if (!userData && normalizedTwitter) {
          try {
            console.info("[MyStats] fallback /api/user/by-x", normalizedTwitter);
            const res = await fetch(`/api/user/by-x/${encodeURIComponent(normalizedTwitter)}`, {
              cache: "no-store",
            });
            if (res.ok) {
              userData = await res.json();
              foundAddress =
                userData?.userAddress ||
                userData?.address ||
                userData?.walletAddress ||
                userData?.wallet_address ||
                userData?.user?.address ||
                userData?.user?.walletAddress ||
                userData?.user?.wallet_address ||
                null;
            }
          } catch (error) {
            console.error("[MyStats] Error fetching by X handle:", error);
          }
        }

        if (!userData && normalizedDiscord) {
          try {
            console.info("[MyStats] fallback /api/user/by-discord", normalizedDiscord);
            const res = await fetch(`/api/user/by-discord/${encodeURIComponent(normalizedDiscord)}`, {
              cache: "no-store",
            });
            if (res.ok) {
              userData = await res.json();
              foundAddress =
                userData?.userAddress ||
                userData?.address ||
                userData?.walletAddress ||
                userData?.wallet_address ||
                userData?.user?.address ||
                userData?.user?.walletAddress ||
                userData?.user?.wallet_address ||
                null;
            }
          } catch (error) {
            console.error("[MyStats] Error fetching by Discord handle:", error);
          }
        }

        // If we found a user and they have an address, fetch the full profile using /all endpoint
        if (!cancelled && foundAddress) {
          console.info("[MyStats] Found address from social lookup, fetching /all endpoint:", foundAddress);
          try {
            const allRes = await fetch(`/api/user/${encodeURIComponent(foundAddress)}/all`, { cache: "no-store" });
            if (allRes.ok) {
              const allData = await allRes.json() as UserAllResponse;
              console.log("[MyStats] Full user data from /all endpoint:", allData);
              setApiUser((prev) => prev ?? allData);
              setCachedJson(cacheKey, allData);
              
              // Dispatch address to global wallet
              if (typeof window !== "undefined") {
                console.info("[MyStats] dispatch setUserAddress from social/email lookup", foundAddress);
                window.dispatchEvent(
                  new CustomEvent("setUserAddress", {
                    detail: foundAddress,
                  })
                );
              }
              return;
            }
          } catch (error) {
            console.error("[MyStats] Error fetching /all endpoint:", error);
            // Fall through to use basic userData
          }
        }

        // Fallback: use the basic userData we found (even without address)
        if (!cancelled && userData) {
          console.log("[MyStats] Using basic userData (no address found):", userData);
          // Try to structure it similarly to /all response
          const structuredData: UserAllResponse = {
            username: userData?.username || userData?.user?.username || null,
            referralCount: userData?.referralCount || userData?.referrals?.count || null,
            playerPoints: userData?.playerPoints || userData?.totalPoints || userData?.points?.total || null,
            email: userData?.email || normalizedEmail || null,
            xHandle: userData?.xHandle || userData?.['x-handle'] || normalizedTwitter || null,
            discordHandle: userData?.discordHandle || userData?.['discord-handle'] || normalizedDiscord || null,
            raw: {
              all: userData,
            },
          };
          setApiUser((prev) => prev ?? structuredData);
          setCachedJson(cacheKey, structuredData);
        }
      } catch (error) {
        console.error("[MyStats] Error in loadBySocial:", error);
      } finally {
        if (!cancelled) {
          setSocialLoading(false);
          setIsInitialLoad(false);
        }
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
        // Don't clear apiUser or apiUsername if we have social auth - 
        // the social lookup effect will handle fetching user data
        // Only clear if we truly have no connection method
        if (!googleEmail && !effectiveTwitter && !effectiveDiscord) {
          setApiUser(null);
          setApiUsername(null);
        }
        return;
      }
      
      // Guard against null address inside the function
      if (!addr) return;
      
      // Check cache first
      const cacheKey = `pp_tab_cache_mystats_all_${addr}`;
      const cached = getCachedJson<UserAllResponse>(cacheKey);
      if (cached) {
        setApiUser(cached);
        setApiLoading(false);
        setIsInitialLoad(false);
        return;
      }
      
      setApiLoading(true);
      setIsInitialLoad(true);
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
        console.log("=== MYSTATS: User data from API ===");
        console.log("Full API response:", JSON.stringify(data, null, 2));
        console.log("Email from API:", data?.raw?.all?.email || data?.email || "not found");
        console.log("X Handle from API:", data?.raw?.all?.xHandle || data?.raw?.all?.['x-handle'] || data?.xHandle || "not found");
        console.log("Discord Handle from API:", data?.raw?.all?.discordHandle || data?.raw?.all?.['discord-handle'] || data?.discordHandle || "not found");
        console.log("====================================");
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
        if (!abort) {
          setApiLoading(false);
          setIsInitialLoad(false);
        }
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
      // Guard against null address inside the function
      if (!addr) return;
      
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
      // Guard against null address inside the function
      if (!unifiedAddr) return;
      
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
  // User is connected if they have wallet, or any social auth (Google, X, Discord), or if we have API user data
  const isConnected = globalWalletConnected || !!googleEmail || !!effectiveTwitter || !!effectiveDiscord || !!apiUser;
  const anyConnected = !!googleEmail || !!effectiveTwitter || !!effectiveDiscord || globalWalletConnected;

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

  // Extract linked handles from API response
  const apiLinkedEmail = apiUser?.raw?.all?.email || apiUser?.email || null;
  const apiLinkedXHandle = apiUser?.raw?.all?.xHandle || apiUser?.raw?.all?.['x-handle'] || apiUser?.xHandle || null;
  const apiLinkedDiscordHandle = apiUser?.raw?.all?.discordHandle || apiUser?.raw?.all?.['discord-handle'] || apiUser?.discordHandle || null;
  
  // Use API-linked handles if available, otherwise fall back to session handles
  // IMPORTANT: For X/Twitter, only show the actual X handle, never show Google email
  const displayEmail = apiLinkedEmail || googleEmail || null;
  // Ensure X handle is actually a Twitter handle (starts with @ or is a valid handle), not an email
  const isValidTwitterHandle = (handle: string | null) => {
    if (!handle) return false;
    const cleaned = handle.trim();
    // Twitter handles don't contain @ in the middle and are not email addresses
    return cleaned.includes('@') ? cleaned.indexOf('@') === 0 && cleaned.length > 1 : /^[A-Za-z0-9_]+$/.test(cleaned);
  };
  const displayXHandle = (apiLinkedXHandle && isValidTwitterHandle(apiLinkedXHandle))
    ? apiLinkedXHandle
    : (effectiveTwitter && isValidTwitterHandle(effectiveTwitter))
    ? effectiveTwitter
    : null;
  const displayDiscordHandle = apiLinkedDiscordHandle || effectiveDiscord || null;
  
  // Check if handles are linked in API (regardless of session)
  const isEmailLinkedInApi = !!apiLinkedEmail;
  const isXLinkedInApi = !!apiLinkedXHandle;
  const isDiscordLinkedInApi = !!apiLinkedDiscordHandle;
  
  // Debug logging for linked handles and connection state
  useEffect(() => {
    console.log("=== MYSTATS: Connection & Data Debug ===");
    console.log("addressForApi:", addressForApi);
    console.log("apiUser:", apiUser);
    console.log("googleEmail:", googleEmail);
    console.log("effectiveTwitter:", effectiveTwitter);
    console.log("effectiveDiscord:", effectiveDiscord);
    console.log("isConnected:", isConnected);
    console.log("anyConnected:", anyConnected);
    if (apiUser) {
      console.log("API Linked Email:", apiLinkedEmail);
      console.log("API Linked X Handle:", apiLinkedXHandle);
      console.log("API Linked Discord Handle:", apiLinkedDiscordHandle);
      console.log("Display Email:", displayEmail);
      console.log("Display X Handle:", displayXHandle);
      console.log("Display Discord Handle:", displayDiscordHandle);
      console.log("Is Email Linked in API:", isEmailLinkedInApi);
      console.log("Is X Linked in API:", isXLinkedInApi);
      console.log("Is Discord Linked in API:", isDiscordLinkedInApi);
      console.log("API User Username:", apiUser?.username || apiUsername);
      console.log("API User ReferralCount:", apiUser?.referralCount);
      console.log("API User PlayerPoints:", apiUser?.playerPoints || apiUser?.totalPoints);
    }
    console.log("======================================");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUser, addressForApi, googleEmail, effectiveTwitter, effectiveDiscord, isConnected]);

  const usernameFromApi = apiUsername || apiUser?.username;
  // Only use Twitter handle as fallback if we have no username from API at all
  // Don't replace existing usernames with Twitter handle
  const displayUsername =
    isConnected && usernameFromApi
      ? `@${cleanAccountName(usernameFromApi) || usernameFromApi}`
      : isConnected && effectiveTwitter && !usernameFromApi
      ? `@${cleanAccountName(effectiveTwitter) || effectiveTwitter}`
      : "--";

  // Use the actual referral count from API, but also fallback to referredUsers length if available
  const actualReferralCount = apiUser?.referralCount ?? null;
  const displayReferrals =
    isConnected && actualReferralCount !== null && actualReferralCount !== undefined
      ? String(actualReferralCount)
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

  const isLoading = (apiLoading || socialLoading) && isInitialLoad && !apiUser;
  const isRefreshing = (apiLoading || socialLoading) && !isInitialLoad && !!apiUser;

  // Handle disconnect all accounts
  const handleDisconnectAll = async () => {
    try {
      // Clear all cache first
      if (typeof window !== "undefined") {
        try {
          // Clear all localStorage cache
          window.localStorage.clear();
        } catch {
          // ignore localStorage errors
        }
        
        // Clear all sessionStorage cache
        try {
          window.sessionStorage.clear();
        } catch {
          // ignore sessionStorage errors
        }
      }
      
      // Sign out of all NextAuth providers (disconnects all social accounts)
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("[MyStats] Error disconnecting all accounts:", error);
    }
  };

  return (
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col relative">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl md:text-3xl drop-shadow font-bold">My Stats</h2>
        <button
          type="button"
          onClick={handleDisconnectAll}
          className="pixel-chip pixel-chip--entry"
          style={{ cursor: "pointer" }}
          title="Disconnect all accounts and clear cache"
        >
          <span className="pixel-chip__text">Disconnect</span>
        </button>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="pixel-loading-spinner"></div>
            <div className="loading-text">Loading stats...</div>
          </div>
        </div>
      )}

      {/* No user creation flow; we only display existing data */}

      <div className="stats-scroll">
        {/* Primary stats */}
        <div className="stats-list">
          <div className="stats-row">
            <Image src="/assets/Green Icons Outlined/at.png" alt="username" width={26} height={26} className="stats-icon" />
            <div className={`pixel-chip pixel-chip--entry ${isLoading ? 'pixel-skeleton' : isRefreshing ? 'pixel-loading' : ''}`}>
              <span className="pixel-chip__text">{isLoading ? "" : (isConnected ? displayUsername : "--")}</span>
            </div>
          </div>
          <div className="stats-row">
            <Image src="/assets/Green Icons Outlined/power_B.png" alt="PP" width={26} height={26} className="stats-icon" />
            <div className={`pixel-chip pixel-chip--entry ${isLoading ? 'pixel-skeleton' : isRefreshing ? 'pixel-loading' : ''}`}>
              <span className="pixel-chip__text">{isLoading ? "" : displayPP}</span>
            </div>
          </div>
          <div className="stats-row">
            <Image src="/assets/Green Icons Outlined/stats_A.png" alt="Rank" width={26} height={26} className="stats-icon" />
            <div className={`pixel-chip pixel-chip--entry ${isLoading ? 'pixel-skeleton' : isRefreshing ? 'pixel-loading' : ''}`}>
              <span className="pixel-chip__text">{isLoading ? "" : displayRank}</span>
            </div>
          </div>
          <div className="stats-row">
            <Image src="/assets/Green Icons Outlined/friend_add.png" alt="Referrals" width={26} height={26} className="stats-icon" />
            <div className={`pixel-chip pixel-chip--entry ${isLoading ? 'pixel-skeleton' : isRefreshing ? 'pixel-loading' : ''}`}>
              <span className="pixel-chip__text">{isLoading ? "" : (displayReferrals === "--" ? "--" : `${displayReferrals} Referrals`)}</span>
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
              {displayEmail ? (
                <div className="flex items-center gap-2">
                  <div className="pixel-chip pixel-chip--entry pixel-chip--no-bg">
                    <span className="pixel-chip__text">{cleanAccountName(displayEmail)}</span>
                  </div>
                  {!isEmailLinkedInApi && googleEmail && addressForApi && (
                    <button
                      type="button"
                      className="pixel-chip pixel-chip--entry"
                      onClick={async () => {
                        try {
                          // First, check if this email is already linked to another user
                          const normalizedEmail = googleEmail.toLowerCase().trim();
                          const checkRes = await fetch(`/api/user/by-email/${encodeURIComponent(normalizedEmail)}`, { cache: "no-store" });
                          if (checkRes.ok) {
                            const existingUser = await checkRes.json();
                            if (existingUser?.address && existingUser.address.toLowerCase() !== addressForApi.toLowerCase()) {
                              // Email is linked to another account - BLOCK linking and prevent any API calls or UI updates
                              const otherUsername = existingUser.username || existingUser.user?.username || "another user";
                              alert(`Cannot link this Google/email account. It is already linked to another account (@${otherUsername}).`);
                              return; // Early return - no API call, no UI update
                            }
                            // Same address means already linked to this account - no need to link again
                            if (existingUser?.address && existingUser.address.toLowerCase() === addressForApi.toLowerCase()) {
                              alert("This email is already linked to your account.");
                              return; // Early return - prevent duplicate linking
                            }
                          }
                          
                          // Only proceed with linking if no conflict detected
                          const res = await fetch(`/api/user/${encodeURIComponent(addressForApi)}/email`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email: googleEmail }),
                          });
                          
                          if (res.ok) {
                            // Only update UI on successful link
                            setDidSyncGoogle(true);
                            // Clear cache and refetch user data
                            const cacheKey = `pp_tab_cache_mystats_all_${addressForApi}`;
                            try {
                              if (typeof window !== "undefined") {
                                window.sessionStorage.removeItem(cacheKey);
                              }
                            } catch {}
                            // Refetch user data
                            const refetchRes = await fetch(`/api/user/${encodeURIComponent(addressForApi)}/all`, { cache: "no-store" });
                            if (refetchRes.ok) {
                              const refetchData = await refetchRes.json() as UserAllResponse;
                              setApiUser(refetchData || null);
                              if (refetchData) setCachedJson(cacheKey, refetchData);
                            }
                          } else {
                            // Handle API errors - especially 409 conflicts
                            const errorData = await res.json().catch(() => ({}));
                            const errorMessage = errorData.errorMessage || errorData.error || "Failed to link Google/email account. Please try again.";
                            alert(errorMessage);
                            // Don't update UI state - keep it as "Link" button
                            return; // Early return - prevent any UI updates on error
                          }
                        } catch (error) {
                          console.error("[MyStats] Error linking email:", error);
                          alert("An error occurred while linking Google/email account. Please try again.");
                          // Don't update UI state on error - keep it as "Link" button
                        }
                      }}
                    >
                      <span className="pixel-chip__text">Link</span>
                    </button>
                  )}
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
              {displayXHandle ? (
                <div className="flex items-center gap-2">
                  <div className="pixel-chip pixel-chip--entry pixel-chip--no-bg">
                    <span className="pixel-chip__text">@{cleanAccountName(displayXHandle)}</span>
                  </div>
                  {!isXLinkedInApi && effectiveTwitter && addressForApi && (
                    <button
                      type="button"
                      className="pixel-chip pixel-chip--entry"
                      onClick={async () => {
                        try {
                          // Normalize X handle (remove @ if present)
                          const normalizedTwitter = effectiveTwitter.startsWith("@") ? effectiveTwitter.slice(1) : effectiveTwitter;
                          const trimmedTwitter = normalizedTwitter.trim();
                          
                          // First, check if this X handle is already linked to another user
                          const checkRes = await fetch(`/api/user/by-x/${encodeURIComponent(trimmedTwitter)}`, { cache: "no-store" });
                          if (checkRes.ok) {
                            const existingUser = await checkRes.json();
                            if (existingUser?.address && existingUser.address.toLowerCase() !== addressForApi.toLowerCase()) {
                              // X handle is linked to another account - BLOCK linking and prevent any API calls or UI updates
                              const otherUsername = existingUser.username || existingUser.user?.username || "another user";
                              alert(`Cannot link this X/Twitter account. It is already linked to another account (@${otherUsername}).`);
                              return; // Early return - no API call, no UI update
                            }
                            // Same address means already linked to this account - no need to link again
                            if (existingUser?.address && existingUser.address.toLowerCase() === addressForApi.toLowerCase()) {
                              alert("This X/Twitter handle is already linked to your account.");
                              return; // Early return - prevent duplicate linking
                            }
                          }
                          
                          // Only proceed with linking if no conflict detected
                          const res = await fetch(`/api/user/${encodeURIComponent(addressForApi)}/x-handle`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ xHandle: trimmedTwitter }),
                          });
                          
                          if (res.ok) {
                            // Only update UI on successful link
                            setDidSyncX(true);
                            // Clear cache and refetch user data
                            const cacheKey = `pp_tab_cache_mystats_all_${addressForApi}`;
                            try {
                              if (typeof window !== "undefined") {
                                window.sessionStorage.removeItem(cacheKey);
                              }
                            } catch {}
                            // Refetch user data
                            const refetchRes = await fetch(`/api/user/${encodeURIComponent(addressForApi)}/all`, { cache: "no-store" });
                            if (refetchRes.ok) {
                              const refetchData = await refetchRes.json() as UserAllResponse;
                              setApiUser(refetchData || null);
                              if (refetchData) setCachedJson(cacheKey, refetchData);
                            }
                          } else {
                            // Handle API errors - especially 409 conflicts
                            const errorData = await res.json().catch(() => ({}));
                            const errorMessage = errorData.errorMessage || errorData.error || "Failed to link X/Twitter account. Please try again.";
                            alert(errorMessage);
                            // Don't update UI state - keep it as "Link" button
                            return; // Early return - prevent any UI updates on error
                          }
                        } catch (error) {
                          console.error("[MyStats] Error linking X handle:", error);
                          alert("An error occurred while linking X/Twitter account. Please try again.");
                          // Don't update UI state on error - keep it as "Link" button
                        }
                      }}
                      style={{ cursor: "pointer" }}
                      title="Link your X/Twitter account"
                    >
                      <span className="pixel-chip__text">Link</span>
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="pixel-chip pixel-chip--entry"
                  onClick={() => {
                    storeWalletBeforeLink();
                    signIn("twitter", { callbackUrl: "/" });
                  }}
                  style={{ cursor: "pointer" }}
                  title="Link your X/Twitter account"
                >
                  <span className="pixel-chip__text">Link</span>
                </button>
              )}
            </div>
            {/* Discord Account */}
            <div className="stats-row">
              <Image src="/assets/discord.png" alt="Discord" width={26} height={26} className="stats-icon" />
              {displayDiscordHandle ? (
                <div className="flex items-center gap-2">
                  <div className="pixel-chip pixel-chip--entry pixel-chip--no-bg">
                    <span className="pixel-chip__text">{cleanAccountName(displayDiscordHandle)}</span>
                  </div>
                  {!isDiscordLinkedInApi && effectiveDiscord && addressForApi && (
                    <button
                      type="button"
                      className="pixel-chip pixel-chip--entry"
                      onClick={async () => {
                        try {
                          // First, check if this Discord handle is already linked to another user
                          const normalizedDiscord = effectiveDiscord.trim();
                          const checkRes = await fetch(`/api/user/by-discord/${encodeURIComponent(normalizedDiscord)}`, { cache: "no-store" });
                          if (checkRes.ok) {
                            const existingUser = await checkRes.json();
                            if (existingUser?.address && existingUser.address.toLowerCase() !== addressForApi.toLowerCase()) {
                              // Discord handle is linked to another account - BLOCK linking and prevent any API calls or UI updates
                              const otherUsername = existingUser.username || existingUser.user?.username || "another user";
                              alert(`Cannot link this Discord account. It is already linked to another account (@${otherUsername}).`);
                              return; // Early return - no API call, no UI update
                            }
                            // Same address means already linked to this account - no need to link again
                            if (existingUser?.address && existingUser.address.toLowerCase() === addressForApi.toLowerCase()) {
                              alert("This Discord handle is already linked to your account.");
                              return; // Early return - prevent duplicate linking
                            }
                          }
                          
                          // Only proceed with linking if no conflict detected
                          const res = await fetch(`/api/user/${encodeURIComponent(addressForApi)}/discord-handle`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ discordHandle: normalizedDiscord }),
                          });
                          
                          if (res.ok) {
                            // Only update UI on successful link
                            setDidSyncDiscord(true);
                            // Clear cache and refetch user data
                            const cacheKey = `pp_tab_cache_mystats_all_${addressForApi}`;
                            try {
                              if (typeof window !== "undefined") {
                                window.sessionStorage.removeItem(cacheKey);
                              }
                            } catch {}
                            // Refetch user data
                            const refetchRes = await fetch(`/api/user/${encodeURIComponent(addressForApi)}/all`, { cache: "no-store" });
                            if (refetchRes.ok) {
                              const refetchData = await refetchRes.json() as UserAllResponse;
                              setApiUser(refetchData || null);
                              if (refetchData) setCachedJson(cacheKey, refetchData);
                            }
                          } else {
                            // Handle API errors - especially 409 conflicts
                            const errorData = await res.json().catch(() => ({}));
                            const errorMessage = errorData.errorMessage || errorData.error || "Failed to link Discord account. Please try again.";
                            alert(errorMessage);
                            // Don't update UI state - keep it as "Link" button
                            return; // Early return - prevent any UI updates on error
                          }
                        } catch (error) {
                          console.error("[MyStats] Error linking Discord handle:", error);
                          alert("An error occurred while linking Discord account. Please try again.");
                          // Don't update UI state on error - keep it as "Link" button
                        }
                      }}
                      style={{ cursor: "pointer" }}
                      title="Link your Discord account"
                    >
                      <span className="pixel-chip__text">Link</span>
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="pixel-chip pixel-chip--entry"
                  onClick={() => {
                    storeWalletBeforeLink();
                    signIn("discord", { callbackUrl: "/" });
                  }}
                  style={{ cursor: "pointer" }}
                  title="Link your Discord account"
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
                  <div className="pixel-chip pixel-chip--entry pixel-chip--no-bg">
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
                      // Refresh session after wallet connection to ensure linked accounts persist
                      await updateSession();
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
  const { address: globalWalletAddress } = useGlobalWallet();
  const walletAddress = useMemo(() => globalWalletAddress || null, [globalWalletAddress]);

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
        // Using backend task ID constants with updated PP values
        const fallbackTasks: GameTask[] = [
          { id: "FIRMWARE_UPDATE", title: "Complete 'Firmware Update'", rewardPP: 10, done: false },
          { id: "GOTTA_GO_PLACES", title: "Complete 'Gotta Go Places'", rewardPP: 20, done: false },
          { id: "RAMEN_RUSH", title: "Complete 'Ramen Rush'", rewardPP: 15, done: false },
          { id: "HONEY_MEAD", title: "Complete 'Honey Mead'", rewardPP: 75, done: false },
          { id: "FRACTURED_REALMS", title: "Complete 'Fractured Realms'", rewardPP: 100, done: false },
          { id: "SOLANA_LOOTBOX", title: "Open a Solana Lootbox", rewardPP: 150, done: false },
          { id: "HONEYCUB_LOOTBOX", title: "Open a Honeycub Lootbox", rewardPP: 125, done: false },
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
      // Guard against null address inside the function
      if (!walletAddress) return;
      
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
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col relative">
      {/* Header with title and PP chip */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-2xl md:text-3xl drop-shadow font-bold">Game</h2>
        <div className="pixel-chip" aria-label="PP balance">
          <span className="pixel-chip__text">{currentPP} PP</span>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="pixel-loading-spinner"></div>
            <div className="loading-text">Loading tasks...</div>
          </div>
        </div>
      )}

      <div className="tasks-scroll">
        <div className="tasks-section">
          <div className="tasks-section__title">Primary Tasks</div>
          {error && (
            <div className="mb-2 text-yellow-200/90">{error}</div>
          )}
          <div className="tasks-list">
            {loading && !list.length ? (
              // Skeleton loaders for tasks
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="task-row">
                  <div className="task-left">
                    <span className="task-checkbox pixel-skeleton" style={{ minWidth: '28px', minHeight: '28px' }} aria-hidden="true"></span>
                    <span className="task-title pixel-skeleton" style={{ height: '20px', width: '200px', borderRadius: '4px' }}></span>
                  </div>
                  <div className="task-reward pixel-skeleton" style={{ height: '20px', width: '60px', borderRadius: '4px' }}></div>
                </div>
              ))
            ) : (
              list.map((t) => (
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
              ))
            )}
          </div>
        </div>
      </div>
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
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col relative">
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

      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="pixel-loading-spinner"></div>
            <div className="loading-text">Loading leaderboard...</div>
          </div>
        </div>
      )}

      {/* Table header */}
      <div className="lb-header-row">
        <div>Rank</div>
        <div>Username</div>
        <div>Play Points (PP)</div>
      </div>

      {/* Rows */}
      <div className="lb-rows">
        {loading && !rows.length ? (
          // Skeleton loaders for leaderboard rows
          Array.from({ length: 10 }).map((_, i) => (
            <div key={`skeleton-lb-${i}`} className="lb-row">
              <div className="lb-rank pixel-skeleton" style={{ height: '20px', width: '40px', borderRadius: '4px' }}></div>
              <div className="lb-name pixel-skeleton" style={{ height: '20px', width: '150px', borderRadius: '4px' }}></div>
              <div className="lb-pp pixel-skeleton" style={{ height: '20px', width: '80px', borderRadius: '4px' }}></div>
            </div>
          ))
        ) : (
          rows.map((r, idx) => {
            const rank = r.rank ?? idx + 1;
            const name = r.name ?? "--";
            const pp = r.pp ?? 0;
            return (
              <div key={`lb-${rank}-${idx}`} className="lb-row">
                <div className="lb-rank">{rank}</div>
                <div className="lb-name">{name}</div>
                <div className="lb-pp">{pp}</div>
              </div>
            );
          })
        )}
        {rows.length === 0 && !loading && (
          <div className="mt-2 opacity-80">No leaderboard data.</div>
        )}
      </div>
    </div>
  );
}

function DailyContent() {
  const currentPP = 4200;
  const { address: globalWalletAddress } = useGlobalWallet();
  const walletAddress = useMemo(() => globalWalletAddress || null, [globalWalletAddress]);
  const [dailyLoading, setDailyLoading] = useState<boolean>(false);
  const [weeklyLoading, setWeeklyLoading] = useState<boolean>(false);
  const [socialLoading, setSocialLoading] = useState<boolean>(false);

  type SocialTask = { id?: string; title: string; reward: number; done: boolean; canVerify?: boolean; xHandle?: string | null };
  const [socialTasks, setSocialTasks] = useState<SocialTask[]>([
    { id: "REFER_FRIEND", title: "Refer a friend", reward: 50, done: false },
    { id: "FOLLOW_BAKELAND_X", title: "Follow @bakelandxyz on X", reward: 25, done: false, canVerify: false },
    { id: "POST_GAMEPLAY_X", title: "Post a Gameplay Clip on X", reward: 200, done: false, canVerify: false },
  ]);
  type DailyTask = { id: string; title: string; reward: number; done: boolean };
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([
    { id: "HARVEST_50_CARROTS", title: "Harvest x50 Carrots", reward: 25, done: false },
    { id: "HARVEST_25_CABBAGES", title: "Harvest x25 Cabbages", reward: 25, done: false },
    { id: "DELIVER_100_RAMEN", title: "Deliver x100 Ramen Bowls", reward: 75, done: false },
    { id: "OPEN_SOLANA_LOOTBOX", title: "Open a Solana Lootbox", reward: 200, done: false },
    { id: "OPEN_HONEYCUB_LOOTBOX", title: "Open a Honeycub Lootbox", reward: 250, done: false },
  ]);
  
  type WeeklyTask = { id: string; title: string; reward: number; done: boolean };
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyTask[]>([
    { id: "DELIVER_250_RAMEN", title: "Deliver 250 Ramen Bowls", reward: 125, done: false },
    { id: "DELIVER_500_RAMEN", title: "Deliver 500 Ramen Bowls", reward: 200, done: false },
    { id: "HARVEST_100_CARROTS", title: "Harvest 100 Carrots", reward: 50, done: false },
    { id: "HARVEST_50_MUGWORT", title: "Harvest 50 Mugwort", reward: 75, done: false },
    { id: "HARVEST_50_CABBAGES", title: "Harvest 50 Cabbages", reward: 100, done: false },
    { id: "HARVEST_50_PUMPKINS", title: "Harvest 50 Pumpkins", reward: 125, done: false },
    { id: "HARVEST_50_POTATOES", title: "Harvest 50 Potatoes", reward: 125, done: false },
    { id: "COMPLETE_FRACTURED_REALMS", title: "Complete Fractured Realms", reward: 100, done: false },
  ]);

  useEffect(() => {
    let abort = false;
    if (!walletAddress) {
      // Reset to defaults (not completed)
      setDailyTasks((prev) => prev.map((t) => ({ ...t, done: false })));
      setDailyLoading(false);
      return;
    }
    async function loadCompletedDaily() {
      // Guard against null address inside the function
      if (!walletAddress) return;
      
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
        setDailyLoading(false);
        return;
      }
      
      setDailyLoading(true);
      try {
        const res = await fetch(`/api/player-points/${encodeURIComponent(walletAddress)}/completed/daily`, { cache: "no-store" });
        if (!res.ok) {
          if (!abort) setDailyLoading(false);
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
      } finally {
        if (!abort) setDailyLoading(false);
      }
    }
    loadCompletedDaily();
    return () => {
      abort = true;
    };
  }, [walletAddress]);

  // Load completed weekly tasks
  useEffect(() => {
    let abort = false;
    if (!walletAddress) {
      // Reset to defaults (not completed)
      setWeeklyTasks((prev) => prev.map((t) => ({ ...t, done: false })));
      setWeeklyLoading(false);
      return;
    }
    async function loadCompletedWeekly() {
      // Guard against null address inside the function
      if (!walletAddress) return;
      
      // Check cache first
      const cacheKey = `pp_tab_cache_weekly_completed_${walletAddress}`;
      const cached = getCachedJson<{ idSet: string[]; titleSet: string[] }>(cacheKey);
      if (cached && cached.idSet && cached.titleSet) {
        const idSet = new Set(cached.idSet);
        const titleSet = new Set(cached.titleSet);
        setWeeklyTasks((prev) =>
          prev.map((t) => {
            const isDoneById = idSet.has(t.id);
            const isDoneByTitle = titleSet.has(t.title.toLowerCase());
            return { ...t, done: isDoneById || isDoneByTitle || t.done };
          })
        );
        setWeeklyLoading(false);
        return;
      }
      
      setWeeklyLoading(true);
      try {
        const res = await fetch(`/api/player-points/${encodeURIComponent(walletAddress)}/completed/weekly`, { cache: "no-store" });
        if (!res.ok) {
          if (!abort) setWeeklyLoading(false);
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
        setWeeklyTasks((prev) =>
          prev.map((t) => {
            const isDoneById = idSet.has(t.id);
            const isDoneByTitle = titleSet.has(t.title.toLowerCase());
            return { ...t, done: isDoneById || isDoneByTitle || t.done };
          })
        );
      } catch {
        // ignore
      } finally {
        if (!abort) setWeeklyLoading(false);
      }
    }
    loadCompletedWeekly();
    return () => {
      abort = true;
    };
  }, [walletAddress]);

  // Load social task status
  useEffect(() => {
    let abort = false;
    if (!walletAddress) {
      setSocialTasks((prev) => prev.map((t) => ({ ...t, done: false, canVerify: false })));
      setSocialLoading(false);
      return;
    }

    async function loadSocialTasks() {
      if (!walletAddress) return;

      // Check cache first
      const cacheKey = `pp_tab_cache_social_tasks_${walletAddress}`;
      const cached = getCachedJson<{ tasks: SocialTask[] }>(cacheKey);
      if (cached && cached.tasks) {
        setSocialTasks(cached.tasks);
        setSocialLoading(false);
        return;
      }

      setSocialLoading(true);
      try {
        const res = await fetch(`/api/social/twitter/tasks/status?address=${encodeURIComponent(walletAddress)}`, { 
          cache: "no-store" 
        });
        
        if (!res.ok) {
          // If API fails, keep default tasks but mark as not verifiable
          setSocialTasks((prev) => prev.map((t) => ({ ...t, canVerify: false })));
          setSocialLoading(false);
          return;
        }

        const data = await res.json();
        const tasks = data?.tasks || [];
        
        // Merge with existing tasks, keeping "Refer a friend" separate
        // Check if "Refer a friend" is completed from one-time tasks OR if user has referred users
        let referFriendDone = false;
        
        // First check if task is already claimed/completed
        try {
          const completedRes = await fetch(`/api/player-points/${encodeURIComponent(walletAddress)}/completed/one`, { 
            cache: "no-store" 
          });
          if (completedRes.ok) {
            const completedData = await completedRes.json();
            const completed = completedData?.completed || [];
            referFriendDone = completed.some((c: any) => 
              String(c?.taskId ?? "").trim() === "REFER_FRIEND" ||
              String(c?.metadata?.title ?? "").toLowerCase().includes("refer")
            );
          }
        } catch {
          // ignore
        }
        
        // Also check if user has referred at least 1 friend (task is complete-able)
        if (!referFriendDone) {
          try {
            const referredRes = await fetch(`/api/user/${encodeURIComponent(walletAddress)}/referred-users`, { 
              cache: "no-store" 
            });
            if (referredRes.ok) {
              const referredData = await referredRes.json();
              // Check multiple possible response structures
              const referredUsers = 
                referredData?.referredUsers || 
                referredData?.referredUserAddresses || 
                referredData?.raw?.referredUserAddresses || 
                [];
              // Mark as done if user has at least 1 referred user
              referFriendDone = Array.isArray(referredUsers) && referredUsers.length > 0;
            }
          } catch {
            // ignore
          }
        }

        const updatedTasks: SocialTask[] = [
          { id: "REFER_FRIEND", title: "Refer a friend", reward: 50, done: referFriendDone },
          ...tasks.map((t: any) => ({
            id: t.id,
            title: t.title,
            reward: t.reward,
            done: t.completed || false,
            canVerify: t.canVerify || false,
            xHandle: t.xHandle,
          })),
        ];

        if (abort) return;
        setSocialTasks(updatedTasks);
        setCachedJson(cacheKey, { tasks: updatedTasks });
      } catch (error) {
        console.error("[DailyContent] Error loading social tasks:", error);
        // Keep default state on error
      } finally {
        if (!abort) setSocialLoading(false);
      }
    }

    loadSocialTasks();
    return () => {
      abort = true;
    };
  }, [walletAddress]);

  // Handle task verification and claiming
  const handleVerifyTask = async (taskId: string, xHandle: string | null | undefined) => {
    if (!walletAddress || !xHandle) {
      alert("Please connect your X account first to verify this task.");
      return;
    }

    if (!taskId || !["FOLLOW_BAKELAND_X", "POST_GAMEPLAY_X"].includes(taskId)) {
      return;
    }

    setSocialLoading(true);
    try {
      // Verify and claim the task using the claim endpoint
      // This endpoint verifies and marks the task as completed in the backend
      const claimRes = await fetch("/api/social/twitter/tasks/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: walletAddress,
          xHandle,
          taskId,
        }),
      });

      if (!claimRes.ok) {
        const errorData = await claimRes.json().catch(() => ({}));
        alert(errorData.error || "Failed to verify and claim task. Please try again later.");
        return;
      }

      const claimData = await claimRes.json();
      
      if (!claimData.verified) {
        alert(
          claimData.error || 
          (taskId === "FOLLOW_BAKELAND_X" 
            ? "You are not following @bakelandxyz. Please follow and try again." 
            : "No qualifying gameplay post found. Please post about Bakeland gameplay with @bakelandxyz tag and try again.")
        );
        return;
      }

      if (claimData.completed) {
        alert("Task verified and completed! Reward credited to your account.");
      } else {
        // Task verified but not completed (backend endpoint may not be configured)
        alert(claimData.message || "Task verified, but there was an issue completing it. Please contact support.");
      }
      
      // Refresh task status to reflect completion
      const cacheKey = `pp_tab_cache_social_tasks_${walletAddress}`;
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(cacheKey);
      }
      
      const statusRes = await fetch(`/api/social/twitter/tasks/status?address=${encodeURIComponent(walletAddress)}`, {
        cache: "no-store",
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const tasks = statusData?.tasks || [];
        setSocialTasks((prev) => {
          const updated = [...prev];
          const taskIndex = updated.findIndex((t) => t.id === taskId);
          if (taskIndex >= 0) {
            const taskData = tasks.find((t: any) => t.id === taskId);
            updated[taskIndex] = {
              ...updated[taskIndex],
              done: taskData?.completed || claimData.completed || false,
            };
          }
          return updated;
        });
      }
    } catch (error) {
      console.error("[DailyContent] Error verifying task:", error);
      alert("An error occurred while verifying the task. Please try again later.");
    } finally {
      setSocialLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col relative">
      {/* Header with title and PP chip */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-2xl md:text-3xl drop-shadow font-bold">Bounties</h2>
        <div className="pixel-chip" aria-label="PP balance">
          <span className="pixel-chip__text">{currentPP} PP</span>
        </div>
      </div>

      {/* Loading overlay */}
      {(dailyLoading || weeklyLoading || socialLoading) && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="pixel-loading-spinner"></div>
            <div className="loading-text">Loading bounties...</div>
          </div>
        </div>
      )}

      <div className="tasks-scroll">
        {/* Social Tasks */}
        <div className="tasks-section">
          <div className="tasks-section__title">Social Tasks</div>
          <div className="tasks-list">
            {socialTasks.map((t) => (
              <div key={t.id || t.title} className="task-row">
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
                <div className="flex items-center gap-2">
                  <div className="task-reward">+{t.reward} PP</div>
                  {!t.done && t.id && t.id !== "REFER_FRIEND" && t.id !== "POST_GAMEPLAY_X" && t.canVerify && (
                    <button
                      onClick={() => handleVerifyTask(t.id!, t.xHandle)}
                      className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded pixel-button"
                      disabled={socialLoading}
                    >
                      Verify
                    </button>
                  )}
                  {!t.done && t.id && t.id !== "REFER_FRIEND" && t.id !== "POST_GAMEPLAY_X" && !t.canVerify && (
                    <span className="text-xs text-zinc-400">Connect X</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="task-notes">
            <div>• Posts must tag @bakelandxyz to be eligible</div>
            <div>• Posts must include gameplay and/or physical Seeker footage showing Bakeland to be eligible</div>
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

        {/* Weekly Tasks */}
        <div className="tasks-section mt-6">
          <div className="tasks-section__title">Weekly Tasks</div>
          <div className="tasks-list">
            {weeklyTasks.map((t) => (
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

type CreateUserFlowProps = {
  walletAddress: string;
  onUserCreated: () => void;
  onCancel: () => void;
};

function CreateUserFlow({ walletAddress, onUserCreated, onCancel }: CreateUserFlowProps) {
  const [step, setStep] = useState<"connect" | "username">("connect");
  const [username, setUsername] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { address: currentAddress, connected: globalWalletConnected } = useGlobalWallet();
  const { connect: connectWallet, loading: walletConnectLoading } = useWeb3AuthConnect();

  // Determine effective wallet address (use current connected address if available)
  const effectiveWalletAddress = currentAddress || walletAddress;

  // Check if wallet is connected and move to username step
  useEffect(() => {
    if (globalWalletConnected && currentAddress && step === "connect") {
      setStep("username");
    }
  }, [globalWalletConnected, currentAddress, step]);

  const handleConnectWallet = async () => {
    try {
      setError(null);
      await connectWallet();
      // Refresh session after wallet connection to ensure linked accounts persist
      // Note: updateSession is from MyStatsContent's useSession, but we don't have direct access here
      // The session should refresh automatically via refetchOnWindowFocus
    } catch (err) {
      setError("Failed to connect wallet. Please try again.");
      console.error("[CreateUserFlow] Wallet connection error:", err);
    }
  };

  const handleCreateUser = async () => {
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    if (!effectiveWalletAddress) {
      setError("Please connect your wallet first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userAddress: effectiveWalletAddress,
          username: username.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Show user-friendly error message for 409 conflicts (handle already linked)
        const errorMessage = data.errorMessage || data.error || `Failed to create user (${res.status})`;
        throw new Error(errorMessage);
      }

      // Clear cache to force refresh
      const cacheKey = `pp_user_exists_${effectiveWalletAddress}`;
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(cacheKey);
        }
      } catch {
        // ignore
      }

      onUserCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user. Please try again.");
      console.error("[CreateUserFlow] User creation error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col items-center justify-center">
      <div className="max-w-md w-full">
        <h2 className="text-2xl md:text-3xl drop-shadow font-bold mb-6 text-center">
          Create Your Account
        </h2>

        {step === "connect" && (
          <div className="space-y-4">
            <p className="opacity-90 text-center mb-6">
              To get started, please connect your external wallet.
            </p>
            <div className="flex flex-col items-center gap-4">
              {effectiveWalletAddress ? (
                <div className="text-center">
                  <p className="opacity-80 mb-2">Wallet connected:</p>
                  <div className="pixel-chip pixel-chip--entry mb-4">
                    <span className="pixel-chip__text font-mono">{shortenMiddle(effectiveWalletAddress, 6, 6)}</span>
                  </div>
                  <PixelButton
                    variant="tab"
                    size="md"
                    onClick={() => setStep("username")}
                  >
                    Continue
                  </PixelButton>
                </div>
              ) : (
                <>
                  <PixelButton
                    variant="tab"
                    size="md"
                    onClick={handleConnectWallet}
                    disabled={walletConnectLoading}
                  >
                    {walletConnectLoading ? "Connecting..." : "Connect Wallet"}
                  </PixelButton>
                  {error && (
                    <div className="text-yellow-200/90 text-sm text-center">{error}</div>
                  )}
                </>
              )}
              <PixelButton
                variant="tab"
                size="sm"
                onClick={onCancel}
                className="mt-2"
              >
                Cancel
              </PixelButton>
            </div>
          </div>
        )}

        {step === "username" && (
          <div className="space-y-4">
            <p className="opacity-90 text-center mb-4">
              Great! Now choose a username for your account.
            </p>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block mb-2 text-sm opacity-80">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-3 py-2 bg-black/30 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-zinc-400"
                  placeholder="Enter your username"
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) {
                      handleCreateUser();
                    }
                  }}
                />
              </div>
              {error && (
                <div className="text-yellow-200/90 text-sm text-center">{error}</div>
              )}
              <div className="flex gap-3">
                <PixelButton
                  variant="green"
                  size="md"
                  onClick={handleCreateUser}
                  disabled={loading || !username.trim()}
                  className="flex-1"
                >
                  {loading ? "Creating..." : "Create Account"}
                </PixelButton>
                <PixelButton
                  variant="tab"
                  size="md"
                  onClick={() => setStep("connect")}
                  disabled={loading}
                >
                  Back
                </PixelButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type ReferredUser = {
  username?: string;
  userAddress?: string;
  joinedAt?: string;
  lootboxesOpened?: number;
};

function InviteContent() {
  const { address: globalWalletAddress } = useGlobalWallet();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const address = globalWalletAddress;
    if (!address) {
      setLoading(false);
      return;
    }

    async function loadInviteData() {
      // Guard against null address inside the function
      if (!address) return;
      
      try {
        // Check cache first
        const cacheKey = `pp_tab_cache_invite_${address}`;
        const cached = getCachedJson<{ referralCode: string; referredUsers: ReferredUser[] }>(cacheKey);
        if (cached) {
          if (!cancelled) {
            setReferralCode(cached.referralCode);
            setReferredUsers(cached.referredUsers || []);
            setLoading(false);
          }
          return;
        }

        // Fetch user data to get referral code
        const resUser = await fetch(`/api/user/${encodeURIComponent(address)}/all`, { cache: "no-store" });
        if (!resUser.ok) {
          throw new Error("Failed to load user data");
        }

        const data = await resUser.json();
        // Try to get referral code from API, fallback to address
        const code =
          data?.referralCode ||
          data?.raw?.user?.referralCode ||
          data?.raw?.all?.referralCode ||
          address;

        // Fetch referred users from dedicated endpoint
        let users: ReferredUser[] = [];
        try {
          const resRef = await fetch(
            `/api/user/${encodeURIComponent(address)}/referred-users`,
            { cache: "no-store" }
          );
          if (resRef.ok) {
            const refData = await resRef.json();
            if (Array.isArray(refData?.referredUsers)) {
              users = refData.referredUsers as ReferredUser[];
            } else if (Array.isArray(refData?.referredUserAddresses)) {
              users = (refData.referredUserAddresses as string[]).map((addr) => ({
                userAddress: addr,
              }));
            }
          }
        } catch {
          // ignore; we'll just show an empty list
          users = [];
        }

        if (!cancelled) {
          setReferralCode(code);
          setReferredUsers(users);
          setCachedJson(cacheKey, { referralCode: code, referredUsers: users });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load invite data");
          // Fallback: use address as referral code
          setReferralCode(address);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInviteData();
    return () => {
      cancelled = true;
    };
  }, [globalWalletAddress]);

  const handleCopyCode = () => {
    if (referralCode && typeof window !== "undefined") {
      navigator.clipboard.writeText(referralCode).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = referralCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      });
    }
  };

  const displayCode = referralCode ? shortenMiddle(referralCode, 6, 6) : "--";

  return (
    <div className="p-4 md:p-6 text-zinc-100/90 h-full flex flex-col">
      <h2 className="text-2xl md:text-3xl drop-shadow font-bold mb-4">Invite</h2>

      {loading && (
        <div className="flex-1 flex items-center justify-center opacity-80">
          Loading invite data...
        </div>
      )}

      {error && (
        <div className="mb-4 text-yellow-200/90 text-sm">{error}</div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="pixel-loading-spinner"></div>
            <div className="loading-text">Loading invite data...</div>
          </div>
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-6">
          {/* Referral Code Section */}
          <div className="stats-section">
            <div className="stats-section__title mb-3">Your Referral Code</div>
            <div className="flex items-center gap-3">
              <div className={`flex-1 px-3 py-2 bg-black/30 border border-zinc-600 rounded text-zinc-100 text-sm ${loading ? 'pixel-skeleton' : ''}`}>
                {displayCode}
              </div>
              <PixelButton
                variant="tab"
                size="sm"
                onClick={handleCopyCode}
                disabled={!referralCode || loading}
              >
                Copy
              </PixelButton>
            </div>
            <p className="mt-2 text-sm opacity-80">
              Share this code with your friends to earn referral rewards! Each lootbox opened by a referred user rewards +50 PP.
            </p>
          </div>

          {/* Referred Users Section */}
          <div className="stats-section">
            <div className="stats-section__title mb-3">
              Referred Users ({referredUsers.length})
            </div>
            {loading && !referredUsers.length ? (
              // Skeleton loaders for referred users
              Array.from({ length: 3 }).map((_, i) => (
                <div key={`skeleton-invite-${i}`} className="py-2 border-y border-zinc-700/70 grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                  <div className="w-6 text-sm opacity-80 text-right">{i + 1}.</div>
                  <div className="pixel-chip pixel-chip--entry pixel-chip--no-bg flex-1 pixel-skeleton" style={{ height: '34px' }}></div>
                  <div className="w-20 text-sm opacity-80 pixel-skeleton" style={{ height: '20px', borderRadius: '4px' }}></div>
                </div>
              ))
            ) : referredUsers.length === 0 ? (
              <div className="opacity-80 text-sm">
                No users have been referred yet. Share your code to get started!
              </div>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-[auto_1fr_auto] gap-3 pb-2 mb-2 border-b border-zinc-700/70 text-sm font-semibold opacity-90">
                  <div className="w-6"></div>
                  <div>User</div>
                  <div className="w-20 text-right">Lootboxes</div>
                </div>
                {referredUsers.map((user, idx) => (
                  <div key={idx} className="py-2 border-y border-zinc-700/70 grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                    <div className="w-6 text-sm opacity-80 text-right">{idx + 1}.</div>
                    <div className="pixel-chip pixel-chip--entry pixel-chip--no-bg flex-1">
                      <span className="pixel-chip__text">
                        {user.username || shortenMiddle(user.userAddress || "--", 4, 4)}
                      </span>
                    </div>
                    <div className="w-20 text-sm opacity-80 text-right">
                      {user.lootboxesOpened ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}




