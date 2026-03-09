"use client";

import { PlayerBox } from "@/components/player-box";
import type { Player } from "@/types/games";

type FinishedStageProps = {
  players: Player[];
  isHost: boolean;
  busy: boolean;
  onPlayAgain: () => Promise<void>;
};

function placementRowClass(place: number) {
  if (place === 1) return "border-amber-300 bg-amber-100";
  if (place === 2) return "border-slate-300 bg-slate-100";
  if (place === 3) return "border-orange-300 bg-orange-100";
  return "border-slate-200 bg-white";
}

function placementRowPaddingClass(place: number) {
  return place >= 4 ? "px-2 py-2" : "px-3 py-3";
}

function placementSizeClass(place: number) {
  if (place === 1) return "text-3xl sm:text-4xl";
  if (place <= 3) return "text-2xl sm:text-3xl";
  return "text-xl sm:text-2xl";
}

function playerBoxSizeClass(place: number) {
  if (place === 1) return "player-box-result-first";
  if (place >= 4) return "player-box-result-other";
  return "";
}

function buildPlacementRows(players: Player[]) {
  let previousScore: number | null = null;
  let previousPlace = 1;

  return players.map((player, index) => {
    if (index === 0) {
      previousScore = player.score;
      previousPlace = 1;
      return { player, place: 1 };
    }

    if (previousScore !== null && player.score < previousScore) {
      previousPlace = index + 1;
      previousScore = player.score;
    }

    return { player, place: previousPlace };
  });
}

export function FinishedStage({
  players,
  isHost,
  busy,
  onPlayAgain,
}: FinishedStageProps) {
  const winner = players[0] ?? null;
  const hasSingleWinner =
    winner !== null &&
    players.filter((player) => player.score === winner.score).length === 1;
  const placementRows = buildPlacementRows(players);

  return (
    <section className="card-enter -mx-[var(--card-padding)] flex min-h-0 min-w-0 flex-1 flex-col px-[var(--card-padding)] pb-5 pt-2">
      <header className="shrink-0 flex items-start justify-between gap-2">
        <p className="stage-heading">Final standings</p>
        <p className="stage-subheading">{players.length} players</p>
      </header>
      <h2 className="mt-2 shrink-0 text-3xl font-black">
        {winner && hasSingleWinner
          ? `${winner.name} ${winner.emoji} wins`
          : "Game complete"}
      </h2>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <ol className="grid gap-3">
          {placementRows.map(({ player, place }) => (
            <li
              className={`flex items-center justify-between rounded-2xl border ${placementRowClass(place)} ${placementRowPaddingClass(place)}`}
              key={player.id}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`w-10 shrink-0 text-right font-black text-black ${placementSizeClass(place)}`}
                >
                  {place}.
                </span>
                <PlayerBox
                  className={playerBoxSizeClass(place)}
                  color={player.color}
                  emoji={player.emoji}
                  name={player.name}
                />
              </div>
              <span
                className={`font-black text-black ${placementSizeClass(place)}`}
              >
                {player.score}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {isHost ? (
        <div className="mt-3 shrink-0 border-t border-slate-200 pt-3">
          <button
            className="w-full rounded-2xl bg-black px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void onPlayAgain()}
            type="button"
          >
            {busy ? "..." : "Play Again"}
          </button>
        </div>
      ) : (
        <p className="stage-subheading mt-3 shrink-0 border-t border-slate-200 pt-3 text-center">
          Waiting for host to play again.
        </p>
      )}
    </section>
  );
}
