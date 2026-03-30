"use client";

import { StageHeader } from "@/components/stage-header";

type TeamSummary = {
  teamIndex: number;
  teamName: string;
  color: string;
  roundScore: number;
  totalScore: number;
  topPlayerName: string | null;
  topPlayerScore: number;
  startsNextRound: boolean;
};

type RoundSummaryStageProps = {
  roundNumber: number;
  roundCount: number;
  isFinalRound: boolean;
  summaries: TeamSummary[];
  isHost: boolean;
  busy: boolean;
  onContinue: () => Promise<void>;
};

export function RoundSummaryStage({
  roundNumber,
  roundCount,
  isFinalRound,
  summaries,
  isHost,
  busy,
  onContinue,
}: RoundSummaryStageProps) {
  return (
    <section className="card-enter flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
      <StageHeader
        description={
          isFinalRound
            ? "Final round complete. Check totals before locking the results."
            : "Lowest total score starts the next round."
        }
        title={`Round ${roundNumber} Scores`}
        trackingItems={[{ label: "Rounds", value: `${roundNumber}/${roundCount}` }]}
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
                  Team {team.teamIndex + 1}
                </p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">{team.teamName}</h3>
              </div>
              {team.startsNextRound && !isFinalRound ? (
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-white">
                  Starts next
                </span>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  This round
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">{team.roundScore}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  Total
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">{team.totalScore}</p>
              </div>
            </div>

            <p className="mt-4 text-sm font-medium text-slate-600">
              Top player:{" "}
              <span className="font-black text-slate-900">
                {team.topPlayerName ? `${team.topPlayerName} (${team.topPlayerScore})` : "None yet"}
              </span>
            </p>
          </article>
        ))}
      </div>

      {isHost ? (
        <button
          className="mt-4 rounded-2xl bg-black px-4 py-4 text-base font-bold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void onContinue()}
          type="button"
        >
          {busy ? "..." : isFinalRound ? "Lock final results" : `Start round ${Math.min(roundNumber + 1, roundCount)}`}
        </button>
      ) : (
        <p className="mt-4 text-sm font-semibold text-slate-500">
          Waiting for the host to continue.
        </p>
      )}
    </section>
  );
}
