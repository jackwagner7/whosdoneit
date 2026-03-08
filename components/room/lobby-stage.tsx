"use client";

type LobbyStageProps = {
  promptText: string;
  promptReady: boolean;
  submittedPromptCount: number;
  playerCount: number;
  busy: boolean;
  canStart: boolean;
  onPromptTextChange: (value: string) => void;
  onSubmitPrompt: () => Promise<void>;
  onStart: () => Promise<void>;
};

export function LobbyStage({
  promptText,
  promptReady,
  submittedPromptCount,
  playerCount,
  busy,
  canStart,
  onPromptTextChange,
  onSubmitPrompt,
  onStart,
}: LobbyStageProps) {
  return (
    <section className="card-enter rounded-3xl border border-slate-200 bg-white p-5 pb-28 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">? Prompt</p>
      <textarea
        className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-xl font-semibold outline-none focus:border-violet-500 sm:text-2xl"
        maxLength={140}
        onChange={(event) => onPromptTextChange(event.target.value)}
        placeholder="Have you ever..."
        rows={3}
        value={promptText}
      />
      <p className="mt-3 text-sm font-semibold text-slate-600">
        {submittedPromptCount}/{playerCount} ready
      </p>
      {!canStart ? (
        <p className="mt-1 text-xs text-slate-500">Need 3-10 players and one prompt each.</p>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white/95 p-3">
        <button
          className="rounded-2xl bg-violet-600 px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
          disabled={!promptText.trim() || busy}
          onClick={() => void onSubmitPrompt()}
          type="button"
        >
          {busy ? "..." : promptReady ? "Update" : "Submit"}
        </button>
        <button
          className="rounded-2xl bg-slate-900 px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
          disabled={!canStart || busy}
          onClick={() => void onStart()}
          type="button"
        >
          {busy ? "..." : "Start"}
        </button>
      </div>
    </section>
  );
}
