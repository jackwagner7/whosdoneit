"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBanner } from "@/components/app-banner";
import { PartyGamesInfoSheet } from "@/components/party-games-info-sheet";
import { GAME_CATALOG } from "@/lib/game-catalog";
import { getRoomDirectoryEntryByCode } from "@/lib/room-directory";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-config";

type GameSlug = "whosdoneit" | "sayless";
type TitleWord = {
  emoji: string;
};

const TITLE_EMOJI_OPTIONS: Array<{ emojis: string[] }> = [
  { emojis: ["⚡", "💨", "🚀", "✨", "🌟", "🔥", "💥", "⏱️", "⏳"] },
  { emojis: ["🎉", "🥳", "🎊", "🎈", "🪩", "🎵", "🍕", "🍿", "🙌"] },
  { emojis: ["🕹️", "🎮", "👾", "🪙", "🏆", "🎯", "🧩", "🌈", "🎪", "🎲", "🎟️"] },
];

function getRandomTitleWords(): TitleWord[] {
  return TITLE_EMOJI_OPTIONS.map((word) => ({
    emoji: word.emojis[Math.floor(Math.random() * word.emojis.length)] ?? "",
  }));
}

export default function Home() {
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [titleWords, setTitleWords] = useState<TitleWord[]>(
    TITLE_EMOJI_OPTIONS.map((word) => ({ emoji: word.emojis[0] ?? "" })),
  );
  const router = useRouter();

  useEffect(() => {
    setTitleWords(getRandomTitleWords());
  }, []);

  function handleCreateClick(gameSlug: GameSlug) {
    router.push(`/create/${gameSlug}`);
  }

  async function handleJoinSubmit() {
    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    setJoinLoading(true);
    setJoinError(null);

    try {
      const room = await getRoomDirectoryEntryByCode(normalizedCode);
      if (!room) {
        setJoinError("Room not found.");
        return;
      }

      router.push(`/room/${normalizedCode}`);
    } catch (issue) {
      setJoinError(issue instanceof Error ? issue.message : "Could not find room.");
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <main className="app-page">
      <div className="app-page-card app-page-card-mobile-fill flex h-[100svh] max-h-[100svh] flex-col overflow-hidden sm:h-[80vh] sm:max-h-[80vh]">
        <AppBanner
          label={SITE_NAME}
          rightAction={{
            label: "About Quick Party Arcade",
            icon: "info",
            onClick: () => setInfoOpen(true),
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-6 pt-6 text-center">
          <section className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1 overflow-y-auto pb-1">
              <div className="grid gap-3">
                <div className="text-center">
                  <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
                    {titleWords.map((word, index) => (
                      <span key={`${word.emoji}-${index}`}>
                        {word.emoji}{" "}
                      </span>
                    ))}
                  </h1>
                  <p className="mt-2 text-sm font-medium text-slate-600 sm:text-base">
                    {SITE_TAGLINE}
                  </p>
                </div>
                {GAME_CATALOG.map((game) => (
                  <button
                    className="rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm transition-transform duration-150 hover:-translate-y-0.5"
                    key={game.slug}
                    onClick={() => handleCreateClick(game.slug as GameSlug)}
                    type="button"
                  >
                    <p className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                      {game.name}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                      {game.description}
                    </p>
                    <p className="mt-4 text-sm font-black uppercase tracking-[0.14em] text-slate-500">
                      Create room
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-auto shrink-0 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-center">
            <p className="mt-2 text-2xl font-black tracking-tight">
              Already playing?
            </p>
            {joinOpen ? (
              <div className="mt-4 grid gap-3">
                <input
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-xl font-semibold uppercase sm:text-2xl"
                  maxLength={8}
                  onChange={(event) => {
                    setJoinCode(event.target.value.toUpperCase());
                    if (joinError) {
                      setJoinError(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleJoinSubmit();
                    }
                  }}
                  placeholder="Room Code"
                  value={joinCode}
                />
                <button
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-center text-xl font-bold sm:text-2xl"
                  disabled={joinLoading || !joinCode.trim()}
                  onClick={() => void handleJoinSubmit()}
                  type="button"
                >
                  {joinLoading ? "Joining..." : "Join Room"}
                </button>
                {joinError ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                    {joinError}
                  </p>
                ) : null}
              </div>
            ) : (
              <button
                className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-center text-xl font-bold sm:text-2xl"
                onClick={() => setJoinOpen(true)}
                type="button"
              >
                Join Room
              </button>
            )}
          </section>
        </div>
        <PartyGamesInfoSheet onClose={() => setInfoOpen(false)} open={infoOpen} />
      </div>
    </main>
  );
}
