"use client";

import { PlayerBox } from "@/components/player-box";
import { StageFooter, StageFooterMessage } from "@/components/stage-footer";
import { StageShell } from "@/components/stage-shell";
import { StageHeader } from "@/components/stage-header";
import type { SayLessPlayer } from "@/types/sayless";

type TeamSummary = {
  teamIndex: number;
  teamName: string;
  color: string;
  totalScore: number;
  topPlayerName: string | null;
  topPlayerScore: number;
};

type FinishedStageProps = {
  summaries: TeamSummary[];
  hostPlayer: SayLessPlayer | null;
  isHost: boolean;
  isTeamless?: boolean;
  busy: boolean;
  onPlayAgain: () => Promise<void>;
};

export function FinishedStage({
  summaries,
  hostPlayer,
  isHost,
  isTeamless = false,
  busy,
  onPlayAgain,
}: FinishedStageProps) {
  return (
    <StageShell className="overflow-y-auto">
      <StageHeader
        description="The full deck is cleared. Totals stay visible here until the host resets to the lobby."
        title="Final Results"
      />

      <div className="mt-4 grid gap-3">
        {summaries.map((team) => (
          <article
            className="rounded-3xl border-2 bg-white px-5 py-4"
            key={team.teamIndex}
            style={{ borderColor: team.color }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  {isTeamless ? "Player" : `Team ${team.teamIndex + 1}`}
                </p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">{team.teamName}</h3>
              </div>
              <p className="text-3xl font-black text-slate-950">{team.totalScore}</p>
            </div>

            {!isTeamless ? (
              <p className="mt-4 text-sm font-medium text-slate-600">
                Top player:{" "}
                <span className="font-black text-slate-900">
                  {team.topPlayerName ? `${team.topPlayerName} (${team.topPlayerScore})` : "None yet"}
                </span>
              </p>
            ) : null}
          </article>
        ))}
      </div>

      {isHost ? (
        <StageFooter>
          <button
            className="w-full rounded-2xl bg-black px-4 py-4 text-base font-bold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void onPlayAgain()}
            type="button"
          >
            {busy ? "..." : "Back to lobby"}
          </button>
        </StageFooter>
      ) : (
        <StageFooterMessage>
          {hostPlayer ? (
            <PlayerBox color={hostPlayer.color} emoji={hostPlayer.emoji} name={hostPlayer.name} />
          ) : (
            "Waiting for the host to send everyone back to the lobby."
          )}
        </StageFooterMessage>
      )}
    </StageShell>
  );
}
