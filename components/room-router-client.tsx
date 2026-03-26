"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBanner } from "@/components/app-banner";
import { SayLessRoomClient } from "@/components/games/sayless/room-client";
import { RoomClient as WhosDoneItRoomClient } from "@/components/games/whosdoneit/room-client";
import { getRoomSnapshotByCode } from "@/lib/games/sayless/game";
import { getGameSnapshotByCode } from "@/lib/games/whosdoneit/game";
import { getRoomDirectoryEntryByCode } from "@/lib/room-directory";
import type { RoomDirectoryEntry } from "@/lib/room-directory";
import { ROOM_LOADING_LABEL } from "@/lib/site-config";
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
    return (
      <main className="app-page">
        <div className="app-page-card app-page-card-wide app-page-card-mobile-fill h-[calc(100svh-1.5rem)] max-h-[calc(100svh-1.5rem)] sm:h-[80vh] sm:max-h-[80vh] flex flex-col overflow-hidden">
          <AppBanner label={ROOM_LOADING_LABEL} />
          <div className="flex flex-1 items-center justify-center">
            <div className="grid justify-items-center gap-3">
              <div
                aria-hidden="true"
                className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-black"
              />
              <p className="text-sm font-semibold text-slate-600">Loading room...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !entry) {
    return null;
  }

  if (entry.game_type === "sayless") {
    return <SayLessRoomClient code={code} initialSnapshot={sayLessSnapshot} />;
  }

  return <WhosDoneItRoomClient code={code} initialSnapshot={whosDoneItSnapshot} />;
}
