"use client";

import { CountdownBadge } from "@/components/room/countdown-badge";

type PromptingStageProps = {
  promptText: string;
  promptReady: boolean;
  submittedPromptCount: number;
  playerCount: number;
  roundCount: number;
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
  deadlineAt,
  busy,
  onPromptTextChange,
  onSubmitPrompt,
}: PromptingStageProps) {
  return (
    <section className="card-enter rounded-3xl border border-slate-200 bg-white p-5 pb-28 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          ? Prompt
        </p>
        <CountdownBadge deadlineAt={deadlineAt} prefix="T" />
      </div>
      <textarea
        className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-xl font-semibold outline-none focus:border-black sm:text-2xl"
        maxLength={140}
        onChange={(event) => onPromptTextChange(event.target.value)}
        placeholder="Have you ever..."
        rows={3}
        value={promptText}
      />
      <p className="mt-3 text-sm font-semibold text-slate-600">
        {submittedPromptCount}/{playerCount} submitted
      </p>
      <p className="mt-1 text-xs text-slate-500">
        This game will play {roundCount} round{roundCount === 1 ? "" : "s"}.
      </p>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3">
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
