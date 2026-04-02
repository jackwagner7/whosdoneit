"use client";

import { PlayerBox } from "@/components/player-box";

export type WaitingPlayerItem = {
  id: string;
  name: string;
  color: string;
  emoji: string;
};

type PlayerWaitingPanelProps = {
  label: string;
  players: WaitingPlayerItem[];
  emptyMessage?: string;
  className?: string;
  playerBoxClassName?: string;
};

export function PlayerWaitingPanel({
  label,
  players,
  emptyMessage,
  className = "",
  playerBoxClassName,
}: PlayerWaitingPanelProps) {
  return (
    <div className={`grid justify-items-center gap-5 text-center ${className}`.trim()}>
      <p className="text-2xl font-black tracking-[0.04em] text-slate-700 sm:text-3xl">
        {label}
      </p>
      {players.length > 0 ? (
        <ul className="flex flex-wrap items-center justify-center gap-3">
          {players.map((player) => (
            <li className="flex items-center justify-center" key={player.id}>
              <PlayerBox
                className={playerBoxClassName}
                color={player.color}
                emoji={player.emoji}
                name={player.name}
              />
            </li>
          ))}
        </ul>
      ) : emptyMessage ? (
        <p className="text-sm font-medium text-slate-600">{emptyMessage}</p>
      ) : null}
    </div>
  );
}
