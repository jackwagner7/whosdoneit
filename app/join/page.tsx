"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBanner } from "@/components/app-banner";
import { EntryProfileForm } from "@/components/entry-profile-form";
import {
  getDefaultPlayerPreferences,
  hasStoredPlayerPreferences,
  getStoredPlayerPreferences,
  setStoredPlayerPreferences,
} from "@/lib/player-preferences";
import { joinRoomByCode } from "@/lib/room-directory";
import { SITE_NAME } from "@/lib/site-config";

export default function JoinPage() {
  const [defaults, setDefaults] = useState(() => getDefaultPlayerPreferences());
  const [initialCode, setInitialCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsProfile, setNeedsProfile] = useState<boolean | null>(null);
  const attemptedAutoJoinRef = useRef(false);
  const router = useRouter();

  const handleJoin = useCallback(
    async (values: {
      code: string;
      name: string;
      color: string;
      emoji: string;
    }) => {
      const code = values.code.trim().toUpperCase();
      if (!code || !values.name.trim()) {
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { room, player } = await joinRoomByCode(
          code,
          values.name,
          values.color,
          values.emoji,
        );
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
        setError(issue instanceof Error ? issue.message : "Failed to join room");
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const code =
      new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase() ?? "";
    const storedPreferences = getStoredPlayerPreferences();
    setDefaults(storedPreferences);
    setInitialCode(code);

    if (!hasStoredPlayerPreferences()) {
      setNeedsProfile(true);
      return;
    }

    if (!code) {
      setNeedsProfile(true);
      return;
    }

    if (attemptedAutoJoinRef.current) {
      return;
    }

    attemptedAutoJoinRef.current = true;
    void handleJoin({
      code,
      name: storedPreferences.name,
      color: storedPreferences.color,
      emoji: storedPreferences.emoji,
    });
  }, [handleJoin]);

  return (
    <main className="app-page">
      {needsProfile === true ? (
        <EntryProfileForm
          bannerLabel={SITE_NAME}
          error={error}
          initialCode={initialCode}
          initialColor={defaults.color}
          initialEmoji={defaults.emoji}
          initialName={defaults.name}
          loading={loading}
          onSubmit={handleJoin}
          showCodeInput={!initialCode}
          submitLabel="Join"
          title="Join Room"
        />
      ) : (
        <div className="app-page-card app-page-card-wide app-page-card-mobile-fill flex flex-col">
              <AppBanner label={SITE_NAME} />
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm font-semibold text-slate-600">
              {needsProfile === null ? "Loading..." : "Joining room..."}
            </p>
          </div>
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}
