import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

interface TournamentEarnings {
  [entryId: string]: string; // entryId -> official $ for that event
}

export interface EventColumn {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface LeaderboardEntry {
  position: number;
  teamName: string;
  playerName: string;
  officialMoney: string;
  projectedTotal: string;
  currentEventProjected: string;
  eventEarnings: { [eventId: string]: string };
  entryId: string;
}

export interface LeaderboardData {
  title: string;
  entries: LeaderboardEntry[];
  events: EventColumn[];
  lastUpdated: string;
}

const SOURCE_URL = "https://www.easyofficepools.com/leaderboard/?p=452073";

interface RawTournament {
  value: string;
  label: string;
}

function scrapeRows(html: string) {
  const $ = cheerio.load(html);
  const rows: {
    entryId: string;
    teamName: string;
    playerName: string;
    projTotal: string;
    projEvent: string;
    official: string;
  }[] = [];

  $("tr.searchable").each((_, row) => {
    const cells = $(row).find("td");
    const bookmarkHref = cells.eq(0).find("a").attr("href") || "";
    const entryIdMatch = bookmarkHref.match(/e=(\d+)/);
    const entryId = entryIdMatch ? entryIdMatch[1] : "";

    rows.push({
      entryId,
      teamName: cells.eq(2).find("a").first().text().trim(),
      playerName: cells.eq(2).find("span[ng-show]").text().trim(),
      projTotal: cells.eq(3).text().trim(),
      projEvent: cells.eq(4).text().trim(),
      official: cells.eq(5).text().trim(),
    });
  });

  return rows;
}

function parseMoney(val: string): number {
  return parseInt(val.replace(/[$,]/g, ""), 10) || 0;
}

function shortenEventName(name: string): string {
  return name
    .replace(/ presented by.*$/i, "")
    .replace(/^THE /i, "")
    .replace(/^AT&T /i, "")
    .trim();
}

export async function GET() {
  try {
    // 1. Fetch the main page (t=0) to get overall totals and tournament list
    const mainRes = await fetch(`${SOURCE_URL}&t=0`, {
      next: { revalidate: 300 },
    });
    if (!mainRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch leaderboard" },
        { status: 502 }
      );
    }

    const mainHtml = await mainRes.text();
    const $main = cheerio.load(mainHtml);

    const title = $main("h1").first().text().trim();

    // Get tournament list (skip "All Tournaments" option)
    const tournaments: RawTournament[] = [];
    $main("#gdltournament option").each((_, el) => {
      const value = $main(el).attr("value") || "0";
      if (value !== "0") {
        tournaments.push({
          value,
          label: $main(el).text().trim(),
        });
      }
    });

    // Get overall data from t=0
    const mainRows = scrapeRows(mainHtml);

    // 2. Fetch each tournament in parallel
    const tournamentFetches = tournaments.map(async (t) => {
      const res = await fetch(`${SOURCE_URL}&t=${t.value}`, {
        next: { revalidate: 300 },
      });
      if (!res.ok) return { tournament: t, rows: [] };
      const html = await res.text();
      return { tournament: t, rows: scrapeRows(html) };
    });

    const tournamentResults = await Promise.all(tournamentFetches);

    // 3. Determine which tournament is the current event
    // Current event = has non-zero projected event $ and $0 official for top entry
    const events: EventColumn[] = [];
    const eventEarningsMap: { [eventId: string]: TournamentEarnings } = {};

    for (const result of tournamentResults) {
      const { tournament, rows } = result;
      if (rows.length === 0) continue;

      // Check if this is the current (in-progress) event
      const topRow = rows[0];
      const isCurrent =
        parseMoney(topRow.projEvent) > 0 && parseMoney(topRow.official) === 0;

      events.push({
        id: tournament.value,
        name: shortenEventName(tournament.label),
        isCurrent,
      });

      // Map entryId -> earnings for this event
      const earnings: TournamentEarnings = {};
      for (const row of rows) {
        // For current event, use projected total; for completed, use official
        earnings[row.entryId] = isCurrent ? row.projTotal : row.official;
      }
      eventEarningsMap[tournament.value] = earnings;
    }

    // 4. Order events: current event first, then completed in reverse chronological
    // The tournament IDs appear to be in chronological order (lower = earlier)
    events.sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      // Completed events: most recent first (higher ID = more recent)
      return parseInt(b.id) - parseInt(a.id);
    });

    // 5. Build final entries
    const entries: LeaderboardEntry[] = mainRows.map((row, idx) => {
      const eventEarnings: { [eventId: string]: string } = {};
      for (const event of events) {
        const val = eventEarningsMap[event.id]?.[row.entryId] || "$0";
        eventEarnings[event.id] = val;
      }

      return {
        position: idx + 1,
        teamName: row.teamName,
        playerName: row.playerName,
        officialMoney: row.official,
        projectedTotal: row.projTotal,
        currentEventProjected: row.projEvent,
        eventEarnings,
        entryId: row.entryId,
      };
    });

    const data: LeaderboardData = {
      title,
      entries,
      events,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: "Failed to scrape leaderboard" },
      { status: 500 }
    );
  }
}
