"use client";

import { useEffect, useState } from "react";
import { StageMetaBar } from "@/components/room/stage-meta-bar";

type AnsweringStageProps = {
  prompt: string;
  answer: boolean | undefined;
  confessionCount: number;
  expectedConfessions: number;
  deadlineAt: string | null;
  busy: boolean;
  onSubmit: (value: boolean) => Promise<void>;
};

function buttonStyle(active: boolean, tone: "yes" | "no") {
  if (active) {
    return `h-36 w-full rounded-2xl border text-3xl font-black tracking-[0.08em] transition sm:h-44 sm:text-4xl ${
      tone === "yes"
        ? "border-rose-200 bg-rose-100 text-rose-800"
        : "border-sky-200 bg-sky-100 text-sky-800"
    }`;
  }

  return "h-36 w-full rounded-2xl border border-slate-300 bg-white text-3xl font-black tracking-[0.08em] text-slate-700 transition sm:h-44 sm:text-4xl";
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
    <section className="card-enter -mx-[var(--card-padding)] flex min-h-0 min-w-0 flex-1 flex-col px-[var(--card-padding)] pb-5 pt-2">
      <StageMetaBar
        deadlineAt={deadlineAt}
        submittedCount={confessionCount}
        title="Confessional"
        totalCount={expectedConfessions}
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <p className="mt-6 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-center text-xl font-black text-slate-900 sm:text-2xl">
          {prompt}
        </p>
        <div className="mt-8 grid w-full max-w-sm grid-cols-2 gap-3">
          <button
            className={buttonStyle(draftAnswer === false, "no")}
            disabled={busy}
            onClick={() => setDraftAnswer(false)}
            type="button"
          >
            NO
          </button>
          <button
            className={buttonStyle(draftAnswer === true, "yes")}
            disabled={busy}
            onClick={() => setDraftAnswer(true)}
            type="button"
          >
            YES
          </button>
        </div>
      </div>
      <div className="mt-3 shrink-0 border-t border-slate-200 pt-3">
        <button
          className="w-full rounded-2xl bg-black px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
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
