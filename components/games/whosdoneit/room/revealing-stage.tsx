"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PlayerBox } from "@/components/player-box";
import { StageHeader } from "@/components/stage-header";

const REVEAL_WAIT_MS = {
  quick: 240,
  normal: 560,
  dramatic: 1300,
} as const;

const MAJORITY_THRESHOLD = 0.79;

type WaitKey = keyof typeof REVEAL_WAIT_MS;
const PRE_GUESS_WAIT_KEY: WaitKey = "dramatic";
type RevealPattern =
  | "all_innocent_innocent"
  | "all_innocent_guilty"
  | "mostly_innocent_innocent"
  | "mostly_innocent_guilty"
  | "all_guilty_guilty"
  | "all_guilty_innocent"
  | "mostly_guilty_guilty"
  | "mostly_guilty_innocent"
  | "mixed";

type GroupKey = "innocent" | "guilty";

type RevealAnimationPlan = {
  groupOrder: GroupKey[];
  primaryDropWait: WaitKey;
  secondaryDropWait: WaitKey;
  betweenGroupWait: WaitKey;
  revealWait: WaitKey;
};

type RevealGuessRow = {
  id: string;
  guesserName: string;
  guesserColor: string;
  guesserEmoji: string;
  guessedAnswer: boolean;
  correct: boolean;
};

type RevealingStageProps = {
  prompt: string;
  target: {
    id: string;
    name: string;
    color: string;
    emoji: string;
  };
  truthVisible: boolean;
  truth: boolean | undefined;
  guessRows: RevealGuessRow[];
  canControl: boolean;
  busy: boolean;
  deadlineAt: string | null;
  onNext: () => Promise<void>;
};

function classifyRevealPattern(params: {
  guessedInnocentCount: number;
  guessedGuiltyCount: number;
  truth: boolean | undefined;
}): RevealPattern {
  const totalGuesses = params.guessedInnocentCount + params.guessedGuiltyCount;
  if (totalGuesses <= 0 || typeof params.truth !== "boolean") {
    return "mixed";
  }

  const innocentRatio = params.guessedInnocentCount / totalGuesses;
  const guiltyRatio = params.guessedGuiltyCount / totalGuesses;
  const allInnocent = params.guessedInnocentCount === totalGuesses;
  const allGuilty = params.guessedGuiltyCount === totalGuesses;

  if (allInnocent && params.truth === false) return "all_innocent_innocent";
  if (allInnocent && params.truth === true) return "all_innocent_guilty";
  if (innocentRatio > MAJORITY_THRESHOLD && params.truth === false) {
    return "mostly_innocent_innocent";
  }
  if (innocentRatio > MAJORITY_THRESHOLD && params.truth === true) {
    return "mostly_innocent_guilty";
  }
  if (allGuilty && params.truth === true) return "all_guilty_guilty";
  if (allGuilty && params.truth === false) return "all_guilty_innocent";
  if (guiltyRatio > MAJORITY_THRESHOLD && params.truth === true) {
    return "mostly_guilty_guilty";
  }
  if (guiltyRatio > MAJORITY_THRESHOLD && params.truth === false) {
    return "mostly_guilty_innocent";
  }

  return "mixed";
}

function getRevealAnimationPlan(pattern: RevealPattern): RevealAnimationPlan {
  const defaults: RevealAnimationPlan = {
    groupOrder: ["innocent", "guilty"],
    primaryDropWait: "normal",
    secondaryDropWait: "normal",
    betweenGroupWait: "normal",
    revealWait: "dramatic",
  };

  switch (pattern) {
    case "all_innocent_innocent":
      return {
        ...defaults,
        groupOrder: ["innocent", "guilty"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "quick",
        revealWait: "normal",
      };
    case "all_innocent_guilty":
      return {
        ...defaults,
        groupOrder: ["innocent", "guilty"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "quick",
        revealWait: "dramatic",
      };
    case "mostly_innocent_innocent":
      return {
        ...defaults,
        groupOrder: ["innocent", "guilty"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "dramatic",
        revealWait: "normal",
      };
    case "mostly_innocent_guilty":
      return {
        ...defaults,
        groupOrder: ["innocent", "guilty"],
        primaryDropWait: "quick",
        secondaryDropWait: "normal",
        betweenGroupWait: "dramatic",
        revealWait: "dramatic",
      };
    case "all_guilty_guilty":
      return {
        ...defaults,
        groupOrder: ["guilty", "innocent"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "quick",
        revealWait: "normal",
      };
    case "all_guilty_innocent":
      return {
        ...defaults,
        groupOrder: ["guilty", "innocent"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "quick",
        revealWait: "dramatic",
      };
    case "mostly_guilty_guilty":
      return {
        ...defaults,
        groupOrder: ["guilty", "innocent"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "dramatic",
        revealWait: "normal",
      };
    case "mostly_guilty_innocent":
      return {
        ...defaults,
        groupOrder: ["guilty", "innocent"],
        primaryDropWait: "quick",
        secondaryDropWait: "normal",
        betweenGroupWait: "dramatic",
        revealWait: "dramatic",
      };
    case "mixed":
    default:
      return defaults;
  }
}

function waitFor(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicShuffle<T extends { id: string }>(rows: T[], seed: string) {
  return [...rows].sort((left, right) => {
    const leftScore = hashString(`${seed}:${left.id}`);
    const rightScore = hashString(`${seed}:${right.id}`);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }
    return left.id.localeCompare(right.id);
  });
}

export function RevealingStage({
  prompt,
  target,
  truthVisible,
  truth,
  guessRows,
  canControl,
  busy,
  deadlineAt,
  onNext,
}: RevealingStageProps) {
  const allInnocentRows = useMemo(
    () => guessRows.filter((row) => row.guessedAnswer === false),
    [guessRows],
  );
  const allGuiltyRows = useMemo(
    () => guessRows.filter((row) => row.guessedAnswer === true),
    [guessRows],
  );
  const revealPattern = useMemo(
    () =>
      classifyRevealPattern({
        guessedInnocentCount: allInnocentRows.length,
        guessedGuiltyCount: allGuiltyRows.length,
        truth,
      }),
    [allGuiltyRows.length, allInnocentRows.length, truth],
  );
  const revealPlan = useMemo(
    () => getRevealAnimationPlan(revealPattern),
    [revealPattern],
  );
  const [visibleGuessRows, setVisibleGuessRows] = useState<RevealGuessRow[]>([]);
  const [animationComplete, setAnimationComplete] = useState<boolean>(truthVisible);
  const initialRowsByGroupRef = useRef<Record<GroupKey, RevealGuessRow[]>>({
    innocent: guessRows.filter((row) => row.guessedAnswer === false),
    guilty: guessRows.filter((row) => row.guessedAnswer === true),
  });
  const initialRevealPlanRef = useRef<RevealAnimationPlan>(revealPlan);
  const initialIsMixedRef = useRef<boolean>(revealPattern === "mixed");
  const initialShuffleSeedRef = useRef<string>(
    `${target.id}:${guessRows.map((row) => row.id).join("|")}`,
  );
  const shouldAnimateRef = useRef<boolean>(!truthVisible);

  useEffect(() => {
    if (!shouldAnimateRef.current) {
      return;
    }

    let cancelled = false;
    const rowsByGroup = initialRowsByGroupRef.current;
    const plan = initialRevealPlanRef.current;
    const isMixed = initialIsMixedRef.current;
    const shuffleSeed = initialShuffleSeedRef.current;
    const groups =
      isMixed
        ? [
            {
              rows: deterministicShuffle(
                [...rowsByGroup.innocent, ...rowsByGroup.guilty],
                shuffleSeed,
              ),
              dropWait: plan.primaryDropWait,
            },
          ].filter((group) => group.rows.length > 0)
        : plan.groupOrder
            .map((groupKey, index) => ({
              rows: rowsByGroup[groupKey],
              dropWait: index === 0 ? plan.primaryDropWait : plan.secondaryDropWait,
            }))
            .filter((group) => group.rows.length > 0);

    const animate = async () => {
      await waitFor(REVEAL_WAIT_MS[PRE_GUESS_WAIT_KEY]);
      if (cancelled) {
        return;
      }

      for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const group = groups[groupIndex];
        for (let rowIndex = 0; rowIndex < group.rows.length; rowIndex += 1) {
          if (cancelled) {
            return;
          }

          const row = group.rows[rowIndex];
          setVisibleGuessRows((current) => [
            row,
            ...current.filter((entry) => entry.id !== row.id),
          ]);

          if (rowIndex + 1 < group.rows.length) {
            await waitFor(REVEAL_WAIT_MS[group.dropWait]);
            if (cancelled) {
              return;
            }
          }
        }

        const nextGroup = groups[groupIndex + 1];
        if (nextGroup) {
          await waitFor(REVEAL_WAIT_MS[plan.betweenGroupWait]);
          if (cancelled) {
            return;
          }
        }
      }

      await waitFor(REVEAL_WAIT_MS[plan.revealWait]);
      if (cancelled) {
        return;
      }

      setAnimationComplete(true);
    };

    void animate();

    return () => {
      cancelled = true;
    };
  }, []);

  const truthShown = truthVisible && animationComplete;
  const displayRows = truthShown ? guessRows : visibleGuessRows;
  const innocentRows = displayRows.filter((row) => row.guessedAnswer === false);
  const guiltyRows = displayRows.filter((row) => row.guessedAnswer === true);
  const truthToneClass =
    truthShown && typeof truth === "boolean"
      ? truth
        ? "text-rose-700"
        : "text-sky-700"
      : "text-slate-700";
  const innocentPanelClass =
    truthShown && truth === false
      ? "min-w-0 rounded-2xl border-2 border-sky-400 bg-sky-200 p-3"
      : "min-w-0 rounded-2xl border border-sky-200 bg-sky-100 p-3";
  const guiltyPanelClass =
    truthShown && truth === true
      ? "min-w-0 rounded-2xl border-2 border-rose-400 bg-rose-200 p-3"
      : "min-w-0 rounded-2xl border border-rose-200 bg-rose-50 p-3";

  return (
    <section className="card-enter -mx-[var(--card-padding)] flex min-h-0 min-w-0 flex-1 flex-col px-[var(--card-padding)] pb-5 pt-2">
      <StageHeader deadlineAt={truthShown ? deadlineAt : null} title="Trial" />
      <p className="mt-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-xl font-black text-slate-900 sm:text-2xl">
        {prompt}
      </p>
      <div className="mt-3 flex justify-center">
        <PlayerBox color={target.color} emoji={target.emoji} name={target.name} />
      </div>
      <p className={`mt-2 text-center text-lg font-bold ${truthToneClass}`}>
        {truthShown ? `${truth ? "Guilty" : "Innocent"}` : "???"}
      </p>
      <p className="stage-subheading mt-3 text-center">Guesses:</p>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <div className="relative flex items-start gap-4">
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-slate-200" />

          <div className={`min-w-0 flex-1 ${innocentPanelClass}`}>
            <p className="stage-subheading text-center font-black">Innocent</p>
            <ul className="mt-2 grid gap-2">
              {innocentRows.map((row) => (
                <li className="flex justify-center" key={row.id}>
                  <PlayerBox
                    className={truthShown && !row.correct ? "player-box-trial-wrong" : ""}
                    color={row.guesserColor}
                    emoji={row.guesserEmoji}
                    name={row.guesserName}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className={`min-w-0 flex-1 ${guiltyPanelClass}`}>
            <p className="stage-subheading text-center font-black">Guilty</p>
            <ul className="mt-2 grid gap-2">
              {guiltyRows.map((row) => (
                <li className="flex justify-center" key={row.id}>
                  <PlayerBox
                    className={truthShown && !row.correct ? "player-box-trial-wrong" : ""}
                    color={row.guesserColor}
                    emoji={row.guesserEmoji}
                    name={row.guesserName}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {truthShown && canControl ? (
        <div className="mt-3 shrink-0 border-t border-slate-200 pt-3">
          <button
            className="w-full rounded-2xl bg-black px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void onNext()}
            type="button"
          >
            {busy ? "..." : "Next"}
          </button>
        </div>
      ) : (
        <p className="stage-subheading mt-3 shrink-0 border-t border-slate-200 pt-3 text-center">
          {truthShown
            ? `Waiting for ${target.name} ${target.emoji}`
            : "Revealing guesses..."}
        </p>
      )}
    </section>
  );
}
