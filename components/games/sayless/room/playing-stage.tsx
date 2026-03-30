"use client";

import { useRef, useState, type PointerEvent } from "react";

import { PlayerBox } from "@/components/player-box";
import { StageHeader } from "@/components/stage-header";
import { SwipeCard } from "@/components/games/sayless/room/swipe-card";
import type { TrackingStatItem } from "@/components/tracking-stat";
import type { SayLessPlayer, SayLessRoomCard } from "@/types/sayless";

type PlayingStageProps = {
  activePlayer: SayLessPlayer | null;
  activeTeamName: string;
  deadlineAt: string | null;
  isHost: boolean;
  meIsActive: boolean;
  sameTeamAsActive: boolean;
  turnStarted: boolean;
  turnPaused: boolean;
  pausedRemainingSeconds: number | null;
  card: SayLessRoomCard | null;
  roundNumber: number;
  roundCount: number;
  remainingCards: number;
  totalCards: number;
  teamScores: Array<{
    label: string;
    score: number;
    color: string;
    background: string;
  }>;
  busy: boolean;
  onStartTurn: () => Promise<void>;
  onTogglePause: () => Promise<void>;
  onSkipRound: () => Promise<void>;
  onPass: () => Promise<void>;
  onCorrect: () => Promise<void>;
};

function PauseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  );
}

function PlayIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}

function SkipIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M5 6v12" />
      <path d="m9 12 8-6v12z" />
    </svg>
  );
}

export function PlayingStage({
  activePlayer,
  activeTeamName,
  deadlineAt,
  isHost,
  meIsActive,
  sameTeamAsActive,
  turnStarted,
  turnPaused,
  pausedRemainingSeconds,
  card,
  roundNumber,
  roundCount,
  remainingCards,
  totalCards,
  teamScores,
  busy,
  onStartTurn,
  onTogglePause,
  onSkipRound,
  onPass,
  onCorrect,
}: PlayingStageProps) {
  const scoreStripRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
  } | null>(null);
  const [isDraggingScores, setIsDraggingScores] = useState(false);

  const trackingItems: TrackingStatItem[] = [
    { label: "Cards left", value: `${remainingCards}/${totalCards}` },
    { label: "Rounds", value: `${roundNumber}/${roundCount}` },
  ];
  const canControlTurn = turnStarted && (meIsActive || isHost);
  const canUseTimerActions = canControlTurn && !turnPaused;
  const timerActions = canUseTimerActions
    ? [
        {
          label: "Pause",
          icon: <PauseIcon />,
          onSelect: () => {
            void onTogglePause();
          },
          disabled: busy,
        },
        {
          label: "Skip round",
          icon: <SkipIcon />,
          onSelect: () => {
            void onSkipRound();
          },
          disabled: busy,
        },
      ]
    : [];

  function handleScoreStripPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    const strip = scoreStripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: strip.scrollLeft,
    };
    setIsDraggingScores(true);
    strip.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleScoreStripPointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    const strip = scoreStripRef.current;
    if (!dragState || !strip || dragState.pointerId !== event.pointerId) {
      return;
    }

    strip.scrollLeft = dragState.startScrollLeft - (event.clientX - dragState.startX);
    event.preventDefault();
  }

  function endScoreStripDrag(event: PointerEvent<HTMLDivElement>) {
    const strip = scoreStripRef.current;
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    setIsDraggingScores(false);

    if (strip?.hasPointerCapture(event.pointerId)) {
      strip.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
      <StageHeader
        deadlineAt={turnStarted && !turnPaused ? deadlineAt : null}
        description={
          activePlayer
            ? `${activePlayer.name} is up for ${activeTeamName}.`
            : "Waiting for the next turn to start."
        }
        pausedRemainingSeconds={turnPaused ? pausedRemainingSeconds : null}
        reserveTimerSpace
        timerPaused={turnPaused}
        timerActions={timerActions}
        title={`Round ${roundNumber}`}
        trackingItems={trackingItems}
      />

      <div
        className={`scrollbar-hide mt-4 overflow-x-auto overscroll-x-contain pb-1 select-none ${
          isDraggingScores ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerCancel={endScoreStripDrag}
        onPointerDown={handleScoreStripPointerDown}
        onPointerMove={handleScoreStripPointerMove}
        onPointerUp={endScoreStripDrag}
        ref={scoreStripRef}
      >
        <div className="flex w-max min-w-full flex-nowrap gap-2">
          {teamScores.map((team) => (
            <div
              className="flex-none rounded-full border px-3 py-2 text-sm font-bold whitespace-nowrap"
              key={team.label}
              style={{
                borderColor: team.color,
                backgroundColor: team.background,
                color: team.color,
              }}
            >
              {team.label}: {team.score}
            </div>
          ))}
        </div>
      </div>

      {!turnStarted ? (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 px-5 py-6">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
              Next:
            </p>
            {activePlayer ? (
              <div className="mt-4">
                <PlayerBox
                  color={activePlayer.color}
                  emoji={activePlayer.emoji}
                  name={activePlayer.name}
                />
              </div>
            ) : (
              <p className="mt-3 text-sm font-medium text-slate-600">
                Waiting for the next turn to start.
              </p>
            )}
          </div>

          {meIsActive ? (
            <div className="mt-4 shrink-0 border-t border-slate-200 pt-4">
              <button
                className="w-full rounded-2xl bg-black px-4 py-3 text-base font-bold text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void onStartTurn()}
                type="button"
              >
                {busy ? "..." : "Start"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {meIsActive && turnStarted && card ? (
        <div className="mt-5 flex min-h-0 flex-1">
          <SwipeCard
            busy={busy}
            key={card.id}
            description={card.card.description}
            leftHint="Pass"
            leftLabel="Pass"
            onSwipeLeft={onPass}
            onSwipeRight={onCorrect}
            points={card.card.points}
            rightHint="Got it!"
            rightLabel="Got it!"
            title={card.card.title}
          />
        </div>
      ) : null}

      {!meIsActive && turnStarted ? (
        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-6">
          <p className="text-lg font-black text-slate-950">
            {sameTeamAsActive ? "Your team is guessing." : "Listen only."}
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
            {activePlayer
              ? sameTeamAsActive
                ? `${activePlayer.name} is clueing. Only teammates on ${activeTeamName} should call out guesses.`
                : `${activePlayer.name} is clueing for ${activeTeamName}. Your job is to listen to the cards, not guess.`
              : "Waiting for the room to advance the turn."}
          </p>
        </div>
      ) : null}

      {meIsActive && turnStarted && !card ? (
        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-6">
          <p className="text-lg font-black text-slate-950">Loading your next card...</p>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
            Stay ready. The next prompt is on the way.
          </p>
        </div>
      ) : null}

      {turnPaused ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-900">
              <PauseIcon className="h-7 w-7" />
            </div>
            <p className="mt-4 text-2xl font-black text-slate-950">Paused</p>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              {activePlayer
                ? `${activePlayer.name}'s turn is on hold.`
                : "The current turn is on hold."}
            </p>
            {canControlTurn ? (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  aria-label="Resume turn"
                  className="flex items-center justify-center rounded-2xl bg-black px-4 py-3 text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void onTogglePause()}
                  type="button"
                >
                  <PlayIcon />
                </button>
                <button
                  aria-label="Skip round"
                  className="flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void onSkipRound()}
                  type="button"
                >
                  <SkipIcon />
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm font-medium text-slate-600">
                Waiting for the turn controller to resume or skip the round.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
