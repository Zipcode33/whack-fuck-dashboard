"use client";

import { useEffect, useState, useMemo } from "react";

interface EventColumn {
  id: string;
  name: string;
  isCurrent: boolean;
}

interface LeaderboardEntry {
  position: number;
  teamName: string;
  playerName: string;
  officialMoney: string;
  projectedTotal: string;
  currentEventProjected: string;
  eventEarnings: { [eventId: string]: string };
  entryId: string;
}

interface LeaderboardData {
  title: string;
  entries: LeaderboardEntry[];
  events: EventColumn[];
  lastUpdated: string;
}

function parseMoney(val: string): number {
  return parseInt(val.replace(/[$,]/g, ""), 10) || 0;
}

function formatMoney(val: string): string {
  const num = parseMoney(val);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  if (num === 0) return "$0";
  return val;
}

function formatMoneyFull(val: string): string {
  const num = parseMoney(val);
  return `$${num.toLocaleString()}`;
}

function getPositionStyle(pos: number) {
  if (pos === 1) return "bg-gradient-to-r from-yellow-400/20 to-transparent border-l-4 border-yellow-400";
  if (pos === 2) return "bg-gradient-to-r from-gray-300/20 to-transparent border-l-4 border-gray-400";
  if (pos === 3) return "bg-gradient-to-r from-amber-600/20 to-transparent border-l-4 border-amber-600";
  return "border-l-4 border-transparent";
}

function getPositionBadge(pos: number) {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return `${pos}`;
}

type SortKey = "position" | "official" | "projTotal" | string;

export default function Dashboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const fetchData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch {
      if (!isRefresh) setError("Failed to load leaderboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    let entries = data.entries.filter(
      (e) =>
        e.teamName.toLowerCase().includes(search.toLowerCase()) ||
        e.playerName.toLowerCase().includes(search.toLowerCase())
    );

    entries.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "position":
          cmp = a.position - b.position;
          break;
        case "official":
          cmp = parseMoney(b.officialMoney) - parseMoney(a.officialMoney);
          break;
        case "projTotal":
          cmp = parseMoney(b.projectedTotal) - parseMoney(a.projectedTotal);
          break;
        default:
          // Event column sort
          cmp =
            parseMoney(b.eventEarnings[sortBy] || "$0") -
            parseMoney(a.eventEarnings[sortBy] || "$0");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return entries;
  }, [data, search, sortBy, sortDir]);

  function handleSort(col: SortKey) {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortBy !== col) return <span className="text-gray-600 ml-1 text-[10px]">↕</span>;
    return <span className="text-green-400 ml-1 text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const leader = data?.entries[0];
  const totalPrizePool =
    data?.entries.reduce((sum, e) => sum + parseMoney(e.officialMoney), 0) || 0;
  const currentEvent = data?.events.find((e) => e.isCurrent);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-900 via-green-800 to-emerald-900 border-b border-green-700/50">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                ⛳ Whack FUCK!
              </h1>
              <p className="text-green-300/80 text-sm mt-1">
                PGA Golf Pool Dashboard
              </p>
            </div>
            {data && (
              <div className="text-right text-xs text-green-300/60">
                Last updated: {new Date(data.lastUpdated).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        {data && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Teams</p>
              <p className="text-2xl font-bold mt-1">{data.entries.length}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Leader</p>
              <p className="text-lg font-bold mt-1 truncate">{leader?.teamName}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Top Projected</p>
              <p className="text-2xl font-bold mt-1 text-green-400">
                {leader ? formatMoney(leader.projectedTotal) : "-"}
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                {currentEvent ? `Live: ${currentEvent.name}` : "Current Event"}
              </p>
              <p className="text-lg font-bold mt-1 text-yellow-400">
                {currentEvent ? "In Progress" : "-"}
              </p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-4">
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Search teams or players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder-gray-500"
            />
            <svg
              className="absolute left-3 top-3 h-4 w-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Loading leaderboard...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-6 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Desktop Table */}
        {!loading && !error && data && (
          <>
            <div className="hidden lg:block bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-[11px] text-gray-400 uppercase tracking-wider">
                    <th
                      className="px-3 py-3 text-center cursor-pointer hover:text-white transition-colors w-14"
                      onClick={() => handleSort("position")}
                    >
                      Pos <SortIcon col="position" />
                    </th>
                    <th className="px-3 py-3 text-left">Team</th>
                    <th
                      className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort("official")}
                    >
                      Official $ <SortIcon col="official" />
                    </th>
                    <th
                      className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort("projTotal")}
                    >
                      Projected $ <SortIcon col="projTotal" />
                    </th>
                    {data.events.map((event) => (
                      <th
                        key={event.id}
                        className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                        onClick={() => handleSort(event.id)}
                      >
                        <span className={event.isCurrent ? "text-yellow-400" : ""}>
                          {event.name}
                          {event.isCurrent && " *"}
                        </span>
                        <SortIcon col={event.id} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry, idx) => {
                    const displayPos = idx + 1;
                    return (
                    <tr
                      key={entry.entryId}
                      className={`border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${getPositionStyle(displayPos)}`}
                    >
                      <td className="px-3 py-3 text-center">
                        <span className="text-lg">{getPositionBadge(displayPos)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold">{entry.teamName}</div>
                        {entry.playerName && (
                          <div className="text-xs text-gray-500 mt-0.5">{entry.playerName}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-400 font-medium">
                        {entry.officialMoney}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-green-400 font-medium">
                        {entry.projectedTotal}
                      </td>
                      {data.events.map((event) => (
                        <td
                          key={event.id}
                          className={`px-3 py-3 text-right font-mono text-sm ${
                            event.isCurrent ? "text-yellow-300" : "text-gray-400"
                          }`}
                        >
                          {formatMoneyFull(entry.eventEarnings[event.id] || "$0")}
                        </td>
                      ))}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-3">
              {filteredEntries.map((entry, idx) => {
                const displayPos = idx + 1;
                return (
                <div
                  key={entry.entryId}
                  className={`bg-gray-900 rounded-xl p-4 border border-gray-800 ${getPositionStyle(displayPos)}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xl">{getPositionBadge(displayPos)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{entry.teamName}</div>
                      {entry.playerName && (
                        <div className="text-xs text-gray-500">{entry.playerName}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-gray-800/50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-500 uppercase">Official $</p>
                      <p className="text-sm font-mono text-emerald-400 font-medium">
                        {formatMoney(entry.officialMoney)}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-500 uppercase">Projected $</p>
                      <p className="text-sm font-mono text-green-400 font-medium">
                        {formatMoney(entry.projectedTotal)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {data.events.map((event) => (
                      <div key={event.id} className="text-center">
                        <p
                          className={`text-[9px] uppercase truncate ${
                            event.isCurrent ? "text-yellow-400" : "text-gray-600"
                          }`}
                        >
                          {event.name}
                          {event.isCurrent ? " *" : ""}
                        </p>
                        <p
                          className={`text-xs font-mono ${
                            event.isCurrent ? "text-yellow-300" : "text-gray-500"
                          }`}
                        >
                          {formatMoney(entry.eventEarnings[event.id] || "$0")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>

            {filteredEntries.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No teams found matching &quot;{search}&quot;
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-xs text-gray-600">
          Data sourced from EasyOfficePools.com
        </div>
      </footer>
    </div>
  );
}
