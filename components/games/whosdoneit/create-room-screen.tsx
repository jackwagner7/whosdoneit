"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntryProfileForm } from "@/components/entry-profile-form";
import { getGameBySlug } from "@/lib/game-catalog";
import { createRoom } from "@/lib/games/whosdoneit/game";
import {
  getDefaultHostSettings,
  getStoredHostSettings,
} from "@/lib/games/whosdoneit/host-settings-preferences";
import {
  getDefaultPlayerPreferences,
  getStoredPlayerPreferences,
  setStoredPlayerPreferences,
} from "@/lib/player-preferences";

const GAME = getGameBySlug("whosdoneit");

export function WhosDoneItCreateRoomScreen() {
  const [defaults, setDefaults] = useState(() => getDefaultPlayerPreferences());
  const [hostSettings, setHostSettings] = useState(() => getDefaultHostSettings());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setDefaults(getStoredPlayerPreferences());
    setHostSettings(getStoredHostSettings());
  }, []);

  async function handleCreateRoom(values: {
    name: string;
    color: string;
    emoji: string;
  }) {
    if (!values.name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { room, player } = await createRoom(values.name.trim(), {
        playerColor: values.color,
        playerEmoji: values.emoji,
        settings: hostSettings,
      });
      setStoredPlayerPreferences({
        name: player.name,
        color: player.color,
        emoji: player.emoji,
      });
      localStorage.setItem("playerId", player.id);
      localStorage.setItem(`playerId:${room.code}`, player.id);
      router.push(`/room/${room.code}`);
    } catch (issue) {
      console.error(issue);
      setError(issue instanceof Error ? issue.message : "Failed to create room");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-page">
      <EntryProfileForm
        bannerLabel={GAME?.name}
        error={error}
        initialColor={defaults.color}
        initialEmoji={defaults.emoji}
        initialName={defaults.name}
        loading={loading}
        onSubmit={handleCreateRoom}
        submitLabel="Create"
        title={`Create ${GAME?.shortName ?? "Game"} Room`}
      />
    </main>
  );
}
