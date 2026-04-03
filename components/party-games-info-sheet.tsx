"use client";

import { GameInfoSheet } from "@/components/game-info-sheet";

type PartyGamesInfoSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function PartyGamesInfoSheet({ open, onClose }: PartyGamesInfoSheetProps) {
  return (
    <GameInfoSheet
      onClose={onClose}
      open={open}
      steps={[
        "Create a room or join one with a room code.",
        "Everyone plays on their own phone in the same room.",
        "Hosts can tune settings before the game starts.",
        "When a round ends, start another game or jump into a new room.",
      ]}
      summary="Quick Party Games is a phone-first collection of fast party games you can host and join in seconds."
      tips={[
        "Use the room link or code to get everyone in quickly.",
        "These games are designed for portrait play on phones.",
      ]}
      title="Quick Party Games"
    />
  );
}
