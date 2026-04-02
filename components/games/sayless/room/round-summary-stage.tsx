"use client";

import { PlayerBox } from "@/components/player-box";
import { StageFooter } from "@/components/stage-footer";
import { StageShell } from "@/components/stage-shell";
import { StageHeader } from "@/components/stage-header";
import type { SayLessPlayer } from "@/types/sayless";

type TeamRoundScore = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  roundScore: number;
};

type TeamSummary = {
  teamIndex: number;
  teamName: string;
  color: string;
  background: string;
  players: TeamRoundScore[];
  roundTotal: number;
  rounds: number[];
  total: number;
};

type RoundSummaryStageProps = {
  roundNumber: number;
  roundCount: number;
  summaries: TeamSummary[];
  hostPlayer: SayLessPlayer | null;
  isHost: boolean;
  busy: boolean;
  onContinue: () => Promise<void>;
};

function TeamRoundSummaryTable({
  team,
}: {
  team: TeamSummary;
}) {
  return (
    <article
      className="rounded-3xl border-2 px-5 py-4"
      style={{ borderColor: team.color, backgroundColor: team.background }}
    >
      <h3 className="text-center text-xl font-black text-slate-950 sm:text-2xl">{team.teamName}</h3>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white/70">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {team.players.map((player) => (
              <tr className="border-t border-slate-200 first:border-t-0" key={player.id}>
                <td className="px-4 py-2">
                  <PlayerBox
                    className="player-box-mini"
                    color={player.color}
                    emoji={player.emoji}
                    name={player.name}
                  />
                </td>
                <td className="px-4 py-2.5 text-right font-black text-slate-950">
                  {player.roundScore}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <table className="w-full table-fixed border-collapse text-sm font-black text-slate-950">
          <thead className="text-[0.72rem] font-black uppercase tracking-[0.12em] text-slate-600">
            <tr>
              {team.rounds.map((_, index) => (
                <th className="px-0.5 py-0.5 text-center" key={index}>
                  R{index + 1}
                </th>
              ))}
              <th className="px-0.5 py-0.5 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {team.rounds.map((score, index) => (
                <td className="px-0.5 py-0.5 text-center text-base" key={index}>
                  {score}
                </td>
              ))}
              <td className="px-0.5 py-0.5 text-center text-base">
                {team.total}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function RoundSummaryStage({
  roundNumber,
  roundCount,
  summaries,
  hostPlayer,
  isHost,
  busy,
  onContinue,
}: RoundSummaryStageProps) {
  return (
    <StageShell>
      <StageHeader
        title={`Round ${roundNumber} Scores`}
        trackingItems={[{ label: "Rounds", value: `${roundNumber}/${roundCount}` }]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mt-4 grid gap-3">
          {summaries.map((team) => (
            <TeamRoundSummaryTable
              key={team.teamIndex}
              team={team}
            />
          ))}
        </div>
      </div>

      {isHost ? (
        <StageFooter>
          <button
            className="w-full rounded-2xl bg-black px-4 py-4 text-base font-bold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void onContinue()}
            type="button"
          >
            {busy ? "..." : "Continue"}
          </button>
        </StageFooter>
      ) : (
        <StageFooter>
          <div className="flex min-h-[3.5rem] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3">
            {hostPlayer ? (
              <PlayerBox color={hostPlayer.color} emoji={hostPlayer.emoji} name={hostPlayer.name} />
            ) : (
              <span className="stage-subheading !text-lg text-slate-600">Waiting for host.</span>
            )}
          </div>
        </StageFooter>
      )}
    </StageShell>
  );
}
