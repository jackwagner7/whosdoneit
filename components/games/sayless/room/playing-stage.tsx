"use client";

import { useEffect, useState } from "react";
import { SwipeCard } from "@/components/games/sayless/room/swipe-card";
import type { SayLessPlayer, SayLessRoomCard } from "@/types/sayless";

type PlayingStageProps = {
  activePlayer: SayLessPlayer | null;
  activeTeamName: string;
  deadlineAt: string | null;
  meIsActive: boolean;
  sameTeamAsActive: boolean;
  turnStarted: boolean;
  card: SayLessRoomCard | null;
  roundNumber: number;
  roundCount: number;
  remainingCards: number;
  totalCards: number;
  teamScores: Array<{ label: string; score: number }>;
  busy: boolean;
  onStartTurn: () => Promise<void>;
  onPass: () => Promise<void>;
  onCorrect: () => Promise<void>;
};

export function PlayingStage({
  activePlayer,
  activeTeamName,
  deadlineAt,
  meIsActive,
  sameTeamAsActive,
  turnStarted,
  card,
  roundNumber,
  roundCount,
  remainingCards,
  totalCards,
  teamScores,
  busy,
  onStartTurn,
  onPass,
  onCorrect,
}: PlayingStageProps) {
  const [now, setNow] = useState<number | null>(null);
  const secondsLeft =
    deadlineAt && now !== null
      ? Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 1000))
      : null;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [deadlineAt]);

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
      <header className="shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="stage-heading">Round {roundNumber}</p>
            <p className="stage-subheading mt-1">
              {activePlayer
                ? `${activePlayer.name} is up for ${activeTeamName}.`
                : "Waiting for the next turn to start."}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              Timer
            </p>
            <p className="text-2xl font-black text-slate-950">
              {turnStarted ? (secondsLeft === null ? "..." : `${secondsLeft}s`) : "Ready"}
            </p>
          </div>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            Cards left
          </p>
          <p className="mt-1 text-2xl font-black text-slate-950">
            {remainingCards}/{totalCards}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            Rounds
          </p>
          <p className="mt-1 text-2xl font-black text-slate-950">
            {roundNumber}/{roundCount}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {teamScores.map((team) => (
          <div
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
            key={team.label}
          >
            {team.label}: {team.score}
          </div>
        ))}
      </div>

      {meIsActive && !turnStarted ? (
        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-6">
          <p className="text-lg font-black text-slate-950">Your turn is queued.</p>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
            Hit start when your team is ready. The timer begins as soon as the first card appears.
          </p>
          <button
            className="mt-4 rounded-2xl bg-black px-4 py-3 text-base font-bold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void onStartTurn()}
            type="button"
          >
            {busy ? "..." : "Start"}
          </button>
        </div>
      ) : null}

      {meIsActive && turnStarted && card ? (
        <div className="mt-5 flex min-h-0 flex-1">
          <SwipeCard
            busy={busy}
            key={card.id}
            description={card.card.description}
            leftHint="Pass"
            leftLabel="Pass"
            onSwipeLeft={onPass}
            onSwipeRight={onCorrect}
            points={card.card.points}
            rightHint="Got it!"
            rightLabel="Got it!"
            title={card.card.title}
          />
        </div>
      ) : null}

      {!meIsActive ? (
        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-6">
          <p className="text-lg font-black text-slate-950">
            {sameTeamAsActive ? "Your team is guessing." : "Listen only."}
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
            {activePlayer
              ? sameTeamAsActive
                ? `${activePlayer.name} is clueing. Only teammates on ${activeTeamName} should call out guesses.`
                : `${activePlayer.name} is clueing for ${activeTeamName}. Your job is to listen to the cards, not guess.`
              : "Waiting for the room to advance the turn."}
          </p>
        </div>
      ) : null}

      {meIsActive && turnStarted && !card ? (
        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-6">
          <p className="text-lg font-black text-slate-950">Loading your next card...</p>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
            Stay ready. The next prompt is on the way.
          </p>
        </div>
      ) : null}
    </section>
  );
}
