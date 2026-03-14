"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";

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

interface Golfer {
  name: string;
  projectedTotal: string;
  projectedEvent: string;
  officialMoney: string;
}

interface GolferStatsEntry {
  name: string;
  officialMoney: string;
  projectedTotal: string;
  projectedEvent: string;
  pickCount: number;
  teams: string[];
}

interface TeamRoster {
  teamName: string;
  entryId: string;
  golfers: string[];
}

interface GolferStatsData {
  golfers: GolferStatsEntry[];
  rosters: TeamRoster[];
  lastUpdated: string;
}

interface TeamDetail {
  teamName: string;
  golfers: Golfer[];
  total: string;
  projected: string;
  official: string;
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

function getPgaTourUrl(name: string): string {
  return `/api/player-link?name=${encodeURIComponent(name)}`;
}

function getEventUrl(name: string): string {
  return `/api/event-link?name=${encodeURIComponent(name)}`;
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
  const [sortBy, setSortBy] = useState<SortKey>("official");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamDetails, setTeamDetails] = useState<{ [entryId: string]: TeamDetail }>({});
  const [loadingTeam, setLoadingTeam] = useState<string | null>(null);

  // Golfer Stats
  const [golferStats, setGolferStats] = useState<GolferStatsData | null>(null);
  const [golferStatsLoading, setGolferStatsLoading] = useState(false);
  const [golferSortBy, setGolferSortBy] = useState<"picks" | "official" | "projected" | "name">("picks");
  const [golferSortDir, setGolferSortDir] = useState<"asc" | "desc">("asc");
  const [compareTeamA, setCompareTeamA] = useState<string>("");
  const [compareTeamB, setCompareTeamB] = useState<string>("");
  const [mvpSortBy, setMvpSortBy] = useState<"official" | "projected" | "event" | "name" | "picks">("official");
  const [mvpSortDir, setMvpSortDir] = useState<"asc" | "desc">("asc");

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

  // Fetch golfer stats after leaderboard loads
  useEffect(() => {
    if (data && !golferStats && !golferStatsLoading) {
      setGolferStatsLoading(true);
      fetch("/api/golfers")
        .then((res) => res.ok ? res.json() : null)
        .then((json) => { if (json) setGolferStats(json); })
        .catch(() => {})
        .finally(() => setGolferStatsLoading(false));
    }
  }, [data, golferStats, golferStatsLoading]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
      // Also refresh golfer stats
      fetch("/api/golfers")
        .then((res) => res.ok ? res.json() : null)
        .then((json) => { if (json) setGolferStats(json); })
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleTeam = useCallback(async (entryId: string) => {
    if (expandedTeam === entryId) {
      setExpandedTeam(null);
      return;
    }
    setExpandedTeam(entryId);
    if (!teamDetails[entryId]) {
      setLoadingTeam(entryId);
      try {
        const res = await fetch(`/api/team?entry=${entryId}`);
        if (res.ok) {
          const detail = await res.json();
          setTeamDetails((prev) => ({ ...prev, [entryId]: detail }));
        }
      } catch {
        // silently fail
      } finally {
        setLoadingTeam(null);
      }
    }
  }, [expandedTeam, teamDetails]);

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

  const topOfficial = data?.entries.reduce((best, e) =>
    parseMoney(e.officialMoney) > parseMoney(best.officialMoney) ? e : best
  , data?.entries[0]);
  const leader = topOfficial;
  const topProjected = data?.entries.reduce((best, e) =>
    parseMoney(e.projectedTotal) > parseMoney(best.projectedTotal) ? e : best
  , data?.entries[0]);
  const currentEvent = data?.events.find((e) => e.isCurrent);

  // Compute projected position change for each team
  const projectedDelta = useMemo(() => {
    if (!data) return {};
    // Rank by official $ (highest = rank 1)
    const officialRanked = [...data.entries].sort(
      (a, b) => parseMoney(b.officialMoney) - parseMoney(a.officialMoney)
    );
    const officialRankMap: { [id: string]: number } = {};
    officialRanked.forEach((e, i) => (officialRankMap[e.entryId] = i + 1));

    // Rank by projected total $ (highest = rank 1)
    const projectedRanked = [...data.entries].sort(
      (a, b) => parseMoney(b.projectedTotal) - parseMoney(a.projectedTotal)
    );
    const projectedRankMap: { [id: string]: number } = {};
    projectedRanked.forEach((e, i) => (projectedRankMap[e.entryId] = i + 1));

    // Delta = official rank - projected rank (positive = rising, negative = falling)
    const deltas: { [id: string]: number } = {};
    data.entries.forEach((e) => {
      deltas[e.entryId] = officialRankMap[e.entryId] - projectedRankMap[e.entryId];
    });
    return deltas;
  }, [data]);

  const sortedGolfers = useMemo(() => {
    if (!golferStats) return [];
    const arr = [...golferStats.golfers];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (golferSortBy) {
        case "picks": cmp = b.pickCount - a.pickCount; break;
        case "official": cmp = parseMoney(b.officialMoney) - parseMoney(a.officialMoney); break;
        case "projected": cmp = parseMoney(b.projectedTotal) - parseMoney(a.projectedTotal); break;
        case "name": cmp = a.name.localeCompare(b.name); break;
      }
      return golferSortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [golferStats, golferSortBy, golferSortDir]);

  function handleGolferSort(col: "picks" | "official" | "projected" | "name") {
    if (golferSortBy === col) {
      setGolferSortDir(golferSortDir === "asc" ? "desc" : "asc");
    } else {
      setGolferSortBy(col);
      setGolferSortDir("asc");
    }
  }

  function GolferSortIcon({ col }: { col: "picks" | "official" | "projected" | "name" }) {
    if (golferSortBy !== col) return <span className="text-gray-600 ml-1 text-[10px]">↕</span>;
    return <span className="text-green-400 ml-1 text-[10px]">{golferSortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const comparisonData = useMemo(() => {
    if (!golferStats || !compareTeamA || !compareTeamB) return null;
    const rosterA = golferStats.rosters.find((r) => r.teamName === compareTeamA);
    const rosterB = golferStats.rosters.find((r) => r.teamName === compareTeamB);
    if (!rosterA || !rosterB) return null;
    const shared = rosterA.golfers.filter((g) => rosterB.golfers.includes(g));
    return { rosterA, rosterB, shared };
  }, [golferStats, compareTeamA, compareTeamB]);

  const mvpList = useMemo(() => {
    if (!golferStats) return [];
    const arr = [...golferStats.golfers];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (mvpSortBy) {
        case "official": cmp = parseMoney(b.officialMoney) - parseMoney(a.officialMoney); break;
        case "projected": cmp = parseMoney(b.projectedTotal) - parseMoney(a.projectedTotal); break;
        case "event": cmp = parseMoney(b.projectedEvent) - parseMoney(a.projectedEvent); break;
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "picks": cmp = b.pickCount - a.pickCount; break;
      }
      return mvpSortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [golferStats, mvpSortBy, mvpSortDir]);

  function handleMvpSort(col: "official" | "projected" | "event" | "name" | "picks") {
    if (mvpSortBy === col) {
      setMvpSortDir(mvpSortDir === "asc" ? "desc" : "asc");
    } else {
      setMvpSortBy(col);
      setMvpSortDir("asc");
    }
  }

  function MvpSortIcon({ col }: { col: "official" | "projected" | "event" | "name" | "picks" }) {
    if (mvpSortBy !== col) return <span className="text-gray-600 ml-1 text-[10px]">↕</span>;
    return <span className="text-green-400 ml-1 text-[10px]">{mvpSortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function getPickCountColor(count: number): string {
    if (count >= 10) return "text-yellow-300 font-bold";
    if (count >= 7) return "text-emerald-400 font-semibold";
    if (count >= 4) return "text-green-400";
    if (count >= 2) return "text-gray-300";
    return "text-gray-500";
  }

  function ProjectedDelta({ entryId }: { entryId: string }) {
    const delta = projectedDelta[entryId] || 0;
    if (delta === 0) return null;
    if (delta > 0) {
      return (
        <span className="text-green-400 text-xs ml-1.5 font-semibold">
          ▲{delta}
        </span>
      );
    }
    return (
      <span className="text-red-400 text-xs ml-1.5 font-semibold">
        ▼{Math.abs(delta)}
      </span>
    );
  }

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-wider">🏆 Season Leader</p>
              <p className="text-xl font-bold mt-1 truncate">{leader?.teamName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{leader?.playerName}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Top Official $</p>
              <p className="text-2xl font-bold mt-1 text-emerald-400">
                {topOfficial ? formatMoney(topOfficial.officialMoney) : "-"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{topOfficial?.teamName}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Top Projected $</p>
              <p className="text-2xl font-bold mt-1 text-green-400">
                {topProjected ? formatMoney(topProjected.projectedTotal) : "-"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{topProjected?.teamName}</p>
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
                        <a
                          href={getEventUrl(event.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`hover:underline ${event.isCurrent ? "text-yellow-400" : ""}`}
                        >
                          {event.name}
                          {event.isCurrent && " *"}
                        </a>
                        <SortIcon col={event.id} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry, idx) => {
                    const displayPos = idx + 1;
                    const isExpanded = expandedTeam === entry.entryId;
                    const detail = teamDetails[entry.entryId];
                    const isLoading = loadingTeam === entry.entryId;
                    const colSpan = 4 + data.events.length;
                    return (
                    <React.Fragment key={entry.entryId}>
                    <tr
                      onClick={() => toggleTeam(entry.entryId)}
                      className={`border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors cursor-pointer select-none ${getPositionStyle(displayPos)}`}
                    >
                      <td className="px-3 py-3 text-center">
                        <span className="text-lg">{getPositionBadge(displayPos)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                          <div>
                            <div className="font-semibold">{entry.teamName}</div>
                            {entry.playerName && (
                              <div className="text-xs text-gray-500 mt-0.5">{entry.playerName}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-400 font-medium">
                        {entry.officialMoney}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-green-400 font-medium">
                        {entry.projectedTotal}
                        <ProjectedDelta entryId={entry.entryId} />
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
                    {isExpanded && isLoading && (
                      <tr className="bg-gray-800/40">
                        <td colSpan={colSpan} className="px-3 py-2.5">
                          <div className="flex items-center gap-2 pl-6">
                            <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs text-gray-400">Loading golfers...</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && detail && detail.golfers.map((golfer, gi) => (
                      <tr key={golfer.name} className={`bg-gray-800/30 text-sm ${gi < detail.golfers.length - 1 ? "border-b border-gray-700/20" : ""}`}>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 pl-5">
                            <span className="text-gray-500 text-xs">•</span>
                            <a
                              href={getPgaTourUrl(golfer.name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-400 hover:text-green-400 hover:underline transition-colors"
                            >
                              {golfer.name}
                            </a>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-400/60">
                          {parseMoney(golfer.officialMoney) > 0 ? formatMoney(golfer.officialMoney) : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-green-400/60">
                          {parseMoney(golfer.projectedTotal) > 0 ? formatMoney(golfer.projectedTotal) : <span className="text-gray-600">—</span>}
                        </td>
                        {data.events.map((event) => (
                          <td key={event.id} className="px-3 py-2 text-right font-mono text-sm">
                            {event.isCurrent && parseMoney(golfer.projectedEvent) > 0 ? (
                              <span className="text-yellow-300/60">+{formatMoney(golfer.projectedEvent)}</span>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-3">
              {filteredEntries.map((entry, idx) => {
                const displayPos = idx + 1;
                const isExpanded = expandedTeam === entry.entryId;
                const detail = teamDetails[entry.entryId];
                const isLoading = loadingTeam === entry.entryId;
                return (
                <div
                  key={entry.entryId}
                  className={`bg-gray-900 rounded-xl border border-gray-800 overflow-hidden ${getPositionStyle(displayPos)}`}
                >
                  <div
                    className="p-4 cursor-pointer select-none"
                    onClick={() => toggleTeam(entry.entryId)}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xl">{getPositionBadge(displayPos)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                          <div className="font-semibold truncate">{entry.teamName}</div>
                        </div>
                        {entry.playerName && (
                          <div className="text-xs text-gray-500 ml-4">{entry.playerName}</div>
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
                          <ProjectedDelta entryId={entry.entryId} />
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {data.events.map((event) => (
                        <div key={event.id} className="text-center">
                          <a
                            href={getEventUrl(event.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`text-[9px] uppercase truncate block hover:underline ${
                              event.isCurrent ? "text-yellow-400" : "text-gray-600"
                            }`}
                          >
                            {event.name}
                            {event.isCurrent ? " *" : ""}
                          </a>
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

                  {isExpanded && (
                    <div className="border-t border-gray-700/50 bg-gray-800/30 px-4 py-2">
                      {isLoading && (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-gray-400">Loading golfers...</span>
                        </div>
                      )}
                      {detail && (
                        <div className="flex flex-col">
                          {detail.golfers.map((golfer, gi) => (
                            <div key={golfer.name} className={`flex items-center gap-3 py-2.5 text-sm ${gi < detail.golfers.length - 1 ? "border-b border-gray-700/20" : ""}`}>
                              <span className="text-gray-500 text-xs">•</span>
                              <a
                                href={getPgaTourUrl(golfer.name)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-gray-400 hover:text-green-400 hover:underline transition-colors flex-1 truncate"
                              >
                                {golfer.name}
                              </a>
                              <span className="font-mono text-emerald-400/60">
                                {parseMoney(golfer.officialMoney) > 0 ? formatMoney(golfer.officialMoney) : "—"}
                              </span>
                              <span className="font-mono text-green-400/60">
                                {parseMoney(golfer.projectedTotal) > 0 ? formatMoney(golfer.projectedTotal) : "—"}
                              </span>
                              {parseMoney(golfer.projectedEvent) > 0 && (
                                <span className="font-mono text-yellow-300/60">+{formatMoney(golfer.projectedEvent)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
        {/* MVP List */}
        {golferStats && !loading && (
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-4">🏅 MVP List</h2>

            {/* MVP Desktop */}
            <div className="hidden lg:block bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-[11px] text-gray-400 uppercase tracking-wider">
                    <th className="px-3 py-3 text-center w-14">#</th>
                    <th
                      className="px-3 py-3 text-left cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleMvpSort("name")}
                    >
                      Golfer <MvpSortIcon col="name" />
                    </th>
                    <th
                      className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleMvpSort("official")}
                    >
                      Official $ <MvpSortIcon col="official" />
                    </th>
                    <th
                      className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleMvpSort("projected")}
                    >
                      Projected $ <MvpSortIcon col="projected" />
                    </th>
                    <th
                      className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleMvpSort("event")}
                    >
                      Current Event <MvpSortIcon col="event" />
                    </th>
                    <th
                      className="px-3 py-3 text-center cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleMvpSort("picks")}
                    >
                      Teams <MvpSortIcon col="picks" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mvpList.map((golfer, idx) => {
                    const rank = idx + 1;
                    return (
                      <tr
                        key={golfer.name}
                        className={`border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${
                          rank <= 3
                            ? rank === 1
                              ? "bg-gradient-to-r from-yellow-400/10 to-transparent"
                              : rank === 2
                              ? "bg-gradient-to-r from-gray-300/10 to-transparent"
                              : "bg-gradient-to-r from-amber-600/10 to-transparent"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-3 text-center">
                          <span className="text-lg">{rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : <span className="text-sm text-gray-500">{rank}</span>}</span>
                        </td>
                        <td className="px-3 py-3">
                          <a
                            href={getPgaTourUrl(golfer.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-green-400 hover:underline transition-colors font-medium"
                          >
                            {golfer.name}
                          </a>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-emerald-400 font-medium">
                          {formatMoneyFull(golfer.officialMoney)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-green-400">
                          {formatMoney(golfer.projectedTotal)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-yellow-300">
                          {parseMoney(golfer.projectedEvent) > 0 ? `+${formatMoney(golfer.projectedEvent)}` : <span className="text-gray-600">—</span>}
                        </td>
                        <td className={`px-3 py-3 text-center font-mono ${getPickCountColor(golfer.pickCount)}`}>
                          {golfer.pickCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MVP Mobile */}
            <div className="lg:hidden space-y-2 mb-8">
              {mvpList.map((golfer, idx) => {
                const rank = idx + 1;
                return (
                  <div
                    key={golfer.name}
                    className={`bg-gray-900 rounded-xl border border-gray-800 p-3 ${
                      rank <= 3
                        ? rank === 1
                          ? "border-l-4 border-l-yellow-400"
                          : rank === 2
                          ? "border-l-4 border-l-gray-400"
                          : "border-l-4 border-l-amber-600"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-lg w-8 text-center">
                        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : <span className="text-sm text-gray-500">{rank}</span>}
                      </span>
                      <a
                        href={getPgaTourUrl(golfer.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-green-400 hover:underline transition-colors font-medium flex-1"
                      >
                        {golfer.name}
                      </a>
                    </div>
                    <div className="grid grid-cols-3 gap-2 ml-11">
                      <div>
                        <p className="text-[9px] text-gray-500 uppercase">Official</p>
                        <p className="text-sm font-mono text-emerald-400 font-medium">{formatMoney(golfer.officialMoney)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-500 uppercase">Projected</p>
                        <p className="text-sm font-mono text-green-400">{formatMoney(golfer.projectedTotal)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-500 uppercase">Event</p>
                        <p className="text-sm font-mono text-yellow-300">
                          {parseMoney(golfer.projectedEvent) > 0 ? `+${formatMoney(golfer.projectedEvent)}` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Golfer Stats Section */}
        {golferStats && !loading && (
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-4">🏌️ Selection</h2>

            {/* Golfer Popularity Table - Desktop */}
            <div className="hidden lg:block bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto mb-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-[11px] text-gray-400 uppercase tracking-wider">
                    <th className="px-3 py-3 text-center w-10">#</th>
                    <th
                      className="px-3 py-3 text-left cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleGolferSort("name")}
                    >
                      Golfer <GolferSortIcon col="name" />
                    </th>
                    <th
                      className="px-3 py-3 text-center cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleGolferSort("picks")}
                    >
                      Teams <GolferSortIcon col="picks" />
                    </th>
                    <th
                      className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleGolferSort("official")}
                    >
                      Official $ <GolferSortIcon col="official" />
                    </th>
                    <th
                      className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleGolferSort("projected")}
                    >
                      Projected $ <GolferSortIcon col="projected" />
                    </th>
                    <th className="px-3 py-3 text-right">Current Event</th>
                    <th className="px-3 py-3 text-left">Picked By</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGolfers.map((golfer, idx) => (
                    <tr key={golfer.name} className="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors">
                      <td className="px-3 py-3 text-center text-gray-500 text-sm">{idx + 1}</td>
                      <td className="px-3 py-3">
                        <a
                          href={getPgaTourUrl(golfer.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-green-400 hover:underline transition-colors font-medium"
                        >
                          {golfer.name}
                        </a>
                      </td>
                      <td className={`px-3 py-3 text-center font-mono ${getPickCountColor(golfer.pickCount)}`}>
                        {golfer.pickCount}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-400">
                        {formatMoney(golfer.officialMoney)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-green-400">
                        {formatMoney(golfer.projectedTotal)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-yellow-300">
                        {parseMoney(golfer.projectedEvent) > 0 ? `+${formatMoney(golfer.projectedEvent)}` : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-3 text-left">
                        <div className="flex flex-wrap gap-1">
                          {golfer.teams.map((team) => (
                            <span key={team} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                              {team}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Golfer Popularity - Mobile */}
            <div className="lg:hidden space-y-2 mb-8">
              {sortedGolfers.map((golfer, idx) => (
                <div key={golfer.name} className="bg-gray-900 rounded-xl border border-gray-800 p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-gray-500 text-sm w-6 text-center">{idx + 1}</span>
                    <a
                      href={getPgaTourUrl(golfer.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-green-400 hover:underline transition-colors font-medium flex-1"
                    >
                      {golfer.name}
                    </a>
                    <span className={`font-mono text-sm ${getPickCountColor(golfer.pickCount)}`}>
                      {golfer.pickCount} teams
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="bg-gray-800/50 rounded-lg p-1.5 text-center">
                      <p className="text-[9px] text-gray-500 uppercase">Official</p>
                      <p className="text-xs font-mono text-emerald-400">{formatMoney(golfer.officialMoney)}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-1.5 text-center">
                      <p className="text-[9px] text-gray-500 uppercase">Projected</p>
                      <p className="text-xs font-mono text-green-400">{formatMoney(golfer.projectedTotal)}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-1.5 text-center">
                      <p className="text-[9px] text-gray-500 uppercase">Event</p>
                      <p className="text-xs font-mono text-yellow-300">
                        {parseMoney(golfer.projectedEvent) > 0 ? `+${formatMoney(golfer.projectedEvent)}` : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {golfer.teams.map((team) => (
                      <span key={team} className="text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                        {team}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Team Overlap Comparison */}
            <h2 className="text-xl font-bold mb-4">🔀 Team Comparison</h2>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Team A</label>
                  <select
                    value={compareTeamA}
                    onChange={(e) => setCompareTeamA(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select a team...</option>
                    {golferStats.rosters.map((r) => (
                      <option key={r.entryId} value={r.teamName}>{r.teamName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Team B</label>
                  <select
                    value={compareTeamB}
                    onChange={(e) => setCompareTeamB(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select a team...</option>
                    {golferStats.rosters.map((r) => (
                      <option key={r.entryId} value={r.teamName}>{r.teamName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {comparisonData && (
                <div>
                  <div className="text-center mb-4">
                    <span className="text-sm text-gray-400">
                      <span className="text-green-400 font-semibold">{comparisonData.shared.length}</span>
                      {" "}of{" "}
                      <span className="text-white">{comparisonData.rosterA.golfers.length}</span>
                      {" "}golfers in common
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">{comparisonData.rosterA.teamName}</p>
                      <div className="space-y-1">
                        {comparisonData.rosterA.golfers.map((g) => (
                          <div
                            key={g}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                              comparisonData.shared.includes(g)
                                ? "bg-green-900/30 border border-green-700/40"
                                : "bg-gray-800/40"
                            }`}
                          >
                            {comparisonData.shared.includes(g) && (
                              <span className="text-green-400 text-xs">●</span>
                            )}
                            <a
                              href={getPgaTourUrl(g)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-green-400 hover:underline transition-colors"
                            >
                              {g}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">{comparisonData.rosterB.teamName}</p>
                      <div className="space-y-1">
                        {comparisonData.rosterB.golfers.map((g) => (
                          <div
                            key={g}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                              comparisonData.shared.includes(g)
                                ? "bg-green-900/30 border border-green-700/40"
                                : "bg-gray-800/40"
                            }`}
                          >
                            {comparisonData.shared.includes(g) && (
                              <span className="text-green-400 text-xs">●</span>
                            )}
                            <a
                              href={getPgaTourUrl(g)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-green-400 hover:underline transition-colors"
                            >
                              {g}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {compareTeamA && compareTeamB && !comparisonData && (
                <p className="text-center text-gray-500 text-sm">Select two different teams to compare.</p>
              )}
              {(!compareTeamA || !compareTeamB) && (
                <p className="text-center text-gray-500 text-sm">Select two teams above to compare their rosters.</p>
              )}
            </div>
          </div>
        )}

        {golferStatsLoading && !golferStats && (
          <div className="flex items-center justify-center py-10 mt-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Loading golfer stats...</p>
            </div>
          </div>
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
