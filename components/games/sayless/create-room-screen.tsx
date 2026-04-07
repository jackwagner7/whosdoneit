"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EntryProfileForm } from "@/components/entry-profile-form";
import { RoomLoadingScreen } from "@/components/room-loading-screen";
import { getGameBySlug } from "@/lib/game-catalog";
import { createRoom, getRecommendedCardsPerPlayer } from "@/lib/games/sayless/game";
import {
  getDefaultHostSettings,
  getStoredHostSettings,
} from "@/lib/games/sayless/host-settings-preferences";
import {
  getDefaultPlayerPreferences,
  hasStoredPlayerPreferences,
  getStoredPlayerPreferences,
  setStoredPlayerPreferences,
} from "@/lib/player-preferences";

const GAME = getGameBySlug("sayless");

export function SayLessCreateRoomScreen() {
  const [defaults, setDefaults] = useState(() => getDefaultPlayerPreferences());
  const [hostSettings, setHostSettings] = useState(() => getDefaultHostSettings());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsProfile, setNeedsProfile] = useState<boolean | null>(null);
  const attemptedAutoCreateRef = useRef(false);
  const router = useRouter();

  const getRecommendedHostSettings = useCallback(
    () => ({
      ...hostSettings,
      cardsPerPlayer: getRecommendedCardsPerPlayer(1),
    }),
    [hostSettings],
  );

  const handleCreateRoom = useCallback(
    async (values: {
      name: string;
      color: string;
      emoji: string;
    }) => {
      if (!values.name.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const recommendedSettings = getRecommendedHostSettings();
        const { room, player } = await createRoom(values.name.trim(), {
          playerColor: values.color,
          playerEmoji: values.emoji,
          settings: recommendedSettings,
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
    },
    [getRecommendedHostSettings, router],
  );

  useEffect(() => {
    const storedPreferences = getStoredPlayerPreferences();
    const storedHostSettings = getStoredHostSettings();
    setDefaults(storedPreferences);
    setHostSettings({
      ...storedHostSettings,
      cardsPerPlayer: getRecommendedCardsPerPlayer(1),
    });

    if (!hasStoredPlayerPreferences()) {
      setNeedsProfile(true);
      return;
    }

    if (attemptedAutoCreateRef.current) {
      return;
    }

    attemptedAutoCreateRef.current = true;
    setLoading(true);
    setError(null);

    const recommendedSettings = {
      ...storedHostSettings,
      cardsPerPlayer: getRecommendedCardsPerPlayer(1),
    };

    void createRoom(storedPreferences.name.trim(), {
      playerColor: storedPreferences.color,
      playerEmoji: storedPreferences.emoji,
      settings: recommendedSettings,
    })
      .then(({ room, player }) => {
        setStoredPlayerPreferences({
          name: player.name,
          color: player.color,
          emoji: player.emoji,
        });
        localStorage.setItem("playerId", player.id);
        localStorage.setItem(`playerId:${room.code}`, player.id);
        router.push(`/room/${room.code}`);
      })
      .catch((issue) => {
        console.error(issue);
        setError(issue instanceof Error ? issue.message : "Failed to create room");
        setNeedsProfile(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  if (needsProfile !== true) {
    return (
      <RoomLoadingScreen
        message={needsProfile === null ? "Loading your setup..." : "Creating your room..."}
      />
    );
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
