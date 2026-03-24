import { joinRoom as joinSayLessRoom } from "@/lib/games/sayless/game";
import { joinRoom as joinWhosDoneItRoom } from "@/lib/games/whosdoneit/game";
import { supabase } from "@/lib/supabase";
import type { GameType } from "@/types/whosdoneit";

export type RoomDirectoryEntry = {
  id: string;
  code: string;
  game_type: GameType;
};

function asMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "Unknown Supabase error";
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export async function getRoomDirectoryEntryByCode(code: string) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    throw new Error("Room code is required.");
  }

  const { data, error } = await supabase
    .from("rooms")
    .select("id, code, game_type")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (error) {
    throw new Error(asMessage(error));
  }

  return (data as RoomDirectoryEntry | null) ?? null;
}

export async function joinRoomByCode(
  code: string,
  name: string,
  color?: string,
  emoji?: string,
) {
  const room = await getRoomDirectoryEntryByCode(code);

  if (!room) {
    throw new Error("Room not found.");
  }

  if (room.game_type === "sayless") {
    return joinSayLessRoom(code, name, color, emoji);
  }

  return joinWhosDoneItRoom(code, name, color, emoji);
}
