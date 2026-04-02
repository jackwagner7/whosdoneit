"use client";

import { useEffect, useRef, useState } from "react";
import { CountdownBadge } from "@/components/countdown-badge";
import { StageMetaBar } from "@/components/games/whosdoneit/room/stage-meta-bar";
import { StageFooter } from "@/components/stage-footer";
import { StageShell } from "@/components/stage-shell";

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
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    setDraftAnswer(answer);
  }, [answer]);

  useEffect(() => {
    autoSubmittedRef.current = false;
  }, [deadlineAt]);

  useEffect(() => {
    if (!deadlineAt || autoSubmittedRef.current) {
      return;
    }

    const triggerAutoSubmit = () => {
      if (autoSubmittedRef.current || busy) {
        return;
      }

      autoSubmittedRef.current = true;
      void onSubmit(typeof draftAnswer === "boolean" ? draftAnswer : false);
    };

    const remainingMs = new Date(deadlineAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      triggerAutoSubmit();
      return;
    }

    const timeout = window.setTimeout(triggerAutoSubmit, remainingMs + 50);
    return () => window.clearTimeout(timeout);
  }, [busy, deadlineAt, draftAnswer, onSubmit]);

  return (
    <StageShell>
      <StageMetaBar
        deadlineAt={null}
        trackingItems={[
          { label: "Submitted", value: `${confessionCount}/${expectedConfessions}` },
        ]}
        title="Confessional"
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
      <StageFooter>
        <button
          className="grid w-full grid-cols-[4.75rem_1fr_4.75rem] items-stretch overflow-hidden rounded-2xl bg-black text-xl font-bold text-white disabled:opacity-60"
          disabled={busy || typeof draftAnswer !== "boolean"}
          onClick={() => {
            if (typeof draftAnswer === "boolean") {
              void onSubmit(draftAnswer);
            }
          }}
          type="button"
        >
          <span aria-hidden="true" />
          <span className="flex items-center justify-center px-4 py-3 text-center">
            {busy ? "..." : "Submit"}
          </span>
          {!busy ? (
            <CountdownBadge deadlineAt={deadlineAt} variant="button-dark" />
          ) : (
            <span aria-hidden="true" className="border-l border-white/20" />
          )}
        </button>
      </StageFooter>
    </StageShell>
  );
}
