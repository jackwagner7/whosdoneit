"use client";

import { useEffect, useRef, useState } from "react";

type SwipeCardProps = {
  title: string;
  description: string;
  points: number;
  busy: boolean;
  leftLabel: string;
  rightLabel: string;
  leftHint: string;
  rightHint: string;
  onSwipeLeft: () => Promise<void>;
  onSwipeRight: () => Promise<void>;
};

// Main drag distance needed for a normal swipe commit.
const SWIPE_THRESHOLD = 55;
// If the card has reached this fraction of the threshold, releasing still commits
// even when the finger is no longer moving.
const STATIONARY_COMMIT_RATIO = 3;
const EXIT_DISTANCE = 520;
const EXIT_ROTATION = 24;
const EXIT_DURATION_MS = 420;
const EXIT_FADE_DURATION_MS = 340;
const ENTER_DURATION_MS = 420;
const ACTIVE_SWIPE_WINDOW_MS = 90;
const MIN_RELEASE_VELOCITY = 0.18;

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function releasePointerCaptureSafely(target: HTMLDivElement, pointerId: number) {
  if (!target.hasPointerCapture(pointerId)) {
    return;
  }

  try {
    target.releasePointerCapture(pointerId);
  } catch {
    // Some browsers can drop capture before pointerup finishes dispatching.
  }
}

export function SwipeCard({
  title,
  description,
  points,
  busy,
  leftLabel,
  rightLabel,
  leftHint,
  rightHint,
  onSwipeLeft,
  onSwipeRight,
}: SwipeCardProps) {
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const previousSampleRef = useRef({ x: 0, time: 0 });
  const latestSampleRef = useRef({ x: 0, time: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "exit-left" | "exit-right">("idle");

  function resetDrag() {
    pointerIdRef.current = null;
    setDragging(false);
    setDragX(0);
  }

  function shouldCommitSwipe(direction: "left" | "right") {
    const now = performance.now();
    const latestSample = latestSampleRef.current;
    const previousSample = previousSampleRef.current;
    const timeSinceMove = now - latestSample.time;
    const sampleDeltaTime = latestSample.time - previousSample.time;
    const sampleDeltaX = latestSample.x - previousSample.x;
    const releaseVelocity =
      sampleDeltaTime > 0 ? sampleDeltaX / sampleDeltaTime : 0;
    const directionSign = direction === "left" ? -1 : 1;
    const stationaryCommitThreshold = SWIPE_THRESHOLD * STATIONARY_COMMIT_RATIO;
    const draggedFarEnough = Math.abs(dragX) >= SWIPE_THRESHOLD;
    const draggedFarEnoughWhileStationary =
      Math.abs(dragX) >= stationaryCommitThreshold &&
      Math.sign(dragX) === directionSign;

    return (
      draggedFarEnoughWhileStationary ||
      (
        draggedFarEnough &&
        timeSinceMove <= ACTIVE_SWIPE_WINDOW_MS &&
        Math.sign(releaseVelocity) === directionSign &&
        Math.abs(releaseVelocity) >= MIN_RELEASE_VELOCITY
      )
    );
  }

  useEffect(() => {
    cardRef.current?.animate(
      [
        {
          opacity: 0,
          transform: "translateY(-64px)",
        },
        {
          opacity: 1,
          transform: "translateY(0)",
        },
      ],
      {
        duration: ENTER_DURATION_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );
  }, []);

  async function completeSwipe(direction: "left" | "right") {
    if (busy) {
      resetDrag();
      return;
    }

    pointerIdRef.current = null;
    setDragging(false);
    setPhase(direction === "left" ? "exit-left" : "exit-right");

    try {
      await wait(EXIT_DURATION_MS);

      if (direction === "left") {
        await onSwipeLeft();
        return;
      }

      await onSwipeRight();
    } catch (error) {
      setPhase("idle");
      setDragX(0);
      throw error;
    }
  }

  const rotation = dragging ? dragX / 20 : 0;
  const swipeProgress = Math.abs(dragX) / SWIPE_THRESHOLD;

  const VISUAL_START = 0.45;
  const VISUAL_FULL = 3;

  const visualProgress = Math.min(
    Math.max((swipeProgress - VISUAL_START) / (VISUAL_FULL - VISUAL_START), 0),
    1,
  );

  const easedVisualProgress =
    visualProgress * visualProgress * (3 - 2 * visualProgress);

  const keepOverlayOpacity = dragX > 0 ? easedVisualProgress * 0.28 : 0;
  const skipOverlayOpacity = dragX < 0 ? easedVisualProgress * 0.28 : 0;
  const keepLabelOpacity = dragX > 0 ? easedVisualProgress * 0.8 : 0;
  const skipLabelOpacity = dragX < 0 ? easedVisualProgress * 0.8 : 0;

  let transform: string | undefined =
    dragX === 0 ? undefined : `translateX(${dragX}px) rotate(${rotation}deg)`;
  let opacity = 1;
  let transition = dragging
    ? "none"
    : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease";

  if (phase === "exit-left") {
    transform = `translateX(-${EXIT_DISTANCE}px) translateY(24px) rotate(-${EXIT_ROTATION}deg)`;
    opacity = 0;
    transition =
      `transform ${EXIT_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${EXIT_FADE_DURATION_MS}ms ease`;
  } else if (phase === "exit-right") {
    transform = `translateX(${EXIT_DISTANCE}px) translateY(24px) rotate(${EXIT_ROTATION}deg)`;
    opacity = 0;
    transition =
      `transform ${EXIT_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${EXIT_FADE_DURATION_MS}ms ease`;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden bg-white select-none">
      <div className="flex items-center justify-between text-[0.72rem] font-black uppercase tracking-[0.16em] text-slate-500">
        <span>{leftHint}</span>
        <span>Swipe card</span>
        <span>{rightHint}</span>
      </div>

      <div className="relative flex min-h-[18rem] flex-1 rounded-[2.3rem]">
        <div className="relative z-20 flex min-h-[18rem] flex-1">
          <div
            ref={cardRef}
            className="relative flex min-h-[18rem] flex-1 overflow-hidden rounded-[2rem] border-2 border-slate-900 bg-slate-50 px-5 py-6 touch-pan-y select-none"
            onPointerDown={(event) => {
              if (busy || phase === "exit-left" || phase === "exit-right") {
                return;
              }

              pointerIdRef.current = event.pointerId;
              startXRef.current = event.clientX;
              previousSampleRef.current = {
                x: event.clientX,
                time: performance.now(),
              };
              latestSampleRef.current = previousSampleRef.current;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
            }}
            onPointerMove={(event) => {
              if (pointerIdRef.current !== event.pointerId) {
                return;
              }

              previousSampleRef.current = latestSampleRef.current;
              latestSampleRef.current = {
                x: event.clientX,
                time: performance.now(),
              };
              setDragX(event.clientX - startXRef.current);
            }}
            onPointerUp={(event) => {
              if (pointerIdRef.current === event.pointerId) {
                releasePointerCaptureSafely(event.currentTarget, event.pointerId);
              }

              if (dragX <= -SWIPE_THRESHOLD && shouldCommitSwipe("left")) {
                void completeSwipe("left");
                return;
              }

              if (dragX >= SWIPE_THRESHOLD && shouldCommitSwipe("right")) {
                void completeSwipe("right");
                return;
              }

              resetDrag();
            }}
            onPointerCancel={resetDrag}
            style={{
              opacity,
              transform,
              transition,
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 bg-emerald-200"
              style={{ opacity: keepOverlayOpacity }}
            />
            <div
              className="pointer-events-none absolute inset-0 bg-rose-200"
              style={{ opacity: skipOverlayOpacity }}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                className="text-[2.75rem] font-black uppercase tracking-[0.2em] text-emerald-700"
                style={{
                  opacity: keepLabelOpacity,
                  transform: `scale(${0.92 + keepLabelOpacity * 0.08})`,
                }}
              >
                {rightLabel}
              </span>
              <span
                className="absolute text-[2.75rem] font-black uppercase tracking-[0.2em] text-rose-700"
                style={{
                  opacity: skipLabelOpacity,
                  transform: `scale(${0.92 + skipLabelOpacity * 0.08})`,
                }}
              >
                {leftLabel}
              </span>
            </div>
            <div className="relative z-10 flex flex-1 flex-col pt-4">
              <h3 className="text-center text-[2.2rem] font-black leading-tight text-slate-950">
                {title}
              </h3>
              <p className="mt-5 text-[1.08rem] font-medium leading-8 text-slate-700">
                {description}
              </p>
            </div>
            <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-sm font-black uppercase tracking-[0.16em] text-slate-500">
              {points} pts
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900 disabled:opacity-50"
          disabled={busy || phase === "exit-left" || phase === "exit-right"}
          onClick={() => void completeSwipe("left")}
          type="button"
        >
          {leftLabel}
        </button>
        <button
          className="rounded-2xl bg-black px-4 py-3 text-base font-bold text-white disabled:opacity-50"
          disabled={busy || phase === "exit-left" || phase === "exit-right"}
          onClick={() => void completeSwipe("right")}
          type="button"
        >
          {rightLabel}
        </button>
      </div>
    </div>
  );
}
