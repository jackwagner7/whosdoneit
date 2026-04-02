import { NextResponse } from "next/server";
import { getOrCreateDraftBatch } from "@/lib/games/sayless/draft-batch-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string;
      playerId?: string;
    };
    const roomId = body.roomId?.trim();
    const playerId = body.playerId?.trim();

    if (!roomId || !playerId) {
      return NextResponse.json(
        { error: "roomId and playerId are required." },
        { status: 400 },
      );
    }

    const payload = await getOrCreateDraftBatch(roomId, playerId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load draft batch.",
      },
      { status: 500 },
    );
  }
}
