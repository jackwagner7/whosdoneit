"use client";

import { useEffect, useState } from "react";
import { CountdownBadge } from "@/components/room/countdown-badge";

type AnsweringStageProps = {
  prompt: string;
  answer: boolean | undefined;
  confessionCount: number;
  expectedConfessions: number;
  deadlineAt: string | null;
  busy: boolean;
  onSubmit: (value: boolean) => Promise<void>;
};

function buttonStyle(active: boolean) {
  return `rounded-2xl border px-4 py-3 text-xl font-black transition sm:text-2xl ${
    active
      ? "border-violet-600 bg-violet-600 text-white"
      : "border-slate-300 bg-white text-slate-700"
  }`;
}

export function AnsweringStage({
  prompt,
  answer,
  confessionCount,
  expectedConfessions,
  deadlineAt,
  busy,
  onSubmit,
}: AnsweringStageProps) {
  const [draftAnswer, setDraftAnswer] = useState<boolean | undefined>(answer);

  useEffect(() => {
    setDraftAnswer(answer);
  }, [answer]);

  return (
    <section className="card-enter rounded-3xl border border-slate-200 bg-white p-5 pb-28 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">! Answer</p>
        <CountdownBadge deadlineAt={deadlineAt} prefix="T" />
      </div>
      <p className="mt-3 rounded-2xl bg-violet-50 px-4 py-3 text-xl font-black text-violet-900 sm:text-2xl">
        {prompt}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className={buttonStyle(draftAnswer === true)}
          disabled={busy}
          onClick={() => setDraftAnswer(true)}
          type="button"
        >
          YES
        </button>
        <button
          className={buttonStyle(draftAnswer === false)}
          disabled={busy}
          onClick={() => setDraftAnswer(false)}
          type="button"
        >
          NO
        </button>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-600">
        {confessionCount}/{expectedConfessions}
      </p>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3">
        <button
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
          disabled={busy || typeof draftAnswer !== "boolean"}
          onClick={() => {
            if (typeof draftAnswer === "boolean") {
              void onSubmit(draftAnswer);
            }
          }}
          type="button"
        >
          {busy ? "..." : "Submit answer"}
        </button>
      </div>
    </section>
  );
}
