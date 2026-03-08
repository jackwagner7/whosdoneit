"use client";

import { PlayerBox } from "@/components/player-box";
import type { Player } from "@/types/games";

type LobbyStageProps = {
  players: Player[];
  busy: boolean;
  canStart: boolean;
  isHost: boolean;
  onStart: () => Promise<void>;
};

export function LobbyStage({
  players,
  busy,
  canStart,
  isHost,
  onStart,
}: LobbyStageProps) {
  return (
    <section className="card-enter flex flex-1 flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Lobby
        </p>
        <p className="text-sm font-semibold text-slate-600">{players.length} players</p>
      </div>

      {!canStart ? (
        <p className="mt-1 text-xs text-slate-500">Need at least 2 players to start.</p>
      ) : null}

      <ul className="mt-4 grid gap-3">
        {players.map((player) => (
          <li className="flex items-center justify-center" key={player.id}>
            <PlayerBox
              className="min-w-[10rem]"
              color={player.color}
              emoji={player.emoji}
              name={player.name}
            />
          </li>
        ))}
      </ul>

      {isHost ? (
        <div className="mt-auto border-t border-slate-200 pt-3">
          <button
            className="w-full rounded-2xl bg-black px-5 py-3 text-xl font-bold text-white disabled:opacity-50 sm:text-2xl"
            disabled={!canStart || busy}
            onClick={() => void onStart()}
            type="button"
          >
            {busy ? "..." : "Start"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm font-semibold text-slate-500">Waiting for host to start.</p>
      )}
    </section>
  );
}
