"use client";

import { PlayerBox } from "@/components/player-box";
import { StageFooter, StageFooterMessage } from "@/components/stage-footer";
import { StageHeader } from "@/components/stage-header";
import { StageShell } from "@/components/stage-shell";
import type { Player } from "@/types/whosdoneit";

type LeaderboardStageProps = {
  players: Player[];
  myPlayerId: string;
  hasNextRound: boolean;
  questionNumber: number;
  totalQuestions: number;
  busy: boolean;
  isHost: boolean;
  onContinue: () => Promise<void>;
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

export function LeaderboardStage({
  players,
  myPlayerId,
  hasNextRound,
  questionNumber,
  totalQuestions,
  busy,
  isHost,
  onContinue,
}: LeaderboardStageProps) {
  const placementRows = buildPlacementRows(players);

  return (
    <StageShell>
      <StageHeader
        title="Standings"
        trackingItems={[
          { label: "Players", value: `${players.length}` },
          { label: "Question", value: `${questionNumber}/${totalQuestions}` },
        ]}
      />
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
                {player.id === myPlayerId ? (
                  <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-600">
                    You
                  </span>
                ) : null}
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
        <StageFooter>
          <button
            className="w-full rounded-2xl bg-black px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void onContinue()}
            type="button"
          >
            {busy ? "..." : hasNextRound ? "Next" : "Final standings"}
          </button>
        </StageFooter>
      ) : (
        <StageFooterMessage>Waiting for host</StageFooterMessage>
      )}
    </StageShell>
  );
}
