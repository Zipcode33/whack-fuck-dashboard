import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

const LEADERBOARD_URL =
  "https://www.easyofficepools.com/leaderboard/?p=452073&t=0";
const TEAM_API_URL =
  "https://www.easyofficepools.com/api/leaderboard/pgaMoneyEntryDetails.php";

interface GolferAgg {
  name: string;
  officialMoney: number;
  projectedTotal: number;
  projectedEvent: number;
  teams: string[];
}

export interface GolferStatsEntry {
  name: string;
  officialMoney: string;
  projectedTotal: string;
  projectedEvent: string;
  pickCount: number;
  teams: string[];
}

export interface TeamRoster {
  teamName: string;
  entryId: string;
  golfers: string[];
}

export interface GolferStatsData {
  golfers: GolferStatsEntry[];
  rosters: TeamRoster[];
  lastUpdated: string;
}

function fmt(num: number): string {
  return `$${num.toLocaleString()}`;
}

export async function GET() {
  try {
    // 1. Fetch leaderboard to get all entry IDs and team names
    const lbRes = await fetch(LEADERBOARD_URL, { next: { revalidate: 300 } });
    if (!lbRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch leaderboard" },
        { status: 502 }
      );
    }

    const lbHtml = await lbRes.text();
    const $ = cheerio.load(lbHtml);

    const teams: { entryId: string; teamName: string }[] = [];
    $("tr.searchable").each((_, row) => {
      const cells = $(row).find("td");
      const bookmarkHref = cells.eq(0).find("a").attr("href") || "";
      const match = bookmarkHref.match(/e=(\d+)/);
      if (match) {
        teams.push({
          entryId: match[1],
          teamName: cells.eq(2).find("a").first().text().trim(),
        });
      }
    });

    // 2. Fetch all team details in parallel
    const teamFetches = teams.map(async (team) => {
      try {
        const res = await fetch(
          `${TEAM_API_URL}?entry=${team.entryId}&t=0`,
          { next: { revalidate: 300 } }
        );
        if (!res.ok) return { team, picks: [] };
        const data = await res.json();
        return { team, picks: data.picks || [] };
      } catch {
        return { team, picks: [] };
      }
    });

    const teamResults = await Promise.all(teamFetches);

    // 3. Aggregate golfer data
    const golferMap: { [name: string]: GolferAgg } = {};
    const rosters: TeamRoster[] = [];

    for (const result of teamResults) {
      const golferNames: string[] = [];

      for (const pick of result.picks) {
        const name: string = pick.TEAM_NAME_T;
        const official = Math.round(parseFloat(pick.OFFICIAL_EARN_A) || 0);
        const projTotal = Math.round(parseFloat(pick.EARNINGS_I) || 0);
        const projEvent = Math.round(parseFloat(pick.PROJ_EARN_A) || 0);

        golferNames.push(name);

        if (!golferMap[name]) {
          golferMap[name] = {
            name,
            officialMoney: official,
            projectedTotal: projTotal,
            projectedEvent: projEvent,
            teams: [],
          };
        } else {
          // Update with latest values (should be same across teams)
          golferMap[name].officialMoney = official;
          golferMap[name].projectedTotal = projTotal;
          golferMap[name].projectedEvent = projEvent;
        }

        golferMap[name].teams.push(result.team.teamName);
      }

      rosters.push({
        teamName: result.team.teamName,
        entryId: result.team.entryId,
        golfers: golferNames,
      });
    }

    // 4. Convert to array, sort by pick count then official $
    const golfers: GolferStatsEntry[] = Object.values(golferMap)
      .map((g) => ({
        name: g.name,
        officialMoney: fmt(g.officialMoney),
        projectedTotal: fmt(g.projectedTotal),
        projectedEvent: fmt(g.projectedEvent),
        pickCount: g.teams.length,
        teams: g.teams,
      }))
      .sort((a, b) => {
        if (b.pickCount !== a.pickCount) return b.pickCount - a.pickCount;
        return (
          parseInt(b.officialMoney.replace(/[$,]/g, ""), 10) -
          parseInt(a.officialMoney.replace(/[$,]/g, ""), 10)
        );
      });

    const data: GolferStatsData = {
      golfers,
      rosters,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Golfer stats error:", error);
    return NextResponse.json(
      { error: "Failed to aggregate golfer stats" },
      { status: 500 }
    );
  }
}
