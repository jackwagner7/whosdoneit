"use client";

import { useRef, useState } from "react";

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

const SWIPE_THRESHOLD = 90;

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
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  function resetDrag() {
    pointerIdRef.current = null;
    setDragging(false);
    setDragX(0);
  }

  async function completeSwipe(direction: "left" | "right") {
    resetDrag();
    if (busy) {
      return;
    }

    if (direction === "left") {
      await onSwipeLeft();
      return;
    }

    await onSwipeRight();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden select-none">
      <div className="flex items-center justify-between text-[0.72rem] font-black uppercase tracking-[0.16em] text-slate-500">
        <span>{leftHint}</span>
        <span>Swipe card</span>
        <span>{rightHint}</span>
      </div>

      <div
        className="flex min-h-[18rem] flex-1 flex-col rounded-[2rem] border-2 border-slate-900 bg-white px-5 py-6 shadow-[0_16px_40px_rgba(15,23,42,0.12)] touch-pan-y select-none"
        onPointerDown={(event) => {
          pointerIdRef.current = event.pointerId;
          startXRef.current = event.clientX;
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (pointerIdRef.current !== event.pointerId) {
            return;
          }

          setDragX(event.clientX - startXRef.current);
        }}
        onPointerUp={() => {
          if (dragX <= -SWIPE_THRESHOLD) {
            void completeSwipe("left");
            return;
          }

          if (dragX >= SWIPE_THRESHOLD) {
            void completeSwipe("right");
            return;
          }

          resetDrag();
        }}
        onPointerCancel={resetDrag}
        style={{
          transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)`,
          transition: dragging ? "none" : "transform 150ms ease",
        }}
      >
        <div className="flex items-start justify-end">
          <span className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
            {points} pts
          </span>
        </div>
        <div className="flex flex-1 flex-col pt-4">
          <h3 className="text-center text-[2.2rem] font-black leading-tight text-slate-950">
            {title}
          </h3>
          <p className="mt-5 text-[1.08rem] font-medium leading-8 text-slate-700">
            {description}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900 disabled:opacity-50"
          disabled={busy}
          onClick={() => void completeSwipe("left")}
          type="button"
        >
          {leftLabel}
        </button>
        <button
          className="rounded-2xl bg-black px-4 py-3 text-base font-bold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void completeSwipe("right")}
          type="button"
        >
          {rightLabel}
        </button>
      </div>
    </div>
  );
}
