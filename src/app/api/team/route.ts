import { NextResponse } from "next/server";

export interface Golfer {
  name: string;
  projectedTotal: string;
  projectedEvent: string;
  officialMoney: string;
}

export interface TeamDetail {
  teamName: string;
  golfers: Golfer[];
  total: string;
  projected: string;
  official: string;
}

const SOURCE_URL =
  "https://www.easyofficepools.com/api/leaderboard/pgaMoneyEntryDetails.php";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get("entry");

  if (!entryId) {
    return NextResponse.json({ error: "Missing entry ID" }, { status: 400 });
  }

  try {
    const res = await fetch(`${SOURCE_URL}?entry=${entryId}&t=0`, {
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch team details" },
        { status: 502 }
      );
    }

    const data = await res.json();

    const golfers: Golfer[] = (data.picks || []).map(
      (pick: {
        TEAM_NAME_T: string;
        EARNINGS_I: string;
        PROJ_EARN_A: string;
        OFFICIAL_EARN_A: string;
      }) => ({
        name: pick.TEAM_NAME_T,
        projectedTotal: `$${Math.round(parseFloat(pick.EARNINGS_I)).toLocaleString()}`,
        projectedEvent: `$${Math.round(parseFloat(pick.PROJ_EARN_A)).toLocaleString()}`,
        officialMoney: `$${Math.round(parseFloat(pick.OFFICIAL_EARN_A)).toLocaleString()}`,
      })
    );

    const teamDetail: TeamDetail = {
      teamName: data.picks?.[0]?.POOL_TEAM_NAME_T || "",
      golfers,
      total: `$${Math.round(data.total).toLocaleString()}`,
      projected: `$${Math.round(data.projected).toLocaleString()}`,
      official: `$${Math.round(data.official).toLocaleString()}`,
    };

    return NextResponse.json(teamDetail);
  } catch (error) {
    console.error("Team detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch team details" },
      { status: 500 }
    );
  }
}
