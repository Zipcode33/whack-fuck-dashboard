import { NextResponse } from "next/server";

interface PgaPlayer {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

let cachedPlayers: PgaPlayer[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function getPlayers(): Promise<PgaPlayer[]> {
  if (cachedPlayers && Date.now() - cacheTime < CACHE_TTL) {
    return cachedPlayers;
  }

  const res = await fetch("https://data-api.pgatour.com/player/list/R");
  if (!res.ok) throw new Error("Failed to fetch PGA Tour players");

  const data = await res.json();
  cachedPlayers = (data.players || data || []).map(
    (p: { id: string; firstName: string; lastName: string; displayName: string }) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      displayName: p.displayName,
    })
  );
  cacheTime = Date.now();
  return cachedPlayers!;
}

function normalise(str: string): string {
  return str.toLowerCase().replace(/[^a-z]/g, "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  try {
    const players = await getPlayers();
    const target = normalise(name);

    // Try exact displayName match first
    let match = players.find((p) => normalise(p.displayName) === target);

    // Fallback: first + last concatenated
    if (!match) {
      match = players.find(
        (p) => normalise(p.firstName + p.lastName) === target
      );
    }

    // Fallback: last name only (for unique last names)
    if (!match) {
      const targetParts = name.toLowerCase().trim().split(/\s+/);
      const lastName = targetParts[targetParts.length - 1];
      const lastNameMatches = players.filter(
        (p) => p.lastName.toLowerCase() === lastName
      );
      if (lastNameMatches.length === 1) {
        match = lastNameMatches[0];
      }
    }

    if (match) {
      const slug = `${match.firstName}-${match.lastName}`
        .toLowerCase()
        .replace(/\s+/g, "-");
      return NextResponse.redirect(
        `https://www.pgatour.com/player/${match.id}/${slug}`
      );
    }

    // No match found — fall back to PGA Tour search
    return NextResponse.redirect(
      `https://www.pgatour.com/players?search=${encodeURIComponent(name)}`
    );
  } catch (error) {
    console.error("Player link error:", error);
    return NextResponse.redirect(
      `https://www.pgatour.com/players?search=${encodeURIComponent(name || "")}`
    );
  }
}
