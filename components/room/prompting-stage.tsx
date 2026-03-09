"use client";

import { StageMetaBar } from "@/components/room/stage-meta-bar";

const QUICK_PROMPTS = [
  "Have you ever ghosted a group chat?",
  "Have you ever blamed traffic when you were late?",
  "Have you ever pretended to watch a show you never saw?",
];

type PromptingStageProps = {
  promptText: string;
  promptReady: boolean;
  submittedPromptCount: number;
  playerCount: number;
  roundCount: number;
  currentRoundNumber: number;
  deadlineAt: string | null;
  busy: boolean;
  onPromptTextChange: (value: string) => void;
  onSubmitPrompt: () => Promise<void>;
};

export function PromptingStage({
  promptText,
  promptReady,
  submittedPromptCount,
  playerCount,
  roundCount,
  currentRoundNumber,
  deadlineAt,
  busy,
  onPromptTextChange,
  onSubmitPrompt,
}: PromptingStageProps) {
  return (
    <section className="card-enter -mx-[var(--card-padding)] flex min-h-0 min-w-0 flex-1 flex-col px-[var(--card-padding)] pb-5 pt-2">
      <StageMetaBar
        deadlineAt={deadlineAt}
        submittedCount={submittedPromptCount}
        title="Prompt"
        totalCount={playerCount}
      />
      <p className="stage-subheading mt-1">
        Write one short prompt everyone can answer yes or no.
      </p>
      {roundCount > 1 ? (
        <p className="mt-1 text-xs text-slate-500">
          Round {Math.min(currentRoundNumber, roundCount)}/{roundCount}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <div className="w-full max-w-2xl">
          <input
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg font-semibold outline-none focus:border-black sm:text-xl"
            maxLength={140}
            onChange={(event) => onPromptTextChange(event.target.value)}
            placeholder="Have you ever..."
            type="text"
            value={promptText}
          />
        </div>
        <div className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-2">
          {QUICK_PROMPTS.map((quickPrompt) => (
            <button
              key={quickPrompt}
              className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-black disabled:opacity-60"
              disabled={busy}
              onClick={() => onPromptTextChange(quickPrompt)}
              type="button"
            >
              {quickPrompt}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 shrink-0 border-t border-slate-200 pt-3">
        <button
          className="w-full rounded-2xl bg-black px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
          disabled={!promptText.trim() || busy}
          onClick={() => void onSubmitPrompt()}
          type="button"
        >
          {busy ? "..." : promptReady ? "Update prompt" : "Submit prompt"}
        </button>
      </div>
    </section>
  );
}
