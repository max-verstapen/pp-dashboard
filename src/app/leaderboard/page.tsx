import React from "react";

type LeaderboardItem = {
  rank: number;
  userAddress: string;
  username: string;
  totalPoints: number;
  level: number;
};

type LeaderboardResponse = {
  leaderboard: LeaderboardItem[];
  count: number;
};

function shortenAddress(address: string, chars = 4) {
  if (!address) return "";
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const baseUrl = process.env.USER_API_BASE_URL;
  const apiKey = process.env.USER_API_KEY;
  const limitParam = (searchParams?.limit as string) ?? "100";

  if (!baseUrl || !apiKey) {
    return (
      <div className="flex min-h-[60svh] items-center justify-center">
        <div className="panel max-w-xl">
          <h1 className="text-xl font-bold">Leaderboard</h1>
          <p className="mt-2 text-red-400">
            Missing required environment variables:{" "}
            {!baseUrl ? "userDBUrl " : ""}
            {!apiKey ? "USERDBKEy" : ""}
          </p>
        </div>
      </div>
    );
  }

  let data: LeaderboardResponse | null = null;
  let errorText: string | null = null;

  try {
    const url = new URL("/player-points/leaderboard", baseUrl);
    url.searchParams.set("limit", limitParam);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
      },
      // Always fetch fresh data
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upstream error ${res.status}: ${text}`);
    }

    data = (await res.json()) as LeaderboardResponse;
  } catch (err) {
    errorText =
      err instanceof Error ? err.message : "Failed to load leaderboard.";
  }

  const items = data?.leaderboard ?? [];

  return (
    <div className="flex min-h-[100svh] items-center justify-center font-sans">
      <main className="mx-[4vw] mt-[4svh] mb-[4svh] w-[calc(100vw-8vw)]">
        <div className="panel overflow-x-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-extrabold uppercase tracking-wide text-[#3f5125]">
              Leaderboard
            </h1>
            <p className="text-sm text-zinc-300">
              Showing top {items.length}
            </p>
          </div>

          {errorText ? (
            <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-red-300">
              {errorText}
            </div>
          ) : (
            <table className="mt-4 w-full border-separate border-spacing-y-1 text-left">
              <thead className="text-zinc-300">
                <tr>
                  <th className="border-b border-zinc-700/60 px-3 py-2">#</th>
                  <th className="border-b border-zinc-700/60 px-3 py-2">
                    Username
                  </th>
                  <th className="border-b border-zinc-700/60 px-3 py-2">
                    Address
                  </th>
                  <th className="border-b border-zinc-700/60 px-3 py-2">
                    Points
                  </th>
                  <th className="border-b border-zinc-700/60 px-3 py-2">
                    Level
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const topRankRowClasses =
                    index === 0
                      ? "bg-red-500/20 text-red-200 shadow-[0_0_18px_rgba(239,68,68,0.95)]"
                      : index === 1
                        ? "bg-purple-500/20 text-purple-200 shadow-[0_0_18px_rgba(168,85,247,0.95)]"
                        : index === 2
                          ? "bg-green-400/20 text-green-200 shadow-[0_0_18px_rgba(74,222,128,0.95)]"
                          : "hover:bg-white/5 text-zinc-100";

                  const topRankCellBorderClasses =
                    index === 0
                      ? "border-2 border-red-400"
                      : index === 1
                        ? "border-2 border-purple-400"
                        : index === 2
                          ? "border-2 border-green-300"
                          : "border border-zinc-700/60";

                  return (
                    <tr key={item.userAddress} className={topRankRowClasses}>
                      <td
                        className={`px-3 py-2 font-bold ${topRankCellBorderClasses}`}
                      >
                        {item.rank}
                      </td>
                      <td className={`px-3 py-2 ${topRankCellBorderClasses}`}>
                        {item.username || "Unknown User"}
                      </td>
                      <td
                        className={`px-3 py-2 font-mono text-sm ${topRankCellBorderClasses}`}
                      >
                        {shortenAddress(item.userAddress)}
                      </td>
                      <td
                        className={`px-3 py-2 font-semibold ${topRankCellBorderClasses}`}
                      >
                        {item.totalPoints}
                      </td>
                      <td className={`px-3 py-2 ${topRankCellBorderClasses}`}>
                        {item.level}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="mt-4 text-xs text-zinc-400">
            Data fetched from API via env `userDBUrl` with header `X-Api-Key`.
          </div>
        </div>
      </main>
    </div>
  );
}

