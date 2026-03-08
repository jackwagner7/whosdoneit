"use client";

import Link from "next/link";
import type { Player } from "@/types/games";

type FinishedStageProps = {
  players: Player[];
};

export function FinishedStage({ players }: FinishedStageProps) {
  const winner = players[0] ?? null;

  return (
    <section className="card-enter rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">= Done</p>
      <h2 className="mt-2 text-3xl font-black">
        {winner ? `${winner.name} ${winner.emoji} wins` : "Game complete"}
      </h2>
      <ol className="mt-3 grid gap-2">
        {players.map((player, index) => (
          <li
            className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-lg"
            key={player.id}
          >
            <span className="font-bold" style={{ color: player.color }}>
              {index + 1}. {player.name} {player.emoji}
            </span>
            <span className="font-black">{player.score}</span>
          </li>
        ))}
      </ol>
      <Link className="mt-4 inline-block text-sm font-semibold underline" href="/">
        New room
      </Link>
    </section>
  );
}
