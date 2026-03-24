"use client";

type SubmissionWaitingStageProps = {
  submittedCount: number;
  totalCount: number;
  phaseLabel: string;
};

export function SubmissionWaitingStage({
  submittedCount,
  totalCount,
  phaseLabel,
}: SubmissionWaitingStageProps) {
  const allSubmitted = totalCount > 0 && submittedCount >= totalCount;

  return (
    <section className="card-enter -mx-[var(--card-padding)] flex min-h-0 min-w-0 flex-1 flex-col px-[var(--card-padding)] pb-5 pt-2">
      <header className="shrink-0">
        <p className="stage-heading">{phaseLabel}</p>
        <p className="stage-subheading mt-1">
          {allSubmitted ? "All submissions are in." : `Waiting for ${phaseLabel.toLowerCase()} submissions.`}
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <p className="text-5xl font-black tabular-nums text-slate-700 sm:text-6xl">
          {Math.min(submittedCount, totalCount)}/{totalCount}
        </p>
        {allSubmitted ? (
          <div className="grid justify-items-center gap-3">
            <div
              aria-hidden="true"
              className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-black"
            />
            <p className="stage-subheading text-center">Loading next stage...</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
