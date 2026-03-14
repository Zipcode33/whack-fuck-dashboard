import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

interface TournamentInfo {
  name: string;
  url: string;
}

let cachedTournaments: TournamentInfo[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function normalise(str: string): string {
  return str
    .toLowerCase()
    .replace(/the\s+/g, "")
    .replace(/presented by.*$/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getTournaments(): Promise<TournamentInfo[]> {
  if (cachedTournaments && Date.now() - cacheTime < CACHE_TTL) {
    return cachedTournaments;
  }

  try {
    const res = await fetch("https://www.pgatour.com/schedule", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error("Schedule fetch failed");

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract __NEXT_DATA__ from the page
    const nextDataScript = $("#__NEXT_DATA__").html();
    if (nextDataScript) {
      const nextData = JSON.parse(nextDataScript);
      const tournaments: TournamentInfo[] = [];

      // Navigate the Next.js data structure to find tournament info
      const props = nextData?.props?.pageProps;
      const schedule =
        props?.schedule?.completed ||
        props?.schedule?.upcoming ||
        props?.schedule ||
        props;

      // Try to find tournament arrays in the data
      extractTournaments(props, tournaments);

      if (tournaments.length > 0) {
        cachedTournaments = tournaments;
        cacheTime = Date.now();
        return tournaments;
      }
    }

    // Fallback: extract tournament links from HTML
    const tournaments: TournamentInfo[] = [];
    $('a[href*="/tournaments/"]').each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (
        text &&
        text.length > 3 &&
        href.includes("/tournaments/") &&
        !href.includes("/schedule")
      ) {
        const url = href.startsWith("http")
          ? href
          : `https://www.pgatour.com${href}`;
        tournaments.push({ name: text, url });
      }
    });

    if (tournaments.length > 0) {
      // Deduplicate by URL
      const seen = new Set<string>();
      cachedTournaments = tournaments.filter((t) => {
        if (seen.has(t.url)) return false;
        seen.add(t.url);
        return true;
      });
      cacheTime = Date.now();
      return cachedTournaments;
    }
  } catch (error) {
    console.error("Schedule scrape error:", error);
  }

  // Final fallback: empty (will trigger Google search fallback)
  return [];
}

// Recursively search the Next.js data for tournament objects
function extractTournaments(obj: unknown, results: TournamentInfo[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractTournaments(item, results);
    }
    return;
  }
  const record = obj as Record<string, unknown>;

  // Check if this object looks like a tournament
  const name =
    record.tournamentName ||
    record.tournament_name ||
    record.name ||
    record.title;
  const url =
    record.tournamentUrl ||
    record.tournament_url ||
    record.url ||
    record.href ||
    record.leaderboardUrl;

  if (
    typeof name === "string" &&
    typeof url === "string" &&
    url.includes("/tournaments/")
  ) {
    const fullUrl = url.startsWith("http")
      ? url
      : `https://www.pgatour.com${url}`;
    results.push({ name, url: fullUrl });
  }

  // Recurse into child properties
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      extractTournaments(value, results);
    }
  }
}

function matchScore(eventName: string, tournamentName: string): number {
  const a = normalise(eventName);
  const b = normalise(tournamentName);

  // Exact match
  if (a === b) return 100;

  // One contains the other
  if (b.includes(a)) return 90;
  if (a.includes(b)) return 85;

  // Word overlap
  const aWords = a.split(" ");
  const bWords = b.split(" ");
  const commonWords = aWords.filter((w) => bWords.includes(w) && w.length > 2);
  if (commonWords.length === 0) return 0;
  return (commonWords.length / Math.max(aWords.length, bWords.length)) * 80;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  try {
    const tournaments = await getTournaments();

    // Find best match
    let bestMatch: TournamentInfo | null = null;
    let bestScore = 0;

    for (const t of tournaments) {
      const score = matchScore(name, t.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = t;
      }
    }

    if (bestMatch && bestScore >= 50) {
      // Append /leaderboard if not already there
      let url = bestMatch.url;
      if (!url.endsWith("/leaderboard")) {
        url = url.replace(/\/$/, "") + "/leaderboard";
      }
      return NextResponse.redirect(url);
    }

    // Fallback: PGA Tour search
    return NextResponse.redirect(
      `https://www.pgatour.com/search?q=${encodeURIComponent(name)}`
    );
  } catch (error) {
    console.error("Event link error:", error);
    return NextResponse.redirect(
      `https://www.pgatour.com/search?q=${encodeURIComponent(name || "")}`
    );
  }
}
