"use client";

import type { CSSProperties } from "react";
import { CountdownBadge } from "@/components/countdown-badge";
import { PlayerBox } from "@/components/player-box";
import { StageFooter } from "@/components/stage-footer";
import { StageShell } from "@/components/stage-shell";
import { StageHeader } from "@/components/stage-header";
import { SwipeCard } from "@/components/games/sayless/room/swipe-card";
import type { TrackingStatItem } from "@/components/tracking-stat";
import type { SayLessPlayer, SayLessRoomCard } from "@/types/sayless";

type PlayingStageProps = {
  activePlayer: SayLessPlayer | null;
  activeTeamName: string;
  activeTeamColor: string;
  activeTeamBackground: string;
  successfulCards: Array<{
    id: string;
    title: string;
    points: number;
  }>;
  deadlineAt: string | null;
  isHost: boolean;
  meIsActive: boolean;
  turnStarted: boolean;
  turnPaused: boolean;
  pausedRemainingSeconds: number | null;
  card: SayLessRoomCard | null;
  roundNumber: number;
  roundCount: number;
  remainingCards: number;
  totalCards: number;
  busy: boolean;
  onStartTurn: () => Promise<void>;
  onTogglePause: () => Promise<void>;
  onSkipTurn: () => Promise<void>;
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
      <path d="m7 12 8-6v12z" />
      <path d="M19 6v12" />
    </svg>
  );
}

export function PlayingStage({
  activePlayer,
  activeTeamName,
  activeTeamColor,
  activeTeamBackground,
  successfulCards,
  deadlineAt,
  isHost,
  meIsActive,
  turnStarted,
  turnPaused,
  pausedRemainingSeconds,
  card,
  roundNumber,
  roundCount,
  remainingCards,
  totalCards,
  busy,
  onStartTurn,
  onTogglePause,
  onSkipTurn,
  onPass,
  onCorrect,
}: PlayingStageProps) {
  const trackingItems: TrackingStatItem[] = [
    { label: "Rounds", value: `${roundNumber}/${roundCount}` },
    { label: "Cards left", value: `${remainingCards}/${totalCards}` },
  ];
  const canControlTurn = turnStarted && (meIsActive || isHost);
  const canPauseTurn = canControlTurn && !turnPaused;

  return (
    <StageShell className="relative overflow-y-auto">
      <StageHeader
        title={`Round ${roundNumber}`}
        trackingItems={trackingItems}
      />

      {!turnStarted ? (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-6">
            {activePlayer ? (
              <div className="grid justify-items-center gap-5 text-center">
                <p className="text-2xl font-black tracking-[0.04em] text-slate-700 sm:text-3xl">
                  Up Next:
                </p>
                <div
                  className="sayless-up-next-box"
                  style={
                    {
                      "--team-color": activeTeamColor,
                      "--team-bg": activeTeamBackground,
                    } as CSSProperties
                  }
                >
                  <p className="sayless-up-next-name">{activeTeamName}</p>
                  <div className="mt-4 flex justify-center">
                    <PlayerBox
                      className="player-box-flat"
                      color={activePlayer.color}
                      emoji={activePlayer.emoji}
                      name={activePlayer.name}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-600">
                Waiting for the next turn to start.
              </p>
            )}
          </div>

          {meIsActive ? (
            <StageFooter className="pt-4">
              <button
                className="w-full rounded-2xl bg-black px-4 py-3 text-base font-bold text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void onStartTurn()}
                type="button"
              >
                {busy ? "..." : "Start"}
              </button>
            </StageFooter>
          ) : null}
        </div>
      ) : null}

      {meIsActive && turnStarted && card ? (
        <div className="mt-5 flex min-h-0 flex-1">
          <SwipeCard
            busy={busy}
            centerHint={null}
            deadlineAt={deadlineAt}
            key={card.id}
            description={card.card.description}
            leftHint="Pass"
            leftLabel="Pass"
            onTimerClick={
              canPauseTurn
                ? () => {
                    void onTogglePause();
                  }
                : undefined
            }
            onSwipeLeft={onPass}
            onSwipeRight={onCorrect}
            pausedRemainingSeconds={turnPaused ? pausedRemainingSeconds : null}
            points={card.card.points}
            rightHint="Got it!"
            rightLabel="Got it!"
            timerPaused={turnPaused}
            title={card.card.title}
          />
        </div>
      ) : null}

      {!meIsActive && turnStarted ? (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-5 px-5 py-6 text-center">
            {activePlayer ? (
              <>
                <div
                  className="sayless-up-next-box"
                  style={
                    {
                      "--team-color": activeTeamColor,
                      "--team-bg": activeTeamBackground,
                    } as CSSProperties
                  }
                >
                  <p className="sayless-up-next-name">{activeTeamName}</p>
                  <div className="mt-4 flex justify-center">
                    <PlayerBox
                      className="player-box-flat"
                      color={activePlayer.color}
                      emoji={activePlayer.emoji}
                      name={activePlayer.name}
                    />
                  </div>
                </div>

                {successfulCards.length > 0 ? (
                  <div className="flex min-h-0 w-full max-w-sm flex-1 flex-col rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
                    <p className="shrink-0 text-sm font-black uppercase tracking-[0.14em] text-slate-500">
                      Cards this round
                    </p>
                    <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
                      <ul className="grid gap-2">
                        {successfulCards.map((card) => (
                          <li
                            className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left"
                            key={card.id}
                          >
                            <span className="min-w-0 text-base font-bold text-slate-900">
                              {card.title}
                            </span>
                            <span className="shrink-0 text-sm font-black uppercase tracking-[0.08em] text-emerald-700">
                              {card.points} pts
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm font-medium text-slate-600">
                Waiting for the room to advance the turn.
              </p>
            )}
          </div>

          <StageFooter className="pt-4">
            <div className="flex min-h-[3.5rem] items-center justify-center">
              <CountdownBadge
                deadlineAt={deadlineAt}
                paused={turnPaused}
                pausedRemainingSeconds={turnPaused ? pausedRemainingSeconds : null}
              />
            </div>
          </StageFooter>
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
                  aria-label="Skip turn"
                  className="flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void onSkipTurn()}
                  type="button"
                >
                  <SkipIcon />
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm font-medium text-slate-600">
                Waiting for the turn controller to resume or skip the turn.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </StageShell>
  );
}
