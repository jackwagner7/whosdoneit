"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntryProfileForm } from "@/components/entry-profile-form";
import { joinRoom } from "@/lib/game";
import { getStoredPlayerPreferences } from "@/lib/player-preferences";

export default function JoinPage() {
  const [defaults] = useState(() => getStoredPlayerPreferences());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleJoin(values: {
    name: string;
    color: string;
    emoji: string;
  }) {
    const rawCode = window.prompt("Room code") ?? "";
    const code = rawCode.trim().toUpperCase();
    if (!code || !values.name.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { room, player } = await joinRoom(code, values.name, values.color, values.emoji);
      localStorage.setItem("playerId", player.id);
      localStorage.setItem(`playerId:${room.code}`, player.id);
      router.push(`/room/${room.code}`);
    } catch (issue) {
      console.error(issue);
      setError(issue instanceof Error ? issue.message : "Failed to join room");
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
        onSubmit={handleJoin}
        submitLabel="Join"
        title="Join Room"
      />
    </main>
  );
}
