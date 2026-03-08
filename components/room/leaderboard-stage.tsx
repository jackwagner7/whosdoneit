"use client";

import type { Player } from "@/types/games";

type LeaderboardStageProps = {
  players: Player[];
  myPlayerId: string;
  hasNextRound: boolean;
  busy: boolean;
  onContinue: () => Promise<void>;
};

export function LeaderboardStage({
  players,
  myPlayerId,
  hasNextRound,
  busy,
  onContinue,
}: LeaderboardStageProps) {
  return (
    <section className="card-enter rounded-3xl border border-slate-200 bg-white p-5 pb-28 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">+ Scores</p>
      <ol className="mt-3 grid gap-2">
        {players.map((player, index) => (
          <li
            className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-lg"
            key={player.id}
          >
            <span className="font-bold" style={{ color: player.color }}>
              {index + 1}. {player.name}
              {" "}
              {player.emoji}
              {player.id === myPlayerId ? " (you)" : ""}
            </span>
            <span className="font-black">{player.score}</span>
          </li>
        ))}
      </ol>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3">
        <button
          className="w-full rounded-2xl bg-black px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
          disabled={busy}
          onClick={() => void onContinue()}
          type="button"
        >
          {busy ? "..." : hasNextRound ? "Next" : "Finish"}
        </button>
      </div>
    </section>
  );
}
