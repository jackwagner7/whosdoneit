"use client";

import { useEffect, useMemo, useRef } from "react";
import { StageMetaBar } from "@/components/games/whosdoneit/room/stage-meta-bar";
import { StageFooter, StageFooterButton } from "@/components/stage-footer";
import { StageShell } from "@/components/stage-shell";

const QUICK_PROMPT_POOL = [
  "Have you ever ghosted a group chat?",
  "Have you ever blamed traffic when you were late?",
  "Have you ever pretended to watch a show you never saw?",
  "Have you ever laughed at a joke you did not understand?",
  "Have you ever sent a message to the wrong person?",
  "Have you ever eaten breakfast for dinner?",
  "Have you ever stayed up all night by accident?",
  "Have you ever forgotten a close friend's birthday?",
  "Have you ever re-watched a movie more than five times?",
  "Have you ever used someone else's streaming account?",
  "Have you ever lied about reading the terms and conditions?",
  "Have you ever taken food from someone else's plate?",
  "Have you ever missed a flight?",
  "Have you ever dropped your phone in water?",
  "Have you ever made up an excuse to leave early?",
  "Have you ever accidentally liked an old photo?",
  "Have you ever skipped a song you actually love?",
  "Have you ever worn mismatched socks all day?",
  "Have you ever cried during a TV show?",
  "Have you ever forgotten why you entered a room?",
  "Have you ever spoken to a pet like it understands everything?",
  "Have you ever fallen asleep in a meeting or class?",
  "Have you ever snooped through someone else's playlist?",
  "Have you ever pretended your battery died to avoid replying?",
  "Have you ever sent a voice note by accident?",
  "Have you ever set multiple alarms and still overslept?",
  "Have you ever bought something just because it was on sale?",
  "Have you ever re-gifted a present?",
  "Have you ever taken a screenshot of a chat for evidence?",
  "Have you ever forgotten someone's name right after hearing it?",
  "Have you ever searched your own name online?",
  "Have you ever danced when no one was watching?",
  "Have you ever said 'on my way' before leaving the house?",
  "Have you ever eaten food past the expiry date?",
  "Have you ever watched spoilers and still watched the show?",
  "Have you ever copied homework or work from someone else?",
  "Have you ever pretended to be busy to avoid plans?",
  "Have you ever used AI to help write a message?",
  "Have you ever made a big decision by coin flip?",
  "Have you ever forgotten a password and guessed it eventually?",
];
const QUICK_PROMPT_COUNT = 3;

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getRotatingQuickPrompts(seed: string) {
  const scored = QUICK_PROMPT_POOL.map((prompt) => ({
    prompt,
    score: hashString(`${seed}:${prompt}`),
  }));

  return scored
    .sort(
      (left, right) =>
        left.score - right.score || left.prompt.localeCompare(right.prompt),
    )
    .slice(0, QUICK_PROMPT_COUNT)
    .map((entry) => entry.prompt);
}

type PromptingStageProps = {
  promptText: string;
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
  submittedPromptCount,
  playerCount,
  roundCount,
  currentRoundNumber,
  deadlineAt,
  busy,
  onPromptTextChange,
  onSubmitPrompt,
}: PromptingStageProps) {
  const autoSubmittedRef = useRef(false);
  const quickPrompts = useMemo(
    () => getRotatingQuickPrompts(deadlineAt ?? "initial"),
    [deadlineAt],
  );

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
      if (promptText.trim()) {
        void onSubmitPrompt();
      }
    };

    const remainingMs = new Date(deadlineAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      triggerAutoSubmit();
      return;
    }

    const timeout = window.setTimeout(triggerAutoSubmit, remainingMs + 50);
    return () => window.clearTimeout(timeout);
  }, [busy, deadlineAt, onSubmitPrompt, promptText]);

  return (
    <StageShell>
      <StageMetaBar
        deadlineAt={null}
        trackingItems={[
          { label: "Submitted", value: `${submittedPromptCount}/${playerCount}` },
          ...(roundCount > 1
            ? [{ label: "Round", value: `${Math.min(currentRoundNumber, roundCount)}/${roundCount}` }]
            : []),
        ]}
        title="Prompt"
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <p className="stage-subheading text-center">
          Write a <i>never-have-I-ever</i> style yes/no question.
        </p>
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
        <div className="flex w-full max-w-3xl flex-col items-center gap-2">
          <p className="stage-heading">Examples</p>
          <div className="flex w-full flex-wrap items-center justify-center gap-2">
            {quickPrompts.map((quickPrompt) => (
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
      </div>
      <StageFooter>
        <StageFooterButton
          busy={busy}
          disabled={!promptText.trim() || busy}
          deadlineAt={deadlineAt}
          onClick={() => void onSubmitPrompt()}
        >
          {busy ? "..." : "Submit"}
        </StageFooterButton>
      </StageFooter>
    </StageShell>
  );
}
