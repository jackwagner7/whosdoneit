"use client";

import { useEffect, useState } from "react";
import { AppBanner } from "@/components/app-banner";
import { SayLessRoomClient } from "@/components/games/sayless/room-client";
import { RoomClient as WhosDoneItRoomClient } from "@/components/games/whosdoneit/room-client";
import { getRoomDirectoryEntryByCode } from "@/lib/room-directory";
import type { RoomDirectoryEntry } from "@/lib/room-directory";
import { SITE_NAME } from "@/lib/site-config";

type RoomRouterClientProps = {
  code: string;
};

export function RoomRouterClient({ code }: RoomRouterClientProps) {
  const [entry, setEntry] = useState<RoomDirectoryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void getRoomDirectoryEntryByCode(code)
      .then((nextEntry) => {
        if (!active) {
          return;
        }

        if (!nextEntry) {
          setError("Room not found.");
          setLoading(false);
          return;
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

  if (loading) {
    return (
      <main className="app-page">
        <div className="app-page-card app-page-card-mobile-fill flex flex-col">
          <AppBanner label={SITE_NAME} />
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm font-semibold text-slate-600">Loading room...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !entry) {
    return (
      <main className="app-page">
        <div className="app-page-card app-page-card-mobile-fill flex flex-col">
          <AppBanner label={SITE_NAME} />
          <p className="mt-6 text-xl font-bold">Room unavailable</p>
          <p className="mt-2 text-sm text-slate-600">{error ?? "Unknown error."}</p>
        </div>
      </main>
    );
  }

  if (entry.game_type === "sayless") {
    return <SayLessRoomClient code={code} />;
  }

  return <WhosDoneItRoomClient code={code} />;
}
