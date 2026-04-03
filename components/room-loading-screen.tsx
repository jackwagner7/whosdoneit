"use client";

import { useState } from "react";
import { AppBanner } from "@/components/app-banner";
import { PartyGamesInfoSheet } from "@/components/party-games-info-sheet";
import { ROOM_LOADING_LABEL } from "@/lib/site-config";

type RoomLoadingScreenProps = {
  message: string;
};

export function RoomLoadingScreen({ message }: RoomLoadingScreenProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <main className="app-page">
      <div className="app-page-card app-page-card-wide app-page-card-mobile-fill flex h-[calc(100svh-1.5rem)] max-h-[calc(100svh-1.5rem)] flex-col overflow-hidden sm:h-[80vh] sm:max-h-[80vh]">
        <AppBanner
          label={ROOM_LOADING_LABEL}
          rightAction={{
            label: "About Quick Party Games",
            icon: "info",
            onClick: () => setInfoOpen(true),
          }}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="grid justify-items-center gap-3">
            <div
              aria-hidden="true"
              className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-black"
            />
            <p className="text-sm font-semibold text-slate-600">{message}</p>
          </div>
        </div>
        <PartyGamesInfoSheet onClose={() => setInfoOpen(false)} open={infoOpen} />
      </div>
    </main>
  );
}
