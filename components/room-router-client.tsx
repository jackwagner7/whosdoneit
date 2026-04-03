"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SayLessRoomClient } from "@/components/games/sayless/room-client";
import { RoomClient as WhosDoneItRoomClient } from "@/components/games/whosdoneit/room-client";
import { RoomLoadingScreen } from "@/components/room-loading-screen";
import { getRoomSnapshotByCode } from "@/lib/games/sayless/game";
import { getGameSnapshotByCode } from "@/lib/games/whosdoneit/game";
import { getRoomDirectoryEntryByCode } from "@/lib/room-directory";
import type { RoomDirectoryEntry } from "@/lib/room-directory";
import type { SayLessSnapshot } from "@/types/sayless";
import type { GameSnapshot } from "@/types/whosdoneit";

type RoomRouterClientProps = {
  code: string;
};

export function RoomRouterClient({ code }: RoomRouterClientProps) {
  const router = useRouter();
  const [entry, setEntry] = useState<RoomDirectoryEntry | null>(null);
  const [whosDoneItSnapshot, setWhosDoneItSnapshot] = useState<GameSnapshot | null>(null);
  const [sayLessSnapshot, setSayLessSnapshot] = useState<SayLessSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void getRoomDirectoryEntryByCode(code)
      .then(async (nextEntry) => {
        if (!active) {
          return;
        }

        if (!nextEntry) {
          setError("Room not found.");
          setLoading(false);
          return;
        }

        if (nextEntry.game_type === "sayless") {
          const initialSnapshot = await getRoomSnapshotByCode(code);
          if (!active) {
            return;
          }

          setSayLessSnapshot(initialSnapshot);
          setWhosDoneItSnapshot(null);
        } else {
          const initialSnapshot = await getGameSnapshotByCode(code);
          if (!active) {
            return;
          }

          setWhosDoneItSnapshot(initialSnapshot);
          setSayLessSnapshot(null);
        }

        setEntry(nextEntry);
        setError(null);
        setLoading(false);
      })
      .catch((issue) => {
        if (!active) {
          return;
        }

        setError(issue instanceof Error ? issue.message : "Could not load room.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    if (!loading && (error || !entry)) {
      router.replace("/");
    }
  }, [entry, error, loading, router]);

  if (loading) {
    return <RoomLoadingScreen message="Loading room..." />;
  }

  if (error || !entry) {
    return null;
  }

  if (entry.game_type === "sayless") {
    return <SayLessRoomClient code={code} initialSnapshot={sayLessSnapshot} />;
  }

  return <WhosDoneItRoomClient code={code} initialSnapshot={whosDoneItSnapshot} />;
}
