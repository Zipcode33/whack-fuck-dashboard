import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export interface LeaderboardEntry {
  position: number;
  teamName: string;
  playerName: string;
  projectedTotal: string;
  projectedEvent: string;
  officialMoney: string;
  entryId: string;
}

export interface Tournament {
  value: string;
  label: string;
}

export interface LeaderboardData {
  title: string;
  entries: LeaderboardEntry[];
  tournaments: Tournament[];
  lastUpdated: string;
}

const SOURCE_URL = "https://www.easyofficepools.com/leaderboard/?p=452073";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tournament = searchParams.get("t") || "0";

  try {
    const res = await fetch(`${SOURCE_URL}&t=${tournament}`, {
      next: { revalidate: 300 }, // cache for 5 minutes
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch leaderboard" },
        { status: 502 }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract title
    const title = $("h1").first().text().trim();

    // Extract tournament options
    const tournaments: Tournament[] = [];
    $("#gdltournament option").each((_, el) => {
      tournaments.push({
        value: $(el).attr("value") || "0",
        label: $(el).text().trim(),
      });
    });

    // Extract leaderboard entries
    const entries: LeaderboardEntry[] = [];
    $("tr.searchable").each((_, row) => {
      const cells = $(row).find("td");

      const position = parseInt(cells.eq(1).text().trim(), 10);
      const teamName = cells.eq(2).find("a").first().text().trim();
      const playerName = cells.eq(2).find("span[ng-show]").text().trim();
      const projectedTotal = cells.eq(3).text().trim();
      const projectedEvent = cells.eq(4).text().trim();
      const officialMoney = cells.eq(5).text().trim();

      // Extract entry ID from the bookmark link
      const bookmarkHref = cells.eq(0).find("a").attr("href") || "";
      const entryIdMatch = bookmarkHref.match(/e=(\d+)/);
      const entryId = entryIdMatch ? entryIdMatch[1] : "";

      entries.push({
        position,
        teamName,
        playerName,
        projectedTotal,
        projectedEvent,
        officialMoney,
        entryId,
      });
    });

    const data: LeaderboardData = {
      title,
      entries,
      tournaments,
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
