"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntryProfileForm } from "@/components/entry-profile-form";
import { createRoom } from "@/lib/game";
import {
  getStoredPlayerPreferences,
  setStoredPlayerPreferences,
} from "@/lib/player-preferences";

export default function HostPage() {
  const [defaults] = useState(() => getStoredPlayerPreferences());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
        error={error}
        initialColor={defaults.color}
        initialEmoji={defaults.emoji}
        initialName={defaults.name}
        loading={loading}
        onSubmit={handleCreateRoom}
        submitLabel="Create"
        title="Create Room"
      />
    </main>
  );
}
