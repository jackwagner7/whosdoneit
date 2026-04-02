"use client";

import {
  PlayerWaitingPanel,
  type WaitingPlayerItem,
} from "@/components/player-waiting-panel";
import { StageShell } from "@/components/stage-shell";
import { StageHeader } from "@/components/stage-header";

type SubmissionWaitingStageProps = {
  submittedCount: number;
  totalCount: number;
  phaseLabel: string;
  waitingPlayers: WaitingPlayerItem[];
};

export function SubmissionWaitingStage({
  submittedCount,
  totalCount,
  phaseLabel,
  waitingPlayers,
}: SubmissionWaitingStageProps) {
  const allSubmitted = totalCount > 0 && submittedCount >= totalCount;

  return (
    <StageShell>
      <StageHeader
        description={allSubmitted ? "All submissions are in." : undefined}
        title={phaseLabel}
        trackingItems={[
          { label: "Submitted", value: `${Math.min(submittedCount, totalCount)}/${totalCount}` },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        {allSubmitted ? (
          <div className="grid justify-items-center gap-3">
            <div
              aria-hidden="true"
              className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-black"
            />
            <p className="stage-subheading text-center">Loading next stage...</p>
          </div>
        ) : (
          <PlayerWaitingPanel
            label="Waiting for:"
            players={waitingPlayers}
            emptyMessage={`Waiting for ${phaseLabel.toLowerCase()} submissions.`}
          />
        )}
      </div>
    </StageShell>
  );
}
