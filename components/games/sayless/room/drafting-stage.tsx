"use client";

import type { SayLessCard } from "@/types/sayless";
import { SwipeCard } from "@/components/games/sayless/room/swipe-card";

type DraftingStageProps = {
  card: SayLessCard | null;
  draftedCount: number;
  targetCount: number;
  totalDrafted: number;
  totalTarget: number;
  doneDrafting: boolean;
  busy: boolean;
  loadingCard: boolean;
  onSkip: () => Promise<void>;
  onKeep: () => Promise<void>;
};

export function DraftingStage({
  card,
  draftedCount,
  targetCount,
  totalDrafted,
  totalTarget,
  doneDrafting,
  busy,
  loadingCard,
  onSkip,
  onKeep,
}: DraftingStageProps) {
  const showLoadingPlaceholder = loadingCard && !card;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
      <header className="shrink-0">
        <div className="flex items-start justify-between gap-4">
          <p className="stage-heading">Draft</p>
          <div className="flex items-start gap-4 text-[0.72rem] font-black uppercase tracking-[0.14em] text-slate-500">
            <div className="text-center">
              <p>Your picks</p>
              <p className="mt-1 text-base font-black tracking-normal text-slate-950">
                {draftedCount}/{targetCount}
              </p>
            </div>
            <div className="text-center">
              <p>Room deck</p>
              <p className="mt-1 text-base font-black tracking-normal text-slate-950">
                {totalDrafted}/{totalTarget}
              </p>
            </div>
          </div>
        </div>
      </header>

      {showLoadingPlaceholder ? (
        <div className="mt-5 flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex min-h-[18rem] flex-1 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
              <div
                aria-hidden="true"
                className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900"
              />
              <p className="mt-4 text-sm font-semibold text-slate-600">Loading card</p>
            </div>
            <div className="grid grid-cols-2 gap-3 opacity-45">
              <button
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900"
                disabled
                type="button"
              >
                Skip
              </button>
              <button
                className="rounded-2xl bg-black px-4 py-3 text-base font-bold text-white"
                disabled
                type="button"
              >
                Keep
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {card ? (
        <div className="mt-5 flex min-h-0 flex-1">
          <div className="relative flex min-h-0 flex-1">
            <SwipeCard
              busy={busy || loadingCard}
              description={card.description}
              leftHint="Skip"
              leftLabel="Skip"
              onSwipeLeft={onSkip}
              onSwipeRight={onKeep}
              points={card.points}
              rightHint="Keep"
              rightLabel="Keep"
              title={card.title}
            />
            {loadingCard ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[2rem] bg-white/75 backdrop-blur-[2px]">
                <div className="grid justify-items-center gap-3 text-center">
                  <div
                    aria-hidden="true"
                    className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900"
                  />
                  <p className="text-sm font-semibold text-slate-700">Loading next card</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!showLoadingPlaceholder && !card && doneDrafting ? (
        <div className="mt-5 flex min-h-0 flex-1">
          <div className="flex min-h-[18rem] flex-1 flex-col justify-center rounded-3xl border border-slate-200 bg-slate-50 px-5 py-6">
            <p className="text-lg font-black text-slate-950">You are done drafting.</p>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              Waiting for the rest of the room to finish building the deck.
            </p>
          </div>
        </div>
      ) : null}

      {!showLoadingPlaceholder && !card && !doneDrafting ? (
        <div className="mt-5 flex min-h-0 flex-1">
          <div className="flex min-h-[18rem] flex-1 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
            <div
              aria-hidden="true"
              className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900"
            />
            <p className="mt-4 text-sm font-semibold text-slate-600">Loading card</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
